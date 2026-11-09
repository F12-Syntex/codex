/**
 * Book (read_marks, annotations) schema (owner: WS-C). Append-only list run by `electron/db/migrate.ts` (area "book").
 * Never edit an applied migration; append the next version instead.
 */

import type { Migration } from "../db/migrate";

export const bookMigrations: Migration[] = [
  {
    version: 1,
    name: "read_marks + annotations (ParaId-anchored)",
    up: `
      CREATE TABLE IF NOT EXISTS read_marks (
        file_path TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        para_id TEXT NOT NULL,
        PRIMARY KEY (file_path, chapter_id)
      );
      CREATE TABLE IF NOT EXISTS annotations (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        para_id TEXT NOT NULL,
        kind TEXT NOT NULL,            -- comment | highlight
        author TEXT NOT NULL,          -- user
        text TEXT,
        quote TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_annotations_file ON annotations (file_path, chapter_id);
    `,
  },
  {
    version: 2,
    name: "para_anchors (ParaRef of rows kept in legacy tables: quotes, bookmarks)",
    up: `
      CREATE TABLE IF NOT EXISTS para_anchors (
        kind TEXT NOT NULL,            -- quote | bookmark
        ref_id TEXT NOT NULL,          -- legacy row id
        file_path TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        para_id TEXT NOT NULL,
        quote TEXT,
        PRIMARY KEY (kind, ref_id)
      );
      CREATE INDEX IF NOT EXISTS idx_para_anchors_file ON para_anchors (file_path);
    `,
  },
];
