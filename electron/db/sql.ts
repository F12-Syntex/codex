/**
 * Minimal synchronous SQL interface shared by every store (AI cache, artifacts, knowledge,
 * assistant…). Production wraps better-sqlite3 (`wrapBetterSqlite`); tests use sql.js
 * (`electron/db/sqljs.ts`) because better-sqlite3 is built for Electron's ABI and cannot load
 * under plain `node --test`.
 *
 * Rules for store code:
 * - Depend on `SqlDb` only. Never import `better-sqlite3`, `sql.js` or `electron` at the top level.
 * - Parameters are positional (`?`) arrays, or an object for named parameters written `@name`
 *   in SQL and passed as `{ name: value }` (no prefix in the key).
 * - Values: string | number | bigint | Uint8Array | null. Convert booleans to 0/1 yourself.
 * - `transaction(fn)` must be synchronous; nested calls become savepoints.
 * - FTS5: available under better-sqlite3, NOT under the bundled sql.js build. Probe with
 *   `hasFts5(db)` and fall back (e.g. LIKE) behind the same store interface.
 */

import type BetterSqlite3 from "better-sqlite3";

export type SqlValue = string | number | bigint | Uint8Array | null;
export type SqlParams = readonly SqlValue[] | Readonly<Record<string, SqlValue>>;

export interface RunResult {
  /** Rows changed by the statement (INSERT/UPDATE/DELETE). */
  changes: number;
  /** Rowid of the last inserted row on this connection. */
  lastInsertRowid: number;
}

export interface SqlDb {
  readonly driver: "better-sqlite3" | "sql.js";
  /** Execute one or more statements without parameters (DDL, PRAGMA). */
  exec(sql: string): void;
  run(sql: string, params?: SqlParams): RunResult;
  get<T = Record<string, unknown>>(sql: string, params?: SqlParams): T | undefined;
  all<T = Record<string, unknown>>(sql: string, params?: SqlParams): T[];
  /** Run `fn` atomically. Throws (after rolling back) if `fn` throws or returns a Promise. */
  transaction<T>(fn: () => T): T;
  close(): void;
}

function isThenable(v: unknown): boolean {
  return !!v && (typeof v === "object" || typeof v === "function") && typeof (v as { then?: unknown }).then === "function";
}

export const ASYNC_TRANSACTION_ERROR = "SqlDb.transaction: callback must be synchronous (it returned a Promise)";

/** True if the connection supports FTS5 virtual tables. */
export function hasFts5(db: SqlDb): boolean {
  try {
    db.exec("CREATE VIRTUAL TABLE temp.__fts5_probe USING fts5(x); DROP TABLE temp.__fts5_probe;");
    return true;
  } catch {
    return false;
  }
}

/** Wraps an already-open better-sqlite3 connection. Statements are cached per SQL string. */
export function wrapBetterSqlite(raw: BetterSqlite3.Database): SqlDb {
  const cache = new Map<string, BetterSqlite3.Statement>();
  const MAX_CACHED = 500;

  const stmt = (sql: string): BetterSqlite3.Statement => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
      cache.set(sql, s);
    }
    return s;
  };
  // better-sqlite3 takes positional params spread, named params as one object.
  const args = (params?: SqlParams): unknown[] =>
    params === undefined ? [] : Array.isArray(params) ? [...params] : [params];

  return {
    driver: "better-sqlite3",
    exec(sql) {
      raw.exec(sql);
    },
    run(sql, params) {
      const r = stmt(sql).run(...args(params));
      return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) };
    },
    get<T>(sql: string, params?: SqlParams) {
      return stmt(sql).get(...args(params)) as T | undefined;
    },
    all<T>(sql: string, params?: SqlParams) {
      return stmt(sql).all(...args(params)) as T[];
    },
    transaction<T>(fn: () => T): T {
      // better-sqlite3 handles nesting with savepoints and rolls back when the callback throws.
      return raw.transaction(() => {
        const out = fn();
        if (isThenable(out)) throw new Error(ASYNC_TRANSACTION_ERROR);
        return out;
      })();
    },
    close() {
      cache.clear();
      raw.close();
    },
  };
}

/** Shared by adapters that implement transactions by hand (sql.js). */
export function makeManualTransaction(exec: (sql: string) => void): <T>(fn: () => T) => T {
  let depth = 0;
  let seq = 0;
  return <T>(fn: () => T): T => {
    const sp = depth === 0 ? null : `sp_${++seq}`;
    exec(sp ? `SAVEPOINT ${sp}` : "BEGIN");
    depth++;
    try {
      const out = fn();
      if (isThenable(out)) throw new Error(ASYNC_TRANSACTION_ERROR);
      depth--;
      exec(sp ? `RELEASE ${sp}` : "COMMIT");
      return out;
    } catch (err) {
      depth--;
      try {
        exec(sp ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : "ROLLBACK");
      } catch { /* the original error matters more */ }
      throw err;
    }
  };
}
