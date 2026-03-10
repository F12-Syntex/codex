/* ── Chapter Labels — shared utility ── */
// Single source of truth for chapter number display.
// Chapters matching NON_STORY_RE are excluded from numbering.

export type ChapterLabels = Record<number, number>;

const NON_STORY_RE =
  /^\s*(cover|title[\s-]?page|table\s+of\s+contents?|toc|contents?|copyright(\s+page)?|dedication|about\s+(the\s+)?(author|book|story)?|preface|foreword|acknowledgements?|acknowledgments?|index|glossary|bibliography|colophon|epigraph|half[\s-]?title|imprint|legal(\s+notice)?|disclaimer|author'?s?\s+(note|word)|front\s+matter|back\s+matter)\s*$/i;

export function isNonStoryTitle(label: string): boolean {
  return NON_STORY_RE.test(label);
}

/**
 * Build chapter labels from a TOC, skipping known non-story pages.
 * Returns a map of chapterIndex → 1-based display number.
 */
export function buildChapterLabels(toc: { chapterIndex: number; label: string }[]): ChapterLabels {
  const labels: ChapterLabels = {};
  let n = 0;
  for (const entry of toc) {
    if (!isNonStoryTitle(entry.label)) {
      labels[entry.chapterIndex] = ++n;
    }
  }
  return labels;
}

/**
 * Format a 0-based chapter index as a display number.
 * Returns null when the chapter is a known non-story page (labels loaded, index absent).
 * Falls back to index + 1 when no labels are available yet.
 */
export function fmtCh(index: number, labels: ChapterLabels): number | null {
  if (Object.keys(labels).length === 0) return index + 1; // labels not loaded yet
  return labels[index] ?? null; // null = non-story page
}
