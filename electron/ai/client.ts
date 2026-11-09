/**
 * LLM client (owner: WS-A). One OpenRouter implementation for the whole app; the fake provider
 * (`fake-provider.ts`) implements the same `LLMClient` interface.
 *
 * - JSON mode and tools are gated on model capabilities (`models.ts`): `response_format` is only
 *   sent when the model is KNOWN to support it; otherwise the prompt alone asks for JSON and
 *   `shared/ai/json.ts` parses loosely. Tools on a model known not to support them → `bad_request`.
 * - Streaming via SSE when `req.stream` is set (deltas forwarded as they arrive).
 * - Finish reasons are normalised; `length` throws `truncated` (with the partial completion
 *   attached) unless `allowTruncated`, and `content_filter` throws `content_filtered`.
 * - Usage comes from OpenRouter (`usage: {include: true}` → `cost`), else from catalog pricing.
 * - Never retries: retry policy lives in the scheduler.
 *
 * No `electron` import: `fetch` and the key getter are injected (testable under `node --test`).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- provider JSON is untyped; every field is checked at use */

import type { ChatMessage, ModelInfo, TaskId, ToolCall, ToolSpec, Usage } from "../shared/ai/types";
import { AIError, isAbortError } from "./errors";

// ── Contracts (AI_AUDIT §4.4.3) ─────────────────────────────────────────────

export type JsonRequest = { mode: "object" } | { mode: "schema"; name: string; schema: object };

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: JsonRequest;
  tools?: ToolSpec[];
  toolChoice?: "auto" | "none";
  /** Called with each streamed text delta. Presence switches the request to SSE streaming. */
  stream?: (delta: string) => void;
  signal: AbortSignal;
  timeoutMs?: number;
  /** Return a `finishReason: "length"` completion instead of throwing `truncated`. */
  allowTruncated?: boolean;
  /** Diagnostics/fake-provider routing only; never sent to the provider. */
  meta?: { task?: TaskId; jobId?: string };
}

export type FinishReason = "stop" | "length" | "content_filter" | "tool_calls" | "unknown";

export interface Completion {
  text: string;
  toolCalls: ToolCall[];
  finishReason: FinishReason;
  usage: Usage;
  model: string;
}

/** Throws `AIError` (never anything else). */
export interface LLMClient {
  complete(req: CompletionRequest): Promise<Completion>;
}

export type ModelCapabilities = ModelInfo["capabilities"];

// ── OpenRouter implementation ───────────────────────────────────────────────

export interface OpenRouterClientOptions {
  /** Current API key, or null (→ `no_api_key`). Read on every call so key changes apply at once. */
  getApiKey: () => string | null;
  fetch?: typeof fetch;
  /** Known capabilities of a model, or undefined when the catalog doesn't know it. */
  capabilities?: (model: string) => ModelCapabilities | undefined;
  /** USD per token, used when the provider doesn't report `cost`. */
  pricing?: (model: string) => { prompt: number; completion: number } | undefined;
  baseUrl?: string;
  defaultTimeoutMs?: number;
  now?: () => number;
}

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 120_000;

/** Disable Gemini safety filters so dark fiction isn't blocked (kept from the legacy client). */
const GOOGLE_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

export function createOpenRouterClient(opts: OpenRouterClientOptions): LLMClient {
  const doFetch = opts.fetch ?? fetch;
  const baseUrl = (opts.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/$/, "");
  const now = opts.now ?? Date.now;

  return {
    async complete(req: CompletionRequest): Promise<Completion> {
      if (req.signal.aborted) throw new AIError("cancelled", "Cancelled");
      const apiKey = opts.getApiKey();
      if (!apiKey) throw new AIError("no_api_key", "No OpenRouter API key configured");

      const body = buildRequestBody(req, opts.capabilities?.(req.model));
      const link = linkSignal(req.signal, req.timeoutMs ?? opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        let res: Response;
        try {
          res = await doFetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": "https://github.com/F12-Syntex/codex",
              "X-Title": "Codex",
            },
            body: JSON.stringify(body),
            signal: link.signal,
          });
        } catch (err) {
          throw transportError(err, req.signal, link);
        }

        if (!res.ok) {
          const text = await safeText(res);
          throw httpError(res.status, text, res.headers, now());
        }

        let completion: Completion;
        try {
          completion = req.stream
            ? await readStream(res, req.model, req.stream, now)
            : parseCompletionJson(await res.json(), req.model, now);
        } catch (err) {
          if (err instanceof AIError) throw err;
          throw transportError(err, req.signal, link);
        }

        completion.usage = withCost(completion.usage, opts.pricing?.(completion.model) ?? opts.pricing?.(req.model));
        return finishOrThrow(completion, req);
      } finally {
        link.cleanup();
      }
    },
  };
}

