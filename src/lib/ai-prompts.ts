/* ── Global AI Prompt Templates ───────────────────────── */

/**
 * Build a prompt that asks the AI to generate a clean, spoiler-free
 * chapter title based on the chapter's content.
 *
 * @param originalTitle  The current chapter title (e.g. "Chapter 3")
 * @param contentPreview First ~600 chars of the chapter text for context
 * @param bookTitle      The book's title for additional context
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
 * Build a batch prompt that renames multiple chapters at once.
 * More efficient than one-by-one calls.
 *
 * @param chapters Array of { title, preview } for each chapter
 * @param bookTitle The book's title
 */
export function buildBatchChapterRenamePrompt(
  chapters: { title: string; preview: string }[],
  bookTitle: string,
): string {
  const chapterList = chapters
    .map(
      (ch, i) =>
        `[${i + 1}] Title: "${ch.title}"\nPreview: ${ch.preview}`,
    )
    .join("\n\n");

  return [
    `You are a literary assistant helping organize an ebook library.`,
    `The book is "${bookTitle}".`,
    ``,
    `Below are chapters that need clean, spoiler-free subtitles. For each chapter:`,
    `- Capture the mood, setting, or theme of the opening without revealing plot twists`,
    `- Be concise (2-6 words)`,
    `- Do not repeat the chapter number`,
    `- Do not use generic filler like "A New Beginning"`,
    `- Be evocative and specific to the content`,
    ``,
    `Chapters:`,
    ``,
    chapterList,
    ``,
    `Reply with one subtitle per line, numbered to match. Format:`,
    `1: <subtitle>`,
    `2: <subtitle>`,
    `...`,
    ``,
    `Only the numbered subtitles, nothing else.`,
  ].join("\n");
}

/**
 * Parse the batch rename response into an array of subtitles.
 * Expects format: "1: subtitle\n2: subtitle\n..."
 */
export function parseBatchRenameResponse(
  response: string,
  count: number,
): string[] {
  const lines = response.trim().split("\n");
  const results: string[] = new Array(count).fill("");

  for (const line of lines) {
    const match = line.match(/^(\d+)\s*[:.\-–]\s*(.+)$/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      if (idx >= 0 && idx < count) {
        results[idx] = match[2].trim();
      }
    }
  }

  return results;
}
