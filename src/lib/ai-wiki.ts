/* ── AI Wiki — DB-backed Core Logic ───────────────────── */

import { chatWithPreset } from "./openrouter";
import { loadOverrides } from "./ai-presets";
import {
  WIKI_SYSTEM_PROMPT,
  buildWikiUserPrompt,
  buildWikiBatchUserPrompt,
  buildTieredContext,
  BATCH_TEXT_BUDGET,
  CHAPTER_TEXT_BUDGET,
  MAX_CHAPTERS_PER_BATCH,
} from "./ai-wiki-prompt";

/* ── Types ──────────────────────────────────────────────── */

export type WikiEntryType = "character" | "item" | "location" | "event" | "concept";

export interface WikiEntryDetail {
  chapterIndex: number;
  content: string;
  category: string;
  relevance: number;
  isSuperseded: boolean;
  supersededChapter?: number;
  sourceText: string;
}

export interface WikiAliasDetailed {
  alias: string;
  alias_type: string; // 'name' | 'title' | 'epithet' | 'nickname' | 'honorific'
  relevance: number;  // 1-5
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
  aliases: WikiAliasDetailed[];
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

// AI response can send aliases as plain strings (legacy) or structured objects
type AIAliasInput = string | { alias: string; type?: string; alias_type?: string; relevance?: number };

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
  aliases?: AIAliasInput[];
  shortDescription: string;
  description: string;
  significance?: number;
  status?: string;
  firstAppearance?: number;
  details?: { chapterIndex: number; content: string; category: string; relevance?: number; source?: string }[];
  relationships?: WikiRelationship[];
  color?: string;
}

interface AISupersede {
  category: string;
  reason?: string;
}

interface AIUpdate {
  id: string;
  newAliases?: AIAliasInput[];
  descriptionAppend?: string;
  significance?: number;
  status?: string;
  details?: { chapterIndex: number; content: string; category: string; relevance?: number; source?: string }[];
  relationships?: WikiRelationship[];
  supersede?: AISupersede[];
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

interface AIMCStat {
  key: string;
  category: string;
  name: string;
  value: string | null;
  is_active: boolean;
}

interface AIWikiChapterData {
  chapter_index: number;
  chapter_summary?: AIChapterSummary;
  arc_updates?: AIArcUpdate[];
  new_arcs?: AINewArc[];
  arc_amendments?: AIArcAmendment[];
  new_entries: AINewEntry[];
  updates: AIUpdate[];
  mc_stats?: AIMCStat[];
}

interface AIWikiResponse {
  // MC protagonist entity ID (set once when identified)
  mc_entity_id?: string;
  // New batch format
  batch?: AIWikiChapterData[];
  // Legacy single-chapter fields (for backwards compat)
  chapter_summary?: AIChapterSummary;
  arc_updates?: AIArcUpdate[];
  new_arcs?: AINewArc[];
  arc_amendments?: AIArcAmendment[];
  new_entries?: AINewEntry[];
  updates?: AIUpdate[];
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
  force = false,
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

  // Check if already processed (skipped when force=true for retry)
  if (!force) {
    const processed = await api.wikiGetProcessed(filePath);
    if (processed.includes(chapterIndex)) return;
  }

  // Ensure meta exists
  await api.wikiUpsertMeta(filePath, bookTitle);

  // Build tiered context from DB
  const context = await buildContextFromDB(filePath, chapterIndex);

  const userPrompt = buildWikiUserPrompt(chapterIndex, chapterText, bookTitle, context);

  const overrides = await loadOverrides();

