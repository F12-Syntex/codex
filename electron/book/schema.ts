/**
 * Book (read_marks, annotations) schema (owner: WS-C). Append-only list run by `electron/db/migrate.ts` (area "book").
 * Never edit an applied migration; append the next version instead.
 */

import type { Migration } from "../db/migrate";

export const bookMigrations: Migration[] = [];
