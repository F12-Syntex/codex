/* ── AI Wiki — DB-backed Core Logic ───────────────────── */

import { chatWithPreset } from "./openrouter";
import { parseOverrides, PRESET_OVERRIDES_KEY } from "./ai-presets";
import {
  WIKI_SYSTEM_PROMPT,
  buildWikiUserPrompt,
  buildTieredContext,
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

/** Lightweight entry for display (assembled from DB queries) */
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
  significance: number;
  status: string;
}

export interface WikiArc {
  id: string;
  name: string;
  description: string;
  arcType: string;
  status: string;
  startChapter: number;
  endChapter: number | null;
}

export interface WikiArcBeat {
  chapterIndex: number;
  beatType: string;
  description: string;
}

export interface ChapterSummary {
  chapterIndex: number;
  summary: string;
  keyEvents: string;
  activeEntities: string;
  mood: string;
}

/* ── AI Response Types ──────────────────────────────────── */

interface AIChapterSummary {
  summary: string;
  mood: string;
  key_events: string[];
}

interface AIArcUpdate {
  arc_id: string;
  status: string;
  beat: { beat_type: string; description: string };
}

interface AINewArc {
  id: string;
  name: string;
  arc_type: string;
  description: string;
  entities?: { entry_id: string; role: string }[];
  initial_beat: { beat_type: string; description: string };
}

interface AINewEntry {
  id: string;
  name: string;
  type: WikiEntryType;
  aliases?: string[];
  shortDescription: string;
  description: string;
  significance?: number;
  status?: string;
  firstAppearance?: number;
  details?: WikiEntryDetail[];
  relationships?: WikiRelationship[];
  color?: string;
}

interface AIUpdate {
  id: string;
  newAliases?: string[];
  descriptionAppend?: string;
  significance?: number;
  status?: string;
  details?: WikiEntryDetail[];
  relationships?: WikiRelationship[];
}

interface AIArcAmendment {
  action: "merge" | "delete";
  // For merge
  source_arc_ids?: string[];
  target_arc_id?: string;
  // For delete
  arc_id?: string;
  reason?: string;
}

