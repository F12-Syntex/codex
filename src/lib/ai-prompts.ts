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
 * Check if a chapter title already has a meaningful subtitle.
 * e.g. "Chapter 1: The Final Battle" → true (already named)
 *      "Chapter 3" → false (generic, should be renamed)
 *      "The Gathering Storm" → true (already descriptive)
 */
function hasSubtitle(title: string): boolean {
  // If it contains a colon/dash separator with text after, it already has a subtitle
  if (/[:–—]\s*.{2,}/.test(title)) return true;
  // If it doesn't start with a generic prefix, it's already descriptive
  if (!/^(chapter|part|story|volume|book|section)\s+(\d+|[ivxlcdm]+)$/i.test(title.trim())) {
    // Doesn't match "Chapter N" pattern — check if it's just a number
    if (/^\d+$/.test(title.trim())) return false;
    // It's something descriptive already (e.g. "The Gathering Storm")
    if (!/^(chapter|part|story|volume|book|section)\s/i.test(title.trim())) return true;
  }
  return false;
}

/**
 * Check whether a chapter should be skipped by AI rename.
 * Returns true if the chapter is structural (cover, TOC, etc.)
 * or already has a meaningful name.
 */
export function shouldSkipRename(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return true;
  if (SKIP_PATTERNS.some((p) => p.test(trimmed))) return true;
  if (hasSubtitle(trimmed)) return true;
  return false;
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
