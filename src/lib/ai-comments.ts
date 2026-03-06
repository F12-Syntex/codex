/* ── AI Inline Comments ─────────────────────────────────── */

import { chatWithPreset } from "./openrouter";

export interface InlineComment {
  paraIndex: number;
  text: string;
  author: "ai" | "user";
}

export interface ChapterComments {
  comments: InlineComment[];
}

/**
 * Generate casual AI comments for a chapter.
 * The AI reads the full chapter and picks a few paragraphs to react to,
 * like a ~20 year old reader on discord/reddit would.
 */
export async function generateAIComments(
  chapterText: string[],
  bookTitle: string,
  chapterTitle: string,
  chapterIndex: number,
  isAborted: () => boolean,
): Promise<InlineComment[]> {
  const apiKey = await window.electronAPI?.getSetting("openrouterApiKey");
  if (!apiKey) throw new Error("No API key");

  // Build numbered paragraph text for the AI
  const numbered = chapterText
    .map((p, i) => `[${i}] ${p}`)
    .join("\n\n");

  // Limit to ~6000 chars to stay within context
  const trimmed = numbered.length > 6000
    ? numbered.slice(0, 6000) + "\n\n[... rest of chapter truncated]"
    : numbered;

  const totalParas = chapterText.length;
  // Very sparse: 0-2 comments per chapter, only for truly standout moments
  const suggestedCount = Math.min(2, Math.floor(totalParas / 20));

  const systemPrompt = `You are someone who's reading "${bookTitle}" and leaving comments as you go. You're around 20 years old, you use discord and reddit a lot. Your comments should sound EXACTLY like real comments from those platforms.

Rules:
- Comment on AT MOST ${suggestedCount + 1} paragraphs. You can leave ZERO comments if nothing genuinely stands out — most chapters don't deserve any. Only react when something truly hits: a major twist, an incredible line, something genuinely funny or shocking. If nothing grabs you, return an empty array [].
- Sound natural and human. Use lowercase, abbreviations, slang. Not every comment needs perfect grammar. Some can be short ("bruh", "nah wtf"), some can be a sentence or two.
- React genuinely: be funny, shocked, confused, hyped, sad, suspicious, whatever fits. Don't be fake positive about everything.
- Reference what actually happened in the paragraph. Don't be vague.
- NO spoilers from later in the book. React as if reading for the first time.
- Don't start every comment the same way. Mix it up.
- Don't be cringe or try too hard. Just be real.
- Never break character. Never say "as an AI". You're just a person reading this book.

Examples of good comments:
- "wait WHAT. no way he just did that lmao"
- "this is lowkey terrifying ngl"
- "ok i kinda love this character already"
- "bro is NOT making it out of this one"
- "the foreshadowing here is insane if you think about it"
- "im sorry but this dialogue is so good"
- "nah this scene hits different at 2am"

Output format — STRICTLY follow this JSON array format, nothing else:
[{"p": <paragraph_number>, "c": "<your comment>"}]

Where "p" is the paragraph number from the [N] markers and "c" is your comment.`;

  const userMessage = `Here's chapter ${chapterIndex + 1} "${chapterTitle}" from "${bookTitle}". Leave your comments:\n\n${trimmed}`;

  if (isAborted()) return [];

  const response = await chatWithPreset(
    apiKey,
    "quick",
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  );

  if (isAborted()) return [];

  const raw = response.choices?.[0]?.message?.content?.trim() ?? "";

  // Parse JSON response
  try {
    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ p: number; c: string }>;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => typeof item.p === "number" && typeof item.c === "string" && item.p >= 0 && item.p < totalParas)
      .map((item) => ({
        paraIndex: item.p,
        text: item.c.trim(),
        author: "ai" as const,
      }))
      .filter((c) => c.text.length > 0);
  } catch {
    console.error("[ai-comments] Failed to parse AI response:", raw);
    return [];
  }
}
