/**
 * Assistant (assistant_threads, assistant_messages), Simulate branches and the vocabulary deck
 * (owner: WS-E). Append-only list run by `electron/db/migrate.ts` (area "assistant").
 * Never edit an applied migration; append the next version instead.
 *
 * Vocabulary lives in this area (not a separate "vocab" area) so Phase 1 does not have to touch
 * the shared migrations registry. Branches replace the index-anchored legacy `sim_branches` /
 * `sim_segments` (legacy rows are migrated in Phase 2d, mapping `truncate_after_para` → ParaId).
 */

import type { Migration } from "../db/migrate";
import { importLegacyChats } from "./legacy";

export const assistantMigrations: Migration[] = [
  {
    version: 1,
    name: "assistant threads, messages, branches, vocab",
    up: `
      CREATE TABLE IF NOT EXISTS assistant_threads (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        mode TEXT NOT NULL,
        title TEXT NOT NULL,
        seed TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_threads_file ON assistant_threads(file_path, updated_at);

      CREATE TABLE IF NOT EXISTS assistant_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        seq INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_messages_thread ON assistant_messages(thread_id, seq);

      CREATE TABLE IF NOT EXISTS assistant_branches (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        para_id TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        entity_id TEXT,
        entity_name TEXT,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_branches_file ON assistant_branches(file_path, updated_at);

      CREATE TABLE IF NOT EXISTS assistant_branch_segments (
        id INTEGER PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES assistant_branches(id) ON DELETE CASCADE,
        segment_index INTEGER NOT NULL,
        user_input TEXT NOT NULL,
        paragraphs TEXT NOT NULL,
        choices TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        UNIQUE (branch_id, segment_index)
      );

      CREATE TABLE IF NOT EXISTS vocab_items (
        id INTEGER PRIMARY KEY,
        file_path TEXT,
        chapter_id TEXT,
        para_id TEXT,
        term TEXT NOT NULL,
        lemma TEXT,
        context TEXT,
        definition TEXT,
        translation TEXT,
        created_at INTEGER NOT NULL,
        due_at INTEGER NOT NULL,
        interval_days REAL NOT NULL DEFAULT 0,
        ease REAL NOT NULL DEFAULT 2.5,
        reps INTEGER NOT NULL DEFAULT 0,
        lapses INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_vocab_due ON vocab_items(due_at);
      CREATE INDEX IF NOT EXISTS idx_vocab_file ON vocab_items(file_path);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vocab_term ON vocab_items(COALESCE(file_path, ''), lower(term));
    `,
  },
  {
    // Phase 2d: legacy Buddy / chat history (settings keys) → assistant threads, then the legacy
    // keys are removed. Per-book failures are logged and left for the lazy per-book import
    // (`AssistantService.listThreads`). Simulate branches need the parsed book: imported lazily.
    version: 2,
    name: "import legacy buddy and chat history",
    up: (db) => {
      importLegacyChats(db, { onError: (filePath, err) => console.error(`[assistant] legacy chat import failed for ${filePath}`, err) });
    },
  },
];
