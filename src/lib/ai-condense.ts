/* ── AI Concise Reading — tighten prose without losing content ──
 *
 * Pure condensing module: tightens prose to 80–90% of original word count
 * while preserving all information, emotion, and atmosphere. No formatting is applied.
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

const SYSTEM_PROMPT = `You are a book editor. You refine prose — same voice, same content, tighter sentences.

GOAL: Retain 80–90% of original word count. The reader must not notice edits. Every piece of information, emotion, and atmosphere must survive.

RULES:
1. Write in the SAME style, POV, tense, and voice as the original. Do NOT summarize.
2. Keep EVERYTHING: plot events, character actions, dialogue lines, names, numbers, abilities, items, reveals, emotional beats, atmosphere, descriptions, internal thoughts, tension, humor, tone.
3. Only tighten: wordy phrases into concise ones, remove truly redundant words (e.g. "he nodded his head" → "he nodded"), trim filler words ("just", "really", "very", "that" when grammatically unnecessary), compress run-on sentences.
4. Do NOT cut: descriptions, emotional reactions, world-building details, character observations, sensory details, or atmosphere. These are part of the reading experience.
5. Dialogue stays EXACTLY as written — do not shorten, paraphrase, or merge dialogue lines. Spoken words are sacred. Only fix obvious typos/grammar in dialogue.
6. Each output paragraph maps 1:1 to an input paragraph. Same number of paragraphs in, same number out. Do NOT merge or drop paragraphs.
7. Never wrap output in quotes or add commentary. Just output the refined prose directly.
8. When in doubt, keep the original wording. Under-editing is better than over-editing.

OUTPUT: Return a JSON array of strings. Each string is one paragraph of refined prose.
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

/** Handle AI returning [[text], [text]] instead of ["text", "text"] */
function tryFlattenNestedArray(s: string): string[] | null {
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return null;
    // Check if it's an array of single-element arrays
    if (parsed.every(x => Array.isArray(x))) {
      const flat = parsed.flatMap(x => x).filter(x => typeof x === "string");
      return flat.length > 0 ? flat : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Last resort: extract paragraph text from malformed response line by line */
function extractParagraphLines(s: string): string[] | null {
  let inner = s.trim();
  if (inner.startsWith("[")) inner = inner.slice(1);
  if (inner.endsWith("]")) inner = inner.slice(0, -1);

  const lines = inner.split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 15)
    .map(l => {
      // Strip leading/trailing brackets, quotes, commas
      let t = l;
      t = t.replace(/^\[?"?\s*/, "");
      t = t.replace(/\s*"?\]?,?\s*$/, "");
      return t.trim();
    })
    .filter(l => l.length > 10);

  return lines.length > 0 ? lines : null;
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
  // Handle both complete and truncated code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else {
    const openFence = cleaned.match(/```(?:json)?\s*([\s\S]*)/);
    if (openFence) cleaned = openFence[1].trim();
  }

  const direct = tryParseArray(cleaned);
  if (direct) return direct.map(cleanParagraph);

  // Flatten nested arrays: [[text], [text]] → [text, text]
  const flattened = tryFlattenNestedArray(cleaned);
  if (flattened) return flattened.map(cleanParagraph);

  const arrStart = cleaned.indexOf("[");
  if (arrStart !== -1) {
    const fromBracket = cleaned.slice(arrStart);
    const d2 = tryParseArray(fromBracket);
    if (d2) return d2.map(cleanParagraph);

    const f2 = tryFlattenNestedArray(fromBracket);
    if (f2) return f2.map(cleanParagraph);

    const repaired = repairArray(fromBracket);
    if (repaired) {
      console.warn("ai-condense: salvaged truncated response");
      return repaired.map(cleanParagraph);
    }

    // Last resort: extract text lines from malformed response
    const extracted = extractParagraphLines(fromBracket);
    if (extracted) {
      console.warn("ai-condense: extracted %d paragraphs from malformed response", extracted.length);
      return extracted.map(cleanParagraph);
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
