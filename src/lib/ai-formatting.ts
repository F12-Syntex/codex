/* ── AI Formatting — visual HTML enhancements for book text ──
 *
 * Pure formatting module: takes raw HTML paragraphs and returns
 * visually enhanced HTML using ai-fmt-* CSS classes. No condensing.
 *
 * Uses sparse object format: AI returns only modified paragraphs
 * as {index: html}, unmodified paragraphs keep originals.
 */

import type { BookChapter } from "@/app/reader/lib/types";
import type { OpenRouterMessage } from "./openrouter";
import { chatWithPreset } from "./openrouter";
import { loadOverrides } from "./ai-presets";
import type { StyleDictionary } from "./ai-style-dictionary";
import {
  extractRulesFromFormatted, mergeRules, buildStyleContext, saveDictionary,
  extractCharacterStyles, mergeCharacterStyles,
} from "./ai-style-dictionary";
import { buildClassReference } from "./ai-formatting-classes";

/* ── Constants ──────────────────────────────────────────────── */

const CHUNK_SIZE = 40;
const PARALLEL_CHUNKS = 3;
const MAX_RETRIES = 2;

/** Any class starting with "ai-fmt-" is allowed. */
const AI_FMT_PREFIX = "ai-fmt-";

/* ── System prompt ──────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are a book formatting AI. You receive a JSON object of HTML paragraphs (keyed by index) and return ONLY the ones you changed, as a JSON object mapping index → formatted HTML.

Read the content, understand the genre and tone, and apply visual enhancements from the CLASS REFERENCE below. Use your judgement — a literary novel needs different treatment than a game-lit novel. Adapt.

# RULES
1. Return {index: html} for modified paragraphs ONLY. Skip unchanged ones.
2. Use ONLY classes from the reference. No inline styles. No Unicode emoji.
3. Fix grammar, punctuation, spelling, and line spacing issues. Preserve tone, dialect, and style.
4. Light prose cleanup: fix obvious translation artifacts, awkward phrasing, missing words, and broken sentences. Keep changes minimal — the reader should not notice edits. NEVER alter character voice, intentional slang, or stylistic choices.
5. Narration/dialogue: do NOT add new content or rewrite meaning. Only fix clear errors.
6. Structured data (stats, skills, tables): MAY restructure for clarity. Keep all info.
7. FORMAT ALL dialogue lines — never skip a paragraph that contains spoken dialogue. If a paragraph has quoted speech (\u201C, \u201D, \u2018, \u2019, or standard " marks), it MUST be formatted with a dialogue speaker span. This is mandatory, not optional.
8. Keep enhancements compact and inline. Don't dominate the page.
9. Consecutive structured paragraphs: merge into first index, set consumed indices to "".
10. Stat block labels: 1-2 words max, EVERY label gets an icon. Use icons to replace words.
11. Dialogue tags: CRITICAL — the ai-fmt-dialogue-* span MUST appear ONLY immediately before quoted speech (the opening quote character). Example: <span class="ai-fmt-dialogue-hero">Name</span> \u201CHello.\u201D — NEVER wrap character name mentions inside narration or action paragraphs with this class. The span signals "the next thing is speech by this character" and nothing else.
12. System messages: keep text SHORT and punchy.
13. Plain narration paragraphs with no dialogue, grammar issues, or structured data may be skipped. But when in doubt, format it.

# OUTPUT
Return ONLY valid JSON: {"0":"<div>...</div>","3":"<p>text</p>","4":""}. No markdown fences, no explanation.

# CLASS REFERENCE
` + buildClassReference();

/* ── Helpers ────────────────────────────────────────────────── */

/**
 * Build wiki context string from wiki entries for character identification.
 */
function buildWikiContextString(
  entries: { name: string; type: string; short_description: string; significance: number }[],
): string {
  const chars = entries
    .filter(e => e.type === "character")
    .sort((a, b) => (b.significance ?? 0) - (a.significance ?? 0))
    .slice(0, 25);
  if (chars.length === 0) return "";
  const lines = chars.map(e => `- ${e.name}: ${e.short_description || "character"}`).join("\n");
  return `\n\n# KEY CHARACTERS IN THIS BOOK\n${lines}\n\nUse these names to correctly identify speakers in dialogue.`;
}

