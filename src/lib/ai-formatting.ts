/* ── AI Formatting — prompt building, parsing, orchestration ── */

import type { BookChapter } from "@/app/reader/lib/types";
import type { OpenRouterMessage } from "./openrouter";
import { chatWithPreset } from "./openrouter";
import { parseOverrides, PRESET_OVERRIDES_KEY } from "./ai-presets";
import type { StyleDictionary } from "./ai-style-dictionary";
import { extractRulesFromFormatted, mergeRules, buildStyleContext, saveDictionary } from "./ai-style-dictionary";
import { buildClassReference } from "./ai-formatting-classes";

const PRESET_ID = "quick";
const CHUNK_SIZE = 40;
const MAX_SINGLE_CALL = 50;
const PARALLEL_CHUNKS = 3;

/** Any class starting with "ai-fmt-" is allowed — gives AI full creative freedom. */
const AI_FMT_PREFIX = "ai-fmt-";

const SYSTEM_RULES = `You are a book formatting AI. You receive a JSON object of HTML paragraphs (keyed by index) and return ONLY the ones you changed, as a JSON object mapping index → formatted HTML.

Read the content, understand the genre and tone, and apply visual enhancements from the CLASS REFERENCE below. Use your judgement — a literary novel needs different treatment than a game-lit novel. Adapt.

# RULES
1. Return {index: html} for modified paragraphs ONLY. Skip unchanged ones.
2. Use ONLY classes from the reference. No inline styles. No Unicode emoji.
3. Fix grammar/punctuation. Preserve tone, dialect, style.
4. Narration/dialogue: keep original text — don't rewrite or add content.
5. Structured data (stats, skills, tables): MAY restructure for clarity. Keep all info.
6. Most paragraphs stay as plain text — SKIP THEM.
7. Keep enhancements compact and inline. Don't dominate the page.
8. Consecutive structured paragraphs: merge into first index, set consumed indices to "".
9. Stat block labels: 1-2 words max, EVERY label gets an icon. Use icons to replace words.
10. Dialogue tags: use the CHARACTER'S ACTUAL NAME, never generic roles like "HERO"/"VILLAIN".
11. System messages: keep text SHORT and punchy.

# OUTPUT
Return ONLY valid JSON: {"0":"<div>...</div>","3":"<p>text</p>","4":""}. No markdown fences, no explanation.`;

/** Full system prompt = rules + generated class reference */
const SYSTEM_PROMPT = SYSTEM_RULES + "\n\n# CLASS REFERENCE\n" + buildClassReference();

/**
 * Build the messages array for the AI formatting call.
 * chunkOffset is the starting index of this chunk within the full chapter
 * (used so the AI returns correct 0-based indices within the chunk).
 */
export function buildFormattingPrompt(
  paragraphs: string[],
  bookTitle: string,
  chunkOffset: number = 0,
  styleContext: string = "",
): OpenRouterMessage[] {
  // Build indexed object so AI knows the indices
  const indexed: Record<number, string> = {};
  for (let i = 0; i < paragraphs.length; i++) {
    indexed[i] = paragraphs[i];
  }

  return [
    { role: "system", content: SYSTEM_PROMPT + styleContext },
    {
      role: "user",
      content: `Book: "${bookTitle}"\n\nFormat these ${paragraphs.length} paragraphs (indices 0-${paragraphs.length - 1}). Return ONLY modified ones as {index: html}:\n${JSON.stringify(indexed)}`,
    },
  ];
}

/**
 * Parse the AI response (sparse object format) into a full array of HTML strings.
 * The AI returns {index: html} for only modified paragraphs.
 * Unmodified paragraphs keep their original content.
 * Also supports legacy full-array format for backwards compatibility.
 */
export function parseFormattingResponse(
  response: string,
  expectedCount: number,
  originals?: string[],
): string[] | null {
  try {
    // Strip markdown fences if present
    let cleaned = response.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(cleaned);

    // Handle sparse object format: {index: html}
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

/**
 * Remove any class="..." values that don't start with "ai-fmt-".
 * This gives the AI full creative freedom within the ai-fmt namespace.
 */
function stripUnrecognizedClasses(html: string): string {
  return html.replace(/class="([^"]*)"/g, (_match, classes: string) => {
    const filtered = classes
      .split(/\s+/)
      .filter((c: string) => c && c.startsWith(AI_FMT_PREFIX))
      .join(" ");
    return filtered ? `class="${filtered}"` : "";
  });
}

/** Resolve user's preset overrides from settings. */
async function loadOverrides() {
  const raw = await window.electronAPI?.getSetting(PRESET_OVERRIDES_KEY);
  return parseOverrides(raw ?? null);
}

/**
 * Format a single chapter's content via AI.
 * Handles chunking for long chapters. Uses the "quick" preset.
 */
