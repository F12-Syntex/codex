/* ── AI Chapter Labeling ── */
// Sends the book's TOC to AI; AI returns {chapterIndex: chapterNum} for
// real story chapters only, skipping cover/TOC/copyright pages.

import { chatWithPreset } from "./openrouter";

export type ChapterLabels = Record<number, number>;

export async function labelChapters(
  apiKey: string,
  toc: { index: number; label: string }[],
): Promise<ChapterLabels> {
  if (toc.length === 0) return {};

  const messages = [
    {
      role: "system" as const,
      content: `Classify EPUB chapters. Return JSON {chapterIndex:chapterNum} for story chapters only.
Skip non-story pages: cover, title page, table of contents, copyright, dedication, about-the-author.
Include story content: chapters, prologues (num=0), epilogues, afterwords, intermissions.
Chapter numbers start at 1 and increment sequentially. Return ONLY valid JSON, no explanation.`,
    },
    {
      role: "user" as const,
      content: JSON.stringify(toc.map((e) => [e.index, e.label])),
    },
  ];

  const response = await chatWithPreset(apiKey, "quick", messages);
  const content = response.choices?.[0]?.message?.content ?? "";

  try {
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);

    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const result: ChapterLabels = {};
    for (const [k, v] of Object.entries(obj)) {
      const idx = Number(k);
      const num = Number(v);
      if (!isNaN(idx) && !isNaN(num) && num >= 0) result[idx] = num;
    }
    return result;
  } catch {
    console.warn("[chapter-labels] Failed to parse AI response:", content);
    return {};
  }
}
