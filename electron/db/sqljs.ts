/**
 * sql.js (WASM SQLite) adapter for `SqlDb` — TESTS ONLY (`sql.js` is a devDependency).
 * Never import this from production code paths.
 *
 * Differences from better-sqlite3 worth knowing:
 * - No FTS5 in the bundled build (FTS4 exists). Use `hasFts5()` and a fallback.
 * - Missing named parameters bind as NULL instead of throwing.
 */

import initSqlJs from "sql.js";
import type { Database as SqlJsDatabase, SqlValue as SqlJsValue } from "sql.js";
import { makeManualTransaction, type RunResult, type SqlDb, type SqlParams, type SqlValue } from "./sql";

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function toSqlJs(v: SqlValue): SqlJsValue {
  return typeof v === "bigint" ? Number(v) : v;
}

/** `{name: v}` → `{"@name": v, ":name": v, "$name": v}` so any prefix used in the SQL binds. */
function bindParams(params?: SqlParams): SqlJsValue[] | Record<string, SqlJsValue> | undefined {
  if (params === undefined) return undefined;
  if (Array.isArray(params)) return (params as readonly SqlValue[]).map(toSqlJs);
  const out: Record<string, SqlJsValue> = {};
  for (const [k, v] of Object.entries(params as Record<string, SqlValue>)) {
    if (/^[@:$]/.test(k)) {
      out[k] = toSqlJs(v);
    } else {
      out[`@${k}`] = out[`:${k}`] = out[`$${k}`] = toSqlJs(v);
    }
  }
  return out;
}

export function wrapSqlJs(raw: SqlJsDatabase): SqlDb {
  const exec = (sql: string) => {
    raw.exec(sql);
  };

  function query<T>(sql: string, params: SqlParams | undefined, limit: number): T[] {
    const stmt = raw.prepare(sql);
    try {
      const bound = bindParams(params);
      if (bound !== undefined) stmt.bind(bound);
      const rows: T[] = [];
      while (rows.length < limit && stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  return {
    driver: "sql.js",
    exec,
    run(sql, params): RunResult {
      const stmt = raw.prepare(sql);
      try {
        const bound = bindParams(params);
        if (bound !== undefined) stmt.bind(bound);
        stmt.step();
      } finally {
        stmt.free();
      }
      const changes = raw.getRowsModified();
      const idRow = raw.exec("SELECT last_insert_rowid()");
      const lastInsertRowid = Number(idRow[0]?.values[0]?.[0] ?? 0);
      return { changes, lastInsertRowid };
    },
    get<T>(sql: string, params?: SqlParams) {
      return query<T>(sql, params, 1)[0];
    },
    all<T>(sql: string, params?: SqlParams) {
      return query<T>(sql, params, Infinity);
    },
    transaction: makeManualTransaction(exec),
    close() {
      raw.close();
    },
  };
}

/** Fresh in-memory database with foreign keys on (matching production). */
export async function openSqlJsDb(): Promise<SqlDb> {
  sqlJsPromise ??= initSqlJs();
  const SQL = await sqlJsPromise;
  const db = wrapSqlJs(new SQL.Database());
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}
