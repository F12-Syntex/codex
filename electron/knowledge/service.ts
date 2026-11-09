/**
 * The knowledge service (owner: WS-B): one object over the knowledge modules, implementing the
 * frozen `KnowledgeReader` (handed to the AI runtime as `TaskServices.knowledge`) plus the writes
 * and extras the `knowledge:*` IPC handlers and tasks need. Synchronous except search indexing.
 */

import type { SqlDb } from "../db/sql";
import type { AIEvent } from "../shared/ai/types";
import type {
  EntityIndexItem, EntitySnapshot, Frontier, KnowledgeContext, KnowledgeContextRequest, KnowledgeReader,
  ReadingPosition, RecapStatus, SearchHit, WikiEdit, WikiSnapshot,
} from "../shared/knowledge/types";
import { getContext } from "./context";
import { applyEdits, undoEdit, type ApplyEditsOutcome } from "./edits";
import { frontierEvent, knowledgeEvent, safeEmitter } from "./events";
import { getFrontier, markRecapSeen, recapStatus, recordPosition, type SpoilerMode } from "./frontier";
import { clearChapterKnowledge } from "./ingest";
import { adoptLegacyMerges, mergeLogAt } from "./legacy";
import { buildWikiSnapshot, defaultLabel, getEntityAt, getEntityIndexAt, type ChapterLabeler } from "./read";
import { ensureIndexed, isIndexed, searchBook, type BookSource } from "./search";
import { clearWiki } from "./store";

export interface KnowledgeServiceOptions {
  db: SqlDb;
  emit?: (e: AIEvent) => void;
  /** Global spoiler mode (AISettings.spoilerMode). Default: read `ai:settings:v1`, else "frontier". */
  spoilerMode?: () => SpoilerMode;
  /** Chapter label provider (WS-C `classify.ts` once wired); default 1-based index. */
  labelsFor?: (filePath: string) => ChapterLabeler;
  /** Book content for lazy search indexing. Without it, search only sees what is indexed. */
  books?: BookSource;
  now?: () => number;
}

export interface KnowledgeService extends KnowledgeReader {
  readonly db: SqlDb;
  /** `requested` when given (e.g. the wiki's "Show everything"), else the book's frontier. */
  resolveFrontier(filePath: string, requested?: Frontier): Frontier;
  labelsFor(filePath: string): ChapterLabeler;
  emit(e: AIEvent): void;
  recordPosition(filePath: string, pos: ReadingPosition): Frontier;
  wiki(filePath: string, frontier?: Frontier): WikiSnapshot;
  applyEdits(filePath: string, edits: WikiEdit[]): ApplyEditsOutcome;
  undoEdit(filePath: string, undoId: number): boolean;
  /** Whole book, or one chapter (undoes that chapter's run). */
  clear(filePath: string, chapterIndex?: number): void;
  recapStatus(filePath: string): RecapStatus;
  recapSeen(filePath: string, chapterIndex: number): void;
  /** Builds the index first when a book source is available. */
  searchAsync(filePath: string, query: string, frontier: Frontier, limit: number): Promise<SearchHit[]>;
  /** Index the book in the background (no-op without a book source). */
  warmSearch(filePath: string): void;
}

/** Reads `AISettings.spoilerMode` from the settings table without depending on WS-A's module. */
export function readSpoilerModeSetting(db: SqlDb): SpoilerMode {
  try {
    const raw = db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", ["ai:settings:v1"])?.value;
    const mode = raw ? (JSON.parse(raw) as { spoilerMode?: unknown }).spoilerMode : undefined;
    return mode === "position" || mode === "off" || mode === "frontier" ? mode : "frontier";
  } catch {
    return "frontier";
  }
}

export function createKnowledgeService(opts: KnowledgeServiceOptions): KnowledgeService {
  const { db } = opts;
  const emit = safeEmitter(opts.emit);
  const now = opts.now ?? Date.now;
  const mode = opts.spoilerMode ?? (() => readSpoilerModeSetting(db));
  const labelsFor = opts.labelsFor ?? (() => defaultLabel);

  const resolveFrontier = (filePath: string, requested?: Frontier): Frontier => requested ?? getFrontier(db, filePath, mode());

  const warmSearch = (filePath: string) => {
    if (!opts.books) return;
    ensureIndexed(db, filePath, opts.books).catch((err) => console.warn("[knowledge] indexing failed", err));
  };

  const svc: KnowledgeService = {
    db,
    resolveFrontier,
    labelsFor,
    emit,
    getFrontier: (filePath) => getFrontier(db, filePath, mode()),
    getContext: (req: KnowledgeContextRequest): KnowledgeContext =>
      getContext(db, req, { frontierOf: (fp) => resolveFrontier(fp), labelOf: labelsFor(req.filePath) }),
    getEntityIndex: (filePath, frontier): EntityIndexItem[] => getEntityIndexAt(db, filePath, frontier),
    getEntity: (filePath, id, frontier): EntitySnapshot | null => getEntityAt(db, filePath, id, frontier),
    search(filePath, query, frontier, limit) {
      if (!isIndexed(db, filePath)) warmSearch(filePath);
      return searchBook(db, filePath, query, frontier, limit);
    },
    async searchAsync(filePath, query, frontier, limit) {
      if (opts.books) {
        try {
          await ensureIndexed(db, filePath, opts.books);
        } catch (err) {
          console.warn("[knowledge] indexing failed", err);
        }
      }
      return searchBook(db, filePath, query, frontier, limit);
    },
    warmSearch,
    recordPosition(filePath, pos) {
      const r = recordPosition(db, filePath, pos, now());
      if (r.changed) emit(frontierEvent(filePath, r.frontier));
      return mode() === "frontier" ? r.frontier : getFrontier(db, filePath, mode());
    },
    wiki(filePath, frontier) {
      const f = resolveFrontier(filePath, frontier);
      const snap = buildWikiSnapshot(db, filePath, f, labelsFor(filePath));
      try {
        adoptLegacyMerges(db, filePath, now());
        snap.mergeLog = mergeLogAt(db, filePath, f);
      } catch (err) {
        console.warn("[knowledge] merge history unavailable", err);
      }
      return snap;
    },
    applyEdits(filePath, edits) {
      const out = applyEdits(db, filePath, edits, now());
      if (out.applied > 0) emit(knowledgeEvent(filePath, out.chapters, out.mergeLogIds.length ? "merge" : "edit"));
      return out;
    },
    undoEdit(filePath, undoId) {
      const ok = undoEdit(db, filePath, undoId, now());
      if (ok) emit(knowledgeEvent(filePath, [], "edit"));
      return ok;
    },
    clear(filePath, chapterIndex) {
      if (chapterIndex == null) clearWiki(db, filePath);
      else clearChapterKnowledge(db, filePath, chapterIndex);
      emit(knowledgeEvent(filePath, chapterIndex == null ? [] : [chapterIndex], "clear"));
    },
    recapStatus: (filePath) => recapStatus(db, filePath, now(), labelsFor(filePath)),
    recapSeen: (filePath, chapterIndex) => markRecapSeen(db, filePath, chapterIndex, now()),
  };
  return svc;
}
