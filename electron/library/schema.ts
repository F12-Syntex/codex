/**
 * Library AI area (owner: WS-E for Phase 2d; AI_AUDIT §6 F5): suggested / accepted tags, series
 * decisions and the last tagging result per book. Append-only; run by `registerLibrary` through
 * `runMigrations(db, [{ area: "library", migrations }])` (tracked in `schema_migrations`).
 *
 * Keyed by file path (legacy `items.id` changes when a book is re-imported).
 */

import type { Migration } from "../db/migrate";

export const libraryMigrations: Migration[] = [
  {
    version: 1,
    name: "item tags, series and tagging results",
    up: `
      CREATE TABLE IF NOT EXISTS item_tags (
        file_path TEXT NOT NULL,
        kind TEXT NOT NULL,
        tag TEXT NOT NULL COLLATE NOCASE,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (file_path, kind, tag)
      );
      CREATE INDEX IF NOT EXISTS idx_item_tags_status ON item_tags(status, kind);

      -- Accepted series membership (one series per book).
      CREATE TABLE IF NOT EXISTS item_series (
        file_path TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        series_key TEXT NOT NULL,
        number REAL,
        source TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_item_series_key ON item_series(series_key);

      -- "Not part of this series": never suggested again for this book.
      CREATE TABLE IF NOT EXISTS item_series_dismissed (
        file_path TEXT NOT NULL,
        series_key TEXT NOT NULL,
        PRIMARY KEY (file_path, series_key)
      );

      -- Last \`library.tag\` result per book (version = task version that produced it).
      CREATE TABLE IF NOT EXISTS item_ai (
        file_path TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        language TEXT,
        one_line TEXT,
        ai_series TEXT,
        ai_series_number REAL,
        tagged_at INTEGER NOT NULL
      );
    `,
  },
];
