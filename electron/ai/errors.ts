/**
 * The one error type thrown inside the AI core (owner: WS-A). Crosses IPC as `AIErrorInfo`.
 *
 * Tasks throw `AIError` for task-level failures ("validation", "truncated" after salvage fails…);
 * the client throws it for transport/provider failures. The scheduler alone decides retries
 * (AI_AUDIT §4.4.3): tasks never retry transport errors themselves.
 */

import type { AIErrorCode, AIErrorInfo } from "../shared/ai/types";
import type { Completion } from "./client";

/** Codes the scheduler retries with backoff (rate_limited is handled separately via the limiter). */
export const BACKOFF_CODES: ReadonlySet<AIErrorCode> = new Set<AIErrorCode>(["server", "network", "timeout"]);
/** Codes that trip the circuit breaker. */
export const BREAKER_CODES: ReadonlySet<AIErrorCode> = new Set<AIErrorCode>(["auth", "no_api_key"]);

const DEFAULT_RETRYABLE: ReadonlySet<AIErrorCode> = new Set<AIErrorCode>(["rate_limited", "server", "network", "timeout"]);

export interface AIErrorOptions {
  status?: number;
  retryAt?: number;
  retryable?: boolean;
  /** The partial completion, for `truncated` / `content_filtered` (tasks may salvage it). */
  partial?: Completion;
  /** Validation issues (`parse` / `validation`), human-readable. */
  issues?: string[];
  cause?: unknown;
}

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAt?: number;
  readonly partial?: Completion;
  readonly issues?: string[];

  constructor(code: AIErrorCode, message: string, opts: AIErrorOptions = {}) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.retryable = opts.retryable ?? DEFAULT_RETRYABLE.has(code);
    this.status = opts.status;
    this.retryAt = opts.retryAt;
    this.partial = opts.partial;
    this.issues = opts.issues;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }

  toInfo(): AIErrorInfo {
    const info: AIErrorInfo = { code: this.code, message: this.message, retryable: this.retryable };
    if (this.status !== undefined) info.status = this.status;
    if (this.retryAt !== undefined) info.retryAt = this.retryAt;
    return info;
  }
}

export function isAIError(err: unknown): err is AIError {
  return err instanceof AIError;
}

/** True for DOM/Node abort errors (fetch, AbortSignal.throwIfAborted, our own sleep). */
export function isAbortError(err: unknown): boolean {
  return !!err && typeof err === "object" && ((err as { name?: string }).name === "AbortError" || (err as { code?: string }).code === "ABORT_ERR");
}

/** Normalise anything thrown into an `AIError`. `signal` disambiguates abort vs timeout. */
export function toAIError(err: unknown, signal?: AbortSignal): AIError {
  if (err instanceof AIError) return err;
  if (signal?.aborted) return new AIError("cancelled", "Cancelled", { cause: err });
  if (isAbortError(err)) return new AIError("cancelled", "Cancelled", { cause: err });
  if (err && typeof err === "object" && (err as { name?: string }).name === "TimeoutError") {
    return new AIError("timeout", "Request timed out", { cause: err });
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AIError("unknown", message || "Unknown error", { cause: err, retryable: false });
}

export function errorInfo(err: unknown): AIErrorInfo {
  return toAIError(err).toInfo();
}

export function cancelledError(reason?: unknown): AIError {
  const msg = typeof reason === "string" ? reason : reason instanceof Error ? reason.message : "Cancelled";
  return new AIError("cancelled", msg || "Cancelled", { retryable: false });
}
