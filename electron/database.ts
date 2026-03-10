import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";

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

const WIKI_TABLES = [
  "wiki_arc_beats", "wiki_arc_entities", "wiki_arcs",
  "wiki_chapter_summaries", "wiki_appearances",
  "wiki_relationships", "wiki_details", "wiki_aliases",
  "wiki_entries", "wiki_processed", "wiki_mc_stats", "wiki_meta",
] as const;

// ── Wiki CRUD ─────────────────────────────────────

export interface WikiEntryRow {
  id: string;
  file_path: string;
  name: string;
  type: string;
  short_description: string;
  description: string;
  color: string;
  first_appearance: number;
  significance: number;
  status: string;
}

export interface WikiDetailRow {
  id: number;
  file_path: string;
  entry_id: string;
  chapter_index: number;
  category: string;
  content: string;
  relevance: number;
  is_superseded: number;
  superseded_chapter: number | null;
}

export interface WikiAliasRow {
  alias: string;
  alias_type: string;
  relevance: number;
}

export interface WikiRelationshipRow {
  id: number;
  file_path: string;
  source_id: string;
  target_id: string;
  relation: string;
  since_chapter: number;
  until_chapter: number | null;
  description: string;
}

export interface WikiChapterSummaryRow {
  file_path: string;
  chapter_index: number;
  summary: string;
  key_events: string;
  active_entities: string;
  mood: string;
}

export interface WikiArcRow {
  id: string;
  file_path: string;
  name: string;
  description: string;
  arc_type: string;
  status: string;
  start_chapter: number;
  end_chapter: number | null;
}

export interface WikiArcBeatRow {
  id: number;
  file_path: string;
  arc_id: string;
  chapter_index: number;
  beat_type: string;
  description: string;
}

// ── Wiki Entries ──

export function upsertWikiEntry(entry: {
  id: string;
  filePath: string;
  name: string;
  type: string;
  shortDescription?: string;
  description?: string;
  color?: string;
  firstAppearance?: number;
  significance?: number;
  status?: string;
}): void {
  db.prepare(`
    INSERT INTO wiki_entries (id, file_path, name, type, short_description, description, color, first_appearance, significance, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path, id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      short_description = excluded.short_description,
      description = excluded.description,
      color = excluded.color,
      first_appearance = excluded.first_appearance,
      significance = excluded.significance,
      status = excluded.status
  `).run(
    entry.id,
    entry.filePath,
    entry.name,
    entry.type,
    entry.shortDescription ?? "",
    entry.description ?? "",
    entry.color ?? "blue",
    entry.firstAppearance ?? 0,
    entry.significance ?? 1,
    entry.status ?? "active",
  );
}

/** Remove wiki entries with empty/null name, id, or short_description (created by truncated AI responses). */
export function purgeNullWikiEntries(filePath: string): number {
  const result = db.prepare(
    `DELETE FROM wiki_entries
     WHERE file_path = ?
       AND (trim(name) = '' OR trim(id) = '' OR trim(COALESCE(short_description,'')) = '')`
  ).run(filePath);
  return result.changes;
}

export function getWikiEntries(filePath: string): WikiEntryRow[] {
  return db.prepare(
    "SELECT * FROM wiki_entries WHERE file_path = ? ORDER BY first_appearance ASC"
  ).all(filePath) as WikiEntryRow[];
}

export function getWikiEntry(filePath: string, entryId: string): WikiEntryRow | null {
  return (db.prepare(
    "SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?"
  ).get(filePath, entryId) as WikiEntryRow) ?? null;
}

export function deleteWikiEntry(filePath: string, entryId: string): void {
  db.prepare("DELETE FROM wiki_entries WHERE file_path = ? AND id = ?").run(filePath, entryId);
}

// ── Wiki Entry Merge ──

export interface WikiMergeLogRow {
  id: number;
  file_path: string;
  source_id: string;
  target_id: string;
  source_name: string;
  target_name: string;
  source_snapshot: string;
  merged_at: string;
}

