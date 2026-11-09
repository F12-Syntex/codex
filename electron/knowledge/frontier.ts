/**
 * Reading frontier (`reading_state`, owner: WS-B). AI_AUDIT §4.4.5 "Frontier rules":
 * - `frontier_chapter = max(previous, i)` once chapter i is finished (last page, TTS/speed reader
 *   finished it, or ≥ 90% of its pages viewed) — the reader reports that as `atChapterEnd`.
 * - Jumping via the TOC (`via: "jump"`) moves the position but never the frontier.
 * - The chapter after the frontier is readable up to the last visible paragraph (`frontier_para`).
 *
 * Also tracks reading sessions for the "Previously on…" recap trigger (F1).
 */

import type { SqlDb } from "../db/sql";
import type { Frontier, ReadingPosition, RecapStatus } from "../shared/knowledge/types";

export type SpoilerMode = Frontier["mode"];

export interface ReadingStateRow {
  file_path: string;
  chapter_index: number;
  para_id: string | null;
  frontier_chapter: number;
  frontier_para: string | null;
  last_opened_at: number | null;
  last_recap_chapter: number | null;
  last_recap_at: number | null;
  session_started_at: number | null;
  prev_session_at: number | null;
}

/** A gap longer than this starts a new reading session. */
export const SESSION_GAP_MS = 30 * 60_000;
/** Away longer than this → recap on reopen. */
export const RECAP_AWAY_MS = 8 * 3_600_000;
/** Finished chapters since the last recap that also trigger it. */
export const RECAP_PROGRESS_CHAPTERS = 3;

/** Highest chapter whose knowledge may be shown (Infinity when ungated). */
export function maxChapter(f: Frontier): number {
  return f.mode === "off" ? Number.POSITIVE_INFINITY : f.chapterIndex;
}

/** SQL-friendly bound (sqlite has no Infinity). */
export function maxChapterSql(f: Frontier): number {
  return f.mode === "off" ? 1_000_000_000 : f.chapterIndex;
}

export function getReadingState(db: SqlDb, filePath: string): ReadingStateRow | null {
  const row = db.get<ReadingStateRow>("SELECT * FROM reading_state WHERE file_path = ?", [filePath]);
  if (row) return row;
  return seedFromLegacyProgress(db, filePath);
}

/**
 * Legacy migration (AI_AUDIT §4.6): seed the frontier from `readProgress:<path>` (chapter − 1),
 * lazily on first read. No-op when the settings table or key is missing.
 */
export function seedFromLegacyProgress(db: SqlDb, filePath: string): ReadingStateRow | null {
  let raw: string | undefined;
  try {
    raw = db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [`readProgress:${filePath}`])?.value;
  } catch {
    return null; // no settings table (tests)
  }
  if (!raw) return null;
  let chapter: number;
  try {
    const parsed = JSON.parse(raw) as { chapter?: unknown };
    chapter = typeof parsed.chapter === "number" && Number.isFinite(parsed.chapter) ? Math.max(0, Math.floor(parsed.chapter)) : NaN;
  } catch {
    return null;
  }
  if (!Number.isFinite(chapter)) return null;
  db.run(
    "INSERT OR IGNORE INTO reading_state (file_path, chapter_index, frontier_chapter) VALUES (?, ?, ?)",
    [filePath, chapter, chapter - 1],
  );
  return db.get<ReadingStateRow>("SELECT * FROM reading_state WHERE file_path = ?", [filePath]) ?? null;
}

/** The frontier under a spoiler mode. Defaults to "nothing read" for unknown books. */
export function getFrontier(db: SqlDb, filePath: string, mode: SpoilerMode = "frontier"): Frontier {
  const s = getReadingState(db, filePath);
  return frontierFromState(s, mode);
}

export function frontierFromState(s: ReadingStateRow | null, mode: SpoilerMode): Frontier {
  if (!s) return { chapterIndex: -1, mode };
  if (mode === "position") {
    const f: Frontier = { chapterIndex: s.chapter_index - 1, mode };
    if (s.para_id) f.paraId = s.para_id;
    return f;
  }
  const f: Frontier = { chapterIndex: s.frontier_chapter, mode };
  if (s.frontier_para) f.paraId = s.frontier_para;
  return f;
}

/** Roll the session if the book was idle; returns the (possibly updated) row. */
function touchSession(db: SqlDb, filePath: string, s: ReadingStateRow, now: number): ReadingStateRow {
  const idle = s.last_opened_at == null || now - s.last_opened_at > SESSION_GAP_MS;
  if (idle) {
    db.run(
      "UPDATE reading_state SET prev_session_at = ?, session_started_at = ?, last_opened_at = ? WHERE file_path = ?",
      [s.last_opened_at, now, now, filePath],
    );
    return { ...s, prev_session_at: s.last_opened_at, session_started_at: now, last_opened_at: now };
  }
  db.run("UPDATE reading_state SET last_opened_at = ? WHERE file_path = ?", [now, filePath]);
  return { ...s, last_opened_at: now };
}

