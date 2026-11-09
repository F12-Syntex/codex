/**
 * ArtifactStore (chapter_artifacts) and per-book AI prefs (book_ai_prefs), owner WS-D.
 * AI_AUDIT §4.4.6, §4.6 — replaces the whole-book JSON blobs in `settings` (S1-2): one row per
 * chapter × kind × variant, every write a single-row upsert on main's thread.
 *
 * Depends on `SqlDb` only (better-sqlite3 in production, sql.js in tests).
 */

import type { SqlDb } from "../db/sql";
import type {
  AIEventOf, ArtifactKind, ArtifactStore, BookAIPrefs, ChapterArtifact,
} from "../shared/ai/types";
import type { ChapterId } from "../shared/pipeline/types";

export type ArtifactEventSink = (e: AIEventOf<"artifact">) => void;

interface ArtifactRow {
  file_path: string;
  chapter_id: string;
  chapter_index: number;
  kind: string;
  variant: string;
  source_hash: string;
  base_hash: string;
  task_version: number;
  model: string;
  artifact_hash: string;
  data: string;
  created_at: number;
}

/** Row without the (potentially large) payload, for status/totals. */
export interface ArtifactMeta {
  chapterId: ChapterId;
  chapterIndex: number;
  kind: ArtifactKind;
  variant: string;
  sourceHash: string;
  baseHash: string;
  taskVersion: number;
  artifactHash: string;
}

function fromRow<T>(r: ArtifactRow): ChapterArtifact<T> {
  return {
    filePath: r.file_path,
    chapterId: r.chapter_id,
    chapterIndex: Number(r.chapter_index),
    kind: r.kind as ArtifactKind,
    variant: r.variant,
    sourceHash: r.source_hash,
    baseHash: r.base_hash,
    taskVersion: Number(r.task_version),
    model: r.model,
    artifactHash: r.artifact_hash,
    data: JSON.parse(r.data) as T,
    createdAt: Number(r.created_at),
  };
}

export class SqlArtifactStore implements ArtifactStore {
  constructor(private readonly db: SqlDb, private readonly emit: ArtifactEventSink = () => {}) {}

  get<T>(filePath: string, chapterId: ChapterId, kind: ArtifactKind, variant = ""): ChapterArtifact<T> | null {
    const r = this.db.get<ArtifactRow>(
      "SELECT * FROM chapter_artifacts WHERE file_path = ? AND chapter_id = ? AND kind = ? AND variant = ?",
      [filePath, chapterId, kind, variant],
    );
    return r ? fromRow<T>(r) : null;
  }

  put<T>(a: ChapterArtifact<T>): void {
    this.db.run(
      `INSERT INTO chapter_artifacts (file_path, chapter_id, chapter_index, kind, variant, source_hash, base_hash,
         task_version, model, artifact_hash, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (file_path, chapter_id, kind, variant) DO UPDATE SET
         chapter_index = excluded.chapter_index, source_hash = excluded.source_hash, base_hash = excluded.base_hash,
         task_version = excluded.task_version, model = excluded.model, artifact_hash = excluded.artifact_hash,
         data = excluded.data, created_at = excluded.created_at`,
      [
        a.filePath, a.chapterId, a.chapterIndex, a.kind, a.variant, a.sourceHash, a.baseHash,
        a.taskVersion, a.model, a.artifactHash, JSON.stringify(a.data), a.createdAt,
      ],
    );
    this.emit({ type: "artifact", filePath: a.filePath, chapterIndex: a.chapterIndex, chapterId: a.chapterId, kind: a.kind, variant: a.variant });
  }

  /** Per chapter (by id) and per kind; "all" clears every kind. Emits one `artifact` event per removed row. */
  clear(filePath: string, kind: ArtifactKind | "all", chapterId?: ChapterId): number {
    const where = ["file_path = ?"];
    const params: (string | number)[] = [filePath];
    if (kind !== "all") { where.push("kind = ?"); params.push(kind); }
    if (chapterId !== undefined) { where.push("chapter_id = ?"); params.push(chapterId); }
    return this.deleteWhere(where.join(" AND "), params);
  }

  /** Same as `clear`, addressed by chapter index (what the renderer knows). */
  clearByIndex(filePath: string, kind: ArtifactKind | "all", chapterIndex?: number): number {
    const where = ["file_path = ?"];
    const params: (string | number)[] = [filePath];
    if (kind !== "all") { where.push("kind = ?"); params.push(kind); }
    if (chapterIndex !== undefined) { where.push("chapter_index = ?"); params.push(chapterIndex); }
    return this.deleteWhere(where.join(" AND "), params);
  }