/**
 * Strip classes that don't start with "ai-fmt-" and fix dialogue spans.
 */
export function stripUnrecognizedClasses(html: string): string {
  const stripped = html.replace(/class="([^"]*)"/g, (_match, classes: string) => {
    const filtered = classes
      .split(/\s+/)
      .filter((c: string) => c && c.startsWith(AI_FMT_PREFIX))
      .join(" ");
    return filtered ? `class="${filtered}"` : "";
  });
  return fixDialogueSpans(stripped);
}

/**
 * Fix dialogue spans where the AI incorrectly wrapped quoted speech inside
 * the speaker span instead of only the speaker name.
 */
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

/* ── JSON extraction + repair ───────────────────────────────── */

function extractAndRepairJson(raw: string): string | null {
  const s = raw.trim();

  const objStart = s.indexOf("{");
  const arrStart = s.indexOf("[");
  const start = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
  if (start === -1) return null;

  const extracted = s.slice(start);

  try { JSON.parse(extracted); return extracted; } catch { /* fall through */ }

  const lastBrace = extracted.lastIndexOf("}");
  const lastBracket = extracted.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  if (end > 0) {
    const trimmed = extracted.slice(0, end + 1);
    try { JSON.parse(trimmed); return trimmed; } catch { /* fall through */ }
  }

  return repairTruncated(extracted);
}

function repairTruncated(s: string): string | null {
  if (s.startsWith("{")) {
    let r = s.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, "");
    const quoteCount = (r.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) r += '"';
    if (!r.endsWith("}")) r += "}";
    try { JSON.parse(r); return r; } catch { /* fall through */ }

    const lastGoodComma = r.lastIndexOf('",');
    if (lastGoodComma > 0) {
      const truncated = r.substring(0, lastGoodComma + 1) + "}";
      try { JSON.parse(truncated); return truncated; } catch { /* fall through */ }
    }
  }

  if (s.startsWith("[")) {
    let r = s;
    const quoteCount = (r.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) r += '"';
    if (!r.endsWith("]")) r += "]";
    try { JSON.parse(r); return r; } catch { /* fall through */ }
  }

  return null;
}

/**
 * After parsing a sparse AI response, detect paragraphs that were merged
 * into an earlier paragraph but not cleared by the AI.
 */
function clearMergedDuplicates(result: string[], originals: string[]): void {
  const strip = (html: string) =>
    html.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

  const resultText = result.map(strip);

  for (let j = 1; j < result.length; j++) {
    if (result[j] === "") continue;
    if (result[j] !== originals[j]) continue;

    const origJ = strip(originals[j]);
    if (origJ.length < 30) continue;

    for (let i = 0; i < j; i++) {
      if (resultText[i].includes(origJ)) {
        result[j] = "";
        break;
      }
    }
  }
}

/* ── Prompt building ────────────────────────────────────────── */

export function buildFormattingPrompt(
  paragraphs: string[],
  bookTitle: string,
  _chunkOffset: number = 0,
  styleContext: string = "",
  wikiContext: string = "",
): OpenRouterMessage[] {
  const indexed: Record<number, string> = {};
  for (let i = 0; i < paragraphs.length; i++) {
    indexed[i] = paragraphs[i];
  }

  return [
    { role: "system", content: SYSTEM_PROMPT + styleContext + wikiContext },
    {
      role: "user",
      content: `Book: "${bookTitle}"\n\nFormat these ${paragraphs.length} paragraphs (indices 0-${paragraphs.length - 1}). Return ONLY modified ones as {index: html}:\n${JSON.stringify(indexed)}`,
    },
  ];
}

/* ── Response parsing ───────────────────────────────────────── */

