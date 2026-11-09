/**
 * Legacy wiki data adoption (owner: WS-B, Phase 2b). Lazy, idempotent migrations of what the old
 * renderer pipeline (`src/lib/ai-wiki.ts`) left behind:
 *
 * - `wiki_processed` rows → `knowledge_runs`. A run is keyed by chapter id, which the old table
 *   never had, so adoption happens whenever book content is at hand: for one chapter inside
 *   `ingestChapter`, or for the whole book through the content cache (`adoptLegacyProcessed`,
 *   called by the `chapter.knowledge` task once per book). An adopted run has no ledger
 *   (`LEGACY_LEDGER`): clearing or re-running it falls back to the per-chapter clear, exactly as
 *   before. It is stamped with the current task version, so nothing re-runs (and costs money)
 *   just because it was migrated. `wiki_processed` stays as a mirror while the legacy reader
 *   still reads it.
 * - `wiki_merge_log` rows without a `knowledge_edit_log` entry (merges made in the old wiki
 *   window) → an edit-log row, so every merge can be undone with `knowledge:edits:undo`.
 *
 * Safe fallback when a book cannot be parsed: nothing is adopted and `ingestChapter` keeps
 * treating legacy-processed chapters as done (status "unchanged"), as in Phase 1.
 */

import type { SqlDb } from "../db/sql";
import type { Frontier, WikiMergeItem } from "../shared/knowledge/types";
import { maxChapterSql } from "./frontier";
import { tableExists, type WikiMergeLogRow } from "./store";

/** `knowledge_runs.created_ids` of an adopted legacy run (not a v1 ledger ⇒ per-chapter clear). */
export const LEGACY_LEDGER = JSON.stringify({ v: 0, legacy: true });

/** Whether the chapter has any wiki rows of its own (else the legacy mark was a skip). */
function chapterHasData(db: SqlDb, filePath: string, ch: number): boolean {
  return !!(
    db.get("SELECT 1 FROM wiki_chapter_summaries WHERE file_path = ? AND chapter_index = ? LIMIT 1", [filePath, ch]) ||
    db.get("SELECT 1 FROM wiki_appearances WHERE file_path = ? AND chapter_index = ? LIMIT 1", [filePath, ch]) ||
    db.get("SELECT 1 FROM wiki_details WHERE file_path = ? AND chapter_index = ? LIMIT 1", [filePath, ch])
  );
}

/**
 * Adopt one legacy-processed chapter. Returns true when a run row was written (the chapter was
 * in `wiki_processed` and had no run yet, under this id or at this index).
 */
export function adoptLegacyChapter(
  db: SqlDb,
  filePath: string,
  chapter: { index: number; id: string },
  taskVersion: number,
  now: number = Date.now(),
): boolean {
  if (!tableExists(db, "knowledge_runs")) return false;
  if (!db.get("SELECT 1 FROM wiki_processed WHERE file_path = ? AND chapter_index = ?", [filePath, chapter.index])) return false;
  if (db.get("SELECT 1 FROM knowledge_runs WHERE file_path = ? AND (chapter_id = ? OR chapter_index = ?) LIMIT 1", [filePath, chapter.id, chapter.index])) {
    return false;
  }
  db.run(
    "INSERT OR IGNORE INTO knowledge_runs (file_path, chapter_id, chapter_index, task_version, status, created_ids, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [filePath, chapter.id, chapter.index, taskVersion, chapterHasData(db, filePath, chapter.index) ? "done" : "skipped", LEGACY_LEDGER, now],
  );
  return true;
}

/**
 * Adopt every legacy-processed chapter of a book whose ids are known. Chapters beyond the parsed
 * book (e.g. a different parse) are left alone. Returns the number of runs written.
 */
