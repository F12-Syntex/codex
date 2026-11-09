/**
 * AI core (ai_cache, ai_usage) schema (owner: WS-A). Append-only list run by `electron/db/migrate.ts` (area "ai").
 * Never edit an applied migration; append the next version instead.
 */

import type { Migration } from "../db/migrate";

export const aiMigrations: Migration[] = [];
