/**
 * Knowledge (knowledge:*) RPC handlers (owner: WS-B).
 *
 * Creates the knowledge service on the shared connection, provides it to the AI runtime as
 * `TaskServices.knowledge`, registers the `chapter.knowledge`, `book.recap` and `entity.lookup`
 * tasks, and registers every `knowledge:*` channel. Phase 1: purely additive — nothing calls these
 * channels yet; the legacy `wiki:*` handlers keep working (they delegate to the same store).
 */

import type { AreaContext } from "../ipc/context";
import { Priority, type AIEvent } from "../shared/ai/types";
import type { Frontier, ReadingPosition, WikiEdit } from "../shared/knowledge/types";
import { peekAIRuntime } from "../ai/runtime";
import { createKnowledgeTask } from "../ai/tasks/knowledge";
import { createRecapTask } from "../ai/tasks/recap";
import { createEntityLookupTask } from "../ai/tasks/entity-lookup";
import type { ChapterLabeler } from "./read";
import type { BookSource } from "./search";
import { createKnowledgeService, type KnowledgeService } from "./service";

let service: KnowledgeService | null = null;
let books: BookSource | null = null;
let labels: ((filePath: string) => ChapterLabeler) | null = null;

/** The service created by `registerKnowledge` (null before). */
export function getKnowledgeService(): KnowledgeService | null {
  return service;
}

/** WS-C (or Phase 2 wiring) hands over book content for search indexing and story labels. */
export function provideKnowledgeBooks(source: BookSource, labelsFor?: (filePath: string) => ChapterLabeler): void {
  books = source;
  if (labelsFor) labels = labelsFor;
}

const lazyBooks: BookSource = {
  getBook(filePath) {
    if (!books) return Promise.reject(new Error("knowledge: no book content source provided"));
    return books.getBook(filePath);
  },
};

const PRIORITIES = new Set<number>(Object.values(Priority));

function isFrontier(v: unknown): v is Frontier {
  const f = v as Frontier;
  return !!f && typeof f === "object" && typeof f.chapterIndex === "number" && Number.isFinite(f.chapterIndex)
    && (f.mode === "frontier" || f.mode === "position" || f.mode === "off")
    && (f.paraId === undefined || typeof f.paraId === "string");
}

function optFrontier(v: unknown): Frontier | undefined {
  return isFrontier(v) ? v : undefined;
}

function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v) throw new Error(`knowledge: ${name} must be a non-empty string`);
  return v;
}

function int(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new Error(`knowledge: ${name} must be an integer ≥ 0`);
  return v;
}

export function registerKnowledge(ctx: AreaContext): void {
  const runtime = peekAIRuntime();
  const emit = (e: AIEvent) => {
    if (runtime) runtime.events.emit(e);
    else ctx.broadcast("ai:event", e);
  };
  const svc = createKnowledgeService({
    db: ctx.db,
    emit,
    spoilerMode: runtime ? () => runtime.settings.get().spoilerMode : undefined,
    labelsFor: (fp) => (labels ? labels(fp) : (i) => String(i + 1)),
    books: lazyBooks,
  });
  // Without a provided source, search simply returns what is indexed.
  const warm = svc.warmSearch;
  svc.warmSearch = (fp) => {
    if (books) warm(fp);
  };
  service = svc;

  if (runtime) {
    runtime.provideServices({ knowledge: svc });
    for (const def of [createKnowledgeTask(svc), createRecapTask(svc), createEntityLookupTask(svc)]) {
      if (!runtime.registry.has(def.id)) runtime.registry.register(def);
    }
  }

  ctx.handle("knowledge:position", (_m, filePath, pos: ReadingPosition) => {
    if (!pos || typeof pos !== "object") throw new Error("knowledge: position is required");
    return svc.recordPosition(str(filePath, "filePath"), {
      chapterIndex: int(pos.chapterIndex, "chapterIndex"),
      paraId: typeof pos.paraId === "string" ? pos.paraId : undefined,
      atChapterEnd: pos.atChapterEnd === true,
      via: pos.via === "tts" || pos.via === "speed" || pos.via === "jump" ? pos.via : "page",
    });
  });
  ctx.handle("knowledge:frontier", (_m, filePath) => svc.getFrontier(str(filePath, "filePath")));
  ctx.handle("knowledge:context", (_m, req) => {
    if (!req || typeof req !== "object") throw new Error("knowledge: request is required");
    const filePath = str(req.filePath, "filePath");
    return svc.getContext({ ...req, filePath, frontier: svc.resolveFrontier(filePath, optFrontier(req.frontier)), budgetChars: Math.min(100_000, Math.max(0, Number(req.budgetChars) || 0)) });
  });
  ctx.handle("knowledge:entityIndex", (_m, filePath, frontier) => {
    const fp = str(filePath, "filePath");
    return svc.getEntityIndex(fp, svc.resolveFrontier(fp, optFrontier(frontier)));
  });
  ctx.handle("knowledge:entity", (_m, filePath, id, frontier) => {
    const fp = str(filePath, "filePath");
    return svc.getEntity(fp, str(id, "id"), svc.resolveFrontier(fp, optFrontier(frontier)));
  });
  ctx.handle("knowledge:search", (_m, filePath, query, opts) => {
    const fp = str(filePath, "filePath");
    const limit = typeof opts?.limit === "number" ? opts.limit : 20;
    const frontier = svc.resolveFrontier(fp, optFrontier(opts?.frontier));
    return books ? svc.searchAsync(fp, String(query ?? ""), frontier, limit) : svc.search(fp, String(query ?? ""), frontier, limit);
  });
  ctx.handle("knowledge:edits:apply", (_m, filePath, edits: WikiEdit[]) => {
    const { chapters: _chapters, ...result } = svc.applyEdits(str(filePath, "filePath"), Array.isArray(edits) ? edits : []);
    void _chapters;
    return result;
  });
  ctx.handle("knowledge:edits:undo", (_m, filePath, undoId) => svc.undoEdit(str(filePath, "filePath"), int(undoId, "undoId")));
  ctx.handle("knowledge:ingest", (meta, filePath, chapterIndex, priority) => {
    const rt = peekAIRuntime();
    if (!rt) throw new Error("knowledge:ingest: the AI runtime is not available");
    const fp = str(filePath, "filePath");
    const ch = int(chapterIndex, "chapterIndex");
    return rt.scheduler.submit(
      {
        task: "chapter.knowledge",
        input: { filePath: fp, chapterIndex: ch },
        scope: { filePath: fp, chapterIndex: ch },
        priority: PRIORITIES.has(priority) ? priority : Priority.Background,
      },
      meta.senderId,
    );
  });
  ctx.handle("knowledge:clear", (_m, filePath, chapterIndex) => {
    svc.clear(str(filePath, "filePath"), chapterIndex == null ? undefined : int(chapterIndex, "chapterIndex"));
  });
  ctx.handle("knowledge:wiki", (_m, filePath, frontier) => svc.wiki(str(filePath, "filePath"), optFrontier(frontier)));
  ctx.handle("knowledge:recapStatus", (_m, filePath) => svc.recapStatus(str(filePath, "filePath")));
  ctx.handle("knowledge:recapSeen", (_m, filePath, chapterIndex) => {
    svc.recapSeen(str(filePath, "filePath"), int(chapterIndex, "chapterIndex"));
  });
}
