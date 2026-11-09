/**
 * Frontier clamping used by the assistant tools and the marker parser (owner: WS-E).
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * Rules (AI_AUDIT §4.4.5): chapters ≤ `frontier.chapterIndex` are fully readable; the chapter after
 * it (the one being read) is readable up to and including `frontier.paraId`; everything else is
 * hidden. Mode "off" disables gating. An unknown `paraId` hides the whole current chapter
 * (fail closed).
 */

import type { Frontier } from "../knowledge/types";
import type { ParaId } from "../pipeline/types";

export type ChapterVisibility = "full" | "partial" | "none";

export function chapterVisibility(frontier: Frontier, chapterIndex: number): ChapterVisibility {
  if (frontier.mode === "off") return "full";
  if (chapterIndex <= frontier.chapterIndex) return "full";
  if (chapterIndex === frontier.chapterIndex + 1 && frontier.paraId) return "partial";
  return "none";
}

/** How many leading paragraphs of the chapter the reader may see (0…paras.length). */
export function visibleParaCount(frontier: Frontier, chapter: { index: number; paras: readonly { id: ParaId }[] }): number {
  const v = chapterVisibility(frontier, chapter.index);
  if (v === "full") return chapter.paras.length;
  if (v === "none") return 0;
  const at = chapter.paras.findIndex((p) => p.id === frontier.paraId);
  return at < 0 ? 0 : at + 1;
}

/** True if paragraph `paraIndex` (0-based) of `chapter` is within the frontier. */
export function isParaVisible(
  frontier: Frontier,
  chapter: { index: number; paras: readonly { id: ParaId }[] },
  paraIndex: number,
): boolean {
  return paraIndex >= 0 && paraIndex < visibleParaCount(frontier, chapter);
}

/** Highest chapter index that has any visible text (−1 if none). Ignores mode "off" (returns +∞). */
export function lastVisibleChapter(frontier: Frontier): number {
  if (frontier.mode === "off") return Number.POSITIVE_INFINITY;
  return frontier.paraId ? frontier.chapterIndex + 1 : frontier.chapterIndex;
}
