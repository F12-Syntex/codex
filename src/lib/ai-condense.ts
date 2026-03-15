/* ── AI Concise Reading — condense + format in one pass ──── */

import type { BookChapter } from "@/app/reader/lib/types";
import { chatWithPreset } from "./openrouter";
import { loadOverrides } from "./ai-presets";
import { buildClassReference } from "./ai-formatting-classes";
import type { StyleDictionary } from "./ai-style-dictionary";
import {
  extractRulesFromFormatted, mergeRules,
  buildStyleContext, saveDictionary,
  extractCharacterStyles, mergeCharacterStyles,
} from "./ai-style-dictionary";

/** Max paragraphs sent per AI call. */
const CONDENSE_CHUNK = 60;

const CLASS_REFERENCE = buildClassReference();

const SYSTEM_PROMPT = `You are an expert literary editor AND book formatting AI combined into one.
Your job is TWO things at once:
1. CONDENSE the text to 55–70 % of the original word count
2. FORMAT the condensed result with visual HTML enhancements

## CONDENSING RULES

VOICE — the most important rule:
- Match the source text's prose style, rhythm, and sentence structure exactly
- Preserve the author's vocabulary, idioms, and distinctive phrases
- Keep the same POV, tense, and narrative distance
- Maintain the emotional tone — tense scenes feel tense, quiet scenes quiet
- Dialogue must feel like the characters are speaking, not paraphrased reports
- Literary devices (metaphors, imagery, fragments for emphasis) stay when they carry voice

WHAT TO CUT — only genuine redundancy:
- Sentences repeating info stated 1-2 sentences earlier
- Multi-step actions where only the outcome matters ("He reached out and grabbed it" → "He grabbed it")
- Filler transitions adding no info ("He thought about this", "After a moment")
- Over-explained reactions when emotion is shown through action/dialogue
- Redundant attributives when speaker is obvious
- Repeated descriptive beats

WHAT TO KEEP — never cut:
- Every plot event, decision, and consequence
- All character introductions and revealed traits
- All dialogue — paraphrase only for length, preserve character voice
- World-building details needed to understand what happens
- Reveals, twists, foreshadowing
- Specific names, numbers, places, abilities, items, relationships

## FORMATTING RULES

After condensing, apply visual HTML formatting using the CLASS REFERENCE below.
Use your judgement — adapt formatting to the genre and tone.

1. Return each condensed paragraph as formatted HTML.
2. Use ONLY classes from the reference. No inline styles. No Unicode emoji.
3. Fix grammar, punctuation, spelling. Preserve tone, dialect, style.
4. Light prose cleanup: fix translation artifacts, awkward phrasing. Keep changes minimal.
5. FORMAT ALL dialogue — if a paragraph has quoted speech, it MUST get a dialogue speaker span.
6. Structured data (stats, skills, tables): restructure for clarity.
7. Consecutive structured paragraphs: merge into one.
8. Stat block labels: 1-2 words max, EVERY label gets an icon.
9. Dialogue tags: the ai-fmt-dialogue-* span MUST appear ONLY before quoted speech.
10. System messages: keep text SHORT and punchy.

## OUTPUT FORMAT

Return ONLY a valid JSON array of HTML strings. Each string is one condensed + formatted paragraph.
No markdown fences, no explanation, no wrapper object — just the array.
Merging short related paragraphs is fine when it reads naturally.

# CLASS REFERENCE
${CLASS_REFERENCE}`;

function buildWikiContextString(
  entries: { name: string; type: string; short_description: string; significance: number }[],
): string {
  const chars = entries
    .filter(e => e.type === "character")
    .sort((a, b) => (b.significance ?? 0) - (a.significance ?? 0))
    .slice(0, 25);
  if (chars.length === 0) return "";
  const lines = chars.map(e => `- ${e.name}: ${e.short_description || "character"}`).join("\n");
  return `\n\n# KEY CHARACTERS\n${lines}\n\nUse these names to identify speakers in dialogue.`;
}

/* ── JSON parsing helpers ───────────────────────────────── */

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

const AI_FMT_PREFIX = "ai-fmt-";

function stripUnrecognizedClasses(html: string): string {
  return html.replace(/class="([^"]*)"/g, (_match, classes: string) => {
    const filtered = classes
      .split(/\s+/)
      .filter((c: string) => c && c.startsWith(AI_FMT_PREFIX))
      .join(" ");
    return filtered ? `class="${filtered}"` : "";
  });
}