  const response = await chatWithPreset(
    apiKey,
    "quick",
    [
      { role: "system", content: WIKI_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    overrides,
  );

  if (isAborted()) return;

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) return;

  const parsed = parseWikiResponse(content);
  if (!parsed) return;

  if (isAborted()) return;

  // Set MC entity ID if identified
  if (parsed.mc_entity_id) {
    await api.wikiSetMCEntityId(filePath, parsed.mc_entity_id);
  }

  // Write results to DB
  const chapterDataList = getChapterDataFromResponse(parsed, chapterIndex);
  for (const chapterData of chapterDataList) {
    if (isAborted()) return;
    await writeResponseToDB(filePath, chapterData.chapter_index, chapterData);
  }
}

/** Process multiple chapters in a single AI call for efficiency */
export async function generateWikiForChapterBatch(
  chapters: { index: number; text: string }[],
  bookTitle: string,
  filePath: string,
  isAborted: () => boolean,
): Promise<number[]> {
  if (chapters.length === 0) return [];

  const api = window.electronAPI;
  if (!api) return [];

  const apiKey = await api.getSetting("openrouterApiKey");
  if (!apiKey) throw new Error("No API key configured");

  await api.wikiUpsertMeta(filePath, bookTitle);

  const firstIndex = chapters[0].index;
  const context = await buildContextFromDB(filePath, firstIndex);
  const userPrompt = buildWikiBatchUserPrompt(chapters, bookTitle, context);

  const overrides = await loadOverrides();
  const response = await chatWithPreset(
    apiKey,
    "quick",
    [
      { role: "system", content: WIKI_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    overrides,
  );

  if (isAborted()) return [];

  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) return [];

  const parsed = parseWikiResponse(content);
  if (!parsed) return [];

  if (isAborted()) return [];

  // Set MC entity ID if identified
  if (parsed.mc_entity_id) {
    await api.wikiSetMCEntityId(filePath, parsed.mc_entity_id);
  }

  const chapterDataList = getChapterDataFromResponse(parsed, firstIndex);
  const processed: number[] = [];

  for (const chapterData of chapterDataList) {
    if (isAborted()) break;
    await writeResponseToDB(filePath, chapterData.chapter_index, chapterData);
    processed.push(chapterData.chapter_index);
  }

  return processed;
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

  // Fetch aliases for roster entities (use string forms for AI context)
  const rosterAliases = new Map<string, string[]>();
  for (const e of rosterEntries) {
    const aliases = await api.wikiGetAliases(filePath, e.id);
    const relevant = aliases.filter((a) => a.relevance >= 3).map((a) => a.alias);
    if (relevant.length > 0) rosterAliases.set(e.id, relevant);
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
      aliases: rosterAliases.get(e.id),
    })),
    recentRelationships,
    activeArcs,
    entityIndex: entityIndex.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      short_description: (allEntries.find((a) => a.id === e.id)?.short_description) ?? "",
      aliases: e.aliases,
    })),
  });
}

/** Normalize AI alias inputs (string or object) into the DB-compatible format */
function normalizeAliases(aliases: AIAliasInput[]): Array<{ alias: string; alias_type: string; relevance: number }> {
  return aliases.map((a) => {
    if (typeof a === "string") return { alias: a, alias_type: "name", relevance: 3 };
    return {
      alias: a.alias,
      alias_type: a.alias_type ?? a.type ?? "name",
      relevance: a.relevance ?? 3,
    };
  }).filter((a) => a.alias);
}

/** Map AI detail objects (with optional `source`) to DB format (with `sourceText`) */
function mapDetailsForDB(details: { chapterIndex: number; content: string; category: string; relevance?: number; source?: string }[]) {
  return details.map((d) => ({ ...d, sourceText: d.source ?? "" }));
}

/* ── Write AI response to DB ────────────────────────────── */

