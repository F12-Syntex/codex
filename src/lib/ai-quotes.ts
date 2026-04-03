/* ── AI Quote Enrichment ─────────────────────────────────── */

import { aiText } from "./ai-client";

export interface QuoteEnrichment {
  speaker: string;
  kind: "dialogue" | "inner_thought" | "narration" | "description" | "quote";
}

/**
 * Uses AI to detect the speaker and classify the quote type.
 * Does NOT modify the original text.
 */
export async function enrichQuote(
  quoteText: string,
  context: {
    chapterTitle: string;
    bookTitle: string;
    surroundingText?: string;
  }
): Promise<QuoteEnrichment> {
  const systemPrompt = `You are a literary analyst. Given a quote from a book, identify:
1. The speaker (if it's dialogue or inner thought — use "narrator" for narration/description, or the character's name)
2. The kind: one of "dialogue", "inner_thought", "narration", "description", "quote"

Respond with ONLY valid JSON in this exact format:
{"speaker":"<name or narrator or unknown>","kind":"<kind>"}

Rules:
- dialogue: spoken words between characters
- inner_thought: character's internal monologue
- narration: third-person storytelling
- description: setting, scene, or character description
- quote: a standalone notable statement
- If you cannot determine the speaker, use "unknown"`;

  const userPrompt = `Book: "${context.bookTitle}"
Chapter: "${context.chapterTitle}"
${context.surroundingText ? `\nContext:\n${context.surroundingText}\n` : ""}
Quote to analyze:
"${quoteText}"`;

  try {
    const raw = await aiText({
      preset: "quick",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 80,
    });

    // Find first { in case of preamble
    const start = raw.indexOf("{");
    if (start === -1) throw new Error("No JSON in response");
    const json = raw.slice(start);
    const end = json.lastIndexOf("}");
    const parsed = JSON.parse(json.slice(0, end + 1)) as QuoteEnrichment;
    if (!parsed.speaker || !parsed.kind) throw new Error("Invalid JSON structure");
    return parsed;
  } catch {
    return { speaker: "unknown", kind: "quote" };
  }
}