// ── Request building ────────────────────────────────────────────────────────

export function buildRequestBody(req: CompletionRequest, caps: ModelCapabilities | undefined): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map(toWireMessage),
    usage: { include: true },
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
  if (req.stream) body.stream = true;

  if (req.json && caps) {
    if (req.json.mode === "schema" && caps.jsonSchema) {
      body.response_format = { type: "json_schema", json_schema: { name: req.json.name, strict: false, schema: req.json.schema } };
    } else if (caps.json) {
      body.response_format = { type: "json_object" };
    }
  }

  if (req.tools?.length) {
    if (caps && !caps.tools) {
      throw new AIError("bad_request", `Model ${req.model} does not support tool calling`, { retryable: false });
    }
    body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    if (req.toolChoice) body.tool_choice = req.toolChoice;
  }

  if (req.model.startsWith("google/")) body.safety_settings = GOOGLE_SAFETY_SETTINGS;
  return body;
}

function toWireMessage(m: ChatMessage): Record<string, unknown> {
  const out: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.role === "tool" && m.toolCallId) out.tool_call_id = m.toolCallId;
  if (m.role === "assistant" && m.toolCalls?.length) {
    out.tool_calls = m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } }));
  }
  return out;
}

// ── Response parsing ────────────────────────────────────────────────────────

export function mapFinishReason(raw: unknown): FinishReason {
  const r = typeof raw === "string" ? raw.toLowerCase() : "";
  if (r === "stop" || r === "end_turn" || r === "stop_sequence" || r === "eos") return "stop";
  if (r === "length" || r === "max_tokens" || r === "max_output_tokens") return "length";
  if (r === "content_filter" || r === "safety" || r === "recitation" || r === "prohibited_content" || r === "blocklist") return "content_filter";
  if (r === "tool_calls" || r === "function_call" || r === "tool_use") return "tool_calls";
  return "unknown";
}

interface WireUsage { prompt_tokens?: number; completion_tokens?: number; cost?: number }

function toUsage(model: string, u: WireUsage | undefined): Usage {
  const usage: Usage = { model, promptTokens: num(u?.prompt_tokens), completionTokens: num(u?.completion_tokens) };
  if (typeof u?.cost === "number" && Number.isFinite(u.cost)) usage.costUsd = u.cost;
  return usage;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function withCost(usage: Usage, pricing: { prompt: number; completion: number } | undefined): Usage {
  if (usage.costUsd !== undefined || !pricing) return usage;
  return { ...usage, costUsd: usage.promptTokens * pricing.prompt + usage.completionTokens * pricing.completion };
}

/** Parse a non-streamed `/chat/completions` body. Errors embedded in a 200 body are thrown. */
export function parseCompletionJson(json: unknown, requestedModel: string, now: () => number = Date.now): Completion {
  const j = (json ?? {}) as Record<string, any>;
  if (j.error) throw providerBodyError(j.error, now());
  const choice = Array.isArray(j.choices) ? j.choices[0] : undefined;
  if (!choice) throw new AIError("server", "Provider returned no choices");
  if (choice.error) throw providerBodyError(choice.error, now());
  const model = typeof j.model === "string" && j.model ? j.model : requestedModel;
  const msg = choice.message ?? {};
  const toolCalls: ToolCall[] = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map((c: any, i: number) => ({
        id: String(c?.id ?? `call_${i}`),
        name: String(c?.function?.name ?? ""),
        arguments: typeof c?.function?.arguments === "string" ? c.function.arguments : JSON.stringify(c?.function?.arguments ?? {}),
      }))
    : [];
  return {
    text: typeof msg.content === "string" ? msg.content : "",
    toolCalls,
    finishReason: mapFinishReason(choice.finish_reason ?? choice.native_finish_reason),
    usage: toUsage(model, j.usage),
    model,
  };
}

async function readStream(res: Response, requestedModel: string, onDelta: (d: string) => void, now: () => number): Promise<Completion> {
  if (!res.body) {
    // Some fetch stubs return no body stream; fall back to a full read.
    return parseSseText(await res.text(), requestedModel, onDelta, now);
  }
  const acc = new SseAccumulator(requestedModel, onDelta, now);
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (acc.line(line)) return acc.result();
      }
    }
    buf += decoder.decode();
    if (buf) acc.line(buf);
    return acc.result();
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