interface AIWikiResponse {
  chapter_summary?: AIChapterSummary;
  arc_updates?: AIArcUpdate[];
  new_arcs?: AINewArc[];
  arc_amendments?: AIArcAmendment[];
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

const VALID_TYPES: WikiEntryType[] = ["character", "item", "location", "event", "concept"];

function validateType(t: string): WikiEntryType {
  return VALID_TYPES.includes(t as WikiEntryType) ? (t as WikiEntryType) : "concept";
}

/* ── Core: Generate Wiki for Chapter (DB-backed) ────────── */

export async function generateWikiForChapter(
  chapterIndex: number,
  chapterText: string,
  bookTitle: string,
  filePath: string,
  isAborted: () => boolean,
): Promise<void> {
  const api = window.electronAPI;
  if (!api) return;

  const apiKey = await api.getSetting("openrouterApiKey");
  if (!apiKey) throw new Error("No API key configured");

  // Skip chapters with embedded images or excessive size
  if (chapterText.includes("data:image/") || chapterText.includes("base64,") || chapterText.length > 500_000) {
    console.warn(`Skipping wiki analysis for chapter ${chapterIndex}: contains images or too large`);
    await api.wikiMarkProcessed(filePath, chapterIndex);
    return;
  }

  // Check if already processed
  const processed = await api.wikiGetProcessed(filePath);
  if (processed.includes(chapterIndex)) return;

  // Ensure meta exists
  await api.wikiUpsertMeta(filePath, bookTitle);

  // Build tiered context from DB
  const context = await buildContextFromDB(filePath, chapterIndex);

  const userPrompt = buildWikiUserPrompt(chapterIndex, chapterText, bookTitle, context);

  const overrides = parseOverrides(
    (await api.getSetting(PRESET_OVERRIDES_KEY)) ?? null,
  );

  const response = await chatWithPreset(
    apiKey,
    "quick",
    [
      { role: "system", content: WIKI_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    overrides,
    { max_tokens: 16384 },
  );

  if (isAborted()) return;

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) return;

  const parsed = parseWikiResponse(content);
  if (!parsed) return;

  if (isAborted()) return;

  // Write results to DB
  await writeResponseToDB(filePath, chapterIndex, parsed);
}

/* ── Build tiered context from DB ───────────────────────── */

async function buildContextFromDB(
  filePath: string,
  currentChapter: number,
) {
  const api = window.electronAPI!;

  // Recent summaries (last 8 chapters for better continuity)
  const fromCh = Math.max(0, currentChapter - 8);
  const recentSummaries = currentChapter > 0
    ? await api.wikiGetChapterSummaries(filePath, fromCh, currentChapter - 1)
    : [];

  // ALL entries — the AI needs to know about all tracked entities
  const allEntries = await api.wikiGetEntries(filePath);

  // Build rich entity roster: all entities with significance >= 2, or recent ones
  const recentEntityRows = await api.wikiGetRecentEntities(filePath, 8, currentChapter - 1);
  const recentEntityIds = new Set(recentEntityRows.map((e) => e.id));

  // Combine: recent entities + all significant entities (deduped)
  const rosterEntries = [...recentEntityRows];
  for (const e of allEntries) {
    if (!recentEntityIds.has(e.id) && e.significance >= 2) {
      rosterEntries.push(e);
    }
  }

  // Get relationships for roster entities
  const recentRelationships = new Map<string, { target_name: string; relation: string }[]>();
  const nameMap = new Map(allEntries.map((e) => [e.id, e.name]));

  for (const e of rosterEntries) {
    const rels = await api.wikiGetRelationships(filePath, e.id, currentChapter - 1);
    if (rels.length > 0) {
      recentRelationships.set(
        e.id,
        rels.slice(0, 3).map((r) => ({
          target_name: (r.source_id === e.id ? nameMap.get(r.target_id) : nameMap.get(r.source_id)) ?? r.target_id,
          relation: r.relation,
        })),
      );
    }
  }

  // Active arcs
  const activeArcRows = await api.wikiGetActiveArcs(filePath);
  const activeArcs = await Promise.all(
    activeArcRows.map(async (a) => {
      const beats = await api.wikiGetArcBeats(filePath, a.id);
      const latestBeat = beats.length > 0 ? beats[beats.length - 1] : null;
      return {
        id: a.id,
        name: a.name,
        arc_type: a.arc_type,
        status: a.status,
        description: a.description,
        latestBeat: latestBeat ? `[${latestBeat.beat_type}] ${latestBeat.description}` : undefined,
      };
    }),
  );

  // Entity index includes short description so AI can recognize characters
  const entityIndex = await api.wikiGetEntityIndex(filePath);

  return buildTieredContext({
    recentSummaries: recentSummaries.map((s) => ({
      chapter_index: s.chapter_index,
      summary: s.summary,
      mood: s.mood,
    })),
    recentEntities: rosterEntries.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      short_description: e.short_description,
      significance: e.significance,
      status: e.status,
    })),
    recentRelationships,
    activeArcs,
    entityIndex: entityIndex.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      short_description: (allEntries.find((a) => a.id === e.id)?.short_description) ?? "",
    })),
  });
}

/* ── Write AI response to DB ────────────────────────────── */

