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
      FOREIGN KEY (file_path, entry_id) REFERENCES wiki_entries(file_path, id)
    );

    CREATE TABLE IF NOT EXISTS wiki_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (file_path, entry_id) REFERENCES wiki_entries(file_path, id)
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
      FOREIGN KEY (file_path, source_id) REFERENCES wiki_entries(file_path, id),
      FOREIGN KEY (file_path, target_id) REFERENCES wiki_entries(file_path, id)
    );
    CREATE INDEX IF NOT EXISTS idx_rel_source ON wiki_relationships(file_path, source_id);

    CREATE TABLE IF NOT EXISTS wiki_appearances (
      file_path TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      PRIMARY KEY (file_path, entry_id, chapter_index)
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
      PRIMARY KEY (file_path, arc_id, entry_id)
    );

    CREATE TABLE IF NOT EXISTS wiki_arc_beats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      arc_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      beat_type TEXT NOT NULL,
      description TEXT NOT NULL,
      FOREIGN KEY (file_path, arc_id) REFERENCES wiki_arcs(file_path, id)
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
  `);
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
  db.prepare("DELETE FROM wiki_details WHERE file_path = ? AND entry_id = ?").run(filePath, entryId);
  db.prepare("DELETE FROM wiki_aliases WHERE file_path = ? AND entry_id = ?").run(filePath, entryId);
  db.prepare("DELETE FROM wiki_relationships WHERE file_path = ? AND (source_id = ? OR target_id = ?)").run(filePath, entryId, entryId);
  db.prepare("DELETE FROM wiki_appearances WHERE file_path = ? AND entry_id = ?").run(filePath, entryId);
  db.prepare("DELETE FROM wiki_arc_entities WHERE file_path = ? AND entry_id = ?").run(filePath, entryId);
  db.prepare("DELETE FROM wiki_entries WHERE file_path = ? AND id = ?").run(filePath, entryId);
}

// ── Wiki Aliases ──

export function addWikiAliases(filePath: string, entryId: string, aliases: string[]): void {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO wiki_aliases (file_path, entry_id, alias) VALUES (?, ?, ?)"
  );
  for (const alias of aliases) {
    if (alias) stmt.run(filePath, entryId, alias);
  }
}

export function getWikiAliases(filePath: string, entryId: string): string[] {
  const rows = db.prepare(
    "SELECT alias FROM wiki_aliases WHERE file_path = ? AND entry_id = ?"
  ).all(filePath, entryId) as { alias: string }[];
  return rows.map((r) => r.alias);
}

// ── Wiki Details ──

export function addWikiDetails(filePath: string, entryId: string, details: { chapterIndex: number; category: string; content: string }[]): void {
  const stmt = db.prepare(
    "INSERT INTO wiki_details (file_path, entry_id, chapter_index, category, content) VALUES (?, ?, ?, ?, ?)"
  );
  for (const d of details) {
    stmt.run(filePath, entryId, d.chapterIndex, d.category, d.content);
  }
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

// ── Processing State ──

export function markChapterProcessed(filePath: string, chapterIndex: number): void {
  db.prepare(
    "INSERT OR IGNORE INTO wiki_processed (file_path, chapter_index) VALUES (?, ?)"
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
  const entries = db.prepare(
    "SELECT id, name, type, color FROM wiki_entries WHERE file_path = ? ORDER BY first_appearance ASC"
  ).all(filePath) as { id: string; name: string; type: string; color: string }[];

  const aliasStmt = db.prepare(
    "SELECT alias FROM wiki_aliases WHERE file_path = ? AND entry_id = ?"
  );

  return entries.map((e) => {
    const aliases = (aliasStmt.all(filePath, e.id) as { alias: string }[]).map((r) => r.alias);
    return { ...e, aliases };
  });
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

export function clearWiki(filePath: string): void {
  const tables = [
    "wiki_arc_beats", "wiki_arc_entities", "wiki_arcs",
    "wiki_chapter_summaries", "wiki_appearances",
    "wiki_relationships", "wiki_details", "wiki_aliases",
    "wiki_entries", "wiki_processed", "wiki_meta",
  ];
  const clearAll = db.transaction(() => {
    for (const table of tables) {
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
