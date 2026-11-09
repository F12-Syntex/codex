/**
 * AI result cache (owner: WS-A): versioned keys, invalidation, LRU pruning by bytes.
 *
 * Key = fnv1a64(`${task}@v${version}|${model}|${taskKey}`) (see `cacheKey`). A task version bump
 * or a model change therefore misses naturally; `invalidate({ belowVersion })` reclaims the space.
 *
 * Two implementations behind `AICache`: `createSqlAICache(db)` (production, table `ai_cache`) and
 * `createMemoryAICache()` (tests / fake runtime).
 */

import type { CacheSelector, CacheStats, TaskId } from "../shared/ai/types";
import { fnv1a64 } from "../shared/ai/hash";
import type { SqlDb, SqlValue } from "../db/sql";

export interface CacheMeta {
  task: TaskId;
  taskVersion: number;
  model: string;
  filePath?: string;
  /** Precomputed size; defaults to the UTF-8 length of the JSON value. */
  bytes?: number;
}

export interface AICache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, meta: CacheMeta): void;
  /** Remove rows matching the selector; returns the number removed. */
  invalidate(sel: CacheSelector): number;
  stats(): CacheStats;
  /** Delete least-recently-used rows until the total is ≤ maxBytes; returns rows removed. */
  prune(maxBytes: number): number;
}

/** Default cap for `prune` (the runtime prunes on start and every few hundred writes). */
export const DEFAULT_CACHE_MAX_BYTES = 256 * 1024 * 1024;

export function cacheKey(task: TaskId, version: number, model: string, taskKey: string): string {
  return fnv1a64(`${task}@v${version}|${model}|${taskKey}`);
}

function utf8Bytes(s: string): number {
  let b = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) b += 1;
    else if (c < 0x800) b += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { b += 4; i++; }
    else b += 3;
  }
  return b;
}

// ── SQL ─────────────────────────────────────────────────────────────────────

export function createSqlAICache(db: SqlDb, now: () => number = Date.now): AICache {
  const where = (sel: CacheSelector): { sql: string; params: SqlValue[] } => {
    const parts: string[] = [];
    const params: SqlValue[] = [];
    if (sel.filePath !== undefined) { parts.push("file_path = ?"); params.push(sel.filePath); }
    if (sel.task !== undefined) { parts.push("task = ?"); params.push(sel.task); }
    if (sel.belowVersion !== undefined) { parts.push("task_version < ?"); params.push(sel.belowVersion); }
    return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
  };

  return {
    get<T>(key: string): T | undefined {
      const row = db.get<{ value: string }>("SELECT value FROM ai_cache WHERE key = ?", [key]);
      if (!row) return undefined;
      try {
        const v = JSON.parse(row.value) as T;
        db.run("UPDATE ai_cache SET last_used_at = ? WHERE key = ?", [now(), key]);
        return v;
      } catch {
        db.run("DELETE FROM ai_cache WHERE key = ?", [key]);
        return undefined;
      }
    },
    set<T>(key: string, value: T, meta: CacheMeta): void {
      const json = JSON.stringify(value === undefined ? null : value);
      const t = now();
      db.run(
        `INSERT INTO ai_cache (key, task, task_version, model, file_path, value, bytes, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET task = excluded.task, task_version = excluded.task_version, model = excluded.model,
           file_path = excluded.file_path, value = excluded.value, bytes = excluded.bytes, last_used_at = excluded.last_used_at`,
        [key, meta.task, meta.taskVersion, meta.model, meta.filePath ?? null, json, meta.bytes ?? utf8Bytes(json), t, t],
      );
    },
    invalidate(sel: CacheSelector): number {
      const w = where(sel);
      return db.run(`DELETE FROM ai_cache${w.sql}`, w.params).changes;
    },
    stats(): CacheStats {
      const total = db.get<{ rows: number; bytes: number | null }>("SELECT COUNT(*) AS rows, SUM(bytes) AS bytes FROM ai_cache");
      const byTask = db
        .all<{ task: TaskId; rows: number; bytes: number }>("SELECT task, COUNT(*) AS rows, SUM(bytes) AS bytes FROM ai_cache GROUP BY task ORDER BY bytes DESC")
        .map((r) => ({ task: r.task, rows: Number(r.rows), bytes: Number(r.bytes ?? 0) }));
      const byFile = db
        .all<{ file_path: string; rows: number; bytes: number }>(
          "SELECT file_path, COUNT(*) AS rows, SUM(bytes) AS bytes FROM ai_cache WHERE file_path IS NOT NULL GROUP BY file_path ORDER BY bytes DESC",
        )
        .map((r) => ({ filePath: r.file_path, rows: Number(r.rows), bytes: Number(r.bytes ?? 0) }));
      return { rows: Number(total?.rows ?? 0), bytes: Number(total?.bytes ?? 0), byTask, byFile };
    },
    prune(maxBytes: number): number {
      const total = Number(db.get<{ b: number | null }>("SELECT SUM(bytes) AS b FROM ai_cache")?.b ?? 0);
      if (total <= maxBytes) return 0;
      let excess = total - maxBytes;
      const victims: string[] = [];
      // Walk oldest-first in pages until enough bytes are selected.
      let offset = 0;
      const PAGE = 500;
      while (excess > 0) {
        const rows = db.all<{ key: string; bytes: number }>(
          "SELECT key, bytes FROM ai_cache ORDER BY last_used_at ASC, created_at ASC LIMIT ? OFFSET ?",
          [PAGE, offset],
        );
        if (!rows.length) break;
        for (const r of rows) {
          if (excess <= 0) break;
          victims.push(r.key);
          excess -= Number(r.bytes);
        }
        offset += rows.length;
      }
      db.transaction(() => {
        for (let k = 0; k < victims.length; k += 200) {
          const chunk = victims.slice(k, k + 200);
          db.run(`DELETE FROM ai_cache WHERE key IN (${chunk.map(() => "?").join(",")})`, chunk);
        }
      });
      return victims.length;
    },
  };
}