/** Parse a complete SSE payload (tests and body-less fetch stubs). */
export function parseSseText(text: string, requestedModel: string, onDelta: (d: string) => void = () => {}, now: () => number = Date.now): Completion {
  const acc = new SseAccumulator(requestedModel, onDelta, now);
  for (const line of text.split("\n")) if (acc.line(line)) break;
  return acc.result();
}

class SseAccumulator {
  private text = "";
  private model: string;
  private finish: FinishReason = "unknown";
  private usage: WireUsage | undefined;
  private tools = new Map<number, { id: string; name: string; arguments: string }>();
  private sawData = false;

  constructor(requestedModel: string, private onDelta: (d: string) => void, private now: () => number) {
    this.model = requestedModel;
  }

  /** Returns true on `[DONE]`. Throws on an in-stream error. */
  line(raw: string): boolean {
    const line = raw.replace(/\r$/, "");
    if (!line.startsWith("data:")) return false; // comments (": OPENROUTER PROCESSING"), event:, blank
    const data = line.slice(5).trim();
    if (!data) return false;
    if (data === "[DONE]") return true;
    let chunk: any;
    try {
      chunk = JSON.parse(data);
    } catch {
      return false; // partial/garbage line; ignore
    }
    this.sawData = true;
    if (chunk.error) throw providerBodyError(chunk.error, this.now());
    if (typeof chunk.model === "string" && chunk.model) this.model = chunk.model;
    if (chunk.usage) this.usage = chunk.usage;
    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
    if (!choice) return false;
    if (choice.error) throw providerBodyError(choice.error, this.now());
    const delta = choice.delta ?? {};
    if (typeof delta.content === "string" && delta.content) {
      this.text += delta.content;
      try { this.onDelta(delta.content); } catch { /* listener errors never break the stream */ }
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = typeof tc.index === "number" ? tc.index : this.tools.size;
        const cur = this.tools.get(idx) ?? { id: "", name: "", arguments: "" };
        if (tc.id) cur.id = String(tc.id);
        if (tc.function?.name) cur.name += String(tc.function.name);
        if (tc.function?.arguments) cur.arguments += String(tc.function.arguments);
        this.tools.set(idx, cur);
      }
    }
    if (choice.finish_reason) this.finish = mapFinishReason(choice.finish_reason);
    return false;
  }

  result(): Completion {
    if (!this.sawData) throw new AIError("server", "Provider stream ended without data");
    const toolCalls = [...this.tools.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([i, t]) => ({ id: t.id || `call_${i}`, name: t.name, arguments: t.arguments || "{}" }));
    return { text: this.text, toolCalls, finishReason: this.finish, usage: toUsage(this.model, this.usage), model: this.model };
  }
}

function finishOrThrow(c: Completion, req: CompletionRequest): Completion {
  if (c.finishReason === "length" && !req.allowTruncated) {
    throw new AIError("truncated", `Output truncated at ${c.usage.completionTokens || "max"} tokens`, { partial: c, retryable: false });
  }
  if (c.finishReason === "content_filter") {
    throw new AIError("content_filtered", "The provider's content filter blocked this response", { partial: c, retryable: false });
  }
  if (!c.text.trim() && c.toolCalls.length === 0 && c.finishReason !== "length") {
    throw new AIError("server", "The model returned an empty response", { retryable: true });
  }
  return c;
}

// ── Errors ──────────────────────────────────────────────────────────────────

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

interface HeaderLike { get(name: string): string | null }

/** Parse Retry-After (seconds or HTTP date) / X-RateLimit-Reset (epoch s/ms) into epoch ms. */
export function parseRetryAt(headers: HeaderLike | Record<string, unknown> | undefined, now: number): number | undefined {
  if (!headers) return undefined;
  const get = (name: string): string | null => {
    if (typeof (headers as HeaderLike).get === "function") return (headers as HeaderLike).get(name);
    const rec = headers as Record<string, unknown>;
    const k = Object.keys(rec).find((x) => x.toLowerCase() === name.toLowerCase());
    return k !== undefined && rec[k] != null ? String(rec[k]) : null;
  };
  const ra = get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return now + Math.max(0, secs) * 1000;
    const date = Date.parse(ra);
    if (Number.isFinite(date)) return Math.max(now, date);
  }
  const reset = get("x-ratelimit-reset");
  if (reset) {
    const v = Number(reset);
    if (Number.isFinite(v)) {
      if (v > 1e12) return Math.max(now, v); // epoch ms
      if (v > 1e9) return Math.max(now, v * 1000); // epoch s
      return now + Math.max(0, v) * 1000; // delta s
    }
  }
  return undefined;
}

