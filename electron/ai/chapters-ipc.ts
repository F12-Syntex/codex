/**
 * Chapters / bulk / style (chapters:*, bulk:*, style:*) RPC handlers (owner: WS-D).
 *
 * `registerChapters(ctx)` runs right after `registerAI` in `registerAll`. When WS-A's runtime
 * exists it:
 *  - registers WS-D's tasks (title, condense, format, comments, style.regenerate);
 *  - provides the ArtifactStore as `TaskServices.artifacts`;
 *  - builds the orchestrator on the runtime's scheduler, WS-C's `getBookContentReader()` and
 *    (lazily) WS-B's knowledge service for format speakers and knowledge runs;
 *  - registers every chapters:/bulk:/style: channel.
 * Without a runtime it registers nothing. Phase 1 is additive: nothing calls these channels yet,
 * and the legacy AISidebar/hooks keep their own code paths.
 *
 * Do not import `electron` at the top level; take what you need from `ctx` or inject it.
 */

import type { AreaContext } from "../ipc/context";
import type { AIEvent, BookAIPrefs, Priority } from "../shared/ai/types";
import type { KnowledgeReader } from "../shared/knowledge/types";
import { SqlArtifactStore, SqlPrefsStore } from "./artifacts";
import { SqlStyleStore } from "./style";
import {
  ChapterOrchestrator, ORCHESTRATOR_OWNER, type ChapterContentReader, type KnowledgePort, type OrchestratorOptions, type SchedulerPort,
} from "./orchestrator";
import { peekAIRuntime } from "./runtime";
import { titleTask } from "./tasks/title";
import { rewriteTask } from "./tasks/condense";
import { formatTask } from "./tasks/format";
import { commentsTask } from "./tasks/comments";
import { styleRegenTask } from "./tasks/style-regen";
import type { TaskDefinition } from "./registry";
import { ensureBookMigrated } from "../book/legacy-migrate";
import { onBookLastWindowClosed } from "../book/windows";

/** WS-D's task definitions, registered with WS-A's `TaskRegistry`. */
export const CHAPTER_TASKS: readonly TaskDefinition[] = [titleTask, rewriteTask, formatTask, commentsTask, styleRegenTask];

export interface ChapterRuntime {
  scheduler: SchedulerPort;
  books: ChapterContentReader;
  knowledge?: KnowledgePort;
  knowledgeReader?: Pick<KnowledgeReader, "getContext">;
  /** `AISettings.defaults` (WS-A). */
  getDefaults?: () => BookAIPrefs;
  /** Broadcast; default `ctx.broadcast("ai:event", e)`. */
  emit?: (e: AIEvent) => void;
  options?: OrchestratorOptions;
}

let orchestrator: ChapterOrchestrator | null = null;
let offWindowClosed: (() => void) | null = null;

/** The live orchestrator (null until registered), e.g. for main-side callers. */
export function getChapterOrchestrator(): ChapterOrchestrator | null {
  return orchestrator;
}

/** Lazy adapters onto WS-B/WS-C (registered after this area), resolved at call time. */
function defaultRuntime(ctx: AreaContext): ChapterRuntime | null {
  const ai = peekAIRuntime();
  if (!ai) return null;
  for (const def of CHAPTER_TASKS) if (!ai.registry.has(def.id)) ai.registry.register(def);

  /* eslint-disable @typescript-eslint/no-require-imports */
  const books: ChapterContentReader = {
    getChapter: (f, i) => (require("../book/content-cache") as typeof import("../book/content-cache")).getBookContentReader().getChapter(f, i),
    getBook: (f) => (require("../book/content-cache") as typeof import("../book/content-cache")).getBookContentReader().getBook(f),
  };
  const knowledgeService = () => (require("../knowledge/ipc") as typeof import("../knowledge/ipc")).getKnowledgeService();
  const knowledgeReader: Pick<KnowledgeReader, "getContext"> = {
    getContext: (req) => {
      const svc = knowledgeService();
      if (!svc) throw new Error("knowledge service not registered");
      return svc.getContext(req);
    },
  };
  const knowledge: KnowledgePort = {
    chapterState(filePath, chapter) {
      if (!knowledgeService()) return "skipped";
      const { getRun, KNOWLEDGE_TASK_VERSION } = require("../knowledge/ingest") as typeof import("../knowledge/ingest");
      const run = getRun(ctx.db, filePath, chapter.id);
      if (!run) return "missing";
      if (run.status === "skipped") return "skipped";
      if (run.status !== "done") return "missing";
      return Number(run.task_version) === KNOWLEDGE_TASK_VERSION ? "ready" : "stale";
    },
    ingest(filePath, chapterIndex, priority: Priority, group) {
      return ai.scheduler.submit({
        task: "chapter.knowledge",
        input: { filePath, chapterIndex },
        scope: { filePath, chapterIndex },
        priority,
        group,
      }, ORCHESTRATOR_OWNER);
    },
  };
  /* eslint-enable @typescript-eslint/no-require-imports */

  return {
    scheduler: ai.scheduler,
    books,
    knowledge,
    knowledgeReader,
    getDefaults: () => ai.settings.get().defaults,
    emit: (e) => ai.events.emit(e),
  };
}

