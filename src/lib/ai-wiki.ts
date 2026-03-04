/* ── AI Wiki — Data Model & Core Logic ─────────────────── */

import { chatWithPreset } from "./openrouter";
import { parseOverrides, PRESET_OVERRIDES_KEY } from "./ai-presets";
import {
  WIKI_SYSTEM_PROMPT,
  buildWikiUserPrompt,
  summarizeWikiForPrompt,
} from "./ai-wiki-prompt";

/* ── Types ──────────────────────────────────────────────── */

export type WikiEntryType = "character" | "item" | "location" | "event" | "concept";

export interface WikiEntryDetail {
  chapterIndex: number;
  content: string;
  category: string;
}

export interface WikiRelationship {
  targetId: string;
  relation: string;
  since: number;
}

export interface WikiEntry {
  id: string;
  name: string;
  type: WikiEntryType;
  aliases: string[];
  shortDescription: string;
  description: string;
  firstAppearance: number;
  chapterAppearances: number[];
  details: WikiEntryDetail[];
  relationships: WikiRelationship[];
  color: string;
}

export interface BookWiki {
  bookTitle: string;
  filePath: string;
  entries: Record<string, WikiEntry>;
  processedChapters: number[];
  updatedAt: string;
}

/* ── AI Response Types ──────────────────────────────────── */

interface AINewEntry {
  id: string;
  name: string;
  type: WikiEntryType;
  aliases?: string[];
  shortDescription: string;
  description: string;
  firstAppearance: number;
  details?: WikiEntryDetail[];
  relationships?: WikiRelationship[];
  color?: string;
}

interface AIUpdate {
  id: string;
  newAliases?: string[];
  descriptionAppend?: string;
  details?: WikiEntryDetail[];
  relationships?: WikiRelationship[];
}

interface AIWikiResponse {
  new_entries: AINewEntry[];
  updates: AIUpdate[];
}

/* ── Color mapping ──────────────────────────────────────── */

const TYPE_COLORS: Record<WikiEntryType, string> = {
  character: "blue",
  item: "amber",
  location: "emerald",
  event: "rose",
  concept: "violet",
};

/* ── Core Functions ─────────────────────────────────────── */

/**
 * Generate wiki entries for a single chapter by calling the AI.
 */
export async function generateWikiForChapter(
  chapterIndex: number,
  chapterText: string,
  bookTitle: string,
  existingWiki: BookWiki,
  isAborted: () => boolean,
): Promise<BookWiki> {
  const apiKey = await window.electronAPI?.getSetting("openrouterApiKey");
  if (!apiKey) throw new Error("No API key configured");

  if (existingWiki.processedChapters.includes(chapterIndex)) {
    return existingWiki;
  }

  const summary = summarizeWikiForPrompt(existingWiki.entries);
  const userPrompt = buildWikiUserPrompt(chapterIndex, chapterText, bookTitle, summary);

  const overrides = parseOverrides(
    (await window.electronAPI?.getSetting(PRESET_OVERRIDES_KEY)) ?? null,
  );

  const response = await chatWithPreset(
    apiKey,
    "quick",
    [
      { role: "system", content: WIKI_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    overrides,
    { max_tokens: 8192 },
  );

  if (isAborted()) return existingWiki;

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) return existingWiki;

  const parsed = parseWikiResponse(content);
  if (!parsed) return existingWiki;

  return mergeWikiEntries(existingWiki, parsed, chapterIndex);
}

/**
 * Parse AI response JSON, handling common issues including truncated output.
 */
export function parseWikiResponse(raw: string): AIWikiResponse | null {
  // Strip markdown code fences if present
  let cleaned = raw;
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1];
  cleaned = cleaned.trim();

  // Try direct parse first
  const direct = tryParseJSON(cleaned);
  if (direct) return validateWikiResponse(direct);

  // Response was likely truncated — try to salvage by repairing JSON
  const repaired = repairTruncatedJSON(cleaned);
  if (repaired) {
    const parsed = tryParseJSON(repaired);
    if (parsed) {
      console.warn("Wiki response was truncated, salvaged partial data");
      return validateWikiResponse(parsed);
    }
  }

  console.error("Failed to parse wiki response:", raw.slice(0, 300));
  return null;
}

function tryParseJSON(s: string): AIWikiResponse | null {
  try {
    return JSON.parse(s) as AIWikiResponse;
  } catch {
    return null;
  }
}

function validateWikiResponse(parsed: AIWikiResponse): AIWikiResponse {
  if (!Array.isArray(parsed.new_entries)) parsed.new_entries = [];
  if (!Array.isArray(parsed.updates)) parsed.updates = [];

  // Filter out incomplete entries (missing required fields)
  parsed.new_entries = parsed.new_entries.filter(
    (e) => e && typeof e.id === "string" && typeof e.name === "string",
  );
  parsed.updates = parsed.updates.filter(
    (u) => u && typeof u.id === "string",
  );

  return parsed;
}

/**
 * Attempt to repair truncated JSON by closing open brackets/braces.
 * Handles cases where the AI output was cut off mid-response.
 */