export function adoptLegacyProcessed(
  db: SqlDb,
  filePath: string,
  chapters: readonly { index: number; id: string }[],
  taskVersion: number,
  now: number = Date.now(),
): number {
  if (!tableExists(db, "knowledge_runs")) return 0;
  const legacy = db.all<{ chapter_index: number }>(
    `SELECT p.chapter_index FROM wiki_processed p
     WHERE p.file_path = ? AND NOT EXISTS (
       SELECT 1 FROM knowledge_runs r WHERE r.file_path = p.file_path AND r.chapter_index = p.chapter_index
     )`,
    [filePath],
  );
  if (legacy.length === 0) return 0;
  const byIndex = new Map(chapters.map((c) => [c.index, c]));
  return db.transaction(() => {
    let n = 0;
    for (const { chapter_index } of legacy) {
      const c = byIndex.get(chapter_index);
      if (c && adoptLegacyChapter(db, filePath, c, taskVersion, now)) n++;
    }
    return n;
  });
}

/** Legacy merges have no undo entry; give each one (idempotent). Returns the number adopted. */
export function adoptLegacyMerges(db: SqlDb, filePath: string, now: number = Date.now()): number {
  if (!tableExists(db, "knowledge_edit_log") || !tableExists(db, "wiki_merge_log")) return 0;
  const logs = db.all<WikiMergeLogRow>("SELECT id, source_id, target_id FROM wiki_merge_log WHERE file_path = ?", [filePath]);
  if (logs.length === 0) return 0;
  const known = mergeUndoIds(db, filePath);
  const missing = logs.filter((l) => !known.has(l.id));
  if (missing.length === 0) return 0;
  return db.transaction(() => {
    for (const l of missing) {
      db.run(
        "INSERT INTO knowledge_edit_log (file_path, op, edit, undo, created_at) VALUES (?, 'merge', ?, ?, ?)",
        [
          filePath,
          JSON.stringify({ op: "merge", sourceId: l.source_id, targetId: l.target_id }),
          JSON.stringify({ kind: "merge", mergeLogId: l.id }),
          now,
        ],
      );
    }
    return missing.length;
  });
}

/** `wiki_merge_log.id` → open `knowledge_edit_log.id` for merges. */
function mergeUndoIds(db: SqlDb, filePath: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of db.all<{ id: number; undo: string }>(
    "SELECT id, undo FROM knowledge_edit_log WHERE file_path = ? AND op = 'merge' AND undone_at IS NULL ORDER BY id ASC",
    [filePath],
  )) {
    try {
      const u = JSON.parse(r.undo) as { kind?: string; mergeLogId?: unknown };
      if (u.kind === "merge" && typeof u.mergeLogId === "number" && !out.has(u.mergeLogId)) out.set(u.mergeLogId, r.id);
    } catch {
      /* malformed row: ignore */
    }
  }
  return out;
}

/**
 * Merge history for the wiki window: merges whose source and target were both introduced at or
 * before the frontier (the source's name would otherwise leak), newest first. Merges without an
 * undo entry are skipped (call `adoptLegacyMerges` first).
 */
export function mergeLogAt(db: SqlDb, filePath: string, f: Frontier): WikiMergeItem[] {
  if (!tableExists(db, "wiki_merge_log")) return [];
  const max = maxChapterSql(f);
  const undo = tableExists(db, "knowledge_edit_log") ? mergeUndoIds(db, filePath) : new Map<number, number>();
  const out: WikiMergeItem[] = [];
  for (const l of db.all<WikiMergeLogRow>("SELECT * FROM wiki_merge_log WHERE file_path = ? ORDER BY merged_at DESC, id DESC", [filePath])) {
    const undoId = undo.get(l.id);
    if (undoId == null) continue;
    const target = db.get<{ first_appearance: number }>("SELECT first_appearance FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, l.target_id]);
    if (!target || target.first_appearance > max) continue;
    let sourceFirst = 0;
    try {
      const snap = JSON.parse(l.source_snapshot) as { entry?: { first_appearance?: unknown } };
      if (typeof snap.entry?.first_appearance === "number") sourceFirst = snap.entry.first_appearance;
    } catch {
      /* keep 0 */
    }
    if (sourceFirst > max) continue;
    out.push({
      id: l.id, undoId, sourceId: l.source_id, sourceName: l.source_name, targetId: l.target_id, targetName: l.target_name, mergedAt: l.merged_at,
    });
  }
  return out;
}