async function writeResponseToDB(
  filePath: string,
  chapterIndex: number,
  response: AIWikiResponse,
): Promise<void> {
  const api = window.electronAPI!;

  // Chapter summary
  if (response.chapter_summary) {
    await api.wikiUpsertChapterSummary(filePath, {
      chapterIndex,
      summary: response.chapter_summary.summary,
      keyEvents: (response.chapter_summary.key_events ?? []).join(","),
      activeEntities: "",
      mood: response.chapter_summary.mood ?? "",
    });
  }

  // New entries
  for (const entry of response.new_entries) {
    if (!entry.id || !entry.name) continue;
    const type = validateType(entry.type);

    await api.wikiUpsertEntry({
      id: entry.id,
      filePath,
      name: entry.name,
      type,
      shortDescription: entry.shortDescription || "",
      description: entry.description || "",
      color: entry.color || TYPE_COLORS[type] || "blue",
      firstAppearance: entry.firstAppearance ?? chapterIndex,
      significance: entry.significance ?? 1,
      status: entry.status ?? "active",
    });

    if (entry.aliases && entry.aliases.length > 0) {
      await api.wikiAddAliases(filePath, entry.id, entry.aliases);
    }

    if (entry.details && entry.details.length > 0) {
      await api.wikiAddDetails(filePath, entry.id, entry.details);
    }

    if (entry.relationships) {
      for (const rel of entry.relationships) {
        await api.wikiAddRelationship(filePath, {
          sourceId: entry.id,
          targetId: rel.targetId,
          relation: rel.relation,
          sinceChapter: rel.since ?? chapterIndex,
        });
      }
    }

    await api.wikiAddAppearance(filePath, entry.id, chapterIndex);
  }

  // Updates to existing entries
  for (const update of response.updates) {
    if (!update.id) continue;

    // Check entry exists
    const existing = await api.wikiGetEntry(filePath, update.id);
    if (!existing) continue;

    // Update entry fields if needed
    if (update.significance || update.status || update.descriptionAppend) {
      await api.wikiUpsertEntry({
        id: existing.id,
        filePath,
        name: existing.name,
        type: existing.type,
        shortDescription: existing.short_description,
        description: update.descriptionAppend
          ? (existing.description ? `${existing.description}\n\n${update.descriptionAppend}` : update.descriptionAppend)
          : existing.description,
        color: existing.color,
        firstAppearance: existing.first_appearance,
        significance: update.significance ?? existing.significance,
        status: update.status ?? existing.status,
      });
    }

    if (update.newAliases && update.newAliases.length > 0) {
      await api.wikiAddAliases(filePath, update.id, update.newAliases);
    }

    if (update.details && update.details.length > 0) {
      await api.wikiAddDetails(filePath, update.id, update.details);
    }

    if (update.relationships) {
      for (const rel of update.relationships) {
        await api.wikiAddRelationship(filePath, {
          sourceId: update.id,
          targetId: rel.targetId,
          relation: rel.relation,
          sinceChapter: rel.since ?? chapterIndex,
        });
      }
    }

    await api.wikiAddAppearance(filePath, update.id, chapterIndex);
  }

  // Arc updates
  if (response.arc_updates) {
    for (const arcUpdate of response.arc_updates) {
      if (!arcUpdate.arc_id) continue;
      // Update arc status
      const existingArcs = await api.wikiGetAllArcs(filePath);
      const arc = existingArcs.find((a) => a.id === arcUpdate.arc_id);
      if (!arc) continue;

      await api.wikiUpsertArc(filePath, {
        id: arc.id,
        name: arc.name,
        description: arc.description,
        arcType: arc.arc_type,
        status: arcUpdate.status ?? arc.status,
        startChapter: arc.start_chapter,
        endChapter: (arcUpdate.status === "resolved" || arcUpdate.status === "abandoned") ? chapterIndex : arc.end_chapter,
      });

      if (arcUpdate.beat) {
        await api.wikiAddArcBeat(filePath, arcUpdate.arc_id, {
          chapterIndex,
          beatType: arcUpdate.beat.beat_type,
          description: arcUpdate.beat.description,
        });
      }
    }
  }

  // New arcs
  if (response.new_arcs) {
    for (const newArc of response.new_arcs) {
      if (!newArc.id || !newArc.name) continue;

      await api.wikiUpsertArc(filePath, {
        id: newArc.id,
        name: newArc.name,
        description: newArc.description || "",
        arcType: newArc.arc_type || "plot",
        status: "setup",
        startChapter: chapterIndex,
      });

      if (newArc.initial_beat) {
        await api.wikiAddArcBeat(filePath, newArc.id, {
          chapterIndex,
          beatType: newArc.initial_beat.beat_type,
          description: newArc.initial_beat.description,
        });
      }

      if (newArc.entities) {
        for (const ent of newArc.entities) {
          if (ent.entry_id) {
            await api.wikiAddArcEntity(filePath, newArc.id, ent.entry_id, ent.role || "");
          }
        }
      }
    }
  }

  // Arc amendments (merge/delete)
  if (response.arc_amendments) {
    for (const amendment of response.arc_amendments) {
      if (amendment.action === "merge" && amendment.source_arc_ids && amendment.target_arc_id) {
        await api.wikiMergeArcs(filePath, amendment.source_arc_ids, amendment.target_arc_id);
      } else if (amendment.action === "delete" && amendment.arc_id) {
        await api.wikiDeleteArc(filePath, amendment.arc_id);
      }
    }
  }

  // Mark chapter processed
  await api.wikiMarkProcessed(filePath, chapterIndex);
}

/* ── Parse AI Response ──────────────────────────────────── */