async function writeResponseToDB(
  filePath: string,
  chapterIndex: number,
  response: AIWikiChapterData,
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

  // Build lookup of existing entries by name/alias for dedup
  const existingEntries = await api.wikiGetEntries(filePath);
  const nameToId = new Map<string, string>();
  // Also store full names for partial matching
  const existingNames: { name: string; id: string }[] = [];
  for (const e of existingEntries) {
    nameToId.set(e.name.toLowerCase(), e.id);
    existingNames.push({ name: e.name.toLowerCase(), id: e.id });
    const aliases = await api.wikiGetAliases(filePath, e.id);
    for (const a of aliases) {
      nameToId.set(a.alias.toLowerCase(), e.id);
      existingNames.push({ name: a.alias.toLowerCase(), id: e.id });
    }
  }

  // Partial name matching: "Soyoung" matches "Kim Soyoung", etc.
  function findPartialMatch(name: string): string | undefined {
    const lower = name.toLowerCase();
    // Exact match first
    const exact = nameToId.get(lower);
    if (exact) return exact;
    // Check if the new name is a part of an existing name (or vice versa)
    const parts = lower.split(/\s+/);
    for (const existing of existingNames) {
      const existingParts = existing.name.split(/\s+/);
      // New name is a single word that matches any part of an existing multi-word name
      if (parts.length === 1 && existingParts.length > 1 && existingParts.includes(lower)) {
        return existing.id;
      }
      // Existing name is a single word that matches any part of the new multi-word name
      if (existingParts.length === 1 && parts.length > 1 && parts.includes(existing.name)) {
        return existing.id;
      }
    }
    return undefined;
  }

  // New entries — with dedup against existing entries by name/alias
  for (const entry of response.new_entries) {
    if (!entry.id || !entry.name) continue;
    const type = validateType(entry.type);

    // Check if an entry with this name already exists under a different ID
    const existingId = findPartialMatch(entry.name);
    if (existingId && existingId !== entry.id) {
      // Redirect: treat as update to existing entry instead of creating duplicate
      console.info(`Wiki dedup: "${entry.name}" already exists as ${existingId}, merging into existing entry`);
      const existing = await api.wikiGetEntry(filePath, existingId);
      if (existing) {
        // Merge new info into existing entry
        await api.wikiUpsertEntry({
          id: existingId,
          filePath,
          name: existing.name,
          type: existing.type as WikiEntryType,
          shortDescription: existing.short_description,
          description: entry.description
            ? (existing.description ? `${existing.description}\n\n${entry.description}` : entry.description)
            : existing.description,
          color: existing.color,
          firstAppearance: existing.first_appearance,
          significance: Math.max(existing.significance, entry.significance ?? 1),
          status: entry.status ?? existing.status,
        });

        // Add the new name as an alias if it differs from the existing name
        const aliasesToAdd = normalizeAliases(entry.aliases ?? []);
        if (entry.name.toLowerCase() !== existing.name.toLowerCase()) {
          aliasesToAdd.push({ alias: entry.name, alias_type: "name", relevance: 4 });
        }
        if (aliasesToAdd.length > 0) {
          await api.wikiAddAliases(filePath, existingId, aliasesToAdd);
        }
        if (entry.details && entry.details.length > 0) {
          await api.wikiAddDetails(filePath, existingId, mapDetailsForDB(entry.details));
        }
        if (entry.relationships) {
          for (const rel of entry.relationships) {
            await api.wikiAddRelationship(filePath, {
              sourceId: existingId,
              targetId: rel.targetId,
              relation: rel.relation,
              sinceChapter: rel.since ?? chapterIndex,
            });
          }
        }
        await api.wikiAddAppearance(filePath, existingId, chapterIndex);

        // Register new ID as alias so future references resolve
        nameToId.set(entry.id.toLowerCase(), existingId);
        continue;
      }
    }

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
      await api.wikiAddAliases(filePath, entry.id, normalizeAliases(entry.aliases));
    }

    if (entry.details && entry.details.length > 0) {
      await api.wikiAddDetails(filePath, entry.id, mapDetailsForDB(entry.details));
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

    // Register in lookup for subsequent entries in same batch
    nameToId.set(entry.name.toLowerCase(), entry.id);
    if (entry.aliases) {
      for (const a of entry.aliases) {
        const str = typeof a === "string" ? a : a.alias;
        nameToId.set(str.toLowerCase(), entry.id);
      }
    }
  }

  // Updates to existing entries
  for (const update of response.updates) {
    if (!update.id) continue;

    // Resolve ID — might be an old/alternate ID that was deduped
    const resolvedId = nameToId.get(update.id.toLowerCase()) ?? update.id;

    // Check entry exists
    const existing = await api.wikiGetEntry(filePath, resolvedId);
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
      await api.wikiAddAliases(filePath, resolvedId, normalizeAliases(update.newAliases));
    }

    if (update.details && update.details.length > 0) {
      await api.wikiAddDetails(filePath, resolvedId, mapDetailsForDB(update.details));
    }

    // Mark old details as superseded when the AI indicates a fact has changed
    if (update.supersede && update.supersede.length > 0) {
      for (const s of update.supersede) {
        if (s.category) {
          await api.wikiSupersedeDetails(filePath, resolvedId, s.category, chapterIndex);
        }
      }
    }

    if (update.relationships) {
      for (const rel of update.relationships) {
        await api.wikiAddRelationship(filePath, {
          sourceId: resolvedId,
          targetId: rel.targetId,
          relation: rel.relation,
          sinceChapter: rel.since ?? chapterIndex,
        });
      }
    }

    await api.wikiAddAppearance(filePath, resolvedId, chapterIndex);
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
          if (!ent.entry_id) continue;
          // Resolve through dedup map — entity may have been merged into a different ID
          const resolvedEntId = nameToId.get(ent.entry_id.toLowerCase()) ?? ent.entry_id;
          const entExists = await api.wikiGetEntry(filePath, resolvedEntId);
          if (entExists) {
            await api.wikiAddArcEntity(filePath, newArc.id, resolvedEntId, ent.role || "");
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

  // MC stats
  if (response.mc_stats && response.mc_stats.length > 0) {
    for (const stat of response.mc_stats) {
      if (!stat.key || !stat.category || !stat.name) continue;
      await api.wikiUpsertMCStat(filePath, {
        key: stat.key,
        category: stat.category,
        name: stat.name,
        value: stat.value ?? null,
        isActive: stat.is_active !== false,
        chapter: chapterIndex,
      });
    }
  }

  // Mark chapter processed
  await api.wikiMarkProcessed(filePath, chapterIndex);
}

/* ── Parse AI Response ──────────────────────────────────── */

export function parseWikiResponse(raw: string): AIWikiResponse | null {
  let cleaned = raw;

  // 1. Extract from ```json ... ``` fence if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1];
  cleaned = cleaned.trim();

  // Try parsing with progressively more aggressive fixes
  const attempts: Array<() => string> = [
    // Pass 1: control chars only
    () => sanitizeJSONControlChars(cleaned),
    // Pass 2: unescaped-quote fix FIRST so that sanitizeJSONControlChars tracks string
    // boundaries correctly (blindly toggling inString on every `"` corrupts state when
    // the AI emits unescaped dialogue quotes inside a string value)
    () => sanitizeJSONControlChars(sanitizeUnescapedQuotes(cleaned)),
  ];

  for (const makeFixed of attempts) {
    const fixed = makeFixed();

    // Direct parse
    const direct = tryParseJSON(fixed);
    if (direct) return validateWikiResponse(direct);

    // Strip preamble: find first {
    const objStart = fixed.indexOf("{");
    if (objStart !== -1) {
      const fromBrace = fixed.slice(objStart);
      const direct2 = tryParseJSON(fromBrace);
      if (direct2) return validateWikiResponse(direct2);

      const repaired2 = repairTruncatedJSON(fromBrace);
      const parsed2 = tryParseJSON(repaired2);
      if (parsed2) {
        console.warn("Wiki response salvaged (truncated, preamble stripped)");
        return validateWikiResponse(parsed2);
      }
    }

    // Repair truncation on cleaned string directly
    const repaired = repairTruncatedJSON(fixed);
    const parsed = tryParseJSON(repaired);
    if (parsed) {
      console.warn("Wiki response salvaged (truncated)");
      return validateWikiResponse(parsed);
    }
  }

  console.error("Failed to parse wiki response (len=%d):", raw.length, raw.slice(0, 500));
  return null;
}

function tryParseJSON(s: string): AIWikiResponse | null {
  try {
    return JSON.parse(s) as AIWikiResponse;
  } catch {
    return null;
  }
}

const VALID_ENTRY_TYPES = new Set(["character", "item", "location", "event", "concept"]);

function validateChapterData(d: AIWikiChapterData): AIWikiChapterData {
  if (!Array.isArray(d.new_entries)) d.new_entries = [];
  if (!Array.isArray(d.updates)) d.updates = [];
  if (!Array.isArray(d.arc_updates)) d.arc_updates = [];
  if (!Array.isArray(d.new_arcs)) d.new_arcs = [];
  if (!Array.isArray(d.arc_amendments)) d.arc_amendments = [];
  d.new_entries = d.new_entries.filter((e) =>
    e &&
    typeof e.id === "string" && e.id.trim().length > 0 &&
    typeof e.name === "string" && e.name.trim().length > 0 &&
    typeof e.type === "string" && VALID_ENTRY_TYPES.has(e.type) &&
    typeof e.shortDescription === "string" && e.shortDescription.trim().length > 0,
  );
  d.updates = d.updates.filter((u) => u && typeof u.id === "string" && u.id.trim().length > 0);
  return d;
}

function validateWikiResponse(parsed: AIWikiResponse): AIWikiResponse {
  if (parsed.batch) {
    parsed.batch = parsed.batch
      .filter((d) => d && typeof d.chapter_index === "number")
      .map(validateChapterData);
    return parsed;
  }
  // Normalize legacy single-chapter to batch format
  if (!Array.isArray(parsed.new_entries)) parsed.new_entries = [];
  if (!Array.isArray(parsed.updates)) parsed.updates = [];
  if (!Array.isArray(parsed.arc_updates)) parsed.arc_updates = [];
  if (!Array.isArray(parsed.new_arcs)) parsed.new_arcs = [];
  if (!Array.isArray(parsed.arc_amendments)) parsed.arc_amendments = [];
  parsed.new_entries = (parsed.new_entries ?? []).filter((e) => e && typeof e.id === "string" && typeof e.name === "string");
  parsed.updates = (parsed.updates ?? []).filter((u) => u && typeof u.id === "string");
  return parsed;
}

/** Extract chapter data array from response (handles both batch and legacy formats) */
function getChapterDataFromResponse(response: AIWikiResponse, fallbackChapterIndex: number): AIWikiChapterData[] {
  if (response.batch && response.batch.length > 0) return response.batch;
  // Legacy: wrap single-chapter data
  return [{
    chapter_index: fallbackChapterIndex,
    chapter_summary: response.chapter_summary,
    arc_updates: response.arc_updates ?? [],
    new_arcs: response.new_arcs ?? [],
    arc_amendments: response.arc_amendments ?? [],
    new_entries: response.new_entries ?? [],
    updates: response.updates ?? [],
  }];
}

/** Escape literal control characters inside JSON string values (e.g. raw newlines the AI emitted) */
function sanitizeJSONControlChars(s: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\" && inString) {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      const code = ch.charCodeAt(0);
      if (ch === "\n") { result += "\\n"; continue; }
      if (ch === "\r") { result += "\\r"; continue; }
      if (ch === "\t") { result += "\\t"; continue; }
      if (code < 0x20) { result += "\\u" + code.toString(16).padStart(4, "0"); continue; }
    }

    result += ch;
  }

  return result;
}