export interface PositionResult {
  /** Frontier in mode "frontier" after the update. */
  frontier: Frontier;
  /** True when `frontier_chapter` or `frontier_para` changed. */
  changed: boolean;
}

/** Record a reading position (`knowledge:position`). */
export function recordPosition(db: SqlDb, filePath: string, pos: ReadingPosition, now: number = Date.now()): PositionResult {
  return db.transaction(() => {
    const chapter = Math.max(0, Math.floor(pos.chapterIndex));
    let s = getReadingState(db, filePath);
    if (!s) {
      db.run("INSERT INTO reading_state (file_path, chapter_index, frontier_chapter) VALUES (?, ?, -1)", [filePath, chapter]);
      s = db.get<ReadingStateRow>("SELECT * FROM reading_state WHERE file_path = ?", [filePath])!;
    }
    s = touchSession(db, filePath, s, now);

    let fc = s.frontier_chapter;
    let fp = s.frontier_para;
    if (pos.via !== "jump") {
      if (pos.atChapterEnd && chapter > fc) {
        fc = chapter;
        fp = null; // the new "current" chapter starts unread
      }
      // Reading normally inside the chapter right after the frontier: remember how far.
      if (chapter === fc + 1 && pos.paraId && !pos.atChapterEnd) fp = pos.paraId;
    }
    const changed = fc !== s.frontier_chapter || fp !== s.frontier_para;
    db.run(
      "UPDATE reading_state SET chapter_index = ?, para_id = ?, frontier_chapter = ?, frontier_para = ? WHERE file_path = ?",
      [chapter, pos.paraId ?? null, fc, fp, filePath],
    );
    const f: Frontier = { chapterIndex: fc, mode: "frontier" };
    if (fp) f.paraId = fp;
    return { frontier: f, changed };
  });
}

/** Chapters covered by a recap: K grows with time away (3–8), never before `sinceChapter`. */
export function recapWindow(frontierChapter: number, awayMs: number | null, sinceChapter?: number | null): { from: number; to: number } {
  const days = (awayMs ?? 0) / 86_400_000;
  const k = days >= 30 ? 8 : days >= 14 ? 7 : days >= 7 ? 6 : days >= 3 ? 5 : days >= 1 ? 4 : 3;
  let from = Math.max(0, frontierChapter - k + 1);
  if (sinceChapter != null && sinceChapter >= 0 && sinceChapter < frontierChapter) {
    // Recap at least what was read since the last recap (bounded to 8 chapters).
    from = Math.max(0, Math.min(from, sinceChapter + 1), frontierChapter - 7);
  }
  return { from, to: frontierChapter };
}

/** `knowledge:recapStatus`. Also rolls the reading session (it is called when a book opens). */
export function recapStatus(
  db: SqlDb,
  filePath: string,
  now: number = Date.now(),
  labelOf: (chapterIndex: number) => string = (i) => String(i + 1),
): RecapStatus {
  return db.transaction(() => {
    let s = getReadingState(db, filePath);
    if (s) s = touchSession(db, filePath, s, now);
    const frontier = frontierFromState(s, "frontier");
    const fc = frontier.chapterIndex;
    const awayMs = s && s.prev_session_at != null && s.session_started_at != null ? s.session_started_at - s.prev_session_at : null;
    const { from, to } = recapWindow(fc, awayMs, s?.last_recap_chapter);
    const base = { frontier, fromChapter: from, toChapter: to, fromLabel: labelOf(from), toLabel: labelOf(Math.max(to, 0)), awayMs };

    if (!s || fc < 1) return { ...base, due: false, reason: null };
    const shownThisSession = s.last_recap_at != null && s.session_started_at != null && s.last_recap_at >= s.session_started_at;
    const reopened = s.prev_session_at != null;
    if (shownThisSession || !reopened) return { ...base, due: false, reason: null };
    if (awayMs != null && awayMs > RECAP_AWAY_MS) return { ...base, due: true, reason: "away" };
    if (fc - (s.last_recap_chapter ?? -1) >= RECAP_PROGRESS_CHAPTERS) return { ...base, due: true, reason: "progress" };
    return { ...base, due: false, reason: null };
  });
}

/** `knowledge:recapSeen`: the recap up to `chapterIndex` was shown (or dismissed). */
export function markRecapSeen(db: SqlDb, filePath: string, chapterIndex: number, now: number = Date.now()): void {
  const s = getReadingState(db, filePath);
  if (!s) {
    db.run(
      "INSERT INTO reading_state (file_path, chapter_index, frontier_chapter, last_recap_chapter, last_recap_at) VALUES (?, 0, -1, ?, ?)",
      [filePath, chapterIndex, now],
    );
    return;
  }
  db.run("UPDATE reading_state SET last_recap_chapter = ?, last_recap_at = ? WHERE file_path = ?", [chapterIndex, now, filePath]);
}