export function parseWikiResponse(raw: string): AIWikiResponse | null {
  let cleaned = raw;
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1];
  cleaned = cleaned.trim();

  const direct = tryParseJSON(cleaned);
  if (direct) return validateWikiResponse(direct);

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
  if (!Array.isArray(parsed.arc_updates)) parsed.arc_updates = [];
  if (!Array.isArray(parsed.new_arcs)) parsed.new_arcs = [];
  if (!Array.isArray(parsed.arc_amendments)) parsed.arc_amendments = [];

  parsed.new_entries = parsed.new_entries.filter(
    (e) => e && typeof e.id === "string" && typeof e.name === "string",
  );
  parsed.updates = parsed.updates.filter(
    (u) => u && typeof u.id === "string",
  );

  return parsed;
}

function repairTruncatedJSON(s: string): string | null {
  let repaired = s;

  // Remove trailing incomplete key-value pairs (truncated mid-string)
  // e.g. ..."summary": "Some text that got cut off
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, "");
  // Truncated mid-key
  repaired = repaired.replace(/,\s*"[^"]*$/, "");
  // Truncated after colon
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*$/, "");
  // Trailing comma
  repaired = repaired.replace(/,\s*$/, "");

  // Count braces/brackets to close them
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

  // Close unclosed string
  if (inString) {
    // Find the last quote and truncate the partial string value cleanly
    const lastQuote = repaired.lastIndexOf('"');
    if (lastQuote > 0) {
      // Check if this is a value string (after a colon) — close it
      repaired += '"';
    }
  }

  // Re-count after potential string closure
  braces = 0; brackets = 0; inString = false; escaped = false;
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

  // Remove trailing comma before closing brackets/braces
  repaired = repaired.replace(/,\s*$/, "");

  while (brackets > 0) { repaired += "]"; brackets--; }
  while (braces > 0) { repaired += "}"; braces--; }

  return repaired;
}

/* ── Fetch full entry from DB (for display) ─────────────── */

export async function fetchWikiEntry(filePath: string, entryId: string, maxChapter?: number): Promise<WikiEntry | null> {
  const api = window.electronAPI;
  if (!api) return null;

  const row = await api.wikiGetEntry(filePath, entryId);
  if (!row) return null;

  const [aliases, details, relationships, appearances] = await Promise.all([
    api.wikiGetAliases(filePath, entryId),
    api.wikiGetDetails(filePath, entryId, maxChapter),
    api.wikiGetRelationships(filePath, entryId, maxChapter),
    api.wikiGetAppearances(filePath, entryId),
  ]);

  return {
    id: row.id,
    name: row.name,
    type: row.type as WikiEntryType,
    aliases,
    shortDescription: row.short_description,
    description: row.description,
    firstAppearance: row.first_appearance,
    chapterAppearances: maxChapter != null ? appearances.filter((c) => c <= maxChapter) : appearances,
    details: details.map((d) => ({
      chapterIndex: d.chapter_index,
      content: d.content,
      category: d.category,
    })),
    relationships: relationships
      .filter((r) => r.source_id === entryId)
      .map((r) => ({
        targetId: r.target_id,
        relation: r.relation,
        since: r.since_chapter,
      })),
    color: row.color,
    significance: row.significance,
    status: row.status,
  };
}

/**
 * Get an entry's data filtered to only knowledge up to a given chapter.
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

/* ── Entity Index for Text Highlighting ────────────────── */

export function buildEntityIndexFromDB(
  entityIndex: { id: string; name: string; type: string; color: string; aliases: string[] }[],
): Array<{ id: string; name: string; type: WikiEntryType; color: string }> {
  const results: Array<{ id: string; name: string; type: WikiEntryType; color: string }> = [];

  for (const entry of entityIndex) {
    results.push({ id: entry.id, name: entry.name, type: entry.type as WikiEntryType, color: entry.color });
    for (const alias of entry.aliases) {
      results.push({ id: entry.id, name: alias, type: entry.type as WikiEntryType, color: entry.color });
    }
  }

  results.sort((a, b) => b.name.length - a.name.length);
  return results;
}

/* ── Migration ──────────────────────────────────────────── */

export async function attemptMigration(filePath: string): Promise<boolean> {
  const api = window.electronAPI;
  if (!api) return false;
  return api.wikiMigrateJson(filePath);
}