function repairTruncatedJSON(s: string): string | null {
  // Remove any trailing incomplete string value (cut mid-string)
  let repaired = s.replace(/,\s*"[^"]*$/, ""); // trailing key without value
  repaired = repaired.replace(/,\s*$/, ""); // trailing comma
  repaired = repaired.replace(/:\s*"[^"]*$/, ': ""'); // cut mid-string-value

  // Count open/close brackets and braces
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (const ch of repaired) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }

  // Close any open strings
  if (inString) repaired += '"';

  // Close open brackets and braces
  while (brackets > 0) { repaired += "]"; brackets--; }
  while (braces > 0) { repaired += "}"; braces--; }

  return repaired;
}

/**
 * Merge AI response into existing wiki state.
 */
export function mergeWikiEntries(
  wiki: BookWiki,
  response: AIWikiResponse,
  chapterIndex: number,
): BookWiki {
  const entries = { ...wiki.entries };

  // Process new entries
  for (const entry of response.new_entries) {
    const id = entry.id;
    if (!id || entries[id]) continue; // Skip if already exists

    const type = validateType(entry.type);
    entries[id] = {
      id,
      name: entry.name || id,
      type,
      aliases: Array.isArray(entry.aliases) ? entry.aliases : [],
      shortDescription: entry.shortDescription || "",
      description: entry.description || "",
      firstAppearance: entry.firstAppearance ?? chapterIndex,
      chapterAppearances: [chapterIndex],
      details: Array.isArray(entry.details) ? entry.details : [],
      relationships: Array.isArray(entry.relationships) ? entry.relationships : [],
      color: entry.color || TYPE_COLORS[type] || "blue",
    };
  }

  // Process updates to existing entries
  for (const update of response.updates) {
    const existing = entries[update.id];
    if (!existing) continue;

    // Add chapter to appearances if not already there
    if (!existing.chapterAppearances.includes(chapterIndex)) {
      existing.chapterAppearances = [...existing.chapterAppearances, chapterIndex].sort(
        (a, b) => a - b,
      );
    }

    // Add new aliases
    if (Array.isArray(update.newAliases)) {
      const aliasSet = new Set(existing.aliases);
      for (const alias of update.newAliases) {
        if (alias && !aliasSet.has(alias)) {
          aliasSet.add(alias);
        }
      }
      existing.aliases = Array.from(aliasSet);
    }

    // Append description
    if (update.descriptionAppend) {
      existing.description = existing.description
        ? `${existing.description}\n\n${update.descriptionAppend}`
        : update.descriptionAppend;
    }

    // Add new details
    if (Array.isArray(update.details)) {
      existing.details = [...existing.details, ...update.details];
    }

    // Add new relationships (avoid duplicates)
    if (Array.isArray(update.relationships)) {
      const existingRelKeys = new Set(
        existing.relationships.map((r) => `${r.targetId}:${r.relation}`),
      );
      for (const rel of update.relationships) {
        const key = `${rel.targetId}:${rel.relation}`;
        if (!existingRelKeys.has(key)) {
          existing.relationships = [...existing.relationships, rel];
          existingRelKeys.add(key);
        }
      }
    }
  }

  return {
    ...wiki,
    entries,
    processedChapters: [...wiki.processedChapters, chapterIndex].sort((a, b) => a - b),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get an entry's description filtered to only include knowledge up to a given chapter.
 * Prevents spoilers when showing tooltips.
 */
export function getEntryAtChapter(
  entry: WikiEntry,
  maxChapter: number,
): { shortDescription: string; details: WikiEntryDetail[]; relationships: WikiRelationship[] } {
  return {
    shortDescription: entry.firstAppearance <= maxChapter ? entry.shortDescription : "",
    details: entry.details.filter((d) => d.chapterIndex <= maxChapter),
    relationships: entry.relationships.filter((r) => r.since <= maxChapter),
  };
}

/**
 * Create an empty BookWiki for a new book.
 */
export function createEmptyWiki(bookTitle: string, filePath: string): BookWiki {
  return {
    bookTitle,
    filePath,
    entries: {},
    processedChapters: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Load wiki from settings storage.
 */
export async function loadWiki(filePath: string): Promise<BookWiki | null> {
  const raw = await window.electronAPI?.getSetting(`wiki:${filePath}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BookWiki;
  } catch {
    return null;
  }
}

/**
 * Save wiki to settings storage.
 */
export async function saveWiki(wiki: BookWiki): Promise<void> {
  await window.electronAPI?.setSetting(`wiki:${wiki.filePath}`, JSON.stringify(wiki));
}

/**
 * Build a list of all entity names and aliases for text matching.
 */
export function buildEntityIndex(
  wiki: BookWiki,
): Array<{ id: string; name: string; type: WikiEntryType; color: string }> {
  const results: Array<{ id: string; name: string; type: WikiEntryType; color: string }> = [];

  for (const entry of Object.values(wiki.entries)) {
    // Primary name
    results.push({ id: entry.id, name: entry.name, type: entry.type, color: entry.color });
    // Aliases
    for (const alias of entry.aliases) {
      results.push({ id: entry.id, name: alias, type: entry.type, color: entry.color });
    }
  }

  // Sort by name length descending so longer names match first
  results.sort((a, b) => b.name.length - a.name.length);
  return results;
}

/* ── Helpers ────────────────────────────────────────────── */

const VALID_TYPES: WikiEntryType[] = ["character", "item", "location", "event", "concept"];

function validateType(t: string): WikiEntryType {
  return VALID_TYPES.includes(t as WikiEntryType) ? (t as WikiEntryType) : "concept";
}
