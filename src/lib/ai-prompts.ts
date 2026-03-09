/* ── Global AI Prompt Templates ───────────────────────── */

/**
 * Patterns for chapters that should NOT be renamed by AI.
 * These are structural/meta pages, not actual content chapters.
 */
const SKIP_PATTERNS = [
  /^(table\s+of\s+)?contents$/i,
  /^toc$/i,
  /^cover(\s+page)?$/i,
  /^title\s+page$/i,
  /^copyright/i,
  /^(about\s+the\s+)?author/i,
  /^dedication$/i,
  /^acknowledgements?$/i,
  /^(preface|foreword|introduction|prologue|epilogue|afterword)$/i,
  /^appendix/i,
  /^glossary$/i,
  /^index$/i,
  /^bibliography$/i,
  /^also\s+by/i,
  /^notes?$/i,
];

/**
 * Patterns that are clearly generic / need renaming.
 * These match things like: "Chapter 1", "ch003.xml", "ch1", "Part 2", "3", "Section IV"
 */
const GENERIC_PATTERNS = [
  // "Chapter 1", "chapter 23", "CHAPTER IV"
  /^(chapter|part|story|volume|book|section)\s+(\d+|[ivxlcdm]+)$/i,
  // Bare numbers: "3", "42"
  /^\d+$/,
  // Filename-style: "ch003.xml", "ch1.xhtml", "chapter-02", "part_1"
  /^ch(apter)?[-_.]?\d+(\.\w+)?$/i,
  /^(part|section|vol)[-_.]?\d+(\.\w+)?$/i,
  // "Chapter1", "Part2" (no space)
  /^(chapter|part|section)\d+$/i,
];

/**
 * Check whether a chapter title is generic and needs AI enrichment.
 * Returns true for: "Chapter 1", "ch003.xml", "3", "Part IV"
 * Returns false for: "Chapter 1: The Final War", "The Gathering Storm",
 *   "Chapter 1 The Final War", structural pages (TOC, cover, etc.)
 */
export function needsEnrichment(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  // Skip structural pages entirely — they shouldn't be renamed
  if (SKIP_PATTERNS.some((p) => p.test(trimmed))) return false;
  // If it matches a generic pattern, it needs enrichment
  if (GENERIC_PATTERNS.some((p) => p.test(trimmed))) return true;
  // "Chapter 1 The Final War" — has a prefix + number + extra words → already descriptive
  // "Chapter 1: Subtitle" — colon/dash separator → already descriptive
  return false;
}

/**
 * Check whether a chapter should be skipped by AI rename.
 * Returns true if the chapter is structural (cover, TOC, etc.)
 * or already has a meaningful name.
 */
export function shouldSkipRename(title: string): boolean {
  return !needsEnrichment(title);
}

/**
 * Check whether a chapter is a structural/meta page (cover, TOC, copyright, etc.)
 * that should never be sent to AI for wiki analysis.
 */
export function isStructuralChapter(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  return SKIP_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Build a prompt for renaming a single chapter.
 */
export function buildChapterRenamePrompt(
  originalTitle: string,
  contentPreview: string,
  bookTitle: string,
): string {
  return [
    `You are a literary assistant helping organize an ebook library.`,
    `The book is "${bookTitle}".`,
    ``,
    `A chapter currently has the title: "${originalTitle}"`,
    ``,
    `Here is the beginning of the chapter:`,
    `---`,
    contentPreview,
    `---`,
    ``,
    `Generate a clean, spoiler-free title for this chapter. The title should:`,
    `- Capture the mood, setting, or theme of the opening without revealing plot twists`,
    `- Be concise (2-5 words)`,
    `- Not include the chapter number or "Chapter" prefix — just the title words`,
    `- Not use generic filler like "A New Beginning" or "The Journey Continues"`,
    `- Be evocative and specific to the content`,
    ``,
    `Reply with ONLY the title text, nothing else. No quotes, no explanation, no chapter number.`,
  ].join("\n");
}

/**
 * Extract a chapter number from a generic title.
 * "Chapter 3" → 3, "ch005.xml" → 5, "42" → 42, "Part IV" → "IV"
 */
function extractChapterNumber(title: string): string | null {
  const trimmed = title.trim();

  // "Chapter 3", "Part IV"
  const prefixed = trimmed.match(
    /^(?:chapter|part|story|volume|book|section)\s+(\d+|[ivxlcdm]+)$/i,
  );
  if (prefixed) return prefixed[1];

  // Bare number: "3", "42"
  if (/^\d+$/.test(trimmed)) return trimmed;

  // Filename-style: "ch003.xml", "ch1", "chapter-02"
  const filestyle = trimmed.match(/^ch(?:apter)?[-_.]?(\d+)(?:\.\w+)?$/i);
  if (filestyle) return String(parseInt(filestyle[1], 10));

  // "Part_1", "section-2"
  const partStyle = trimmed.match(/^(?:part|section|vol)[-_.]?(\d+)(?:\.\w+)?$/i);
  if (partStyle) return partStyle[1];

  // "Chapter1", "Part2"
  const noSpace = trimmed.match(/^(?:chapter|part|section)(\d+)$/i);
  if (noSpace) return noSpace[1];

  return null;
}

/**
 * Format the renamed title: "Chapter 3" → "Chapter 3 The Final War"
 */
export function formatRenamedTitle(
  originalTitle: string,
  aiTitle: string,
): string {
  if (!aiTitle.trim()) return originalTitle;

  const num = extractChapterNumber(originalTitle);
  if (num) return `Chapter ${num} ${aiTitle.trim()}`;

  return `${originalTitle} ${aiTitle.trim()}`;
}
