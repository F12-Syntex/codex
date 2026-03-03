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
    `Generate a clean, spoiler-free subtitle for this chapter. The subtitle should:`,
    `- Capture the mood, setting, or theme of the opening without revealing plot twists`,
    `- Be concise (2-6 words)`,
    `- Not repeat the chapter number`,
    `- Not use generic filler like "A New Beginning" or "The Journey Continues"`,
    `- Be evocative and specific to the content`,
    ``,
    `Reply with ONLY the subtitle text, nothing else. No quotes, no explanation.`,
  ].join("\n");
}

/**
 * Format the renamed title: "Chapter 3" → "Chapter 3: Subtitle Here"
 */
export function formatRenamedTitle(
  originalTitle: string,
  subtitle: string,
): string {
  if (!subtitle.trim()) return originalTitle;

  const hasNumber =
    /^(Chapter|Part|Story|Volume|Book|Section)\s+(\d+|[IVXLCDM]+)/i.test(originalTitle);

  if (hasNumber) {
    const prefix = originalTitle.match(
      /^((?:Chapter|Part|Story|Volume|Book|Section)\s+(?:\d+|[IVXLCDM]+))/i,
    );
    return prefix ? `${prefix[1]}: ${subtitle}` : `${originalTitle}: ${subtitle}`;
  }

  // For bare numbers like "3"
  if (/^\d+$/.test(originalTitle.trim())) {
    return `${originalTitle}: ${subtitle}`;
  }

  return `${originalTitle}: ${subtitle}`;
}