/**
 * Fix unescaped double quotes inside JSON string values.
 * When AI generates literary content like `"The Fool"` inside a summary, the quotes
 * end up unescaped. This heuristic detects a `"` inside a string that is NOT followed
 * by a structural JSON character (`,`, `:`, `}`, `]`, or whitespace-then-structural)
 * and escapes it.
 */
function sanitizeUnescapedQuotes(s: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      if (!inString) {
        inString = true;
        result += ch;
      } else {
        // Peek ahead (skip whitespace) to see if this is a genuine string-closing quote
        let j = i + 1;
        while (j < s.length && (s[j] === " " || s[j] === "\t" || s[j] === "\n" || s[j] === "\r")) j++;
        const next = j < s.length ? s[j] : "";
        if (next === "" || next === "," || next === ":" || next === "}" || next === "]") {
          // Structural char follows → genuine end of string
          inString = false;
          result += ch;
        } else {
          // Non-structural char follows → unescaped internal quote, escape it
          result += '\\"';
        }
      }
      continue;
    }

    result += ch;
  }

  return result;
}

function repairTruncatedJSON(s: string): string {
  let repaired = s;

  // Remove trailing incomplete key-value pairs (truncated mid-string value).
  // Two variants: comma-separated (middle of object) and opening-brace (first key in object).
  repaired = repaired.replace(/,\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*$/, "");
  repaired = repaired.replace(/(\{)\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*$/, "$1");
  // Truncated mid-key
  repaired = repaired.replace(/,\s*"(?:[^"\\]|\\.)*$/, "");
  // Truncated after colon (value not yet started)
  repaired = repaired.replace(/,\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, "");
  // Trailing comma
  repaired = repaired.replace(/,\s*$/, "");

  // Use a stack to track nesting order so we can close in correct LIFO sequence
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const ch of repaired) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  // Close any unclosed string first
  if (inString) repaired += '"';

  // Remove trailing comma that might be before the closers
  repaired = repaired.replace(/,\s*$/, "");

  // Close containers in correct LIFO order
  while (stack.length > 0) repaired += stack.pop()!;

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
      relevance: d.relevance ?? 3,
      isSuperseded: (d.is_superseded ?? 0) === 1,
      supersededChapter: d.superseded_chapter ?? undefined,
      sourceText: d.source_text ?? "",
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
