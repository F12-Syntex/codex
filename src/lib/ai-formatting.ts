/* ── AI Formatting — prompt building, parsing, orchestration ── */

import type { BookChapter } from "@/app/reader/lib/types";
import type { OpenRouterMessage } from "./openrouter";
import { chatWithPreset } from "./openrouter";
import { parseOverrides, PRESET_OVERRIDES_KEY } from "./ai-presets";
import type { StyleDictionary } from "./ai-style-dictionary";
import { extractRulesFromFormatted, mergeRules, buildStyleContext, saveDictionary } from "./ai-style-dictionary";

const PRESET_ID = "quick";
const CHUNK_SIZE = 40;
const MAX_SINGLE_CALL = 50;
const PARALLEL_CHUNKS = 3;

// All allowed CSS class names — used for validation
const ALLOWED_CLASSES = new Set([
  "ai-fmt-stat-block",
  "ai-fmt-stat-row",
  "ai-fmt-stat-label",
  "ai-fmt-stat-value",
  "ai-fmt-xp-badge",
  "ai-fmt-system-msg",
  "ai-fmt-item-card",
  "ai-fmt-item-name",
  "ai-fmt-rarity-common",
  "ai-fmt-rarity-uncommon",
  "ai-fmt-rarity-rare",
  "ai-fmt-rarity-epic",
  "ai-fmt-rarity-legendary",
  "ai-fmt-status-badge",
  "ai-fmt-status-buff",
  "ai-fmt-status-debuff",
  "ai-fmt-dialogue-villain",
  "ai-fmt-dialogue-divine",
  "ai-fmt-dialogue-hero",
  "ai-fmt-thought",
  "ai-fmt-sfx",
  "ai-fmt-reveal",
  "ai-fmt-icon",
  "ai-fmt-icon-sword",
  "ai-fmt-icon-shield",
  "ai-fmt-icon-sparkle",
  "ai-fmt-icon-zap",
  "ai-fmt-icon-scroll",
  "ai-fmt-icon-skull",
  "ai-fmt-icon-arrow-up",
  "ai-fmt-icon-gem",
  "ai-fmt-icon-trophy",
  "ai-fmt-icon-heart",
  "ai-fmt-icon-star",
  "ai-fmt-icon-flame",
  "ai-fmt-icon-eye",
  "ai-fmt-icon-crown",
  "ai-fmt-icon-book",
  "ai-fmt-icon-target",
  "ai-fmt-icon-plus",
  "ai-fmt-icon-user",
  "ai-fmt-icon-bolt",
]);

