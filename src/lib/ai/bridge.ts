/**
 * Typed renderer wrappers for the AI core (`ai:*`, owner WS-A) and the chapter orchestrator
 * (`chapters:*`, `bulk:*`, `style:*`, owner WS-D). Thin: no state, no caching.
 * Subscribe to progress with `src/lib/ai/events.ts`.
 */

import type {
  AISettings, ArtifactKind, BookAIPrefs, BulkRequest, CacheSelector, CancelSelector, EnsureRequest, JobSpec,
} from "@shared/ai/types";
import { rpc } from "./rpc";

export { Priority } from "@shared/ai/types";
export { hasRpc, RpcUnavailableError } from "./rpc";

export const ai = {
  submit: (spec: JobSpec) => rpc("ai:submit", spec),
  /** Resolves when the job finishes; never rejects for AI errors (see `JobResult.error`). */
  result: (jobId: string) => rpc("ai:result", jobId),
  /** Submit and wait for the result in one call. */
  run: async (spec: JobSpec) => rpc("ai:result", (await rpc("ai:submit", spec)).jobId),
  cancel: (sel: CancelSelector) => rpc("ai:cancel", sel),
  getSettings: () => rpc("ai:settings:get"),
  updateSettings: (patch: Partial<AISettings>) => rpc("ai:settings:update", patch),
  setKey: (key: string) => rpc("ai:key:set", key),
  testKey: () => rpc("ai:key:test"),
  /** Current health (pushed afterwards as `health` events). */
  health: () => rpc("ai:health"),
  models: () => rpc("ai:models"),
  usage: (sel: { filePath?: string; sinceMs?: number } = {}) => rpc("ai:usage", sel),
  cacheStats: () => rpc("ai:cache:stats"),
  clearCache: (sel: CacheSelector) => rpc("ai:cache:clear", sel),
} as const;

export const chapters = {
  getPrefs: (filePath: string) => rpc("chapters:prefs:get", filePath),
  setPrefs: (filePath: string, patch: Partial<BookAIPrefs>) => rpc("chapters:prefs:set", filePath, patch),
  ensure: (req: EnsureRequest) => rpc("chapters:ensure", req),
  artifacts: (filePath: string, chapterIndex: number) => rpc("chapters:artifacts", filePath, chapterIndex),
  status: (filePath: string) => rpc("chapters:status", filePath),
  clear: (filePath: string, kind: ArtifactKind | "all", chapterIndex?: number) =>
    rpc("chapters:clear", filePath, kind, chapterIndex),
} as const;

export const bulk = {
  start: (req: BulkRequest) => rpc("bulk:start", req),
  cancel: (runId: string) => rpc("bulk:cancel", runId),
  status: (filePath: string) => rpc("bulk:status", filePath),
} as const;

export const style = {
  get: (filePath: string) => rpc("style:get", filePath),
  regenerate: (filePath: string, component: string, instruction?: string) =>
    rpc("style:regenerate", filePath, component, instruction),
} as const;
