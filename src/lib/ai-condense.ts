/* ── AI Concise Reading — chapter condensation ────────────── */

import { chatWithPreset } from "./openrouter";
import { loadOverrides } from "./ai-presets";

/** Max paragraphs sent per AI call. Condensing needs broad context so chunks are large. */
const CONDENSE_CHUNK = 80;

const SYSTEM_PROMPT = `You are a literary compression AI. Your task is to condense book chapter text to its absolute minimum without losing any required information.

PRESERVE — keep 100% of these:
- Every plot event, character action, decision, and consequence
- All character introductions, names, and key personality/ability traits revealed
- All dialogue content — what was said and what it implies (paraphrase only to shorten, never to omit)
- Every world-building detail that affects story comprehension
- All reveals, twists, foreshadowing, and narrative beats
- Factual specifics: names, places, numbers, abilities, items, relationships, organisations

REMOVE — aggressively cut these:
- Repeated descriptions of the same thing already established
- Atmospheric padding that adds mood but no new information
- Verbose constructions where a shorter form says the same thing ("He reached out his hand and grabbed it" → "He grabbed it")
- Redundant action steps and over-explained reactions
- Transitional filler ("He thought about this for a moment", "After a while")
- Extended similes or metaphors when the plain meaning is already clear

TARGET: 30–50% of the original word count. Push for the lower end when safe to do so.
STYLE: Write in the same third-person prose style as the source — just tighter and faster. Do not change tense, POV, or narrative voice.

INPUT: A JSON array of paragraph strings.
OUTPUT: Return ONLY a valid JSON array of condensed paragraph strings. No markdown fences, no explanation. Merging short related paragraphs into one is encouraged.`;

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
