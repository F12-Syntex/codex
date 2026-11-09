/**
 * Say the chapter number once. When a chapter's display title already
 * carries its number ("Chapter 6", "6. The Storm", "Part Two"), the leading
 * numeral is redundant and is hidden.
 */

const NUMBERED_TITLE_RE = /^\s*(chapter|chap\.|ch\.|part|book|volume|vol\.|story|episode|act)\s+\S+/i;

export function redundantChapterNo(title: string | undefined, no: number | null | undefined): boolean {
  if (no == null || !title) return false;
  if (NUMBERED_TITLE_RE.test(title)) return true;
  return new RegExp(`(^|[^\\d])${no}([^\\d]|$)`).test(title);
}

/** The numeral to show beside a title, or null when the title already says it. */
export function visibleChapterNo(title: string | undefined, no: number | null | undefined): number | null {
  if (no == null) return null;
  return redundantChapterNo(title, no) ? null : no;
}
