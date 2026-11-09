/**
 * Chapter artifacts (chapter_artifacts, book_ai_prefs, book_style) schema (owner: WS-D). Append-only list run by `electron/db/migrate.ts` (area "chapters").
 * Never edit an applied migration; append the next version instead.
 */

import type { Migration } from "../db/migrate";

export const chaptersMigrations: Migration[] = [
  {
    version: 1,
    name: "chapter_artifacts, book_ai_prefs, book_style",
    up: `
      CREATE TABLE IF NOT EXISTS chapter_artifacts (
        file_path TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        kind TEXT NOT NULL,
        variant TEXT NOT NULL DEFAULT '',
        source_hash TEXT NOT NULL,
        base_hash TEXT NOT NULL DEFAULT '',
        task_version INTEGER NOT NULL,
        model TEXT NOT NULL,
        artifact_hash TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (file_path, chapter_id, kind, variant)
      );
      CREATE INDEX IF NOT EXISTS idx_chapter_artifacts_kind ON chapter_artifacts(file_path, kind, chapter_index);
      CREATE TABLE IF NOT EXISTS book_ai_prefs (
        file_path TEXT PRIMARY KEY,
        prefs TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS book_style (
        file_path TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        version INTEGER NOT NULL
      );
    `,
  },
];