function extractMessage(text: string): { message: string; metadata?: any; code?: unknown } {
  try {
    const j = JSON.parse(text);
    const e = j?.error ?? j;
    const message = typeof e?.message === "string" ? e.message : typeof e === "string" ? e : text;
    return { message, metadata: e?.metadata, code: e?.code };
  } catch {
    return { message: text };
  }
}

/** Map an HTTP failure to an `AIError`. Exported for tests. */
export function httpError(status: number, bodyText: string, headers: HeaderLike | undefined, now: number): AIError {
  const { message: raw, metadata } = extractMessage(bodyText);
  const message = (raw || `HTTP ${status}`).slice(0, 300);
  const lower = message.toLowerCase();

  if (status === 401) return new AIError("auth", `Authentication failed: ${message}`, { status });
  if (status === 403) {
    if (/flagged|moderation|content/.test(lower)) return new AIError("content_filtered", message, { status });
    return new AIError("auth", `Access denied: ${message}`, { status });
  }
  if (status === 402) return new AIError("budget_exceeded", `OpenRouter credits exhausted: ${message}`, { status, retryable: false });
  if (status === 404) return new AIError("model_unavailable", message, { status });
  if (status === 408) return new AIError("timeout", message, { status });
  if (status === 429) {
    const retryAt = parseRetryAt(headers, now) ?? parseRetryAt(metadata?.headers, now);
    return new AIError("rate_limited", `Rate limited: ${message}`, { status, retryAt });
  }
  if (status === 400 || status === 413 || status === 422) {
    if (/(not a valid model|model .*not (found|exist)|no endpoints found|is not available)/.test(lower)) {
      return new AIError("model_unavailable", message, { status });
    }
    return new AIError("bad_request", message, { status });
  }
  if (status >= 500) return new AIError("server", `Provider error (${status}): ${message}`, { status });
  return new AIError("unknown", `HTTP ${status}: ${message}`, { status, retryable: false });
}

function providerBodyError(e: any, now: number): AIError {
  const status = typeof e?.code === "number" ? e.code : 500;
  const message = typeof e?.message === "string" ? e.message : "Provider error";
  return httpError(status, JSON.stringify({ error: { message, metadata: e?.metadata } }), undefined, now);
}

function transportError(err: unknown, callerSignal: AbortSignal, link: LinkedSignal): AIError {
  if (err instanceof AIError) return err;
  if (callerSignal.aborted) return new AIError("cancelled", "Cancelled", { cause: err });
  if (link.timedOut()) return new AIError("timeout", "Request timed out", { cause: err });
  if (isAbortError(err)) return new AIError("cancelled", "Cancelled", { cause: err });
  const msg = err instanceof Error ? err.message : String(err);
  return new AIError("network", `Network error: ${msg}`, { cause: err });
}

// ── Signals ─────────────────────────────────────────────────────────────────

export interface LinkedSignal {
  signal: AbortSignal;
  timedOut(): boolean;
  /** Removes the listener on the parent and clears the timer. Always call it. */
  cleanup(): void;
}

/** A child signal aborted by the parent or after `timeoutMs`. Leak-free: `cleanup()` detaches. */
export function linkSignal(parent: AbortSignal, timeoutMs?: number): LinkedSignal {
  const ctrl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctrl.abort(parent.reason);
  if (parent.aborted) ctrl.abort(parent.reason);
  else parent.addEventListener("abort", onAbort, { once: true });
  const timer =
    timeoutMs && timeoutMs > 0 && Number.isFinite(timeoutMs)
      ? setTimeout(() => {
          timedOut = true;
          ctrl.abort(new AIError("timeout", "Request timed out"));
        }, timeoutMs)
      : undefined;
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    cleanup() {
      if (timer) clearTimeout(timer);
      parent.removeEventListener("abort", onAbort);
    },
  };
}
