/**
 * Knowledge (reading_state, wiki_entry_versions, knowledge_runs, book_fts…) schema (owner: WS-B). Append-only list run by `electron/db/migrate.ts` (area "knowledge").
 * Never edit an applied migration; append the next version instead.
 *
 * v1 re-declares the legacy `wiki_*` tables with `IF NOT EXISTS` (in production `database.ts`
 * has already created them before migrations run, so it is a no-op there). This makes the store
 * self-contained on a fresh sql.js database in tests.
 */

import type { Migration } from "../db/migrate";
import { hasFts5, type SqlDb } from "../db/sql";

const WIKI_BASE = `
  CREATE TABLE IF NOT EXISTS wiki_entries (
    id TEXT NOT NULL, file_path TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
    short_description TEXT DEFAULT '', description TEXT DEFAULT '', color TEXT DEFAULT 'blue',
    first_appearance INTEGER DEFAULT 0, significance INTEGER DEFAULT 1, status TEXT DEFAULT 'active',
    PRIMARY KEY (file_path, id)
  );
  CREATE TABLE IF NOT EXISTS wiki_aliases (
    file_path TEXT NOT NULL, entry_id TEXT NOT NULL, alias TEXT NOT NULL,
    alias_type TEXT NOT NULL DEFAULT 'name', relevance INTEGER NOT NULL DEFAULT 3,
    PRIMARY KEY (file_path, entry_id, alias),
    FOREIGN KEY (file_path, entry_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS wiki_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT NOT NULL, entry_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL,
    relevance INTEGER NOT NULL DEFAULT 3, is_superseded INTEGER NOT NULL DEFAULT 0,
    superseded_chapter INTEGER, source_text TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (file_path, entry_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_details_entry ON wiki_details(file_path, entry_id, chapter_index);
  CREATE INDEX IF NOT EXISTS idx_details_chapter ON wiki_details(file_path, chapter_index);
  CREATE TABLE IF NOT EXISTS wiki_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT NOT NULL, source_id TEXT NOT NULL,
    target_id TEXT NOT NULL, relation TEXT NOT NULL, since_chapter INTEGER NOT NULL,
    until_chapter INTEGER DEFAULT NULL, description TEXT DEFAULT '',
    FOREIGN KEY (file_path, source_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE,
    FOREIGN KEY (file_path, target_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_rel_source ON wiki_relationships(file_path, source_id);
  CREATE INDEX IF NOT EXISTS idx_rel_target ON wiki_relationships(file_path, target_id);
  CREATE TABLE IF NOT EXISTS wiki_appearances (
    file_path TEXT NOT NULL, entry_id TEXT NOT NULL, chapter_index INTEGER NOT NULL,
    PRIMARY KEY (file_path, entry_id, chapter_index),
    FOREIGN KEY (file_path, entry_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_appearances_chapter ON wiki_appearances(file_path, chapter_index);
  CREATE TABLE IF NOT EXISTS wiki_chapter_summaries (
    file_path TEXT NOT NULL, chapter_index INTEGER NOT NULL, summary TEXT NOT NULL,
    key_events TEXT DEFAULT '', active_entities TEXT DEFAULT '', mood TEXT DEFAULT '',
    PRIMARY KEY (file_path, chapter_index)
  );
  CREATE TABLE IF NOT EXISTS wiki_arcs (
    id TEXT NOT NULL, file_path TEXT NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '',
    arc_type TEXT DEFAULT 'plot', status TEXT DEFAULT 'active', start_chapter INTEGER NOT NULL,
    end_chapter INTEGER DEFAULT NULL, PRIMARY KEY (file_path, id)
  );
  CREATE TABLE IF NOT EXISTS wiki_arc_entities (
    file_path TEXT NOT NULL, arc_id TEXT NOT NULL, entry_id TEXT NOT NULL, role TEXT DEFAULT '',
    PRIMARY KEY (file_path, arc_id, entry_id),
    FOREIGN KEY (file_path, arc_id) REFERENCES wiki_arcs(file_path, id) ON DELETE CASCADE,
    FOREIGN KEY (file_path, entry_id) REFERENCES wiki_entries(file_path, id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS wiki_arc_beats (
    id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT NOT NULL, arc_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL, beat_type TEXT NOT NULL, description TEXT NOT NULL,
    FOREIGN KEY (file_path, arc_id) REFERENCES wiki_arcs(file_path, id) ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_arc_beats ON wiki_arc_beats(file_path, arc_id, chapter_index);
  CREATE TABLE IF NOT EXISTS wiki_processed (
    file_path TEXT NOT NULL, chapter_index INTEGER NOT NULL, processed_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (file_path, chapter_index)
  );
  CREATE TABLE IF NOT EXISTS wiki_meta (
    file_path TEXT PRIMARY KEY, book_title TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')),
    mc_entity_id TEXT DEFAULT NULL
  );
  CREATE TABLE IF NOT EXISTS wiki_merge_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT NOT NULL, source_id TEXT NOT NULL,
    target_id TEXT NOT NULL, source_name TEXT NOT NULL, target_name TEXT NOT NULL,
    source_snapshot TEXT NOT NULL, merged_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_merge_log ON wiki_merge_log(file_path);
  CREATE TABLE IF NOT EXISTS wiki_mc_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT NOT NULL, stat_key TEXT NOT NULL,
    category TEXT NOT NULL, display_name TEXT NOT NULL, value TEXT, is_active INTEGER NOT NULL DEFAULT 1,
    last_chapter INTEGER NOT NULL, UNIQUE(file_path, stat_key)
  );
  CREATE INDEX IF NOT EXISTS idx_mc_stats ON wiki_mc_stats(file_path, category);
`;