/** Merge sourceId into targetId — moves all data, logs for undo */
export function mergeWikiEntries(filePath: string, sourceId: string, targetId: string): void {
  const merge = db.transaction(() => {
    const source = db.prepare("SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?").get(filePath, sourceId) as WikiEntryRow | undefined;
    const target = db.prepare("SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?").get(filePath, targetId) as WikiEntryRow | undefined;
    if (!source || !target) return;

    // Snapshot source for undo
    const aliases = (db.prepare("SELECT alias FROM wiki_aliases WHERE file_path = ? AND entry_id = ?").all(filePath, sourceId) as { alias: string }[]).map(r => r.alias);
    const details = db.prepare("SELECT * FROM wiki_details WHERE file_path = ? AND entry_id = ?").all(filePath, sourceId);
    const relationships = db.prepare("SELECT * FROM wiki_relationships WHERE file_path = ? AND (source_id = ? OR target_id = ?)").all(filePath, sourceId, sourceId);
    const appearances = (db.prepare("SELECT chapter_index FROM wiki_appearances WHERE file_path = ? AND entry_id = ?").all(filePath, sourceId) as { chapter_index: number }[]).map(r => r.chapter_index);

    const snapshot = JSON.stringify({ entry: source, aliases, details, relationships, appearances });

    db.prepare(
      "INSERT INTO wiki_merge_log (file_path, source_id, target_id, source_name, target_name, source_snapshot) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(filePath, sourceId, targetId, source.name, target.name, snapshot);

    // Append source description to target
    if (source.description) {
      const newDesc = target.description ? `${target.description}\n\n${source.description}` : source.description;
      db.prepare("UPDATE wiki_entries SET description = ? WHERE file_path = ? AND id = ?").run(newDesc, filePath, targetId);
    }

    // Bump significance
    if (source.significance > target.significance) {
      db.prepare("UPDATE wiki_entries SET significance = ? WHERE file_path = ? AND id = ?").run(source.significance, filePath, targetId);
    }

    // Use earliest first_appearance
    if (source.first_appearance < target.first_appearance) {
      db.prepare("UPDATE wiki_entries SET first_appearance = ? WHERE file_path = ? AND id = ?").run(source.first_appearance, filePath, targetId);
    }

    // Add source name + aliases as aliases of target
    db.prepare("INSERT OR IGNORE INTO wiki_aliases (file_path, entry_id, alias) VALUES (?, ?, ?)").run(filePath, targetId, source.name);
    for (const alias of aliases) {
      db.prepare("INSERT OR IGNORE INTO wiki_aliases (file_path, entry_id, alias) VALUES (?, ?, ?)").run(filePath, targetId, alias);
    }

    // Move details
    db.prepare("UPDATE wiki_details SET entry_id = ? WHERE file_path = ? AND entry_id = ?").run(targetId, filePath, sourceId);

    // Move appearances (ignore duplicates)
    for (const ch of appearances) {
      db.prepare("INSERT OR IGNORE INTO wiki_appearances (file_path, entry_id, chapter_index) VALUES (?, ?, ?)").run(filePath, targetId, ch);
    }

    // Move relationships — repoint source_id/target_id references
    db.prepare("UPDATE wiki_relationships SET source_id = ? WHERE file_path = ? AND source_id = ?").run(targetId, filePath, sourceId);
    db.prepare("UPDATE wiki_relationships SET target_id = ? WHERE file_path = ? AND target_id = ?").run(targetId, filePath, sourceId);

    // Move arc entity references
    const arcEntities = db.prepare("SELECT arc_id, role FROM wiki_arc_entities WHERE file_path = ? AND entry_id = ?").all(filePath, sourceId) as { arc_id: string; role: string }[];
    for (const ae of arcEntities) {
      db.prepare("INSERT OR IGNORE INTO wiki_arc_entities (file_path, arc_id, entry_id, role) VALUES (?, ?, ?, ?)").run(filePath, ae.arc_id, targetId, ae.role);
    }

    // Delete source entry (cascades aliases, remaining references)
    db.prepare("DELETE FROM wiki_entries WHERE file_path = ? AND id = ?").run(filePath, sourceId);
  });
  merge();
}

/** Undo a merge — restore the source entry from snapshot */
export function unmergeWikiEntries(filePath: string, mergeLogId: number): void {
  const unmerge = db.transaction(() => {
    const log = db.prepare("SELECT * FROM wiki_merge_log WHERE id = ? AND file_path = ?").get(mergeLogId, filePath) as WikiMergeLogRow | undefined;
    if (!log) return;

    const snapshot = JSON.parse(log.source_snapshot) as {
      entry: WikiEntryRow;
      aliases: string[];
      details: { chapter_index: number; category: string; content: string; entry_id: string }[];
      relationships: { source_id: string; target_id: string; relation: string; since_chapter: number; until_chapter: number | null; description: string }[];
      appearances: number[];
    };

    // Re-create the source entry
    const e = snapshot.entry;
    db.prepare(
      "INSERT OR IGNORE INTO wiki_entries (id, file_path, name, type, short_description, description, color, first_appearance, significance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(e.id, filePath, e.name, e.type, e.short_description, e.description, e.color, e.first_appearance, e.significance, e.status);

    // Re-add aliases
    for (const alias of snapshot.aliases) {
      db.prepare("INSERT OR IGNORE INTO wiki_aliases (file_path, entry_id, alias) VALUES (?, ?, ?)").run(filePath, e.id, alias);
    }

    // Re-add details (they were moved, so move them back)
    for (const d of snapshot.details) {
      // Move back details that were reassigned to target
      db.prepare(
        "UPDATE wiki_details SET entry_id = ? WHERE file_path = ? AND entry_id = ? AND chapter_index = ? AND category = ? AND content = ?"
      ).run(e.id, filePath, log.target_id, d.chapter_index, d.category, d.content);
    }

    // Re-add appearances
    for (const ch of snapshot.appearances) {
      db.prepare("INSERT OR IGNORE INTO wiki_appearances (file_path, entry_id, chapter_index) VALUES (?, ?, ?)").run(filePath, e.id, ch);
    }

    // Remove source name from target aliases
    db.prepare("DELETE FROM wiki_aliases WHERE file_path = ? AND entry_id = ? AND alias = ?").run(filePath, log.target_id, e.name);
    for (const alias of snapshot.aliases) {
      db.prepare("DELETE FROM wiki_aliases WHERE file_path = ? AND entry_id = ? AND alias = ?").run(filePath, log.target_id, alias);
    }

    // Delete the merge log entry
    db.prepare("DELETE FROM wiki_merge_log WHERE id = ?").run(mergeLogId);
  });
  unmerge();
}

/** Get all merge log entries for a book */
export function getWikiMergeLog(filePath: string): WikiMergeLogRow[] {
  return db.prepare(
    "SELECT * FROM wiki_merge_log WHERE file_path = ? ORDER BY merged_at DESC"
  ).all(filePath) as WikiMergeLogRow[];
}

// ── Wiki Aliases ──

export type WikiAliasInput = string | { alias: string; alias_type?: string; relevance?: number };

export function addWikiAliases(filePath: string, entryId: string, aliases: WikiAliasInput[]): void {
  const stmt = db.prepare(`
    INSERT INTO wiki_aliases (file_path, entry_id, alias, alias_type, relevance) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(file_path, entry_id, alias) DO UPDATE SET
      alias_type = CASE WHEN excluded.relevance > wiki_aliases.relevance THEN excluded.alias_type ELSE wiki_aliases.alias_type END,
      relevance = MAX(wiki_aliases.relevance, excluded.relevance)
  `);
  const insertAll = db.transaction(() => {
    for (const a of aliases) {
      const alias = typeof a === "string" ? a : a.alias;
      const alias_type = typeof a === "string" ? "name" : (a.alias_type ?? "name");
      const relevance = typeof a === "string" ? 3 : (a.relevance ?? 3);
      if (alias) stmt.run(filePath, entryId, alias, alias_type, relevance);
    }
  });
  insertAll();
}

export function getWikiAliases(filePath: string, entryId: string): WikiAliasRow[] {
  return db.prepare(
    "SELECT alias, alias_type, relevance FROM wiki_aliases WHERE file_path = ? AND entry_id = ? ORDER BY relevance DESC"
  ).all(filePath, entryId) as WikiAliasRow[];
}

// ── Wiki Details ──

export function addWikiDetails(filePath: string, entryId: string, details: { chapterIndex: number; category: string; content: string; relevance?: number }[]): void {
  const stmt = db.prepare(
    "INSERT INTO wiki_details (file_path, entry_id, chapter_index, category, content, relevance) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertAll = db.transaction(() => {
    for (const d of details) {
      if (!d.content) continue;
      stmt.run(filePath, entryId, d.chapterIndex, d.category || "info", d.content, d.relevance ?? 3);
    }
  });
  insertAll();
}

export function supersedeWikiDetails(filePath: string, entryId: string, category: string, currentChapter: number): void {
  db.prepare(
    "UPDATE wiki_details SET is_superseded = 1, superseded_chapter = ? WHERE file_path = ? AND entry_id = ? AND category = ? AND chapter_index < ? AND is_superseded = 0"
  ).run(currentChapter, filePath, entryId, category, currentChapter);
}

export function getWikiDetailsForEntry(filePath: string, entryId: string, maxChapter?: number): WikiDetailRow[] {
  if (maxChapter != null) {
    return db.prepare(
      "SELECT * FROM wiki_details WHERE file_path = ? AND entry_id = ? AND chapter_index <= ? ORDER BY chapter_index ASC"
    ).all(filePath, entryId, maxChapter) as WikiDetailRow[];
  }
  return db.prepare(
    "SELECT * FROM wiki_details WHERE file_path = ? AND entry_id = ? ORDER BY chapter_index ASC"
  ).all(filePath, entryId) as WikiDetailRow[];
}

// ── Wiki Relationships ──

export function addWikiRelationship(filePath: string, rel: { sourceId: string; targetId: string; relation: string; sinceChapter: number; description?: string }): void {
  // Check for duplicate
  const existing = db.prepare(
    "SELECT id FROM wiki_relationships WHERE file_path = ? AND source_id = ? AND target_id = ? AND relation = ?"
  ).get(filePath, rel.sourceId, rel.targetId, rel.relation);
  if (existing) return;

  // Skip if target entity doesn't exist (AI may reference entities not yet created)
  const targetExists = db.prepare(
    "SELECT 1 FROM wiki_entries WHERE file_path = ? AND id = ?"
  ).get(filePath, rel.targetId);
  if (!targetExists) return;

  db.prepare(
    "INSERT INTO wiki_relationships (file_path, source_id, target_id, relation, since_chapter, description) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(filePath, rel.sourceId, rel.targetId, rel.relation, rel.sinceChapter, rel.description ?? "");
}

export function getRelationshipsForEntry(filePath: string, entryId: string, maxChapter?: number): WikiRelationshipRow[] {
  if (maxChapter != null) {
    return db.prepare(
      "SELECT * FROM wiki_relationships WHERE file_path = ? AND (source_id = ? OR target_id = ?) AND since_chapter <= ? ORDER BY since_chapter ASC"
    ).all(filePath, entryId, entryId, maxChapter) as WikiRelationshipRow[];
  }
  return db.prepare(
    "SELECT * FROM wiki_relationships WHERE file_path = ? AND (source_id = ? OR target_id = ?) ORDER BY since_chapter ASC"
  ).all(filePath, entryId, entryId) as WikiRelationshipRow[];
}

// ── Wiki Appearances ──

export function addWikiAppearance(filePath: string, entryId: string, chapterIndex: number): void {
  db.prepare(
    "INSERT OR IGNORE INTO wiki_appearances (file_path, entry_id, chapter_index) VALUES (?, ?, ?)"
  ).run(filePath, entryId, chapterIndex);
}

export function getAppearancesForEntry(filePath: string, entryId: string): number[] {
  const rows = db.prepare(
    "SELECT chapter_index FROM wiki_appearances WHERE file_path = ? AND entry_id = ? ORDER BY chapter_index ASC"
  ).all(filePath, entryId) as { chapter_index: number }[];
  return rows.map((r) => r.chapter_index);
}

// ── Chapter Summaries ──

export function upsertChapterSummary(filePath: string, summary: {
  chapterIndex: number;
  summary: string;
  keyEvents?: string;
  activeEntities?: string;
  mood?: string;
}): void {
  db.prepare(`
    INSERT INTO wiki_chapter_summaries (file_path, chapter_index, summary, key_events, active_entities, mood)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path, chapter_index) DO UPDATE SET
      summary = excluded.summary,
      key_events = excluded.key_events,
      active_entities = excluded.active_entities,
      mood = excluded.mood
  `).run(
    filePath,
    summary.chapterIndex,
    summary.summary,
    summary.keyEvents ?? "",
    summary.activeEntities ?? "",
    summary.mood ?? "",
  );
}

export function getChapterSummaries(filePath: string, fromCh: number, toCh: number): WikiChapterSummaryRow[] {
  return db.prepare(
    "SELECT * FROM wiki_chapter_summaries WHERE file_path = ? AND chapter_index >= ? AND chapter_index <= ? ORDER BY chapter_index ASC"
  ).all(filePath, fromCh, toCh) as WikiChapterSummaryRow[];
}

export function getAllChapterSummaries(filePath: string): WikiChapterSummaryRow[] {
  return db.prepare(
    "SELECT * FROM wiki_chapter_summaries WHERE file_path = ? ORDER BY chapter_index ASC"
  ).all(filePath) as WikiChapterSummaryRow[];
}

// ── Story Arcs ──

export function upsertArc(filePath: string, arc: {
  id: string;
  name: string;
  description?: string;
  arcType?: string;
  status?: string;
  startChapter: number;
  endChapter?: number | null;
}): void {
  db.prepare(`
    INSERT INTO wiki_arcs (id, file_path, name, description, arc_type, status, start_chapter, end_chapter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path, id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      arc_type = excluded.arc_type,
      status = excluded.status,
      start_chapter = excluded.start_chapter,
      end_chapter = excluded.end_chapter
  `).run(
    arc.id,
    filePath,
    arc.name,
    arc.description ?? "",
    arc.arcType ?? "plot",
    arc.status ?? "active",
    arc.startChapter,
    arc.endChapter ?? null,
  );
}

export function getActiveArcs(filePath: string): WikiArcRow[] {
  return db.prepare(
    "SELECT * FROM wiki_arcs WHERE file_path = ? AND status IN ('setup', 'active', 'climax') ORDER BY start_chapter ASC"
  ).all(filePath) as WikiArcRow[];
}

export function getAllArcs(filePath: string): WikiArcRow[] {
  return db.prepare(
    "SELECT * FROM wiki_arcs WHERE file_path = ? ORDER BY start_chapter ASC"
  ).all(filePath) as WikiArcRow[];
}

export function addArcBeat(filePath: string, arcId: string, beat: {
  chapterIndex: number;
  beatType: string;
  description: string;
}): void {
  db.prepare(
    "INSERT INTO wiki_arc_beats (file_path, arc_id, chapter_index, beat_type, description) VALUES (?, ?, ?, ?, ?)"
  ).run(filePath, arcId, beat.chapterIndex, beat.beatType, beat.description);
}

export function getArcBeats(filePath: string, arcId: string): WikiArcBeatRow[] {
  return db.prepare(
    "SELECT * FROM wiki_arc_beats WHERE file_path = ? AND arc_id = ? ORDER BY chapter_index ASC"
  ).all(filePath, arcId) as WikiArcBeatRow[];
}

export function addArcEntity(filePath: string, arcId: string, entryId: string, role: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO wiki_arc_entities (file_path, arc_id, entry_id, role) VALUES (?, ?, ?, ?)"
  ).run(filePath, arcId, entryId, role);
}

export function getArcEntities(filePath: string, arcId: string): { entry_id: string; role: string }[] {
  return db.prepare(
    "SELECT entry_id, role FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ?"
  ).all(filePath, arcId) as { entry_id: string; role: string }[];
}

export function deleteArc(filePath: string, arcId: string): void {
  const del = db.transaction(() => {
    db.prepare("DELETE FROM wiki_arc_beats WHERE file_path = ? AND arc_id = ?").run(filePath, arcId);
    db.prepare("DELETE FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ?").run(filePath, arcId);
    db.prepare("DELETE FROM wiki_arcs WHERE file_path = ? AND id = ?").run(filePath, arcId);
  });
  del();
}

export function mergeArcs(filePath: string, sourceArcIds: string[], targetArcId: string): void {
  const merge = db.transaction(() => {
    // Verify target arc exists
    const target = db.prepare(
      "SELECT id FROM wiki_arcs WHERE file_path = ? AND id = ?"
    ).get(filePath, targetArcId);
    if (!target) return;

    for (const sourceId of sourceArcIds) {
      if (sourceId === targetArcId) continue;
      // Verify source arc exists
      const source = db.prepare(
        "SELECT id FROM wiki_arcs WHERE file_path = ? AND id = ?"
      ).get(filePath, sourceId);
      if (!source) continue;

      // Move beats to target arc
      db.prepare(
        "UPDATE wiki_arc_beats SET arc_id = ? WHERE file_path = ? AND arc_id = ?"
      ).run(targetArcId, filePath, sourceId);
      // Move entities to target arc (ignore duplicates)
      const entities = db.prepare(
        "SELECT entry_id, role FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ?"
      ).all(filePath, sourceId) as { entry_id: string; role: string }[];
      for (const e of entities) {
        db.prepare(
          "INSERT OR IGNORE INTO wiki_arc_entities (file_path, arc_id, entry_id, role) VALUES (?, ?, ?, ?)"
        ).run(filePath, targetArcId, e.entry_id, e.role);
      }
      // Delete source arc entities first, then arc (cascade handles beats)
      db.prepare("DELETE FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ?").run(filePath, sourceId);
      db.prepare("DELETE FROM wiki_arcs WHERE file_path = ? AND id = ?").run(filePath, sourceId);
    }
  });
  merge();
}

// ── Processing State ──

export function markChapterProcessed(filePath: string, chapterIndex: number): void {
  db.prepare(
    "INSERT OR IGNORE INTO wiki_processed (file_path, chapter_index) VALUES (?, ?)"
  ).run(filePath, chapterIndex);
}

export function unmarkChapterProcessed(filePath: string, chapterIndex: number): void {
  db.prepare(
    "DELETE FROM wiki_processed WHERE file_path = ? AND chapter_index = ?"
  ).run(filePath, chapterIndex);
}

export function getProcessedChapters(filePath: string): number[] {
  const rows = db.prepare(
    "SELECT chapter_index FROM wiki_processed WHERE file_path = ? ORDER BY chapter_index ASC"
  ).all(filePath) as { chapter_index: number }[];
  return rows.map((r) => r.chapter_index);
}

// ── Wiki Meta ──

export function getWikiMeta(filePath: string): { file_path: string; book_title: string; updated_at: string } | null {
  return (db.prepare(
    "SELECT * FROM wiki_meta WHERE file_path = ?"
  ).get(filePath) as { file_path: string; book_title: string; updated_at: string }) ?? null;
}

export function upsertWikiMeta(filePath: string, bookTitle: string): void {
  db.prepare(`
    INSERT INTO wiki_meta (file_path, book_title, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(file_path) DO UPDATE SET
      book_title = excluded.book_title,
      updated_at = datetime('now')
  `).run(filePath, bookTitle);
}

// ── Entity Index (compact, for AI context + highlighting) ──

export function getEntityIndex(filePath: string): { id: string; name: string; type: string; color: string; aliases: string[] }[] {
  const rows = db.prepare(`
    SELECT e.id, e.name, e.type, e.color,
           GROUP_CONCAT(a.alias, '||') as aliases_str
    FROM wiki_entries e
    LEFT JOIN wiki_aliases a ON a.file_path = e.file_path AND a.entry_id = e.id
    WHERE e.file_path = ?
    GROUP BY e.id
    ORDER BY e.first_appearance ASC
  `).all(filePath) as { id: string; name: string; type: string; color: string; aliases_str: string | null }[];
  return rows.map(r => ({
    id: r.id, name: r.name, type: r.type, color: r.color,
    aliases: r.aliases_str ? r.aliases_str.split("||") : [],
  }));
}

// ── Recent Entities (for AI context window) ──

export function getRecentEntities(filePath: string, lastNChapters: number, currentChapter: number): WikiEntryRow[] {
  const minChapter = Math.max(0, currentChapter - lastNChapters + 1);
  return db.prepare(`
    SELECT DISTINCT e.* FROM wiki_entries e
    JOIN wiki_appearances a ON a.file_path = e.file_path AND a.entry_id = e.id
    WHERE e.file_path = ? AND a.chapter_index >= ? AND a.chapter_index <= ?
    ORDER BY e.significance DESC, e.first_appearance ASC
  `).all(filePath, minChapter, currentChapter) as WikiEntryRow[];
}

// ── Clear Wiki ──

// ── MC Stats ──

export interface MCStatRow {
  id: number;
  file_path: string;
  stat_key: string;
  category: string;
  display_name: string;
  value: string | null;
  is_active: number;
  last_chapter: number;
}

export function upsertMCStat(
  filePath: string,
  stat: { key: string; category: string; name: string; value: string | null; isActive: boolean; chapter: number },
): void {
  db.prepare(`
    INSERT INTO wiki_mc_stats (file_path, stat_key, category, display_name, value, is_active, last_chapter)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path, stat_key) DO UPDATE SET
      category = excluded.category,
      display_name = excluded.display_name,
      value = excluded.value,
      is_active = excluded.is_active,
      last_chapter = excluded.last_chapter
  `).run(filePath, stat.key, stat.category, stat.name, stat.value ?? null, stat.isActive ? 1 : 0, stat.chapter);
}

export function getMCStats(filePath: string): MCStatRow[] {
  return db.prepare(
    "SELECT * FROM wiki_mc_stats WHERE file_path = ? ORDER BY category, display_name"
  ).all(filePath) as MCStatRow[];
}

export function setMCEntityId(filePath: string, entityId: string): void {
  db.prepare("UPDATE wiki_meta SET mc_entity_id = ? WHERE file_path = ?").run(entityId, filePath);
}

export function getMCEntityId(filePath: string): string | null {
  const row = db.prepare("SELECT mc_entity_id FROM wiki_meta WHERE file_path = ?").get(filePath) as { mc_entity_id: string | null } | undefined;
  return row?.mc_entity_id ?? null;
}

export function clearWiki(filePath: string): void {
  const clearAll = db.transaction(() => {
    for (const table of WIKI_TABLES) {
      db.prepare(`DELETE FROM ${table} WHERE file_path = ?`).run(filePath);
    }
  });
  clearAll();
}

// ── Migrate from JSON blob ──

export function migrateJsonWiki(filePath: string): boolean {
  const raw = getSetting(`wiki:${filePath}`);
  if (!raw) return false;

  try {
    const wiki = JSON.parse(raw) as {
      bookTitle: string;
      entries: Record<string, {
        id: string; name: string; type: string; aliases: string[];
        shortDescription: string; description: string;
        firstAppearance: number; chapterAppearances: number[];
        details: { chapterIndex: number; content: string; category: string }[];
        relationships: { targetId: string; relation: string; since: number }[];
        color: string;
      }>;
      processedChapters: number[];
    };

    const migrate = db.transaction(() => {
      upsertWikiMeta(filePath, wiki.bookTitle);

      for (const entry of Object.values(wiki.entries)) {
        upsertWikiEntry({
          id: entry.id,
          filePath,
          name: entry.name,
          type: entry.type,
          shortDescription: entry.shortDescription,
          description: entry.description,
          color: entry.color,
          firstAppearance: entry.firstAppearance,
          significance: 1,
          status: "active",
        });

        if (entry.aliases?.length > 0) {
          addWikiAliases(filePath, entry.id, entry.aliases);
        }

        if (entry.details?.length > 0) {
          addWikiDetails(filePath, entry.id, entry.details.map((d) => ({
            chapterIndex: d.chapterIndex,
            category: d.category,
            content: d.content,
          })));
        }

        for (const rel of entry.relationships ?? []) {
          addWikiRelationship(filePath, {
            sourceId: entry.id,
            targetId: rel.targetId,
            relation: rel.relation,
            sinceChapter: rel.since,
          });
        }

        for (const ch of entry.chapterAppearances ?? []) {
          addWikiAppearance(filePath, entry.id, ch);
        }
      }

      for (const ch of wiki.processedChapters ?? []) {
        markChapterProcessed(filePath, ch);
      }
    });

    migrate();

    // Remove old JSON blob
    db.prepare("DELETE FROM settings WHERE key = ?").run(`wiki:${filePath}`);
    return true;
  } catch (err) {
    console.error("Wiki migration failed:", err);
    return false;
  }
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
