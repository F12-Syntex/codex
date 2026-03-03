/* ── AI Formatting — prompt building, parsing, orchestration ── */

import type { BookChapter } from "@/app/reader/lib/types";
import type { OpenRouterMessage } from "./openrouter";
import { chatWithPreset } from "./openrouter";
import { parseOverrides, PRESET_OVERRIDES_KEY } from "./ai-presets";

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

const SYSTEM_PROMPT = `You are a book formatting AI. You receive a JSON array of HTML paragraph strings and return a JSON array of the EXACT same length with enhanced formatting.

Read the content, understand the genre and tone, and decide what deserves visual enhancement. You have a toolkit of CSS classes below — use your judgement on what fits. A literary novel needs different treatment than a game-lit novel. Adapt.

# CONSTRAINTS
1. Return EXACTLY the same number of array entries as input.
2. Only use the CSS classes listed below. No inline styles. No Unicode emoji.
3. Fix grammar and punctuation. Preserve tone, dialect, and style.
4. Keep original text content — don't rewrite, paraphrase, or add narration.
5. Most paragraphs should stay as normal text with only grammar fixes. Only enhance what genuinely benefits from it.
6. Keep enhancements inline and compact. Don't make anything dominate the page.
7. If consecutive paragraphs form one structured block (like a stat table), merge into the first slot and return "" for consumed slots.

# YOUR TOOLKIT

## Structured data → ai-fmt-stat-block
A full-width grid for any key-value data: character stats, profiles, recipe ingredients, scores, specifications, etc.
Structure: <div class="ai-fmt-stat-block"> containing rows of <div class="ai-fmt-stat-row"><span class="ai-fmt-stat-label">Key</span><span class="ai-fmt-stat-value">Value</span></div>
Keep labels SHORT (1-2 words). For long value lists (like multiple skills), abbreviate or use comma-separated short names. Add an icon before each label where relevant.

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
A tiny colored pill/tag placed BEFORE the quoted dialogue. Do NOT wrap the quote text itself — instead insert a <span class="ai-fmt-dialogue-villain">VILLAIN</span> (or similar short label like the character's name/role) right before the opening quote mark. The tag text should be a short label (1-5 chars): a name, role, or archetype. villain = antagonist/threatening, divine = otherworldly/authoritative/system, hero = protagonist's key moments. Only tag truly notable dialogue — most quotes should stay untagged.

## Internal monologue → ai-fmt-thought
Left-bordered italic block for thoughts, reflections, or inner voice.

## Emphasis → ai-fmt-sfx
Bold treatment for impact words: sound effects, dramatic single words, etc.

## First mention → ai-fmt-reveal
Subtle background highlight for important names, titles, or concepts when first introduced.

## Icons — use freely on labels, stats, badges, and key terms
Add a <span class="ai-fmt-icon ai-fmt-icon-NAME"></span> before text. Use icons on stat labels, item names, system message headers, badge text, and any label that benefits from a visual cue. Don't overuse on plain narration.
Available: sword, shield, sparkle, zap, scroll, skull, arrow-up, gem, trophy, heart, star, flame, eye, crown, book, target, plus, user, bolt.

# OUTPUT
Return ONLY a valid JSON array of strings. No markdown fences, no explanation.`;

/**
 * Build the messages array for the AI formatting call.
 */
export function buildFormattingPrompt(
  paragraphs: string[],
  bookTitle: string,
): OpenRouterMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Book: "${bookTitle}"\n\nFormat these ${paragraphs.length} paragraphs:\n${JSON.stringify(paragraphs)}`,
    },
  ];
}

/**
 * Parse the AI response into an array of HTML strings.
 * Falls back to null on failure.
 */
export function parseFormattingResponse(
  response: string,
  expectedCount: number,
): string[] | null {
  try {
    // Strip markdown fences if present
    let cleaned = response.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;
    if (parsed.length !== expectedCount) return null;

    // Validate and sanitize each entry
    return parsed.map((entry: unknown) => {
      if (typeof entry !== "string") return "";
      return stripUnrecognizedClasses(entry);
    });
  } catch {
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
export async function formatChapterContent(
  apiKey: string,
  chapter: BookChapter,
  bookTitle: string,
  onAbortCheck?: () => boolean,
): Promise<string[] | null> {
  const { htmlParagraphs } = chapter;
  if (htmlParagraphs.length === 0) return [];

  const overrides = await loadOverrides();

  // Small enough for a single call
  if (htmlParagraphs.length <= MAX_SINGLE_CALL) {
    return formatChunk(apiKey, overrides, htmlParagraphs, bookTitle);
  }

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
      batchChunks.map((c) => formatChunk(apiKey, overrides, c.paragraphs, bookTitle)),
    );

    for (let j = 0; j < batchResults.length; j++) {
      if (!batchResults[j]) return null; // chunk failed — abort
      results[batch + j] = batchResults[j];
    }
  }

  return results.flatMap((r) => r!);
}

async function formatChunk(
  apiKey: string,
  overrides: Record<string, { model: string }>,
  paragraphs: string[],
  bookTitle: string,
): Promise<string[] | null> {
  try {
    const messages = buildFormattingPrompt(paragraphs, bookTitle);
    const response = await chatWithPreset(
      apiKey, PRESET_ID, messages, overrides,
      { temperature: 0.3, max_tokens: 16384 },
    );

    const content = response.choices?.[0]?.message?.content;
    if (!content) return null;

    return parseFormattingResponse(content, paragraphs.length);
  } catch (err) {
    console.error("AI formatting chunk failed:", err);
    return null;
  }
}
