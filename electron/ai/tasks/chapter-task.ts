/**
 * The slice of WS-A's `TaskDefinition` / `TaskContext` (AI_AUDIT §4.4.3) that WS-D's chapter tasks
 * use (owner: WS-D).
 *
 * Kept local and structural so the tasks compile and unit-test before `electron/ai/registry.ts`
 * lands. Every member mirrors §4.4.3 exactly, so a real `TaskContext` is assignable to
 * `ChapterTaskContext` and every `ChapterTaskDefinition` is assignable to `TaskDefinition`.
 * Phase 2: replace these with `import type { TaskDefinition, TaskContext } from "../registry"`.
 */

import type { ModelRole, TaskId } from "../../shared/ai/types";
import type { Completion, CompletionRequest } from "../client";
import type { ArtifactStore } from "../../shared/ai/types";

export type ChapterCompleteRequest = Omit<CompletionRequest, "model" | "signal"> & { role?: ModelRole };

export interface ChapterTaskContext {
  jobId: string;
  signal: AbortSignal;
  model: string;
  complete(req: ChapterCompleteRequest): Promise<Completion>;
  /** Sub-call cache (per chunk) so a cancelled job resumes where it stopped. */
  memo<T>(subKey: string, fn: () => Promise<T>): Promise<T>;
  progress(done: number, total: number): void;
  log: (level: "debug" | "info" | "warn", msg: string, data?: unknown) => void;
  /** Present on the real context; chapter tasks do not write artifacts themselves (the orchestrator does). */
  artifacts?: ArtifactStore;
}

export interface ChapterTaskDefinition<I, O> {
  id: TaskId;
  /** Bump → cached outputs and artifacts produced by older versions become stale. */
  version: number;
  role: ModelRole;
  temperature?: number;
  maxTokens?: number;
  maxConcurrency?: number;
  cacheable: boolean;
  /** Everything that affects the output, except model and version (the scheduler adds those). */
  key(input: I, ctx: { model: string }): string;
  run(input: I, ctx: ChapterTaskContext): Promise<O>;
  validate?(output: unknown): output is O;
}

/** True when an error (or completion) means the model ran out of output tokens. */
export function isTruncation(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === "truncated";
}

/** True when the job was cancelled; tasks must rethrow these untouched. */
export function isCancellation(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; name?: unknown };
  return e.code === "cancelled" || e.name === "AbortError";
}
