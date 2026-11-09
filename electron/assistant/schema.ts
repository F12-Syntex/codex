/**
 * Assistant (assistant_threads, assistant_messages) schema (owner: WS-E). Append-only list run by `electron/db/migrate.ts` (area "assistant").
 * Never edit an applied migration; append the next version instead.
 */

import type { Migration } from "../db/migrate";

export const assistantMigrations: Migration[] = [];