  private deleteWhere(where: string, params: (string | number)[]): number {
    const rows = this.db.all<Pick<ArtifactRow, "chapter_id" | "chapter_index" | "kind" | "variant" | "file_path">>(
      `SELECT file_path, chapter_id, chapter_index, kind, variant FROM chapter_artifacts WHERE ${where}`,
      params,
    );
    if (rows.length === 0) return 0;
    this.db.run(`DELETE FROM chapter_artifacts WHERE ${where}`, params);
    for (const r of rows) {
      this.emit({
        type: "artifact", filePath: r.file_path, chapterIndex: Number(r.chapter_index), chapterId: r.chapter_id,
        kind: r.kind as ArtifactKind, variant: r.variant,
      });
    }
    return rows.length;
  }

  /** Every row of one kind for a book (optionally one variant), in chapter order. */
  list<T>(filePath: string, kind: ArtifactKind, variant?: string): ChapterArtifact<T>[] {
    const rows = variant === undefined
      ? this.db.all<ArtifactRow>("SELECT * FROM chapter_artifacts WHERE file_path = ? AND kind = ? ORDER BY chapter_index", [filePath, kind])
      : this.db.all<ArtifactRow>(
          "SELECT * FROM chapter_artifacts WHERE file_path = ? AND kind = ? AND variant = ? ORDER BY chapter_index",
          [filePath, kind, variant],
        );
    return rows.map((r) => fromRow<T>(r));
  }

  /** Metadata of every row for a book (no payloads), for status and totals. */
  listMeta(filePath: string): ArtifactMeta[] {
    return this.db
      .all<Omit<ArtifactRow, "data" | "model" | "created_at" | "file_path">>(
        `SELECT chapter_id, chapter_index, kind, variant, source_hash, base_hash, task_version, artifact_hash
         FROM chapter_artifacts WHERE file_path = ?`,
        [filePath],
      )
      .map((r) => ({
        chapterId: r.chapter_id,
        chapterIndex: Number(r.chapter_index),
        kind: r.kind as ArtifactKind,
        variant: r.variant,
        sourceHash: r.source_hash,
        baseHash: r.base_hash,
        taskVersion: Number(r.task_version),
        artifactHash: r.artifact_hash,
      }));
  }
}

// ── Per-book prefs ──────────────────────────────────────────────────────────

/** Used when neither the book nor `AISettings.defaults` says otherwise. */
export const DEFAULT_BOOK_PREFS: BookAIPrefs = {
  titles: false,
  rewrite: "off",
  formatting: false,
  knowledge: false,
  comments: false,
  recapOnReopen: false,
  prefetchNext: true,
};

function sanitizePrefs(p: Partial<BookAIPrefs>, base: BookAIPrefs): BookAIPrefs {
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    titles: bool(p.titles, base.titles),
    rewrite: p.rewrite === "off" || p.rewrite === "polish" || p.rewrite === "concise" ? p.rewrite : base.rewrite,
    formatting: bool(p.formatting, base.formatting),
    knowledge: bool(p.knowledge, base.knowledge),
    comments: bool(p.comments, base.comments),
    recapOnReopen: bool(p.recapOnReopen, base.recapOnReopen),
    prefetchNext: bool(p.prefetchNext, base.prefetchNext),
  };
}

export class SqlPrefsStore {
  constructor(
    private readonly db: SqlDb,
    /** `AISettings.defaults` (WS-A settings), read on every call so changes apply immediately. */
    private readonly getDefaults: () => BookAIPrefs = () => DEFAULT_BOOK_PREFS,
    private readonly now: () => number = Date.now,
  ) {}

  /** The stored prefs merged over the defaults; a book with no row gets the defaults. */
  get(filePath: string): BookAIPrefs {
    const defaults = sanitizePrefs(this.getDefaults() ?? {}, DEFAULT_BOOK_PREFS);
    const row = this.db.get<{ prefs: string }>("SELECT prefs FROM book_ai_prefs WHERE file_path = ?", [filePath]);
    if (!row) return defaults;
    try {
      return sanitizePrefs(JSON.parse(row.prefs) as Partial<BookAIPrefs>, defaults);
    } catch {
      return defaults;
    }
  }

  /** Read-modify-write in one transaction (synchronous on main, so concurrent windows never lose a toggle). */
  set(filePath: string, patch: Partial<BookAIPrefs>): BookAIPrefs {
    return this.db.transaction(() => {
      const next = sanitizePrefs(patch, this.get(filePath));
      this.db.run(
        `INSERT INTO book_ai_prefs (file_path, prefs, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (file_path) DO UPDATE SET prefs = excluded.prefs, updated_at = excluded.updated_at`,
        [filePath, JSON.stringify(next), this.now()],
      );
      return next;
    });
  }
}