export function parseFormattingResponse(
  response: string,
  expectedCount: number,
  originals?: string[],
): string[] | null {
  try {
    let cleaned = response.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const repaired = extractAndRepairJson(cleaned);
      if (repaired) {
        parsed = JSON.parse(repaired);
      } else {
        console.warn("AI formatting: unrecoverable JSON, falling back to originals");
        return originals ? [...originals] : null;
      }
    }

    // Sparse object format: {index: html}
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const result = originals ? [...originals] : new Array<string>(expectedCount).fill("");
      let changeCount = 0;
      for (const [key, value] of Object.entries(parsed)) {
        const idx = Number(key);
        if (Number.isNaN(idx) || idx < 0 || idx >= expectedCount) continue;
        if (typeof value !== "string") continue;
        result[idx] = stripUnrecognizedClasses(value);
        changeCount++;
      }
      console.log(`AI formatting: ${changeCount}/${expectedCount} paragraphs modified (sparse)`);
      if (originals) clearMergedDuplicates(result, originals);
      return result;
    }

    // Legacy: full array format
    if (Array.isArray(parsed) && parsed.length > 0) {
      const sanitized = parsed.map((entry: unknown) => {
        if (typeof entry !== "string") return "";
        return stripUnrecognizedClasses(entry);
      });

      if (sanitized.length === expectedCount) return sanitized;

      if (sanitized.length < expectedCount) {
        console.warn(`AI formatting: got ${sanitized.length}/${expectedCount} entries, padding`);
        const padded = [...sanitized];
        for (let i = sanitized.length; i < expectedCount; i++) {
          padded.push(originals?.[i] ?? "");
        }
        return padded;
      }

      console.warn(`AI formatting: got ${sanitized.length}/${expectedCount} entries, truncating`);
      return sanitized.slice(0, expectedCount);
    }

    console.warn("AI formatting: response is not a valid object or array");
    return null;
  } catch (err) {
    console.error("AI formatting: JSON parse failed:", err);
    return null;
  }
}

/* ── Single chunk processing ────────────────────────────────── */

async function formatChunk(
  apiKey: string,
  overrides: Record<string, { model: string }>,
  paragraphs: string[],
  bookTitle: string,
  chunkOffset: number = 0,
  styleContext: string = "",
  wikiContext: string = "",
): Promise<string[] | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const messages = buildFormattingPrompt(paragraphs, bookTitle, chunkOffset, styleContext, wikiContext);
      const response = await chatWithPreset(apiKey, "format", messages, overrides);

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        console.warn(`AI formatting: empty response (attempt ${attempt + 1}/${MAX_RETRIES})`);
        continue;
      }

      const result = parseFormattingResponse(content, paragraphs.length, paragraphs);
      if (result) return result;

      console.warn(`AI formatting: parse failed (attempt ${attempt + 1}/${MAX_RETRIES})`);
    } catch (err) {
      console.error(`AI formatting chunk failed (attempt ${attempt + 1}/${MAX_RETRIES}):`, err);
    }
  }
  console.warn("AI formatting: all retries exhausted, returning originals");
  return [...paragraphs];
}

/* ── Public API ─────────────────────────────────────────────── */

export interface FormatResult {
  paragraphs: string[];
  dictionary: StyleDictionary;
}

/**
 * Format a single chapter's content via AI.
 * Handles chunking for long chapters and parallel processing.
 */