/**
 * Build the orchestrator and register the channels. `r` overrides the runtime wiring (tests);
 * returns null (and registers nothing) when no AI runtime exists.
 */
export function registerChapters(ctx: AreaContext, r?: ChapterRuntime | null): ChapterOrchestrator | null {
  const rt = r === undefined ? defaultRuntime(ctx) : r;
  if (!rt) return null;
  const emit = rt.emit ?? ((e: AIEvent) => ctx.broadcast("ai:event", e));
  const artifacts = new SqlArtifactStore(ctx.db, emit);
  peekAIRuntime()?.provideServices({ artifacts });
  const o = new ChapterOrchestrator({
    scheduler: rt.scheduler,
    books: rt.books,
    artifacts,
    prefs: new SqlPrefsStore(ctx.db, rt.getDefaults),
    style: new SqlStyleStore(ctx.db),
    knowledge: rt.knowledge,
    knowledgeReader: rt.knowledgeReader,
    emit,
    options: rt.options,
  });
  orchestrator?.dispose();
  orchestrator = o;
  // Last reader window of a book closed → stop its chapter work (matrix #11: no orphan writes).
  offWindowClosed?.();
  offWindowClosed = onBookLastWindowClosed((filePath) => {
    if (orchestrator === o) o.cancelBook(filePath);
  });

  const str = (v: unknown, name: string): string => {
    if (typeof v !== "string" || !v) throw new Error(`chapters: ${name} must be a non-empty string`);
    return v;
  };
  const idx = (v: unknown): number => {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new Error("chapters: chapterIndex must be an integer ≥ 0");
    return v;
  };

  // Every read first awaits the book's one-time legacy migration (legacy titles, layers, comments
  // and toggles become artifacts/prefs), so a first `ensure` never re-buys work already paid for.
  const migrated = <T>(filePath: string, fn: () => T | Promise<T>): Promise<T> => ensureBookMigrated(filePath).then(fn);

  ctx.handle("chapters:prefs:get", (_m, filePath) => migrated(str(filePath, "filePath"), () => o.getPrefs(filePath)));
  ctx.handle("chapters:prefs:set", (_m, filePath, patch) => migrated(str(filePath, "filePath"), () => o.setPrefs(filePath, patch ?? {})));
  ctx.handle("chapters:ensure", (_m, req) => {
    const r = { ...req, filePath: str(req?.filePath, "filePath"), chapterIndex: idx(req?.chapterIndex) };
    return migrated(r.filePath, () => o.ensure(r));
  });
  ctx.handle("chapters:artifacts", (_m, filePath, chapterIndex) => {
    const i = idx(chapterIndex);
    return migrated(str(filePath, "filePath"), () => o.chapterArtifacts(filePath, i));
  });
  ctx.handle("chapters:status", (_m, filePath) => migrated(str(filePath, "filePath"), () => o.bookStatus(filePath)));
  ctx.handle("chapters:titles", (_m, filePath) => migrated(str(filePath, "filePath"), () => o.chapterTitles(filePath)));
  ctx.handle("chapters:clear", (_m, filePath, kind, chapterIndex) => {
    o.clear(str(filePath, "filePath"), kind, chapterIndex === undefined || chapterIndex === null ? undefined : idx(chapterIndex));
  });
  ctx.handle("bulk:start", (_m, req) => o.startBulk({ ...req, filePath: str(req?.filePath, "filePath") }));
  ctx.handle("bulk:cancel", (_m, runId) => o.cancelBulk(str(runId, "runId")));
  ctx.handle("bulk:status", (_m, filePath) => o.bulkStatus(str(filePath, "filePath")));
  ctx.handle("style:get", (_m, filePath) => o.getStyle(str(filePath, "filePath")));
  ctx.handle("style:regenerate", (_m, filePath, component, instruction) =>
    o.regenerateStyle(str(filePath, "filePath"), str(component, "component"), typeof instruction === "string" ? instruction : undefined));
  return o;
}