// ── Memory ──────────────────────────────────────────────────────────────────

interface MemRow { value: string; meta: CacheMeta; bytes: number; createdAt: number; lastUsedAt: number; seq: number }

export function createMemoryAICache(now: () => number = Date.now): AICache & { readonly size: number; keys(): string[] } {
  const rows = new Map<string, MemRow>();
  let seq = 0;
  const matches = (r: MemRow, sel: CacheSelector) =>
    (sel.filePath === undefined || r.meta.filePath === sel.filePath) &&
    (sel.task === undefined || r.meta.task === sel.task) &&
    (sel.belowVersion === undefined || r.meta.taskVersion < sel.belowVersion);

  return {
    get size() {
      return rows.size;
    },
    keys: () => [...rows.keys()],
    get<T>(key: string): T | undefined {
      const r = rows.get(key);
      if (!r) return undefined;
      r.lastUsedAt = now();
      r.seq = ++seq;
      return JSON.parse(r.value) as T;
    },
    set<T>(key: string, value: T, meta: CacheMeta): void {
      const json = JSON.stringify(value === undefined ? null : value);
      const t = now();
      rows.set(key, { value: json, meta, bytes: meta.bytes ?? utf8Bytes(json), createdAt: rows.get(key)?.createdAt ?? t, lastUsedAt: t, seq: ++seq });
    },
    invalidate(sel: CacheSelector): number {
      let n = 0;
      for (const [k, r] of rows) if (matches(r, sel)) { rows.delete(k); n++; }
      return n;
    },
    stats(): CacheStats {
      const byTask = new Map<TaskId, { rows: number; bytes: number }>();
      const byFile = new Map<string, { rows: number; bytes: number }>();
      let bytes = 0;
      for (const r of rows.values()) {
        bytes += r.bytes;
        const t = byTask.get(r.meta.task) ?? { rows: 0, bytes: 0 };
        t.rows++; t.bytes += r.bytes;
        byTask.set(r.meta.task, t);
        if (r.meta.filePath) {
          const f = byFile.get(r.meta.filePath) ?? { rows: 0, bytes: 0 };
          f.rows++; f.bytes += r.bytes;
          byFile.set(r.meta.filePath, f);
        }
      }
      return {
        rows: rows.size,
        bytes,
        byTask: [...byTask].map(([task, v]) => ({ task, ...v })).sort((a, b) => b.bytes - a.bytes),
        byFile: [...byFile].map(([filePath, v]) => ({ filePath, ...v })).sort((a, b) => b.bytes - a.bytes),
      };
    },
    prune(maxBytes: number): number {
      let total = 0;
      for (const r of rows.values()) total += r.bytes;
      if (total <= maxBytes) return 0;
      const order = [...rows.entries()].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt || a[1].seq - b[1].seq);
      let n = 0;
      for (const [k, r] of order) {
        if (total <= maxBytes) break;
        rows.delete(k);
        total -= r.bytes;
        n++;
      }
      return n;
    },
  };
}
