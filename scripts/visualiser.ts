/**
 * Database Visualiser for Codex
 *
 * Run with: yarn run visualiser
 *
 * Displays all tables in the Codex SQLite database with
 * formatted output, statistics, and reading activity tracking.
 *
 * Uses sql.js (pure WASM SQLite) so it works with system Node.js
 * even though better-sqlite3 is compiled for Electron's Node version.
 */

import initSqlJs, { type Database } from "sql.js";
import path from "path";
import os from "os";
import fs from "fs";

// ── Resolve DB path ──────────────────────────────────

function getDbPath(): string {
  const platform = process.platform;
  let appData: string;
  if (platform === "win32") {
    appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  } else if (platform === "darwin") {
    appData = path.join(os.homedir(), "Library", "Application Support");
  } else {
    appData = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  }

  const candidates = ["Codex", "codex", "Electron"];
  for (const name of candidates) {
    const candidate = path.join(appData, name, "codex.db");
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(appData, "codex", "codex.db");
}

// ── Helpers ──────────────────────────────────────────

const DIVIDER = "\u2500".repeat(80);
const SECTION = "\u2550".repeat(80);

function header(text: string): void {
  console.log(`\n${SECTION}`);
  console.log(`  ${text}`);
  console.log(SECTION);
}

function subheader(text: string): void {
  console.log(`\n${DIVIDER}`);
  console.log(`  ${text}`);
  console.log(DIVIDER);
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  return d.toLocaleString();
}

/** Run a query and return rows as objects */
function query<T>(db: Database, sql: string): T[] {
  const stmt = db.prepare(sql);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function queryOne<T>(db: Database, sql: string): T {
  const rows = query<T>(db, sql);
  return rows[0];
}

// ── Main ─────────────────────────────────────────────

async function main(): Promise<void> {
  const dbPath = getDbPath();
  console.log(`\n  Codex Database Visualiser`);
  console.log(`  DB Path: ${dbPath}\n`);

  if (!fs.existsSync(dbPath)) {
    console.error(`  Could not find database at: ${dbPath}`);
    console.error(`  Make sure Codex has been run at least once.\n`);
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  // List all tables
  const tables = query<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");

  header("TABLES");
  for (const t of tables) {
    const row = queryOne<{ c: number }>(db, `SELECT COUNT(*) as c FROM "${t.name}"`);
    console.log(`  ${padRight(t.name, 25)} ${row.c} rows`);
  }

  // ── Items (Library) ────────────────────────────────
  const items = query<{
    id: number; title: string; author: string; format: string; filePath: string;
    size: number; section: string; view: string; addedAt: string;
  }>(db, "SELECT * FROM items ORDER BY addedAt DESC");

  header(`LIBRARY ITEMS (${items.length})`);
  if (items.length > 0) {
    console.log(
      `  ${padRight("ID", 5)} ${padRight("Title", 35)} ${padRight("Author", 20)} ${padRight("Format", 7)} ${padRight("Size", 10)} ${padRight("Section", 12)} ${padRight("View", 12)} Added`
    );
    console.log(`  ${DIVIDER}`);
    for (const item of items) {
      console.log(
        `  ${padRight(String(item.id), 5)} ${padRight(truncate(item.title, 33), 35)} ${padRight(truncate(item.author, 18), 20)} ${padRight(item.format, 7)} ${padRight(formatBytes(item.size), 10)} ${padRight(item.section, 12)} ${padRight(item.view, 12)} ${formatDate(item.addedAt)}`
      );
    }
  }

  // ── Bookmarks ──────────────────────────────────────
  const bookmarks = query<{
    id: number; filePath: string; chapterIndex: number; paragraphIndex: number; label: string; createdAt: string;
  }>(db, "SELECT * FROM bookmarks ORDER BY createdAt DESC");

  header(`BOOKMARKS (${bookmarks.length})`);
  if (bookmarks.length > 0) {
    console.log(
      `  ${padRight("ID", 5)} ${padRight("Label", 30)} ${padRight("Chapter", 8)} ${padRight("Para", 6)} ${padRight("File", 40)} Created`
    );
    console.log(`  ${DIVIDER}`);
    for (const bm of bookmarks) {
      console.log(
        `  ${padRight(String(bm.id), 5)} ${padRight(truncate(bm.label, 28), 30)} ${padRight(String(bm.chapterIndex), 8)} ${padRight(String(bm.paragraphIndex), 6)} ${padRight(truncate(path.basename(bm.filePath), 38), 40)} ${formatDate(bm.createdAt)}`
      );
    }
  }

  // ── Reading Progress (from settings) ───────────────
  const progressRows = query<{ key: string; value: string }>(
    db, "SELECT key, value FROM settings WHERE key LIKE 'readProgress:%'"
  );

  header(`READING PROGRESS (${progressRows.length} books)`);
  if (progressRows.length > 0) {
    console.log(`  ${padRight("Book File", 50)} ${padRight("Chapter", 8)} Page`);
    console.log(`  ${DIVIDER}`);
    for (const row of progressRows) {
      const bookFile = row.key.replace("readProgress:", "");
      try {
        const { chapter, page } = JSON.parse(row.value);
        console.log(`  ${padRight(truncate(path.basename(bookFile), 48), 50)} ${padRight(String(chapter), 8)} ${page}`);
      } catch {
        console.log(`  ${padRight(truncate(path.basename(bookFile), 48), 50)} (corrupt data)`);
      }
    }
  }

  // ── Reading Activity ───────────────────────────────
  const hasActivityTable = tables.some(t => t.name === "reading_activity");

  if (hasActivityTable) {
    const totalRow = queryOne<{ c: number }>(db, "SELECT COUNT(*) as c FROM reading_activity");
    const totalPages = totalRow.c;

    header(`READING ACTIVITY (${totalPages} page views)`);

    // Per-book summary
    const bookSummary = query<{
      title: string; filePath: string; pagesRead: number;
      firstRead: string; lastRead: string; maxChapter: number; totalChapters: number;
    }>(db, `
      SELECT title, filePath, COUNT(*) as pagesRead,
             MIN(timestamp) as firstRead, MAX(timestamp) as lastRead,
             MAX(chapterIndex) as maxChapter, MAX(totalChapters) as totalChapters
      FROM reading_activity
      GROUP BY filePath
      ORDER BY lastRead DESC
    `);

    if (bookSummary.length > 0) {
      subheader("Per-Book Summary");
      console.log(
        `  ${padRight("Title", 35)} ${padRight("Pages Read", 12)} ${padRight("Chapters", 10)} ${padRight("First Read", 22)} Last Read`
      );
      console.log(`  ${DIVIDER}`);
      for (const book of bookSummary) {
        const progress = `${book.maxChapter + 1}/${book.totalChapters}`;
        console.log(
          `  ${padRight(truncate(book.title || path.basename(book.filePath), 33), 35)} ${padRight(String(book.pagesRead), 12)} ${padRight(progress, 10)} ${padRight(formatDate(book.firstRead), 22)} ${formatDate(book.lastRead)}`
        );
      }
    }

    // Daily activity
    const dailyActivity = query<{ day: string; pages: number; books: number }>(db, `
      SELECT DATE(timestamp) as day, COUNT(*) as pages, COUNT(DISTINCT filePath) as books
      FROM reading_activity
      GROUP BY DATE(timestamp)
      ORDER BY day DESC
      LIMIT 30
    `);

    if (dailyActivity.length > 0) {
      subheader("Daily Activity (last 30 days)");
      console.log(`  ${padRight("Date", 15)} ${padRight("Pages", 10)} ${padRight("Books", 10)} Activity`);
      console.log(`  ${DIVIDER}`);
      const maxPagesInDay = Math.max(...dailyActivity.map(d => d.pages));
      for (const day of dailyActivity) {
        const barLen = Math.max(1, Math.round((day.pages / maxPagesInDay) * 40));
        const bar = "\u2588".repeat(barLen);
        console.log(
          `  ${padRight(day.day, 15)} ${padRight(String(day.pages), 10)} ${padRight(String(day.books), 10)} ${bar}`
        );
      }
    }

    // Recent page views
    const recentActivity = query<{
      id: number; filePath: string; title: string; chapterIndex: number;
      chapterTitle: string; pageIndex: number; totalPages: number; timestamp: string;
    }>(db, "SELECT * FROM reading_activity ORDER BY timestamp DESC LIMIT 20");

    if (recentActivity.length > 0) {
      subheader("Recent Page Views (last 20)");
      console.log(
        `  ${padRight("Title", 30)} ${padRight("Chapter", 25)} ${padRight("Page", 12)} Timestamp`
      );
      console.log(`  ${DIVIDER}`);
      for (const act of recentActivity) {
        const pageStr = `${act.pageIndex + 1}/${act.totalPages}`;
        console.log(
          `  ${padRight(truncate(act.title || path.basename(act.filePath), 28), 30)} ${padRight(truncate(act.chapterTitle || `Ch ${act.chapterIndex + 1}`, 23), 25)} ${padRight(pageStr, 12)} ${formatDate(act.timestamp)}`
        );
      }
    }
  }

  // ── Excluded Paths ─────────────────────────────────
  const excluded = query<{ filePath: string; excludedAt: string }>(
    db, "SELECT * FROM excluded_paths ORDER BY excludedAt DESC"
  );

  if (excluded.length > 0) {
    header(`EXCLUDED PATHS (${excluded.length})`);
    for (const ex of excluded) {
      console.log(`  ${truncate(ex.filePath, 65)}  (${formatDate(ex.excludedAt)})`);
    }
  }

  // ── Settings (non-progress) ────────────────────────
  const otherSettings = query<{ key: string; value: string }>(
    db, "SELECT key, value FROM settings WHERE key NOT LIKE 'readProgress:%' AND key NOT LIKE 'ttsReadMarks:%'"
  );

  if (otherSettings.length > 0) {
    header(`OTHER SETTINGS (${otherSettings.length})`);
    for (const s of otherSettings) {
      console.log(`  ${padRight(s.key, 30)} ${truncate(s.value, 48)}`);
    }
  }

  console.log(`\n${SECTION}`);
  console.log(`  Done. ${tables.length} tables inspected.`);
  console.log(`${SECTION}\n`);

  db.close();
}

main().catch((err) => {
  console.error("  Visualiser error:", err);
  process.exit(1);
});
