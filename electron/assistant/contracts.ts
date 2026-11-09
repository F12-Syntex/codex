/**
 * Cross-stream contracts WS-E codes against, re-exported from their owners so assistant code has
 * one import site: WS-A's task contracts (`electron/ai/registry.ts`) and scheduler, WS-B's
 * `KnowledgeReader`, WS-C's `BookContentReader` (declared by WS-A's registry).
 */

import type { Scheduler } from "../ai/scheduler";
import type { TaskRegistry } from "../ai/registry";

export type {
  BookContentReader, KeyContext, TaskCompletionRequest, TaskContext, TaskDefinition, TaskRegistry, TaskServices,
} from "../ai/registry";
export type { KnowledgeReader } from "../shared/knowledge/types";
export type { Completion, CompletionRequest } from "../ai/client";

/** The scheduler surface the assistant service uses (WS-A's `Scheduler` satisfies it). */
export type SchedulerLike = Pick<Scheduler, "submit" | "result" | "cancel">;

/** The registry surface used to register WS-E tasks. */
export type TaskRegistryLike = Pick<TaskRegistry, "register">;
