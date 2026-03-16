/* ── AI Concise Reading — condense text to a shorter version ──
 *
 * Pure condensing module: reduces text to 55–70% of original word count
 * while preserving voice and meaning. No formatting is applied.
 *
 * Formatting is handled separately by the formatting module (ai-formatting.ts).
 * When both Concise Reading and Formatting are enabled, the formatter runs
 * on the condensed output as a second pass.
 */

import type { BookChapter } from "@/app/reader/lib/types";
import { chatWithPreset } from "./openrouter";
import { loadOverrides } from "./ai-presets";

/* ── Constants ──────────────────────────────────────────────── */

/** Max paragraphs per AI call. */
const CONDENSE_CHUNK = 60;

/* ── System prompt ──────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are a book editor. You tighten prose — same voice, fewer words.

GOAL: Cut to 55–70% of original word count. The reader must not notice edits.

RULES:
1. Write in the SAME style, POV, tense, and voice as the original. Do NOT summarize.
2. Keep every: plot event, character action, dialogue line, name, number, ability, item, reveal.
3. Cut only: repeated information, filler transitions, over-explained reactions, redundant descriptions.
4. Dialogue stays as dialogue — spoken lines with quotation marks, not reported speech.
5. Each output paragraph maps to one or more input paragraphs. Maintain paragraph structure.
6. Never wrap output in quotes or add commentary. Just output the tightened prose directly.

OUTPUT: Return a JSON array of strings. Each string is one paragraph of tightened prose.
No markdown fences. No explanation. No HTML. Just the JSON array.`;

/* ── JSON parsing ───────────────────────────────────────────── */

function tryParseArray(s: string): string[] | null {
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed) && parsed.every(x => typeof x === "string")) return parsed;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const arr = Object.values(parsed).find(
        v => Array.isArray(v) && (v as unknown[]).every(x => typeof x === "string"),
      );
      if (arr) return arr as string[];
    }
    return null;
  } catch {
    return null;
  }
}

function repairArray(s: string): string[] | null {
  let t = s.trim();
  t = t.replace(/,\s*"(?:[^"\\]|\\.)*$/, "");
  t = t.replace(/,\s*$/, "");
  if (!t.endsWith("]")) t += "]";
  return tryParseArray(t);
}

/* ── Post-processing ───────────────────────────────────────── */

/** Strip any HTML tags the AI adds despite instructions, decode entities. */
function cleanParagraph(text: string): string {
  let clean = text.replace(/<[^>]+>/g, "").trim();
  // Decode common HTML entities
  clean = clean.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  return clean;
}

/* ── Single chunk processing ────────────────────────────────── */

async function condenseChunk(
  apiKey: string,
  paragraphs: string[],
  bookTitle: string,
  overrides: Awaited<ReturnType<typeof loadOverrides>>,
): Promise<string[] | null> {
  const filtered = paragraphs.filter(p => p.trim().length > 0);
  if (filtered.length === 0) return [];

  const response = await chatWithPreset(
    apiKey,
    "format",
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Book: "${bookTitle}"\n\nTighten these ${filtered.length} paragraphs:\n${JSON.stringify(filtered)}`,
      },
    ],
    overrides,
  );

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) return null;

  let cleaned = content;
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const direct = tryParseArray(cleaned);
  if (direct) return direct.map(cleanParagraph);

  const arrStart = cleaned.indexOf("[");
  if (arrStart !== -1) {
    const fromBracket = cleaned.slice(arrStart);
    const d2 = tryParseArray(fromBracket);
    if (d2) return d2.map(cleanParagraph);
    const repaired = repairArray(fromBracket);
    if (repaired) {
      console.warn("ai-condense: salvaged truncated response");
      return repaired.map(cleanParagraph);
    }
  }

  console.error("ai-condense: failed to parse response", content.slice(0, 200));
  return null;
}

/* ── Public API ─────────────────────────────────────────────── */

export interface CondenseResult {
  /** Condensed plain text paragraphs (no formatting) */
  paragraphs: string[];
}

/**
 * Condense a chapter's content — produces plain text paragraphs.
 *
 * Formatting is NOT included. Use the Formatting module separately
 * if visual enhancements are desired on the condensed output.
 */
export async function condenseChapterContent(
  apiKey: string,
  chapter: BookChapter,
  bookTitle: string,
  onAbortCheck?: () => boolean,
): Promise<CondenseResult | null> {
  const { htmlParagraphs, paragraphs } = chapter;
  if (paragraphs.length === 0) {
    return { paragraphs: [] };
  }

  // Skip chapters with embedded images or excessive size
  const totalLen = htmlParagraphs.reduce((sum, p) => sum + p.length, 0);
  const hasImages = htmlParagraphs.some(p => p.includes("data:image/") || p.includes("base64,"));
  if (hasImages || totalLen > 500_000) {
    console.warn(`Skipping AI condense: chapter too large (${totalLen} chars) or contains images`);
    return { paragraphs: [...paragraphs] };
  }

  const overrides = await loadOverrides();
  const allCondensed: string[] = [];

  for (let offset = 0; offset < paragraphs.length; offset += CONDENSE_CHUNK) {
    if (onAbortCheck?.()) return null;

    const chunk = paragraphs.slice(offset, offset + CONDENSE_CHUNK);
    const result = await condenseChunk(apiKey, chunk, bookTitle, overrides);
    if (result === null) return null;

    allCondensed.push(...result);
  }

  return { paragraphs: allCondensed };
}