const KNOWLEDGE_V2 = `
  CREATE TABLE IF NOT EXISTS reading_state (
    file_path TEXT PRIMARY KEY,
    chapter_index INTEGER NOT NULL,
    para_id TEXT,
    frontier_chapter INTEGER NOT NULL DEFAULT -1,
    frontier_para TEXT,
    last_opened_at INTEGER,
    last_recap_chapter INTEGER,
    last_recap_at INTEGER,
    session_started_at INTEGER,
    prev_session_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS wiki_entry_versions (
    file_path TEXT NOT NULL, entry_id TEXT NOT NULL, chapter_index INTEGER NOT NULL,
    short_description TEXT NOT NULL, status TEXT NOT NULL, significance INTEGER NOT NULL,
    PRIMARY KEY (file_path, entry_id, chapter_index)
  );
  ALTER TABLE wiki_aliases ADD COLUMN first_chapter INTEGER;
  UPDATE wiki_aliases SET first_chapter = (
    SELECT e.first_appearance FROM wiki_entries e WHERE e.file_path = wiki_aliases.file_path AND e.id = wiki_aliases.entry_id
  ) WHERE first_chapter IS NULL;
  CREATE TABLE IF NOT EXISTS knowledge_runs (
    file_path TEXT NOT NULL, chapter_id TEXT NOT NULL, chapter_index INTEGER NOT NULL,
    task_version INTEGER NOT NULL, status TEXT NOT NULL, created_ids TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (file_path, chapter_id)
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_runs_ch ON knowledge_runs(file_path, chapter_index);
  CREATE TABLE IF NOT EXISTS knowledge_edit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    op TEXT NOT NULL,
    edit TEXT NOT NULL,
    undo TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    undone_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_edit_log ON knowledge_edit_log(file_path, id);
`;

/** FTS5 under better-sqlite3; a plain table (LIKE fallback) under sql.js, which lacks FTS5. */
function createSearchTables(db: SqlDb): void {
  if (hasFts5(db)) {
    db.exec(
      "CREATE VIRTUAL TABLE IF NOT EXISTS book_fts USING fts5(text, file_path UNINDEXED, chapter_index UNINDEXED, para_id UNINDEXED, ord UNINDEXED, tokenize='unicode61 remove_diacritics 2')",
    );
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS book_text (
        file_path TEXT NOT NULL, chapter_index INTEGER NOT NULL, para_id TEXT NOT NULL,
        ord INTEGER NOT NULL, text TEXT NOT NULL,
        PRIMARY KEY (file_path, chapter_index, ord)
      );
    `);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS book_fts_state (
      file_path TEXT PRIMARY KEY, source_key TEXT NOT NULL, chapters INTEGER NOT NULL, indexed_at INTEGER NOT NULL
    );
  `);
}

export const knowledgeMigrations: Migration[] = [
  { version: 1, name: "wiki base tables (if missing)", up: WIKI_BASE },
  { version: 2, name: "reading_state, entry versions, alias first_chapter, runs, edit log", up: KNOWLEDGE_V2 },
  { version: 3, name: "book full-text index", up: createSearchTables },
];
