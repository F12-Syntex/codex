/* ── AI Concise Reading — chapter condensation ────────────── */

import { chatWithPreset } from "./openrouter";
import { loadOverrides } from "./ai-presets";

/** Max paragraphs sent per AI call. Condensing needs broad context so chunks are large. */
const CONDENSE_CHUNK = 80;

const SYSTEM_PROMPT = `You are an expert literary editor. Your task is to produce a condensed version of a book chapter that reads exactly like the original author wrote a tighter draft — not a summary, not a retelling, but the same story with less fat.

VOICE — this is the most important rule:
- Match the source text's prose style, rhythm, and sentence structure exactly
- Preserve the author's vocabulary, idioms, and distinctive phrases
- Keep the same POV, tense, and narrative distance
- Maintain the emotional tone of each scene — tense scenes should feel tense, quiet scenes quiet
- Dialogue must feel like the characters are actually speaking, not paraphrased reports
- Literary devices (metaphors, imagery, sentence fragments for emphasis) should be kept when they carry voice

WHAT TO CUT — only remove genuine redundancy:
- Sentences that repeat information stated one or two sentences earlier
- Multi-step action sequences where only the outcome matters ("He reached out and grabbed it" → "He grabbed it")
- Filler transitions that add no information ("He thought about this", "After a moment", "As he did so")
- Over-explained reactions when the emotion is already shown through action or dialogue
- Redundant attributives when speaker is obvious from context
- Second or third iterations of the same descriptive beat in a row

WHAT TO KEEP — never cut these:
- Every plot event, decision, and consequence
- All character introductions and revealed traits
- All dialogue — paraphrase only for length, preserve the character's voice
- Every world-building detail needed to understand what happens
- All reveals, twists, and foreshadowing
- Specific names, numbers, places, abilities, items, relationships
- The first and best instance of any repeated description

TARGET: 55–70% of the original word count. Prioritise flow and readability over maximum compression.

INPUT: A JSON array of paragraph strings.
OUTPUT: Return ONLY a valid JSON array of condensed paragraph strings. No markdown fences, no explanation. Merging short related paragraphs into one is fine when it reads naturally.`;

function tryParseArray(s: string): string[] | null {
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed) && parsed.every(x => typeof x === "string")) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Attempt to repair a truncated JSON array by closing open structure. */
function repairCondenseArray(s: string): string[] | null {
  let t = s.trim();
  // Strip trailing incomplete string: ,"incomplete...
  t = t.replace(/,\s*"(?:[^"\\]|\\.)*$/, "");
  // Strip trailing comma
  t = t.replace(/,\s*$/, "");
  // Close the array if needed
  if (!t.endsWith("]")) t += "]";
  return tryParseArray(t);
}

async function condenseChunk(
  apiKey: string,
  paragraphs: string[],
  bookTitle: string,
  overrides: Awaited<ReturnType<typeof loadOverrides>>,
): Promise<string[] | null> {
  // Filter empty paragraphs but preserve their positions mapping isn't needed — we just concat
  const filtered = paragraphs.filter(p => p.trim().length > 0);
  if (filtered.length === 0) return [];

  const response = await chatWithPreset(
    apiKey,
    "quick",
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Book: "${bookTitle}"\n\nCondense these ${filtered.length} paragraphs:\n${JSON.stringify(filtered)}`,
      },
    ],
    overrides,
  );

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) return null;

  // Strip markdown fence if present
  let cleaned = content;
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  // Try direct parse
  const direct = tryParseArray(cleaned);
  if (direct) return direct;

  // Find first [
  const arrStart = cleaned.indexOf("[");
  if (arrStart !== -1) {
    const fromBracket = cleaned.slice(arrStart);
    const direct2 = tryParseArray(fromBracket);
    if (direct2) return direct2;
    const repaired = repairCondenseArray(fromBracket);
    if (repaired) {
      console.warn("ai-condense: salvaged truncated response");
      return repaired;
    }
  }

  console.error("ai-condense: failed to parse response", content.slice(0, 200));
  return null;
}

export interface CondenseResult {
  paragraphs: string[];
}

/**
 * Condense a chapter's paragraphs using AI.
 * Returns condensed plain-text paragraphs (30–50% of original length),
 * preserving all plot, characters, dialogue, and world-building information.
 */
export async function condenseChapterContent(
  apiKey: string,
  paragraphs: string[],
  bookTitle: string,
  onAbortCheck?: () => boolean,
): Promise<CondenseResult | null> {
  if (paragraphs.length === 0) return { paragraphs: [] };

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