const SYSTEM_PROMPT = `You are a book formatting AI. You receive a JSON array of HTML paragraph strings and return ONLY the paragraphs you changed, as a JSON object mapping index → formatted HTML.

Read the content, understand the genre and tone, and decide what deserves visual enhancement. You have a toolkit of CSS classes below — use your judgement on what fits. A literary novel needs different treatment than a game-lit novel. Adapt.

# CONSTRAINTS
1. Return a JSON object where keys are paragraph indices (0-based) and values are the formatted HTML. ONLY include paragraphs you actually modified. Skip paragraphs that need no changes.
2. Only use the CSS classes listed below. No inline styles. No Unicode emoji.
3. Fix grammar and punctuation. Preserve tone, dialect, and style.
4. For narration and dialogue: keep original text — don't rewrite or add content.
5. For structured/game data (stats, skills, items, tables): you MAY restructure and abbreviate for clarity. Shorten labels, abbreviate skill names, split lists into badges. All original information must be preserved but the presentation can change.
6. Most paragraphs should stay as normal text — SKIP THEM (don't include in output). Only include paragraphs that genuinely benefit from enhancement or need grammar fixes.
7. Keep enhancements inline and compact. Don't make anything dominate the page.
8. If consecutive paragraphs form one structured block (like a stat table), merge into the first slot's index and set consumed slot indices to "".

# YOUR TOOLKIT

## Structured data → ai-fmt-stat-block
A full-width grid for key-value data. Use icons on EVERY label.
Structure: <div class="ai-fmt-stat-block"> containing rows of <div class="ai-fmt-stat-row"><span class="ai-fmt-stat-label"><span class="ai-fmt-icon ai-fmt-icon-NAME"></span>Label</span><span class="ai-fmt-stat-value">Value</span></div>

Rules for stat blocks:
- Keep labels to 1-2 words. Use icons to replace words where possible (heart icon instead of writing "Health").
- Numeric stats: put the number in the value column. If there are many numeric stats with short values, you can combine 2-3 per row separated by thin pipes: "1.5 | 1.4 | 1.6" with a combined label.
- Lists of skills/items/traits: do NOT put long comma lists in a stat-value cell. Instead, put each one as a separate <span class="ai-fmt-status-badge ai-fmt-status-buff">Skill Name</span> in the value cell, or break them out below the stat block as individual badges.
- Titles/ranks/evaluations: use an ai-fmt-xp-badge for the value.
- Names: use a short header row or put the name in an ai-fmt-reveal span above the block.

## Callout / notification → ai-fmt-system-msg
A subtle left-bordered box for any text that stands apart from narration: system messages, announcements, letters, signs, inscriptions, warnings, formal declarations, etc.

## Inline highlight → ai-fmt-xp-badge
A small inline pill for numeric gains, rewards, scores, rankings, or any short value worth calling out.

## Named item → ai-fmt-item-card + ai-fmt-item-name
A compact card for named things being introduced with descriptions: items, skills, spells, locations, etc. Use a rarity class on the name if a quality/tier applies:
ai-fmt-rarity-common, ai-fmt-rarity-uncommon, ai-fmt-rarity-rare, ai-fmt-rarity-epic, ai-fmt-rarity-legendary

## Inline tags → ai-fmt-status-badge
Tiny inline pills. Combine with ai-fmt-status-buff (positive) or ai-fmt-status-debuff (negative) for any status, condition, trait, or tag mentioned in text.

## Dialogue tags → ai-fmt-dialogue-villain / ai-fmt-dialogue-divine / ai-fmt-dialogue-hero
A tiny colored pill/tag placed BEFORE the quoted dialogue. Do NOT wrap the quote text itself — instead insert a <span class="ai-fmt-dialogue-hero">Zephyr</span> (using the CHARACTER'S NAME, not "HERO") right before the opening quote mark. The tag text MUST be the character's actual name (1-8 chars), never a generic role like "HERO", "VILLAIN", or "DIVINE". villain = antagonist/threatening characters, divine = otherworldly/authoritative/system voices, hero = protagonist and allies. Only tag truly notable dialogue — most quotes should stay untagged.

## Internal monologue → ai-fmt-thought
Left-bordered italic block for thoughts, reflections, or inner voice.

## Emphasis → ai-fmt-sfx
Bold treatment for impact words: sound effects, dramatic single words, etc.

## First mention → ai-fmt-reveal
Subtle background highlight for important names, titles, or concepts when first introduced.

## Icons — use on EVERY stat label, and on badges/items/headers
Add a <span class="ai-fmt-icon ai-fmt-icon-NAME"></span> before text. Every stat-label MUST have an icon. Also use on item names, system message headers, and badge text. Don't use on plain narration.
Available: sword (combat/attack), shield (defense/armor), sparkle (magic/special), zap (speed/energy), scroll (knowledge/lore), skull (death/danger), arrow-up (level/increase), gem (rarity/treasure), trophy (rank/achievement), heart (health/HP), star (rating/level), flame (fire/power), eye (perception/spirit), crown (royalty/authority), book (skills/learning), target (accuracy/focus), plus (gain/addition), user (character/name), bolt (agility/lightning).

# OUTPUT
Return ONLY a valid JSON object mapping indices to formatted strings, e.g. {"0":"<div>...</div>","3":"<p>fixed text</p>","4":""}. No markdown fences, no explanation. If nothing needs changing, return {}.`;

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
 * Remove any class="..." values that aren't in the allowed set.
 */
function stripUnrecognizedClasses(html: string): string {
  return html.replace(/class="([^"]*)"/g, (_match, classes: string) => {
    const filtered = classes
      .split(/\s+/)
      .filter((c: string) => c && ALLOWED_CLASSES.has(c))
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
