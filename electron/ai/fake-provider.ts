/**
 * Deterministic fake LLM (owner: WS-A). Selected at runtime with `CODEX_AI_PROVIDER=fake`
 * (no key needed); also the provider every stream uses in unit tests (`electron/ai/testing.ts`).
 *
 * Responses, in order of precedence:
 * 1. Scripted queue (`enqueue(...)`): strings, completions, failures or functions, consumed FIFO.
 * 2. Per-task responders (`respondTo(task, fn)`; the runtime registers `TaskDefinition.fakeResponse`).
 * 3. The global `respond` option.
 * 4. Default: if the request wants JSON, echo the last JSON object/array found in the last user
 *    message (so 1:1 rewrite/format chunks round-trip), else a short deterministic sentence.
 *
 * Failures (`FakeFailure`) go through the real client's HTTP error mapper, so 429s carry `retryAt`
 * and 401s become `auth`, exactly like OpenRouter. Random failure rates use a seeded PRNG.
 *
 * Env knobs (`fakeProviderFromEnv`): `CODEX_AI_FAKE="429:0.2,500:0.1,length:0.05,latency:300,seed:7,retryAfter:2"`.
 */

import type { TaskId, Usage } from "../shared/ai/types";
import { AIError } from "./errors";
import { httpError, type Completion, type CompletionRequest, type FinishReason, type LLMClient } from "./client";
import { repairJson } from "../shared/ai/json";

export type FakeFailure =
  | { status: number; message?: string; retryAfterSec?: number }
  | { kind: "length" | "content_filter"; text?: string }
  | { kind: "network" | "timeout" | "empty" };

export type FakeReply =
  | string
  | Completion
  | { fail: FakeFailure }
  | ((req: CompletionRequest) => string | Completion | { fail: FakeFailure } | Promise<string | Completion>);

export interface FakeProviderOptions {
  seed?: number;
  /** Delay per call (ms). Uses `sleep` so tests can drive it with a fake clock. */
  latencyMs?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
  /** Random failure probabilities (0..1), seeded. */
  rates?: { rateLimited?: number; server?: number; length?: number };
  /** Retry-After seconds attached to random 429s (default 2). */
  retryAfterSec?: number;
  respond?: (req: CompletionRequest) => string | Completion | undefined;
  /** Chunk size for streamed replies (characters). */
  streamChunk?: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new AIError("cancelled", "Cancelled"));
    const onAbort = () => {
      clearTimeout(t);
      reject(new AIError("cancelled", "Cancelled"));
    };
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

export class FakeProvider implements LLMClient {
  /** Every request received, in order (inspect in tests). */
  readonly calls: CompletionRequest[] = [];
  /** Number of calls currently awaiting a reply. */
  inFlight = 0;
  maxInFlight = 0;
  private queue: FakeReply[] = [];
  private responders = new Map<TaskId, (req: CompletionRequest) => string | undefined>();
  private rand: () => number;
  private opts: FakeProviderOptions;
  /** Gate: when set, every call waits for `release()` (deterministic concurrency tests). */
  private gate: { promise: Promise<void>; release: () => void } | null = null;

  constructor(opts: FakeProviderOptions = {}) {
    this.opts = opts;
    this.rand = mulberry32(opts.seed ?? 1);
  }

  /** Script the next replies (FIFO). */
  enqueue(...replies: FakeReply[]): this {
    this.queue.push(...replies);
    return this;
  }

  /** Script `times` consecutive failures. */
  failNext(failure: FakeFailure, times = 1): this {
    for (let i = 0; i < times; i++) this.queue.push({ fail: failure });
    return this;
  }

  respondTo(task: TaskId, fn: (req: CompletionRequest) => string | undefined): this {
    this.responders.set(task, fn);
    return this;
  }

  setRates(rates: FakeProviderOptions["rates"]): this {
    this.opts = { ...this.opts, rates };
    return this;
  }

  /** Hold every call until `release()` is called. */
  hold(): this {
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    this.gate = { promise, release };
    return this;
  }

  release(): this {
    const g = this.gate;
    this.gate = null;
    g?.release();
    return this;
  }

  reset(): this {
    this.calls.length = 0;
    this.queue.length = 0;
    this.inFlight = 0;
    this.maxInFlight = 0;
    return this;
  }