function fixDialogueSpans(html: string): string {
  return html.replace(
    /<span(\s+class="ai-fmt-dialogue-[^"]*")>([\s\S]*?)<\/span>/g,
    (_match, classAttr: string, content: string) => {
      const quoteIdx = content.search(/[\u201C\u201D\u2018\u2019"']/);
      if (quoteIdx === -1) return _match;
      const speakerPart = content.slice(0, quoteIdx).trimEnd();
      const quotePart = content.slice(quoteIdx);
      if (speakerPart.length === 0) return quotePart;
      return `<span${classAttr}>${speakerPart}</span> ${quotePart}`;
    },
  );
}

function sanitizeHtml(html: string): string {
  return fixDialogueSpans(stripUnrecognizedClasses(html));
}

/* ── Single chunk: condense + format ────────────────────── */

async function condenseFormatChunk(
  apiKey: string,
  paragraphs: string[],
  bookTitle: string,
  overrides: Awaited<ReturnType<typeof loadOverrides>>,
  styleContext: string,
  wikiContext: string,
): Promise<string[] | null> {
  const filtered = paragraphs.filter(p => p.trim().length > 0);
  if (filtered.length === 0) return [];

  const response = await chatWithPreset(
    apiKey,
    "format",
    [
      { role: "system", content: SYSTEM_PROMPT + styleContext + wikiContext },
      {
        role: "user",
        content: `Book: "${bookTitle}"\n\nCondense AND format these ${filtered.length} paragraphs. Return a JSON array of HTML strings:\n${JSON.stringify(filtered)}`,
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
  if (direct) return direct.map(sanitizeHtml);

  const arrStart = cleaned.indexOf("[");
  if (arrStart !== -1) {
    const fromBracket = cleaned.slice(arrStart);
    const d2 = tryParseArray(fromBracket);
    if (d2) return d2.map(sanitizeHtml);
    const repaired = repairArray(fromBracket);
    if (repaired) {
      console.warn("ai-condense: salvaged truncated response");
      return repaired.map(sanitizeHtml);
    }
  }

  console.error("ai-condense: failed to parse response", content.slice(0, 200));
  return null;
}

/* ── Public API ─────────────────────────────────────────── */

export interface CondenseResult {
  /** Condensed + formatted HTML paragraphs */
  paragraphs: string[];
  /** Updated style dictionary */
  dictionary: StyleDictionary;
}

/**
 * Condense a chapter's content using AI — produces formatted HTML in a single pass.
 * No separate formatting step needed.
 */
export async function condenseChapterContent(
  apiKey: string,
  chapter: BookChapter,
  bookTitle: string,
  onAbortCheck?: () => boolean,
  existingDictionary?: StyleDictionary | null,
  filePath?: string,
): Promise<CondenseResult | null> {
  const { htmlParagraphs, paragraphs } = chapter;
  if (paragraphs.length === 0) {
    return {
      paragraphs: [],
      dictionary: existingDictionary ?? { rules: [], bookTitle, updatedAt: new Date().toISOString() },
    };
  }

  // Skip chapters with embedded images or excessive size
  const totalLen = htmlParagraphs.reduce((sum, p) => sum + p.length, 0);
  const hasImages = htmlParagraphs.some(p => p.includes("data:image/") || p.includes("base64,"));
  if (hasImages || totalLen > 500_000) {
    console.warn(`Skipping AI condense: chapter too large (${totalLen} chars) or contains images`);
    return {
      paragraphs: [...htmlParagraphs],
      dictionary: existingDictionary ?? { rules: [], bookTitle, updatedAt: new Date().toISOString() },
    };
  }

  const overrides = await loadOverrides();
  const styleContext = existingDictionary ? buildStyleContext(existingDictionary) : "";

  // Fetch wiki context for character identification
  let wikiContext = "";
  if (filePath) {
    try {
      const entries = await window.electronAPI?.wikiGetEntries(filePath);
      if (entries && entries.length > 0) {
        wikiContext = buildWikiContextString(entries);
      }
    } catch { /* non-critical */ }
  }

  const allCondensed: string[] = [];

  for (let offset = 0; offset < paragraphs.length; offset += CONDENSE_CHUNK) {
    if (onAbortCheck?.()) return null;

    const chunk = paragraphs.slice(offset, offset + CONDENSE_CHUNK);
    const result = await condenseFormatChunk(apiKey, chunk, bookTitle, overrides, styleContext, wikiContext);
    if (result === null) return null;

    allCondensed.push(...result);
  }

  // Extract style rules from the formatted output
  const originals = htmlParagraphs.slice(0, allCondensed.length);
  const newRules = extractRulesFromFormatted(originals, allCondensed);
  const existingRules = existingDictionary?.rules ?? [];
  const mergedRules = mergeRules(existingRules, newRules);
  const newCharStyles = extractCharacterStyles(allCondensed);
  const mergedCharStyles = mergeCharacterStyles(existingDictionary?.characterStyles, newCharStyles);

  const dictionary: StyleDictionary = {
    rules: mergedRules,
    characterStyles: Object.keys(mergedCharStyles).length > 0 ? mergedCharStyles : undefined,
    bookTitle,
    updatedAt: new Date().toISOString(),
  };

  if (filePath) {
    saveDictionary(filePath, dictionary);
  }

  return { paragraphs: allCondensed, dictionary };
}
