/**
 * AI core (ai_cache, ai_usage) schema (owner: WS-A). Append-only list run by `electron/db/migrate.ts` (area "ai").
 * Never edit an applied migration; append the next version instead.
 */

import type { Migration } from "../db/migrate";

export const aiMigrations: Migration[] = [
  {
    version: 1,
    name: "ai_cache + ai_usage",
    up: `
      CREATE TABLE IF NOT EXISTS ai_cache (
        key TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        task_version INTEGER NOT NULL,
        model TEXT NOT NULL,
        file_path TEXT,
        value TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_cache_file ON ai_cache(file_path, task);
      CREATE INDEX IF NOT EXISTS idx_ai_cache_lru ON ai_cache(last_used_at);
      CREATE TABLE IF NOT EXISTS ai_usage (
        id INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        task TEXT NOT NULL,
        file_path TEXT,
        model TEXT NOT NULL,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        cost_usd REAL,
        cached INTEGER NOT NULL DEFAULT 0,
        outcome TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_usage_ts ON ai_usage(ts);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_file ON ai_usage(file_path, ts);
    `,
  },
];