  async complete(req: CompletionRequest): Promise<Completion> {
    if (req.signal.aborted) throw new AIError("cancelled", "Cancelled");
    this.calls.push(req);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await this.waitAbortable(this.gate?.promise, req.signal);
      if (this.opts.latencyMs) await (this.opts.sleep ?? defaultSleep)(this.opts.latencyMs, req.signal);
      if (req.signal.aborted) throw new AIError("cancelled", "Cancelled");

      const scripted = this.queue.shift();
      let reply: string | Completion | { fail: FakeFailure } | undefined;
      if (scripted !== undefined) {
        reply = typeof scripted === "function" ? await scripted(req) : scripted;
      } else {
        const random = this.randomFailure();
        if (random) reply = { fail: random };
        else reply = (req.meta?.task && this.responders.get(req.meta.task)?.(req)) ?? this.opts.respond?.(req) ?? defaultReply(req);
      }

      if (reply && typeof reply === "object" && "fail" in reply) return this.applyFailure(reply.fail, req);
      const completion = typeof reply === "string" ? this.toCompletion(reply, req, "stop") : reply!;
      if (req.stream && completion.text) this.streamOut(completion.text, req.stream);
      if (completion.finishReason === "length" && !req.allowTruncated) {
        throw new AIError("truncated", "Output truncated (fake)", { partial: completion, retryable: false });
      }
      return completion;
    } finally {
      this.inFlight--;
    }
  }

  private async waitAbortable(p: Promise<void> | undefined, signal: AbortSignal): Promise<void> {
    if (!p) return;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new AIError("cancelled", "Cancelled"));
      signal.addEventListener("abort", onAbort, { once: true });
      p.then(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      });
    });
  }

  private randomFailure(): FakeFailure | null {
    const r = this.opts.rates;
    if (!r) return null;
    const x = this.rand();
    let acc = 0;
    if (r.rateLimited && x < (acc += r.rateLimited)) return { status: 429, retryAfterSec: this.opts.retryAfterSec ?? 2 };
    if (r.server && x < (acc += r.server)) return { status: 500 };
    if (r.length && x < (acc += r.length)) return { kind: "length" };
    return null;
  }

  private applyFailure(f: FakeFailure, req: CompletionRequest): never | Completion {
    const now = (this.opts.now ?? Date.now)();
    if ("status" in f) {
      const headers = new Map<string, string>();
      if (f.retryAfterSec !== undefined) headers.set("retry-after", String(f.retryAfterSec));
      throw httpError(f.status, JSON.stringify({ error: { message: f.message ?? `fake ${f.status}` } }), { get: (k) => headers.get(k.toLowerCase()) ?? null }, now);
    }
    switch (f.kind) {
      case "network":
        throw new AIError("network", "Network error (fake)");
      case "timeout":
        throw new AIError("timeout", "Request timed out (fake)");
      case "empty":
        throw new AIError("server", "The model returned an empty response (fake)");
      case "length": {
        const text = f.text ?? defaultReply(req).slice(0, 40);
        const c = this.toCompletion(text, req, "length");
        if (req.allowTruncated) return c;
        throw new AIError("truncated", "Output truncated (fake)", { partial: c, retryable: false });
      }
      case "content_filter":
        throw new AIError("content_filtered", "Blocked by content filter (fake)", { partial: this.toCompletion(f.text ?? "", req, "content_filter"), retryable: false });
    }
  }

  private toCompletion(text: string, req: CompletionRequest, finishReason: FinishReason): Completion {
    const promptChars = req.messages.reduce((n, m) => n + m.content.length, 0);
    const usage: Usage = { model: req.model, promptTokens: Math.ceil(promptChars / 4), completionTokens: Math.ceil(text.length / 4), costUsd: 0 };
    return { text, toolCalls: [], finishReason, usage, model: req.model };
  }

  private streamOut(text: string, onDelta: (d: string) => void) {
    const size = Math.max(1, this.opts.streamChunk ?? 24);
    for (let i = 0; i < text.length; i += size) {
      try { onDelta(text.slice(i, i + size)); } catch { /* ignore listener errors */ }
    }
  }
}

/** JSON requests echo the last JSON value in the last user message; others get a fixed sentence. */
export function defaultReply(req: CompletionRequest): string {
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const wantsJson = !!req.json || /\bjson\b/i.test(req.messages.map((m) => m.content).join("\n"));
  if (wantsJson) {
    const found = lastJsonIn(lastUser);
    return found ?? "{}";
  }
  const gist = lastUser.replace(/\s+/g, " ").trim().slice(0, 80);
  return `Fake response from ${req.model}${gist ? ` to: ${gist}` : "."}`;
}

function lastJsonIn(text: string): string | undefined {
  // Forward scan: every top-level JSON value that parses WITHOUT repair; the last one wins.
  let last: string | undefined;
  let i = text.search(/[[{]/);
  while (i >= 0 && i < text.length) {
    const r = repairJson(text.slice(i));
    if (!r.truncated && r.notes.length === 0) {
      try {
        JSON.parse(r.text);
        last = r.text;
        i += Math.max(1, r.end);
      } catch {
        i++;
      }
    } else {
      i++;
    }
    const next = text.slice(i).search(/[[{]/);
    i = next < 0 ? -1 : i + next;
  }
  return last;
}

/** `CODEX_AI_PROVIDER=fake` → a FakeProvider configured from `CODEX_AI_FAKE`; otherwise null. */
export function fakeProviderFromEnv(env: Record<string, string | undefined> = process.env): FakeProvider | null {
  if ((env.CODEX_AI_PROVIDER ?? "").toLowerCase() !== "fake") return null;
  const cfg: Record<string, number> = {};
  for (const part of (env.CODEX_AI_FAKE ?? "").split(",")) {
    const [k, v] = part.split(":").map((x) => x.trim());
    if (k && v !== undefined && Number.isFinite(Number(v))) cfg[k] = Number(v);
  }
  return new FakeProvider({
    seed: cfg.seed ?? 1,
    latencyMs: cfg.latency ?? 250,
    retryAfterSec: cfg.retryAfter ?? 2,
    rates: { rateLimited: cfg["429"] ?? 0, server: cfg["500"] ?? 0, length: cfg.length ?? 0 },
  });
}