export interface FormatResult {
  paragraphs: string[];
  dictionary: StyleDictionary;
}

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

  const overrides = await loadOverrides();
  const styleContext = existingDictionary ? buildStyleContext(existingDictionary) : "";

  let formatted: string[] | null;

  // Small enough for a single call
  if (htmlParagraphs.length <= MAX_SINGLE_CALL) {
    formatted = await formatChunk(apiKey, overrides, htmlParagraphs, bookTitle, 0, styleContext);
  } else {
    // Build all chunks
    const chunks: { start: number; paragraphs: string[] }[] = [];
    for (let start = 0; start < htmlParagraphs.length; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, htmlParagraphs.length);
      chunks.push({ start, paragraphs: htmlParagraphs.slice(start, end) });
    }

    // Process in parallel batches
    const results = new Array<string[] | null>(chunks.length).fill(null);

    for (let batch = 0; batch < chunks.length; batch += PARALLEL_CHUNKS) {
      if (onAbortCheck?.()) return null;

      const batchChunks = chunks.slice(batch, batch + PARALLEL_CHUNKS);
      const batchResults = await Promise.all(
        batchChunks.map((c) => formatChunk(apiKey, overrides, c.paragraphs, bookTitle, c.start, styleContext)),
      );

      for (let j = 0; j < batchResults.length; j++) {
        if (!batchResults[j]) return null;
        results[batch + j] = batchResults[j];
      }
    }

    formatted = results.flatMap((r) => r!);
  }

  if (!formatted) return null;

  // Extract style rules from the formatted output
  const newRules = extractRulesFromFormatted(htmlParagraphs, formatted);
  const existingRules = existingDictionary?.rules ?? [];
  const mergedRules = mergeRules(existingRules, newRules);

  const dictionary: StyleDictionary = {
    rules: mergedRules,
    bookTitle,
    updatedAt: new Date().toISOString(),
  };

  // Persist dictionary if filePath provided
  if (filePath) {
    saveDictionary(filePath, dictionary);
  }

  return { paragraphs: formatted, dictionary };
}

const MAX_RETRIES = 2;

async function formatChunk(
  apiKey: string,
  overrides: Record<string, { model: string }>,
  paragraphs: string[],
  bookTitle: string,
  chunkOffset: number = 0,
  styleContext: string = "",
): Promise<string[] | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const messages = buildFormattingPrompt(paragraphs, bookTitle, chunkOffset, styleContext);
      const response = await chatWithPreset(
        apiKey, PRESET_ID, messages, overrides,
        { temperature: 0.3, max_tokens: 16384 },
      );

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
  return null;
}

/**
 * Regenerate a component across ALL chapters.
 * The AI gets the original text and full creative freedom to use any classes/structure.
 * Returns a map of chapterKey → { paragraphIndex → newHtml } for all affected chapters.
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

  // Collect ALL paragraphs across ALL chapters that use this component
  // Group by chapter so we can batch them
  const allUpdates: Record<string, Record<number, string>> = {};
  let anyFound = false;

  for (const [chKey, formatted] of Object.entries(formattedChapters)) {
    const chIdx = Number(chKey);
    const originals = bookContent.chapters[chIdx]?.htmlParagraphs;
    if (!originals || !formatted) continue;

    // Find indices in this chapter that use the component
    const indices: number[] = [];
    for (let i = 0; i < formatted.length; i++) {
      if (formatted[i].includes(componentClass)) {
        indices.push(i);
      }
    }
    if (indices.length === 0) continue;
    anyFound = true;

    // Get the original (unformatted) text for these paragraphs
    const originalSubset = indices.map(i => originals[i]);
    const previousSubset = indices.map(i => formatted[i]);

    let regenPrompt = `RE-FORMAT REQUEST: The paragraphs below were previously formatted using "${componentClass}". Produce a COMPLETELY DIFFERENT visual treatment.

PREVIOUS OUTPUT (do NOT repeat this — make something that looks DIFFERENT):
${JSON.stringify(Object.fromEntries(previousSubset.map((p, i) => [i, p])))}

Creative freedom:
- Use ANY combination of classes from your toolkit — you are not limited to "${componentClass}"
- Try completely different structures: if it was a stat-block, try system-msg + badges. If it was badges, try a stat-block or item-card. If it was a system-msg, try inline badges or a thought block.
- Change the layout, grouping, and visual hierarchy
- You can merge data, split it differently, use different icons
- You can leave paragraphs as plain text if that works better
- Be creative and surprising — don't default to the safe/obvious choice`;

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
      const response = await chatWithPreset(
        apiKey, PRESET_ID, messages, overrides,
        { temperature: 0.9, max_tokens: 16384 },
      );

      const content = response.choices?.[0]?.message?.content;
      if (!content) continue;

      const result = parseFormattingResponse(content, originalSubset.length, originalSubset);
      if (!result) continue;

      // Map back to original indices — only include actually changed paragraphs
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
