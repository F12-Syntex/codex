/**
 * Knowledge (reading_state, wiki_entry_versions, knowledge_runs, book_fts…) schema (owner: WS-B). Append-only list run by `electron/db/migrate.ts` (area "knowledge").
 * Never edit an applied migration; append the next version instead.
 */

import type { Migration } from "../db/migrate";

export const knowledgeMigrations: Migration[] = [];
