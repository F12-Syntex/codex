/**
 * Usage tracking (owner: WS-A): one `ai_usage` row per model call and per cache hit.
 * Feeds `ai:usage`, the Settings usage table and the daily budget guard.
 */

import type { TaskId, UsageSummary } from "../shared/ai/types";
import type { SqlDb, SqlValue } from "../db/sql";
import type { UsageRecord } from "./scheduler";

export interface UsageStore {
  record(rec: UsageRecord): void;
  summary(sel?: { filePath?: string; sinceMs?: number }): UsageSummary;
  /** USD spent since `sinceMs` (non-cached calls only). */
  spentSince(sinceMs: number): number;
  /** Delete rows older than `beforeMs`; returns rows removed. */
  prune(beforeMs: number): number;
}

/** Local midnight of the day containing `ms` (budget window). */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function createUsageStore(db: SqlDb): UsageStore {
  return {
    record(rec) {
      const u = rec.usage;
      db.run(
        `INSERT INTO ai_usage (ts, task, file_path, model, prompt_tokens, completion_tokens, cost_usd, cached, outcome)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [rec.ts, rec.task, rec.filePath ?? null, u.model || "", u.promptTokens | 0, u.completionTokens | 0, u.costUsd ?? null, u.cached || rec.outcome === "cache" ? 1 : 0, rec.outcome],
      );
    },
    summary(sel = {}) {
      const sinceMs = sel.sinceMs ?? 0;
      const where = ["ts >= ?"];
      const params: SqlValue[] = [sinceMs];
      if (sel.filePath !== undefined) {
        where.push("file_path = ?");
        params.push(sel.filePath);
      }
      const w = `WHERE ${where.join(" AND ")}`;
      const tot = db.get<Record<string, number | null>>(
        `SELECT
           SUM(CASE WHEN outcome = 'ok' THEN 1 ELSE 0 END) AS requests,
           SUM(COALESCE(prompt_tokens, 0)) AS pt,
           SUM(COALESCE(completion_tokens, 0)) AS ct,
           SUM(COALESCE(cost_usd, 0)) AS cost,
           SUM(CASE WHEN outcome = 'cache' THEN 1 ELSE 0 END) AS hits,
           SUM(CASE WHEN outcome = 'error' THEN 1 ELSE 0 END) AS errors
         FROM ai_usage ${w}`,
        params,
      ) ?? {};
      const group = (col: "task" | "model") =>
        db.all<{ k: string; requests: number; pt: number; ct: number; cost: number }>(
          `SELECT ${col} AS k, SUM(CASE WHEN outcome = 'ok' THEN 1 ELSE 0 END) AS requests,
             SUM(COALESCE(prompt_tokens, 0)) AS pt, SUM(COALESCE(completion_tokens, 0)) AS ct, SUM(COALESCE(cost_usd, 0)) AS cost
           FROM ai_usage ${w} AND outcome != 'cache' GROUP BY ${col} ORDER BY cost DESC, requests DESC`,
          params,
        );
      return {
        sinceMs,
        requests: Number(tot.requests ?? 0),
        promptTokens: Number(tot.pt ?? 0),
        completionTokens: Number(tot.ct ?? 0),
        costUsd: Number(tot.cost ?? 0),
        cacheHits: Number(tot.hits ?? 0),
        errors: Number(tot.errors ?? 0),
        byTask: group("task").map((r) => ({ task: r.k as TaskId, requests: Number(r.requests), promptTokens: Number(r.pt), completionTokens: Number(r.ct), costUsd: Number(r.cost) })),
        byModel: group("model").map((r) => ({ model: r.k, requests: Number(r.requests), promptTokens: Number(r.pt), completionTokens: Number(r.ct), costUsd: Number(r.cost) })),
      };
    },
    spentSince(sinceMs) {
      return Number(db.get<{ c: number | null }>("SELECT SUM(COALESCE(cost_usd, 0)) AS c FROM ai_usage WHERE ts >= ? AND cached = 0", [sinceMs])?.c ?? 0);
    },
    prune(beforeMs) {
      return db.run("DELETE FROM ai_usage WHERE ts < ?", [beforeMs]).changes;
    },
  };
}
