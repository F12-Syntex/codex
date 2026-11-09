/**
 * Shared helpers for WS-D's chapter tasks. Task contracts come from WS-A's `electron/ai/registry.ts`
 * (`TaskDefinition`, `TaskContext`); the aliases below just keep task files short.
 */

import { isAIError } from "../errors";

export type { TaskDefinition as ChapterTaskDefinition, TaskContext as ChapterTaskContext } from "../registry";

/** The model ran out of output tokens (`AIError("truncated")`): split the chunk and retry. */
export function isTruncation(err: unknown): boolean {
  return isAIError(err) ? err.code === "truncated" : !!err && typeof err === "object" && (err as { code?: unknown }).code === "truncated";
}

/** `completeJson` gave up after its one re-ask (`parse` / `validation`): keep originals. */
export function isUnusableReply(err: unknown): boolean {
  const code = isAIError(err) ? err.code : !!err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  return code === "parse" || code === "validation";
}

/** The job was cancelled; tasks rethrow these untouched. */
export function isCancellation(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; name?: unknown };
  return e.code === "cancelled" || e.name === "AbortError";
}

/** A plain-object property of a parsed reply, or null. */
export function objectField(value: unknown, field: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = (value as Record<string, unknown>)[field];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