export async function formatChapterContent(
  apiKey: string,
  chapter: BookChapter,
  bookTitle: string,
  onAbortCheck?: () => boolean,
  existingDictionary?: StyleDictionary | null,
  filePath?: string,
): Promise<FormatResult | null> {
  const { htmlParagraphs } = chapter;
  if (htmlParagraphs.length === 0) {
    return {
      paragraphs: [],
      dictionary: existingDictionary ?? { rules: [], bookTitle, updatedAt: new Date().toISOString() },
    };
  }

  // Skip chapters with embedded images or excessive size
  const totalLen = htmlParagraphs.reduce((sum, p) => sum + p.length, 0);
  const hasImages = htmlParagraphs.some(p => p.includes("data:image/") || p.includes("base64,"));
  if (hasImages || totalLen > 500_000) {
    console.warn(`Skipping AI formatting: chapter too large (${totalLen} chars) or contains images`);
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

  let formatted: string[] | null;

  if (htmlParagraphs.length <= CHUNK_SIZE + 10) {
    formatted = await formatChunk(apiKey, overrides, htmlParagraphs, bookTitle, 0, styleContext, wikiContext);
  } else {
    const chunks: { start: number; paragraphs: string[] }[] = [];
    for (let start = 0; start < htmlParagraphs.length; start += CHUNK_SIZE) {
      chunks.push({ start, paragraphs: htmlParagraphs.slice(start, Math.min(start + CHUNK_SIZE, htmlParagraphs.length)) });
    }

    const results = new Array<string[] | null>(chunks.length).fill(null);

    for (let batch = 0; batch < chunks.length; batch += PARALLEL_CHUNKS) {
      if (onAbortCheck?.()) return null;

      const batchChunks = chunks.slice(batch, batch + PARALLEL_CHUNKS);
      const batchResults = await Promise.all(
        batchChunks.map((c) => formatChunk(apiKey, overrides, c.paragraphs, bookTitle, c.start, styleContext, wikiContext)),
      );

      for (let j = 0; j < batchResults.length; j++) {
        if (!batchResults[j]) return null;
        results[batch + j] = batchResults[j];
      }
    }

    formatted = results.flatMap((r) => r!);
  }

  if (!formatted) return null;

  // Extract style rules from formatted output
  const newRules = extractRulesFromFormatted(htmlParagraphs, formatted);
  const mergedRules = mergeRules(existingDictionary?.rules ?? [], newRules);

  const newCharStyles = extractCharacterStyles(formatted);
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

  return { paragraphs: formatted, dictionary };
}

/* ── Regenerate rule ────────────────────────────────────────── */

/**
 * Regenerate a component across ALL chapters with fresh creative treatment.
 */
export async function regenerateRule(
  apiKey: string,
  componentClass: string,
  formattedChapters: Record<string, string[]>,
  bookContent: { chapters: { htmlParagraphs: string[] }[] },
  bookTitle: string,
  userInstruction?: string,
): Promise<Record<string, Record<number, string>> | null> {
  const overrides = await loadOverrides();

  const allUpdates: Record<string, Record<number, string>> = {};
  let anyFound = false;

  for (const [chKey, formatted] of Object.entries(formattedChapters)) {
    const chIdx = Number(chKey);
    const originals = bookContent.chapters[chIdx]?.htmlParagraphs;
    if (!originals || !formatted) continue;

    const indices: number[] = [];
    for (let i = 0; i < formatted.length; i++) {
      if (formatted[i].includes(componentClass)) {
        indices.push(i);
      }
    }
    if (indices.length === 0) continue;
    anyFound = true;

    const originalSubset = indices.map(i => originals[i]);
    const previousSubset = indices.map(i => formatted[i]);

    let regenPrompt = `RE-FORMAT REQUEST: The paragraphs below were previously formatted using "${componentClass}". Produce a COMPLETELY DIFFERENT visual treatment.

PREVIOUS OUTPUT (do NOT repeat this — make something that looks DIFFERENT):
${JSON.stringify(Object.fromEntries(previousSubset.map((p, i) => [i, p])))}

Creative freedom:
- Use ANY combination of classes from your toolkit
- Try completely different structures
- Change the layout, grouping, and visual hierarchy
- Be creative and surprising`;

    if (userInstruction) {
      regenPrompt += `\n\nUSER REQUEST: ${userInstruction}`;
    }

    const messages: OpenRouterMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Book: "${bookTitle}"\n\n${regenPrompt}\n\nOriginal paragraphs to re-format (indices 0-${originalSubset.length - 1}). Return ONLY modified ones as {index: html}:\n${JSON.stringify(Object.fromEntries(originalSubset.map((p, i) => [i, p])))}`,
      },
    ];

    try {
      const response = await chatWithPreset(apiKey, "format-regen", messages, overrides);

      const content = response.choices?.[0]?.message?.content;
      if (!content) continue;

      const result = parseFormattingResponse(content, originalSubset.length, originalSubset);
      if (!result) continue;

      const chapterUpdates: Record<number, string> = {};
      for (let j = 0; j < indices.length; j++) {
        if (result[j] === originalSubset[j]) continue;
        chapterUpdates[indices[j]] = result[j];
      }
      if (Object.keys(chapterUpdates).length > 0) {
        allUpdates[chKey] = chapterUpdates;
      }
    } catch (err) {
      console.error(`Regenerate rule failed for chapter ${chKey}:`, err);
    }
  }

  if (!anyFound) return null;
  return Object.keys(allUpdates).length > 0 ? allUpdates : null;
}
