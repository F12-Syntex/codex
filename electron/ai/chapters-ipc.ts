/**
 * Chapters / bulk / style (chapters:*, bulk:*, style:*) RPC handlers (owner: WS-D).
 *
 * Phase 1: `registerChapters(ctx)` registers nothing unless the runtime dependencies (WS-A's
 * scheduler, WS-C's book reader) have been provided with `provideChapterRuntime()`, so the app
 * behaves exactly as before. Phase 2 wiring (once WS-A/WS-C land), in main before `registerAll`:
 *
 *   provideChapterRuntime({ scheduler, books, knowledge?, knowledgeReader?, getDefaults: () => settings.get().defaults });
 *   registry.register(...CHAPTER_TASKS)   // WS-A TaskRegistry
 *
 * Do not import `electron` at the top level; take what you need from `ctx` or inject it.
 */

import type { AreaContext } from "../ipc/context";
import type { BookAIPrefs } from "../shared/ai/types";
import { SqlArtifactStore, SqlPrefsStore } from "./artifacts";
import { SqlStyleStore } from "./style";
import {
  ChapterOrchestrator, type ChapterContentReader, type KnowledgePort, type OrchestratorDeps,
  type OrchestratorOptions, type SchedulerPort,
} from "./orchestrator";
import { titleTask } from "./tasks/title";
import { rewriteTask } from "./tasks/condense";
import { formatTask } from "./tasks/format";
import { commentsTask } from "./tasks/comments";
import { styleRegenTask } from "./tasks/style-regen";

/** WS-D's task definitions, for WS-A's `TaskRegistry.register`. */
export const CHAPTER_TASKS = [titleTask, rewriteTask, formatTask, commentsTask, styleRegenTask] as const;

export interface ChapterRuntime {
  scheduler: SchedulerPort;
  books: ChapterContentReader;
  knowledge?: KnowledgePort;
  knowledgeReader?: OrchestratorDeps["knowledgeReader"];
  /** `AISettings.defaults` (WS-A). */
  getDefaults?: () => BookAIPrefs;
  options?: OrchestratorOptions;
}

let runtime: ChapterRuntime | null = null;
let orchestrator: ChapterOrchestrator | null = null;

/** Provide the runtime dependencies; call before `registerAll()`. */
export function provideChapterRuntime(r: ChapterRuntime | null): void {
  runtime = r;
}

/** The live orchestrator (null until registered), e.g. for main-side callers. */
export function getChapterOrchestrator(): ChapterOrchestrator | null {
  return orchestrator;
}

/** Build the orchestrator on a context. Exported for tests. */
export function createChapterOrchestrator(ctx: Pick<AreaContext, "db" | "broadcast">, r: ChapterRuntime): ChapterOrchestrator {
  const artifacts = new SqlArtifactStore(ctx.db, (e) => ctx.broadcast("ai:event", e));
  const prefs = new SqlPrefsStore(ctx.db, r.getDefaults);
  const style = new SqlStyleStore(ctx.db);
  return new ChapterOrchestrator({
    scheduler: r.scheduler,
    books: r.books,
    artifacts,
    prefs,
    style,
    knowledge: r.knowledge,
    knowledgeReader: r.knowledgeReader,
    emit: (e) => ctx.broadcast("ai:event", e),
    options: r.options,
  });
}

export function registerChapters(ctx: AreaContext, r: ChapterRuntime | null = runtime): ChapterOrchestrator | null {
  if (!r) return null; // Phase 1: nothing registered, app unchanged.
  const o = createChapterOrchestrator(ctx, r);
  orchestrator = o;

  ctx.handle("chapters:prefs:get", (_m, filePath) => o.getPrefs(filePath));
  ctx.handle("chapters:prefs:set", (_m, filePath, patch) => o.setPrefs(filePath, patch ?? {}));
  ctx.handle("chapters:ensure", (_m, req) => o.ensure(req));
  ctx.handle("chapters:artifacts", (_m, filePath, chapterIndex) => o.chapterArtifacts(filePath, chapterIndex));
  ctx.handle("chapters:status", (_m, filePath) => o.bookStatus(filePath));
  ctx.handle("chapters:clear", (_m, filePath, kind, chapterIndex) => {
    o.clear(filePath, kind, chapterIndex);
  });
  ctx.handle("bulk:start", (_m, req) => o.startBulk(req));
  ctx.handle("bulk:cancel", (_m, runId) => o.cancelBulk(runId));
  ctx.handle("bulk:status", (_m, filePath) => o.bulkStatus(filePath));
  ctx.handle("style:get", (_m, filePath) => o.getStyle(filePath));
  ctx.handle("style:regenerate", (_m, filePath, component, instruction) => o.regenerateStyle(filePath, component, instruction));
  return o;
}
