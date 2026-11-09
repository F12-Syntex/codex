/* ── AI Wiki — legacy renderer entry points (Phase 2b compatibility shim, owner WS-B) ──
 *
 * Wiki ingestion now runs in main: `knowledge:ingest` → task `chapter.knowledge` on the per-book
 * knowledge lane (electron/knowledge/ingest.ts). One transaction per chapter, idempotent per
 * chapter id, one chapter at a time per book — so the still-mounted `useWiki` and
 * `Reader.processAllWikiChapters` can no longer race each other into duplicate entries
 * (AI_AUDIT S1-3). The prompt, parsing, entity resolution and DB writes that used to live here
 * moved to `electron/knowledge/*`.
 *
 * Delete this file once the reader cutover (2c) removes the last import.
 */

import type { JobResult } from "@shared/ai/types";
import { Priority } from "@shared/ai/types";
import type { WikiEntryType } from "@shared/knowledge/types";
import { hasRpc, rpc } from "@/lib/ai/rpc";
import { knowledge } from "@/lib/knowledge/bridge";

export type { WikiEntryType } from "@shared/knowledge/types";

/** How often a caller's `isAborted()` is polled while a job runs. */
const ABORT_POLL_MS = 250;

/**
 * Queue one chapter on the knowledge lane and wait for it. Cancels the job when `isAborted()`
 * turns true. Throws on AI errors (callers log and retry), resolves quietly when cancelled.
 */
async function ingest(
  filePath: string,
  chapterIndex: number,
  opts: { bookTitle?: string; force?: boolean; priority: Priority; isAborted: () => boolean },
): Promise<JobResult | null> {
  if (!hasRpc() || !filePath || opts.isAborted()) return null;
  const ticket = await knowledge.ingest(filePath, chapterIndex, opts.priority, {
    force: opts.force || undefined,
    bookTitle: opts.bookTitle || undefined,
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  const aborted = new Promise<null>((resolve) => {
    timer = setInterval(() => {
      if (!opts.isAborted()) return;
      clearInterval(timer);
      void rpc("ai:cancel", { jobId: ticket.jobId }).catch(() => {});
      resolve(null);
    }, ABORT_POLL_MS);
  });
  try {
    const res = await Promise.race([rpc("ai:result", ticket.jobId), aborted]);
    if (res?.state === "error") throw new Error(res.error?.message ?? "Wiki analysis failed");
    return res;
  } finally {
    clearInterval(timer);
  }
}

/** Analyse one chapter into the wiki (no-op if it already has a run, unless `force`). */
export async function generateWikiForChapter(
  chapterIndex: number,
  _chapterText: string,
  bookTitle: string,
  filePath: string,
  isAborted: () => boolean,
  force = false,
): Promise<void> {
  await ingest(filePath, chapterIndex, { bookTitle, force, priority: Priority.Visible, isAborted });
}

/**
 * Analyse several chapters, one job each, in order (the knowledge lane runs them one at a time).
 * Returns the indices that finished (done, skipped or already analysed).
 */
export async function generateWikiForChapterBatch(
  chapters: { index: number; text: string }[],
  bookTitle: string,
  filePath: string,
  isAborted: () => boolean,
): Promise<number[]> {
  const done: number[] = [];
  for (const ch of chapters) {
    if (isAborted()) break;
    const res = await ingest(filePath, ch.index, { bookTitle, priority: Priority.Background, isAborted });
    if (res?.state === "done") done.push(ch.index);
  }
  return done;
}

/* ── Entity index for text highlighting (legacy reader) ── */

export function buildEntityIndexFromDB(
  entityIndex: { id: string; name: string; type: string; color: string; aliases: string[] }[],
): Array<{ id: string; name: string; type: WikiEntryType; color: string }> {
  const results: Array<{ id: string; name: string; type: WikiEntryType; color: string }> = [];

  for (const entry of entityIndex) {
    results.push({ id: entry.id, name: entry.name, type: entry.type as WikiEntryType, color: entry.color });
    for (const alias of entry.aliases) {
      results.push({ id: entry.id, name: alias, type: entry.type as WikiEntryType, color: entry.color });
    }
  }

  results.sort((a, b) => b.name.length - a.name.length);
  return results;
}

/* ── Migration (legacy JSON wiki → DB; removed in Phase 3) ── */

export async function attemptMigration(filePath: string): Promise<boolean> {
  const api = window.electronAPI;
  if (!api) return false;
  return api.wikiMigrateJson(filePath);
}
