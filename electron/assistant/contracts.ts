/**
 * Structural mirrors of the cross-stream contracts WS-E codes against (AI_AUDIT §4.4.3, §5.5),
 * kept to the members WS-E actually uses. Because TypeScript is structural, definitions typed with
 * these are assignable to WS-A's `TaskDefinition` / `TaskContext` (electron/ai/registry.ts) and
 * accept WS-B's `KnowledgeReader` and WS-C's `BookContentReader` as-is.
 *
 * When WS-A's registry lands, `TaskDefinitionLike` can be replaced by an import with no other
 * change.
 */

import type { AISettings, JobResult, JobSpec, JobTicket, CancelSelector, ModelRole, Priority } from "../shared/ai/types";
import type { KnowledgeReader } from "../shared/knowledge/types";
import type { BookContentV2, SourceChapter } from "../shared/pipeline/types";
import type { Completion, CompletionRequest } from "../ai/client";

export type { KnowledgeReader } from "../shared/knowledge/types";
export type { Completion, CompletionRequest } from "../ai/client";

/** WS-C (async: PDF parsing is async). Sync implementations are accepted too. */
export interface BookContentReader {
  getChapter(filePath: string, chapterIndex: number): Promise<SourceChapter> | SourceChapter;
  getBook(filePath: string): Promise<BookContentV2> | BookContentV2;
}

export type TaskCompleteRequest = Omit<CompletionRequest, "model" | "signal"> & { role?: ModelRole };

/** Subset of WS-A's `TaskContext` used by WS-E tasks. */
export interface TaskContextLike {
  jobId: string;
  signal: AbortSignal;
  settings: AISettings;
  model: string;
  complete(req: TaskCompleteRequest): Promise<Completion>;
  delta(text: string): void;
  books: BookContentReader;
  knowledge: KnowledgeReader;
  log: (level: "debug" | "info" | "warn", msg: string, data?: unknown) => void;
}

export interface KeyContextLike {
  model: string;
  settings: AISettings;
}

/** Subset of WS-A's `TaskDefinition`. */
export interface TaskDefinitionLike<I, O> {
  id: JobSpec["task"];
  version: number;
  role: ModelRole;
  temperature?: number;
  maxTokens?: number;
  maxConcurrency?: number;
  lane?(spec: JobSpec<I>): string | undefined;
  cacheable: boolean;
  key(input: I, ctx: KeyContextLike): string;
  run(input: I, ctx: TaskContextLike): Promise<O>;
  validate?(output: unknown): output is O;
}

/** Subset of WS-A's `Scheduler`. */
export interface SchedulerLike {
  submit<I>(spec: JobSpec<I>, owner?: number): JobTicket;
  result<O>(jobId: string): Promise<JobResult<O>>;
  cancel(sel: CancelSelector | { owner: number }): number;
}

/** Subset of WS-A's `TaskRegistry`. */
export interface TaskRegistryLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(def: TaskDefinitionLike<any, any>): void;
}

export type { Priority };
