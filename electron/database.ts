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
