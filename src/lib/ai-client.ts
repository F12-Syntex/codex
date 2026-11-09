/* ── Legacy AI client (Phase 2 compatibility shim) ──
 *
 * The old renderer modules (`ai-wiki`, `ai-condense`, `ai-formatting`, `ai-buddy`…) still call
 * `ai` / `aiText`. They no longer reach OpenRouter from the renderer: every call is
 * the `legacy.complete` task on the main-process AI core (`ai:submit` → `ai:result`), so legacy
 * and new features share one queue (concurrency, rate limit, retries, circuit breaker), one
 * cache, one usage ledger and the one API key in safeStorage.
 *
 * - The preset picks a model role (quick → fast, creative → creative, format/format-regen →
 *   format); the models come from Settings › Intelligence. `overrides` and `retries` are ignored
 *   (the scheduler owns retries).
 * - Aborting the caller's signal cancels the job; an explicit `timeout` cancels it too.
 * - Errors keep the legacy `AIError` codes so existing callers behave as before.
 *
 * Deleted in Phase 3 once nothing imports it.
 */

import type { AIErrorInfo, JobResult } from "@shared/ai/types";
import { Priority } from "@shared/ai/types";
import { getPreset, type PresetOverrides } from "./ai-presets";
import { ai as core, hasRpc } from "./ai/bridge";

/* ── Types ─────────────────────────────────────────────── */

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  finish_reason: string;
}

export interface AIRequestOptions {
  /** Preset ID — determines the model role and default temperature */
  preset: string;
  /** Messages to send */
  messages: AIMessage[];
  /** Override temperature (takes precedence over preset) */
  temperature?: number;
  /** Override max_tokens (takes precedence over preset) */
  maxTokens?: number;
  /** Caller-provided abort signal — the job is cancelled when this fires */
  signal?: AbortSignal;
  /** Overall timeout in ms, including time spent queued. Default: none (main enforces a
   *  per-request timeout; queueing behind other work is expected). */
  timeout?: number;
  /** @deprecated Ignored: the main-process scheduler owns retries. */
  retries?: number;
  /** @deprecated Ignored: models come from Settings › Intelligence. */
  overrides?: PresetOverrides;
  /** Ask the core for loosely-parsed JSON (one re-ask on failure); the reply is re-serialised JSON. */
  json?: boolean;
  /** Internal: model role override (used by the openrouter shim for web lookups). */
  role?: "fast" | "rewrite" | "format" | "analysis" | "chat" | "creative" | "web";
}

export class AIError extends Error {
  constructor(
    message: string,
    public readonly code: AIErrorCode,
    public readonly status?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "AIError";
  }
}

export type AIErrorCode =
  | "no_api_key"
  | "invalid_preset"
  | "timeout"
  | "aborted"
  | "rate_limited"
  | "auth_error"
  | "server_error"
  | "empty_response"
  | "network_error"
  | "unknown";

/* ── Mapping ───────────────────────────────────────────── */

const PRESET_ROLE: Record<string, NonNullable<AIRequestOptions["role"]>> = {
  quick: "fast",
  creative: "creative",
  format: "format",
  "format-regen": "format",
};

/** Core error → legacy error (codes the old callers switch on). */
export function toLegacyError(info: AIErrorInfo | undefined): AIError {
  if (!info) return new AIError("AI request failed", "unknown");
  switch (info.code) {
    case "no_api_key":
      return new AIError("No API key configured", "no_api_key");
    case "auth":
      return new AIError(info.message || "Authentication failed", "auth_error", info.status);
    case "rate_limited":
      return new AIError(info.message || "Rate limited — too many requests", "rate_limited", info.status, true);
    case "server":
    case "model_unavailable":
      return new AIError(info.message, "server_error", info.status, info.retryable);
    case "network":
      return new AIError(info.message, "network_error", info.status, true);
    case "timeout":
      return new AIError(info.message || "Request timed out", "timeout", info.status, true);
    case "cancelled":
      return new AIError("Request aborted", "aborted");
    case "parse":
    case "validation":
    case "truncated":
    case "content_filtered":
      return new AIError(info.message || "AI returned an unusable response", "empty_response", info.status, true);
    default:
      return new AIError(info.message || "Unknown error", "unknown", info.status, info.retryable);
  }
}

/* ── Public API ────────────────────────────────────────── */

/** Send an AI request through the main-process AI core. Throws `AIError` on failure. */
export async function ai(options: AIRequestOptions): Promise<AIResponse> {
  const preset = getPreset(options.preset);
  if (!preset && !options.role) {
    throw new AIError(`Unknown preset: "${options.preset}"`, "invalid_preset");
  }
  if (!hasRpc()) throw new AIError("AI is only available in the desktop app", "no_api_key");
  if (options.signal?.aborted) throw new AIError("Request aborted", "aborted");

  const role = options.role ?? PRESET_ROLE[options.preset] ?? "fast";
  const temperature = options.temperature ?? preset?.temperature;
  const maxTokens = options.maxTokens ?? preset?.maxTokens;
  // Creative / regeneration presets expect a fresh answer each time: don't read the cache.
  const fresh = (temperature ?? 0) >= 0.7;

  let ticket;
  try {
    ticket = await core.submit({
      task: "legacy.complete",
      input: {
        messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
        role,
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { maxTokens }),
        ...(options.json && { json: true }),
      },
      priority: Priority.Visible,
      cache: fresh ? "refresh" : "use",
    });
  } catch (err) {
    throw new AIError(err instanceof Error ? err.message : "AI request failed", "unknown");
  }

  const jobId = ticket.jobId;
  let timedOut = false;
  const cancel = () => void core.cancel({ jobId }).catch(() => {});
  const onAbort = () => cancel();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = options.timeout
    ? setTimeout(() => {
        timedOut = true;
        cancel();
      }, options.timeout)
    : null;

  let result: JobResult;
  try {
    result = await core.result(jobId);
  } catch (err) {
    throw new AIError(err instanceof Error ? err.message : "AI request failed", "unknown");
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }

  if (result.state === "cancelled") {
    if (timedOut && !options.signal?.aborted) throw new AIError("Request timed out", "timeout", undefined, true);
    throw new AIError("Request aborted", "aborted");
  }
  if (result.state === "error") throw toLegacyError(result.error);

  const out = result.output as { text?: string; model?: string; finishReason?: string } | undefined;
  const content = out?.text?.trim();
  if (!content) throw new AIError("AI returned an empty response", "empty_response", undefined, true);

  const prompt = result.usage.reduce((n, u) => n + u.promptTokens, 0);
  const completion = result.usage.reduce((n, u) => n + u.completionTokens, 0);
  return {
    content,
    model: out?.model ?? "",
    usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion },
    finish_reason: out?.finishReason ?? "unknown",
  };
}

/**
 * Convenience: send an AI request and get just the content string.
 * Throws AIError on failure.
 */
export async function aiText(options: AIRequestOptions): Promise<string> {
  const response = await ai(options);
  return response.content;
}
