import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";
import { wrapBetterSqlite, type SqlDb } from "./db/sql";
import { runMigrations } from "./db/migrate";
import * as wiki from "./knowledge/store";
import type {
  WikiEntryRow, WikiDetailRow, WikiAliasRow, WikiRelationshipRow, WikiChapterSummaryRow,
  WikiArcRow, WikiArcBeatRow, WikiMergeLogRow, MCStatRow, WikiAliasInput,
} from "./knowledge/store";

export interface LibraryItem {
  id: number;
  title: string;
  author: string;
  cover: string;
  gradient: string;
  format: string;
  filePath: string;
  size: number;
  section: string;
  view: string;
  addedAt: string;
}

let db: Database.Database;
let sqlDb: SqlDb | null = null;

/** The shared connection behind the `SqlDb` interface, for the new area stores (AI, artifacts,
 *  knowledge, book, assistant). Throws if called before `initDatabase()`. */
export function getDb(): SqlDb {
  if (!db) throw new Error("getDb() called before initDatabase()");
  sqlDb ??= wrapBetterSqlite(db);
  return sqlDb;
}

export function initDatabase(): void {
  const dbPath = path.join(app.getPath("userData"), "codex.db");
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  // Enable foreign key enforcement (required for ON DELETE CASCADE)
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT DEFAULT 'Unknown',
      cover TEXT DEFAULT '',
      gradient TEXT NOT NULL,
      format TEXT NOT NULL,
      filePath TEXT UNIQUE NOT NULL,
      size INTEGER DEFAULT 0,
      section TEXT NOT NULL,
      view TEXT NOT NULL,
      addedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filePath TEXT NOT NULL,
      chapterIndex INTEGER NOT NULL,
      paragraphIndex INTEGER NOT NULL,
      label TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS excluded_paths (
      filePath TEXT PRIMARY KEY NOT NULL,
      excludedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reading_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filePath TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      chapterIndex INTEGER NOT NULL,
      chapterTitle TEXT NOT NULL DEFAULT '',
      pageIndex INTEGER NOT NULL,
      totalPages INTEGER NOT NULL DEFAULT 1,
      totalChapters INTEGER NOT NULL DEFAULT 1,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_reading_activity_file
      ON reading_activity (filePath, timestamp);

    -- ── Quotes ───────────────────────────────────────

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filePath TEXT NOT NULL,
      chapterIndex INTEGER NOT NULL,
      paragraphIndex INTEGER NOT NULL,
      text TEXT NOT NULL,
      chapterTitle TEXT NOT NULL DEFAULT '',
      bookTitle TEXT NOT NULL DEFAULT '',
      speaker TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'quote',
      note TEXT NOT NULL DEFAULT '',
      aiEnhanced INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_quotes_file ON quotes(filePath);

    -- ── Wiki Tables ──────────────────────────────────

    CREATE TABLE IF NOT EXISTS wiki_entries (
      id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      short_description TEXT DEFAULT '',
      description TEXT DEFAULT '',
      color TEXT DEFAULT 'blue',
      first_appearance INTEGER DEFAULT 0,
      significance INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      PRIMARY KEY (file_path, id)
    );

    CREATE TABLE IF NOT EXISTS wiki_aliases (
      file_path TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      PRIMARY KEY (file_path, entry_id, alias),
      FOREIGN KEY (file_path, entry_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wiki_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (file_path, entry_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_details_entry ON wiki_details(file_path, entry_id, chapter_index);
    CREATE INDEX IF NOT EXISTS idx_details_chapter ON wiki_details(file_path, chapter_index);

    CREATE TABLE IF NOT EXISTS wiki_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      since_chapter INTEGER NOT NULL,
      until_chapter INTEGER DEFAULT NULL,
      description TEXT DEFAULT '',
      FOREIGN KEY (file_path, source_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE,
      FOREIGN KEY (file_path, target_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rel_source ON wiki_relationships(file_path, source_id);
    CREATE INDEX IF NOT EXISTS idx_rel_target ON wiki_relationships(file_path, target_id);

    CREATE TABLE IF NOT EXISTS wiki_appearances (
      file_path TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      PRIMARY KEY (file_path, entry_id, chapter_index),
      FOREIGN KEY (file_path, entry_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_appearances_chapter ON wiki_appearances(file_path, chapter_index);

    CREATE TABLE IF NOT EXISTS wiki_chapter_summaries (
      file_path TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      summary TEXT NOT NULL,
      key_events TEXT DEFAULT '',
      active_entities TEXT DEFAULT '',
      mood TEXT DEFAULT '',
      PRIMARY KEY (file_path, chapter_index)
    );

    CREATE TABLE IF NOT EXISTS wiki_arcs (
      id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      arc_type TEXT DEFAULT 'plot',
      status TEXT DEFAULT 'active',
      start_chapter INTEGER NOT NULL,
      end_chapter INTEGER DEFAULT NULL,
      PRIMARY KEY (file_path, id)
    );

    CREATE TABLE IF NOT EXISTS wiki_arc_entities (
      file_path TEXT NOT NULL,
      arc_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      role TEXT DEFAULT '',
      PRIMARY KEY (file_path, arc_id, entry_id),
      FOREIGN KEY (file_path, arc_id) REFERENCES wiki_arcs(file_path, id) ON DELETE CASCADE,
      FOREIGN KEY (file_path, entry_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wiki_arc_beats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      arc_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      beat_type TEXT NOT NULL,
      description TEXT NOT NULL,
      FOREIGN KEY (file_path, arc_id) REFERENCES wiki_arcs(file_path, id) ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_arc_beats ON wiki_arc_beats(file_path, arc_id, chapter_index);

    CREATE TABLE IF NOT EXISTS wiki_processed (
      file_path TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      processed_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (file_path, chapter_index)
    );

    CREATE TABLE IF NOT EXISTS wiki_meta (
      file_path TEXT PRIMARY KEY,
      book_title TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wiki_merge_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      target_name TEXT NOT NULL,
      source_snapshot TEXT NOT NULL,
      merged_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_merge_log ON wiki_merge_log(file_path);

    CREATE TABLE IF NOT EXISTS wiki_mc_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      stat_key TEXT NOT NULL,
      category TEXT NOT NULL,
      display_name TEXT NOT NULL,
      value TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_chapter INTEGER NOT NULL,
      UNIQUE(file_path, stat_key)
    );
    CREATE INDEX IF NOT EXISTS idx_mc_stats ON wiki_mc_stats(file_path, category);

    -- ── Simulate Tables ─────────────────────────────────

    CREATE TABLE IF NOT EXISTS sim_branches (
      id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      truncate_after_para INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (file_path, id)
    );

    -- ── Installer Downloads ─────────────────────────────
    CREATE TABLE IF NOT EXISTS installer_downloads (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id       TEXT NOT NULL,
      novel_title     TEXT NOT NULL,
      novel_author    TEXT,
      novel_url       TEXT NOT NULL,
      thumbnail       TEXT,
      chapters_json   TEXT NOT NULL,
      total_chapters  INTEGER NOT NULL,
      current_chapter INTEGER DEFAULT 0,
      status          TEXT DEFAULT 'queued',
      error           TEXT,
      epub_path       TEXT,
      started_at      TEXT,
      completed_at    TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sim_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      segment_index INTEGER NOT NULL,
      user_input TEXT NOT NULL,
      html_paragraphs TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (file_path, branch_id) REFERENCES sim_branches(file_path, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sim_segments ON sim_segments(file_path, branch_id, segment_index);
  `);

  // Schema migrations — safe to run repeatedly
  try { db.prepare("ALTER TABLE wiki_meta ADD COLUMN mc_entity_id TEXT DEFAULT NULL").run(); } catch { /* already exists */ }
  // v0.78 — alias relevance + detail tiering
  try { db.prepare("ALTER TABLE wiki_aliases ADD COLUMN alias_type TEXT NOT NULL DEFAULT 'name'").run(); } catch { /* already exists */ }
  try { db.prepare("ALTER TABLE wiki_aliases ADD COLUMN relevance INTEGER NOT NULL DEFAULT 3").run(); } catch { /* already exists */ }
  try { db.prepare("ALTER TABLE wiki_details ADD COLUMN relevance INTEGER NOT NULL DEFAULT 3").run(); } catch { /* already exists */ }
  try { db.prepare("ALTER TABLE wiki_details ADD COLUMN is_superseded INTEGER NOT NULL DEFAULT 0").run(); } catch { /* already exists */ }
  try { db.prepare("ALTER TABLE wiki_details ADD COLUMN superseded_chapter INTEGER").run(); } catch { /* already exists */ }
  // v0.83 — source text for details (quote from chapter)
  try { db.prepare("ALTER TABLE wiki_details ADD COLUMN source_text TEXT NOT NULL DEFAULT ''").run(); } catch { /* already exists */ }

  // Per-area migrations (schema_migrations). Failures are logged and reported, never thrown.
  runMigrations(getDb());
}

// ── Items ──────────────────────────────────────────

export function getAllItems(section: string): LibraryItem[] {
  const stmt = db.prepare("SELECT * FROM items WHERE section = ? ORDER BY addedAt DESC");
  return stmt.all(section) as LibraryItem[];
}

export function addItem(item: Omit<LibraryItem, "id" | "addedAt">): number {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO items (title, author, cover, gradient, format, filePath, size, section, view)
    VALUES (@title, @author, @cover, @gradient, @format, @filePath, @size, @section, @view)
  `);
  const result = stmt.run(item);
  return Number(result.lastInsertRowid);
}

export function addItems(items: Omit<LibraryItem, "id" | "addedAt">[]): LibraryItem[] {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO items (title, author, cover, gradient, format, filePath, size, section, view)
    VALUES (@title, @author, @cover, @gradient, @format, @filePath, @size, @section, @view)
  `);

  const insertMany = db.transaction((rows: Omit<LibraryItem, "id" | "addedAt">[]) => {
    const inserted: LibraryItem[] = [];
    for (const row of rows) {
      const result = insert.run(row);
      if (result.changes > 0) {
        const id = Number(result.lastInsertRowid);
        inserted.push({ ...row, id, addedAt: new Date().toISOString() });
      }
    }
    return inserted;
  });

  return insertMany(items);
}

export function deleteItem(id: number): void {
  // Record the file path as excluded so auto-scan won't re-add it
  const item = db.prepare("SELECT filePath FROM items WHERE id = ?").get(id) as { filePath: string } | undefined;
  if (item) {
    db.prepare("INSERT OR IGNORE INTO excluded_paths (filePath) VALUES (?)").run(item.filePath);
    // Drop the book's library-AI rows (tags, series, AI results) — mirrors LibraryStore.forget.
    for (const t of ["item_tags", "item_series", "item_series_dismissed", "item_ai"]) {
      try {
        db.prepare(`DELETE FROM ${t} WHERE file_path = ?`).run(item.filePath);
      } catch { /* table not created yet (library migrations not run) */ }
    }
  }
  db.prepare("DELETE FROM items WHERE id = ?").run(id);
}

export function getExcludedPaths(): Set<string> {
  const rows = db.prepare("SELECT filePath FROM excluded_paths").all() as { filePath: string }[];
  return new Set(rows.map((r) => r.filePath));
}

export function removeExcludedPath(filePath: string): void {
  db.prepare("DELETE FROM excluded_paths WHERE filePath = ?").run(filePath);
}

export function moveItem(id: number, targetView: string): void {
  db.prepare("UPDATE items SET view = ? WHERE id = ?").run(targetView, id);
}

export function transferItem(id: number, targetSection: string, targetView: string): void {
  db.prepare("UPDATE items SET section = ?, view = ? WHERE id = ?").run(targetSection, targetView, id);
}

export function updateItemMeta(id: number, fields: { title?: string; author?: string; cover?: string }): void {
  const parts: string[] = [];
  const values: unknown[] = [];
  if (fields.title !== undefined) { parts.push("title = ?"); values.push(fields.title); }
  if (fields.author !== undefined) { parts.push("author = ?"); values.push(fields.author); }
  if (fields.cover !== undefined) { parts.push("cover = ?"); values.push(fields.cover); }
  if (parts.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE items SET ${parts.join(", ")} WHERE id = ?`).run(...values);
}

// ── Settings ───────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

// ── Bookmarks ─────────────────────────────────────

export interface Bookmark {
  id: number;
  filePath: string;
  chapterIndex: number;
  paragraphIndex: number;
  label: string;
  createdAt: string;
}

export function getBookmarks(filePath: string): Bookmark[] {
  const stmt = db.prepare("SELECT * FROM bookmarks WHERE filePath = ? ORDER BY chapterIndex ASC, paragraphIndex ASC");
  return stmt.all(filePath) as Bookmark[];
}

export function addBookmark(filePath: string, chapterIndex: number, paragraphIndex: number, label: string): Bookmark {
  const stmt = db.prepare(`
    INSERT INTO bookmarks (filePath, chapterIndex, paragraphIndex, label)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(filePath, chapterIndex, paragraphIndex, label);
  return {
    id: Number(result.lastInsertRowid),
    filePath,
    chapterIndex,
    paragraphIndex,
    label,
    createdAt: new Date().toISOString(),
  };
}

export function deleteBookmark(id: number): void {
  db.prepare("DELETE FROM bookmarks WHERE id = ?").run(id);
}

// ── Quotes ─────────────────────────────────────────

export interface Quote {
  id: number;
  filePath: string;
  chapterIndex: number;
  paragraphIndex: number;
  text: string;
  chapterTitle: string;
  bookTitle: string;
  speaker: string;
  kind: string;
  note: string;
  aiEnhanced: boolean;
  createdAt: string;
}

export function getQuotes(filePath: string): Quote[] {
  const rows = db.prepare(
    "SELECT * FROM quotes WHERE filePath = ? ORDER BY chapterIndex ASC, paragraphIndex ASC, id ASC"
  ).all(filePath) as unknown[];
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as number, filePath: r.filePath as string,
    chapterIndex: r.chapterIndex as number, paragraphIndex: r.paragraphIndex as number,
    text: r.text as string, chapterTitle: r.chapterTitle as string,
    bookTitle: r.bookTitle as string, speaker: (r.speaker as string) ?? "",
    kind: (r.kind as string) ?? "quote", note: (r.note as string) ?? "",
    aiEnhanced: (r.aiEnhanced as number) === 1,
    createdAt: r.createdAt as string,
  }));
}

export function getAllQuotes(): Quote[] {
  const rows = db.prepare(
    "SELECT * FROM quotes ORDER BY createdAt DESC"
  ).all() as unknown[];
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as number, filePath: r.filePath as string,
    chapterIndex: r.chapterIndex as number, paragraphIndex: r.paragraphIndex as number,
    text: r.text as string, chapterTitle: r.chapterTitle as string,
    bookTitle: r.bookTitle as string, speaker: (r.speaker as string) ?? "",
    kind: (r.kind as string) ?? "quote", note: (r.note as string) ?? "",
    aiEnhanced: (r.aiEnhanced as number) === 1,
    createdAt: r.createdAt as string,
  }));
}

export function addQuote(
  filePath: string, chapterIndex: number, paragraphIndex: number,
  text: string, chapterTitle: string, bookTitle: string
): Quote {
  const stmt = db.prepare(`
    INSERT INTO quotes (filePath, chapterIndex, paragraphIndex, text, chapterTitle, bookTitle)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(filePath, chapterIndex, paragraphIndex, text, chapterTitle, bookTitle);
  return {
    id: Number(result.lastInsertRowid),
    filePath, chapterIndex, paragraphIndex, text, chapterTitle, bookTitle,
    speaker: "", kind: "quote", note: "", aiEnhanced: false,
    createdAt: new Date().toISOString(),
  };
}

export function updateQuote(id: number, fields: { speaker?: string; kind?: string; note?: string; aiEnhanced?: boolean }): void {
  const parts: string[] = [];
  const values: unknown[] = [];
  if (fields.speaker !== undefined) { parts.push("speaker = ?"); values.push(fields.speaker); }
  if (fields.kind !== undefined) { parts.push("kind = ?"); values.push(fields.kind); }
  if (fields.note !== undefined) { parts.push("note = ?"); values.push(fields.note); }
  if (fields.aiEnhanced !== undefined) { parts.push("aiEnhanced = ?"); values.push(fields.aiEnhanced ? 1 : 0); }
  if (parts.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE quotes SET ${parts.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteQuote(id: number): void {
  db.prepare("DELETE FROM quotes WHERE id = ?").run(id);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// ── Reading Activity ─────────────────────────────

export interface ReadingActivity {
  id: number;
  filePath: string;
  title: string;
  chapterIndex: number;
  chapterTitle: string;
  pageIndex: number;
  totalPages: number;
  totalChapters: number;
  timestamp: string;
}

export function recordPageView(
  filePath: string,
  title: string,
  chapterIndex: number,
  chapterTitle: string,
  pageIndex: number,
  totalPages: number,
  totalChapters: number,
): void {
  db.prepare(`
    INSERT INTO reading_activity (filePath, title, chapterIndex, chapterTitle, pageIndex, totalPages, totalChapters)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(filePath, title, chapterIndex, chapterTitle, pageIndex, totalPages, totalChapters);
}

export function getReadingActivity(filePath?: string, limit = 500): ReadingActivity[] {
  if (filePath) {
    return db.prepare(
      "SELECT * FROM reading_activity WHERE filePath = ? ORDER BY timestamp DESC LIMIT ?"
    ).all(filePath, limit) as ReadingActivity[];
  }
  return db.prepare(
    "SELECT * FROM reading_activity ORDER BY timestamp DESC LIMIT ?"
  ).all(limit) as ReadingActivity[];
}

export function getReadingStats(): {
  totalPagesRead: number;
  totalSessions: number;
  booksRead: number;
  activityByBook: { filePath: string; title: string; pagesRead: number; lastRead: string }[];
} {
  const totalPagesRead = (db.prepare(
    "SELECT COUNT(*) as count FROM reading_activity"
  ).get() as { count: number }).count;

  // A "session" is a group of activity with <30min gap
  const booksRead = (db.prepare(
    "SELECT COUNT(DISTINCT filePath) as count FROM reading_activity"
  ).get() as { count: number }).count;

  const activityByBook = db.prepare(`
    SELECT filePath, title, COUNT(*) as pagesRead, MAX(timestamp) as lastRead
    FROM reading_activity
    GROUP BY filePath
    ORDER BY lastRead DESC
  `).all() as { filePath: string; title: string; pagesRead: number; lastRead: string }[];

  return { totalPagesRead, totalSessions: 0, booksRead, activityByBook };
}

// ── Wiki (owner: WS-B) ────────────────────────────
// The wiki tables live behind `SqlDb` in `electron/knowledge/store.ts`. These exports keep their
// legacy signatures so the existing `wiki:*` IPC handlers in main.ts work unchanged; they simply
// delegate to the store on the shared connection. Removed in Phase 3 with the legacy handlers.

export type {
  WikiEntryRow, WikiDetailRow, WikiAliasRow, WikiRelationshipRow, WikiChapterSummaryRow,
  WikiArcRow, WikiArcBeatRow, WikiMergeLogRow, MCStatRow, WikiAliasInput,
} from "./knowledge/store";

export function upsertWikiEntry(entry: Parameters<typeof wiki.upsertWikiEntry>[1]): void {
  wiki.upsertWikiEntry(getDb(), entry);
}

/** Remove wiki entries with empty/null name, id, or short_description (created by truncated AI responses). */
export function purgeNullWikiEntries(filePath: string): number {
  return wiki.purgeNullWikiEntries(getDb(), filePath);
}

export function getWikiEntries(filePath: string): WikiEntryRow[] {
  return wiki.getWikiEntries(getDb(), filePath);
}

export function getWikiEntry(filePath: string, entryId: string): WikiEntryRow | null {
  return wiki.getWikiEntry(getDb(), filePath, entryId);
}

export function deleteWikiEntry(filePath: string, entryId: string): void {
  wiki.deleteWikiEntry(getDb(), filePath, entryId);
}

/** Merge sourceId into targetId — moves all data, logs for undo */
export function mergeWikiEntries(filePath: string, sourceId: string, targetId: string): void {
  wiki.mergeWikiEntries(getDb(), filePath, sourceId, targetId);
}

/** Undo a merge — restore the source entry from snapshot */
export function unmergeWikiEntries(filePath: string, mergeLogId: number): void {
  wiki.unmergeWikiEntries(getDb(), filePath, mergeLogId);
}

/** Get all merge log entries for a book */
export function getWikiMergeLog(filePath: string): WikiMergeLogRow[] {
  return wiki.getWikiMergeLog(getDb(), filePath);
}

export function addWikiAliases(filePath: string, entryId: string, aliases: WikiAliasInput[]): void {
  wiki.addWikiAliases(getDb(), filePath, entryId, aliases);
}

export function getWikiAliases(filePath: string, entryId: string): WikiAliasRow[] {
  return wiki.getWikiAliases(getDb(), filePath, entryId);
}

export function addWikiDetails(filePath: string, entryId: string, details: { chapterIndex: number; category: string; content: string; relevance?: number; sourceText?: string }[]): void {
  wiki.addWikiDetails(getDb(), filePath, entryId, details);
}

export function supersedeWikiDetails(filePath: string, entryId: string, category: string, currentChapter: number): void {
  wiki.supersedeWikiDetails(getDb(), filePath, entryId, category, currentChapter);
}

export function getWikiDetailsForEntry(filePath: string, entryId: string, maxChapter?: number): WikiDetailRow[] {
  return wiki.getWikiDetailsForEntry(getDb(), filePath, entryId, maxChapter);
}

export function addWikiRelationship(filePath: string, rel: { sourceId: string; targetId: string; relation: string; sinceChapter: number; description?: string }): void {
  wiki.addWikiRelationship(getDb(), filePath, rel);
}

export function getRelationshipsForEntry(filePath: string, entryId: string, maxChapter?: number): WikiRelationshipRow[] {
  return wiki.getRelationshipsForEntry(getDb(), filePath, entryId, maxChapter);
}

export function addWikiAppearance(filePath: string, entryId: string, chapterIndex: number): void {
  wiki.addWikiAppearance(getDb(), filePath, entryId, chapterIndex);
}

export function getAppearancesForEntry(filePath: string, entryId: string): number[] {
  return wiki.getAppearancesForEntry(getDb(), filePath, entryId);
}

export function getAllWikiRelationships(filePath: string): WikiRelationshipRow[] {
  return wiki.getAllWikiRelationships(getDb(), filePath);
}

export function getAllAppearanceCounts(filePath: string): { entry_id: string; count: number }[] {
  return wiki.getAllAppearanceCounts(getDb(), filePath);
}

export function upsertChapterSummary(filePath: string, summary: Parameters<typeof wiki.upsertChapterSummary>[2]): void {
  wiki.upsertChapterSummary(getDb(), filePath, summary);
}

export function getChapterSummaries(filePath: string, fromCh: number, toCh: number): WikiChapterSummaryRow[] {
  return wiki.getChapterSummaries(getDb(), filePath, fromCh, toCh);
}

export function getAllChapterSummaries(filePath: string): WikiChapterSummaryRow[] {
  return wiki.getAllChapterSummaries(getDb(), filePath);
}

export function upsertArc(filePath: string, arc: Parameters<typeof wiki.upsertArc>[2]): void {
  wiki.upsertArc(getDb(), filePath, arc);
}

export function getActiveArcs(filePath: string): WikiArcRow[] {
  return wiki.getActiveArcs(getDb(), filePath);
}

export function getAllArcs(filePath: string): WikiArcRow[] {
  return wiki.getAllArcs(getDb(), filePath);
}

export function addArcBeat(filePath: string, arcId: string, beat: { chapterIndex: number; beatType: string; description: string }): void {
  wiki.addArcBeat(getDb(), filePath, arcId, beat);
}

export function getArcBeats(filePath: string, arcId: string): WikiArcBeatRow[] {
  return wiki.getArcBeats(getDb(), filePath, arcId);
}

export function addArcEntity(filePath: string, arcId: string, entryId: string, role: string): void {
  wiki.addArcEntity(getDb(), filePath, arcId, entryId, role);
}

export function getArcEntities(filePath: string, arcId: string): { entry_id: string; role: string }[] {
  return wiki.getArcEntities(getDb(), filePath, arcId);
}

export function deleteArc(filePath: string, arcId: string): void {
  wiki.deleteArc(getDb(), filePath, arcId);
}

export function mergeArcs(filePath: string, sourceArcIds: string[], targetArcId: string): void {
  wiki.mergeArcs(getDb(), filePath, sourceArcIds, targetArcId);
}

export function markChapterProcessed(filePath: string, chapterIndex: number): void {
  wiki.markChapterProcessed(getDb(), filePath, chapterIndex);
}

export function unmarkChapterProcessed(filePath: string, chapterIndex: number): void {
  wiki.unmarkChapterProcessed(getDb(), filePath, chapterIndex);
}

export function getProcessedChapters(filePath: string): number[] {
  return wiki.getProcessedChapters(getDb(), filePath);
}

export function getWikiMeta(filePath: string): { file_path: string; book_title: string; updated_at: string } | null {
  return wiki.getWikiMeta(getDb(), filePath);
}

export function upsertWikiMeta(filePath: string, bookTitle: string): void {
  wiki.upsertWikiMeta(getDb(), filePath, bookTitle);
}

export function getEntityIndex(filePath: string): { id: string; name: string; type: string; color: string; aliases: string[] }[] {
  return wiki.getEntityIndex(getDb(), filePath);
}

export function getRecentEntities(filePath: string, lastNChapters: number, currentChapter: number): WikiEntryRow[] {
  return wiki.getRecentEntities(getDb(), filePath, lastNChapters, currentChapter);
}

export function clearChapterWikiData(filePath: string, chapterIndex: number): void {
  wiki.clearChapterWikiData(getDb(), filePath, chapterIndex);
}

export function getAllWikiAliases(filePath: string): { entry_id: string; alias: string; alias_type: string; relevance: number }[] {
  return wiki.getAllWikiAliases(getDb(), filePath);
}

export function upsertMCStat(filePath: string, stat: Parameters<typeof wiki.upsertMCStat>[2]): void {
  wiki.upsertMCStat(getDb(), filePath, stat);
}

export function getMCStats(filePath: string): MCStatRow[] {
  return wiki.getMCStats(getDb(), filePath);
}

export function setMCEntityId(filePath: string, entityId: string): void {
  wiki.setMCEntityId(getDb(), filePath, entityId);
}

export function getMCEntityId(filePath: string): string | null {
  return wiki.getMCEntityId(getDb(), filePath);
}

export function clearWiki(filePath: string): void {
  wiki.clearWiki(getDb(), filePath);
}

/** Clear ALL wiki data for ALL books */
export function clearAllWiki(): void {
  wiki.clearAllWiki(getDb());
}

/** Delete all settings whose key starts with the given prefix */
export function clearSettingsByPrefix(prefix: string): void {
  db.prepare("DELETE FROM settings WHERE key LIKE ?").run(prefix + "%");
}

export function migrateJsonWiki(filePath: string): boolean {
  return wiki.migrateJsonWiki(getDb(), filePath);
}

// ── Simulate ──────────────────────────────────────────

export interface SimBranchRow {
  id: string;
  file_path: string;
  entity_id: string;
  entity_name: string;
  chapter_index: number;
  truncate_after_para: number;
  created_at: string;
}

export interface SimSegmentRow {
  id: number;
  file_path: string;
  branch_id: string;
  segment_index: number;
  user_input: string;
  html_paragraphs: string; // JSON stringified string[]
  created_at: string;
}

export function upsertBranch(branch: {
  id: string;
  filePath: string;
  entityId: string;
  entityName: string;
  chapterIndex: number;
  truncateAfterPara: number;
}): void {
  db.prepare(`
    INSERT OR REPLACE INTO sim_branches (id, file_path, entity_id, entity_name, chapter_index, truncate_after_para)
    VALUES (@id, @filePath, @entityId, @entityName, @chapterIndex, @truncateAfterPara)
  `).run(branch);
}

export function getBranches(filePath: string): SimBranchRow[] {
  return db.prepare(
    "SELECT * FROM sim_branches WHERE file_path = ? ORDER BY created_at DESC",
  ).all(filePath) as SimBranchRow[];
}

export function getBranchSegments(filePath: string, branchId: string): SimSegmentRow[] {
  return db.prepare(
    "SELECT * FROM sim_segments WHERE file_path = ? AND branch_id = ? ORDER BY segment_index ASC",
  ).all(filePath, branchId) as SimSegmentRow[];
}

export function addSegment(segment: {
  filePath: string;
  branchId: string;
  segmentIndex: number;
  userInput: string;
  htmlParagraphs: string; // JSON stringified
}): number {
  const result = db.prepare(`
    INSERT INTO sim_segments (file_path, branch_id, segment_index, user_input, html_paragraphs)
    VALUES (@filePath, @branchId, @segmentIndex, @userInput, @htmlParagraphs)
  `).run(segment);
  return Number(result.lastInsertRowid);
}

export function deleteBranch(filePath: string, branchId: string): void {
  db.prepare("DELETE FROM sim_segments WHERE file_path = ? AND branch_id = ?").run(filePath, branchId);
  db.prepare("DELETE FROM sim_branches WHERE file_path = ? AND id = ?").run(filePath, branchId);
}

// ── Installer Downloads ──────────────────────────────

export interface InstallerDownloadRow {
  id: number;
  source_id: string;
  novel_title: string;
  novel_author: string | null;
  novel_url: string;
  thumbnail: string | null;
  chapters_json: string;
  total_chapters: number;
  current_chapter: number;
  status: string;
  error: string | null;
  epub_path: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function addDownload(dl: {
  sourceId: string;
  novelTitle: string;
  novelAuthor: string | null;
  novelUrl: string;
  thumbnail: string | null;
  chaptersJson: string;
  totalChapters: number;
}): number {
  const result = db.prepare(`
    INSERT INTO installer_downloads (source_id, novel_title, novel_author, novel_url, thumbnail, chapters_json, total_chapters)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(dl.sourceId, dl.novelTitle, dl.novelAuthor, dl.novelUrl, dl.thumbnail, dl.chaptersJson, dl.totalChapters);
  return Number(result.lastInsertRowid);
}

export function updateDownloadProgress(id: number, currentChapter: number): void {
  db.prepare("UPDATE installer_downloads SET current_chapter = ? WHERE id = ?").run(currentChapter, id);
}

export function updateDownloadStatus(id: number, status: string, extra?: { error?: string; epubPath?: string }): void {
  if (status === "downloading") {
    db.prepare("UPDATE installer_downloads SET status = ?, started_at = datetime('now') WHERE id = ?").run(status, id);
  } else if (status === "completed") {
    db.prepare("UPDATE installer_downloads SET status = ?, epub_path = ?, completed_at = datetime('now') WHERE id = ?").run(status, extra?.epubPath ?? null, id);
  } else if (status === "failed") {
    db.prepare("UPDATE installer_downloads SET status = ?, error = ? WHERE id = ?").run(status, extra?.error ?? null, id);
  } else {
    db.prepare("UPDATE installer_downloads SET status = ? WHERE id = ?").run(status, id);
  }
}

export function getDownloads(): InstallerDownloadRow[] {
  return db.prepare("SELECT * FROM installer_downloads ORDER BY created_at DESC").all() as InstallerDownloadRow[];
}

export function getDownload(id: number): InstallerDownloadRow | null {
  return (db.prepare("SELECT * FROM installer_downloads WHERE id = ?").get(id) as InstallerDownloadRow) ?? null;
}

export function removeDownload(id: number): void {
  db.prepare("DELETE FROM installer_downloads WHERE id = ?").run(id);
}

export function clearCompletedDownloads(): void {
  db.prepare("DELETE FROM installer_downloads WHERE status IN ('completed', 'failed', 'cancelled')").run();
}
