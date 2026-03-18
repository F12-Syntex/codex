/* ── AI Wiki — DB-backed Core Logic (v2: Entity Resolution + Quality Gates) ── */

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
  source_arc_ids?: string[];
  target_arc_id?: string;
  arc_id?: string;
  reason?: string;
}

interface AIEntityMerge {
  source_id: string;
  target_id: string;
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
  entity_merges?: AIEntityMerge[];
  new_entries: AINewEntry[];
  updates: AIUpdate[];
  mc_stats?: AIMCStat[];
}

interface AIWikiResponse {
  mc_entity_id?: string;
  batch?: AIWikiChapterData[];
  // Legacy single-chapter fields
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

/* ═══════════════════════════════════════════════════════════
   ENTITY RESOLUTION ENGINE

   Multi-signal matching to prevent duplicate entity creation.
   Uses: exact match, alias match, substring match (type-aware),
   and fuzzy matching (Levenshtein distance).
   ═══════════════════════════════════════════════════════════ */

interface ResolverEntry {
  id: string;
  name: string;
  type: string;
  significance: number;
}

class EntityResolver {
  private entries = new Map<string, ResolverEntry>();
  private nameIndex = new Map<string, string>(); // lowercase name/alias → entry ID
  private typeIndex = new Map<string, Set<string>>(); // type → set of entry IDs

  constructor(
    entries: Array<{ id: string; name: string; type: string; significance: number }>,
    aliases: Array<{ entry_id: string; alias: string; relevance: number }>,
  ) {
    for (const e of entries) {
      this.entries.set(e.id, { id: e.id, name: e.name, type: e.type, significance: e.significance });
      this.nameIndex.set(e.name.toLowerCase().trim(), e.id);
      this.nameIndex.set(e.id.toLowerCase(), e.id);

      const typeSet = this.typeIndex.get(e.type) ?? new Set();
      typeSet.add(e.id);
      this.typeIndex.set(e.type, typeSet);
    }

    for (const a of aliases) {
      if (a.relevance >= 2) {
        this.nameIndex.set(a.alias.toLowerCase().trim(), a.entry_id);
      }
    }
  }

  /** Register a new entry created in this batch */
  register(id: string, name: string, type: string, aliases: string[]): void {
    this.entries.set(id, { id, name, type, significance: 1 });
    this.nameIndex.set(name.toLowerCase().trim(), id);
    this.nameIndex.set(id.toLowerCase(), id);
    for (const alias of aliases) {
      if (alias.trim().length >= 2) {
        this.nameIndex.set(alias.toLowerCase().trim(), id);
      }
    }
    const typeSet = this.typeIndex.get(type) ?? new Set();
    typeSet.add(id);
    this.typeIndex.set(type, typeSet);
  }

  /** Look up an ID directly (exact or via alias) */
  lookupId(id: string): string | undefined {
    if (this.entries.has(id)) return id;
    return this.nameIndex.get(id.toLowerCase());
  }

  /** Resolve a name+type to an existing entry. Returns match with confidence score, or null. */
  resolve(name: string, type: string, aliases?: string[]): { id: string; score: number; reason: string } | null {
    const normalized = name.toLowerCase().trim();
    if (!normalized) return null;

    const candidates: Array<{ id: string; score: number; reason: string }> = [];

    // 1. Exact ID match
    if (this.entries.has(name)) {
      return { id: name, score: 100, reason: "exact-id" };
    }

    // 2. Exact name/alias match (case-insensitive)
    const exactMatch = this.nameIndex.get(normalized);
    if (exactMatch) {
      const entry = this.entries.get(exactMatch)!;
      // Type-aware scoring: same type = high confidence, different type = low
      const score = entry.type === type ? 95 : 55;
      candidates.push({ id: exactMatch, score, reason: "exact-name" });
    }

    // 3. Check new entry's aliases against existing names/aliases
    if (aliases) {
      for (const alias of aliases) {
        const aliasNorm = alias.toLowerCase().trim();
        if (!aliasNorm || aliasNorm.length < 2) continue;
        const aliasMatch = this.nameIndex.get(aliasNorm);
        if (aliasMatch && aliasMatch !== exactMatch) {
          const entry = this.entries.get(aliasMatch)!;
          const score = entry.type === type ? 85 : 45;
          candidates.push({ id: aliasMatch, score, reason: "alias-match" });
        }
      }
    }

    // 4. Substring match (type-aware): "Kim" → "Kim Soyoung"
    const nameParts = normalized.split(/\s+/).filter(p => p.length >= 2);
    if (nameParts.length > 0) {
      const seen = new Set(candidates.map(c => c.id));
      for (const [key, entryId] of this.nameIndex) {
        if (seen.has(entryId)) continue;
        const entry = this.entries.get(entryId);
        if (!entry || entry.type !== type) continue;

        const keyParts = key.split(/\s+/);
        let isSubstring = false;

        // Single word matching part of multi-word name
        if (nameParts.length === 1 && keyParts.length > 1 && keyParts.includes(normalized)) {
          isSubstring = true;
        }
        // Multi-word new name where one of its parts matches a single-word existing name
        if (keyParts.length === 1 && nameParts.length > 1 && nameParts.includes(key)) {
          isSubstring = true;
        }

        if (isSubstring) {
          candidates.push({ id: entryId, score: 70, reason: "substring-match" });
          seen.add(entryId);
        }
      }
    }

    // 5. Fuzzy match: Levenshtein distance for similar names (same type only)
    if (normalized.length >= 4) {
      const seen = new Set(candidates.map(c => c.id));
      for (const [key, entryId] of this.nameIndex) {
        if (seen.has(entryId)) continue;
        const entry = this.entries.get(entryId);
        if (!entry || entry.type !== type) continue;
        if (key.length < 4) continue;

        const dist = levenshteinDistance(normalized, key);
        const maxLen = Math.max(normalized.length, key.length);

        // Allow distance of up to 20% of the longer string, minimum 2
        if (dist <= Math.max(2, Math.floor(maxLen * 0.2))) {
          const score = Math.round(50 * (1 - dist / maxLen));
          if (score >= 25) {
            candidates.push({ id: entryId, score, reason: "fuzzy-match" });
            seen.add(entryId);
          }
        }
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0];
    // Auto-merge threshold: score >= 50
    return best.score >= 50 ? best : null;
  }
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use single-row optimization for memory efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/* ═══════════════════════════════════════════════════════════
   ALIAS QUALITY GATE

   Filters contextual/ephemeral references that AI incorrectly
   marks as aliases. Only real names pass through.
   ═══════════════════════════════════════════════════════════ */

const CONTEXTUAL_PATTERNS = [
  /^the\s+/i,            // "the stranger", "the figure"
  /^a\s+/i,              // "a newcomer"
  /^an\s+/i,             // "an outsider"
  /^that\s+/i,           // "that man"
  /^this\s+/i,           // "this creature"
  /^some\s+/i,           // "some warrior"
  /\b(?:he|she|they|it|him|her|them|his|their)\b/i, // pronouns
  /^(?:someone|somebody|anyone|one|nobody)\b/i,      // indefinite
  /(?:figure|stranger|newcomer|person|man|woman|boy|girl|child|creature|being|entity|thing|one)\s*$/i, // generic endings
];

const MAX_ALIAS_LENGTH = 50;
const MIN_ALIAS_LENGTH = 2;

function isContextualAlias(alias: string): boolean {
  const trimmed = alias.trim();
  if (trimmed.length > MAX_ALIAS_LENGTH) return true;
  if (trimmed.length < MIN_ALIAS_LENGTH) return true;

  // Too many words — likely a description, not a name
  const words = trimmed.split(/\s+/);
  if (words.length > 4) return true;

  for (const pattern of CONTEXTUAL_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

/** Normalize AI alias inputs, filtering out contextual references */
function gateAliases(aliases: AIAliasInput[]): Array<{ alias: string; alias_type: string; relevance: number }> {
  return aliases
    .map(a => {
      if (typeof a === "string") return { alias: a, alias_type: "name", relevance: 3 };
      return {
        alias: a.alias,
        alias_type: a.alias_type ?? a.type ?? "name",
        relevance: a.relevance ?? 3,
      };
    })
    .filter(a => a.alias && a.alias.trim().length >= MIN_ALIAS_LENGTH)
    .map(a => {
      // Downgrade contextual aliases to relevance 1 and mark as ephemeral
      if (isContextualAlias(a.alias)) {
        return { ...a, relevance: Math.min(a.relevance, 1), alias_type: "epithet" };
      }
      return a;
    });
}

/** Map AI detail objects to DB format */
function mapDetailsForDB(details: { chapterIndex: number; content: string; category: string; relevance?: number; source?: string }[]) {
  return details.map(d => ({ ...d, sourceText: d.source ?? "" }));
}

/* ═══════════════════════════════════════════════════════════
   DEFERRED RELATIONSHIP QUEUE

   Collects relationships during batch processing and flushes
   them after ALL entities in the batch have been created.
   This prevents relationship loss from creation-order issues.
   ═══════════════════════════════════════════════════════════ */

interface PendingRelationship {
  sourceId: string;
  targetId: string;
  relation: string;
  sinceChapter: number;
}

class RelationshipQueue {
  private pending: PendingRelationship[] = [];

  add(rel: PendingRelationship): void {
    // Basic dedup within the queue
    const isDup = this.pending.some(
      p => p.sourceId === rel.sourceId && p.targetId === rel.targetId && p.relation === rel.relation,
    );
    if (!isDup && rel.sourceId !== rel.targetId) {
      this.pending.push(rel);
    }
  }

  async flush(filePath: string, resolver: EntityResolver): Promise<void> {
    const api = window.electronAPI!;
    for (const rel of this.pending) {
      // Resolve IDs through the resolver — they may have been remapped during dedup
      const resolvedSource = resolver.lookupId(rel.sourceId) ?? rel.sourceId;
      const resolvedTarget = resolver.lookupId(rel.targetId) ?? rel.targetId;

      if (resolvedSource === resolvedTarget) continue;

      await api.wikiAddRelationship(filePath, {
        sourceId: resolvedSource,
        targetId: resolvedTarget,
        relation: rel.relation,
        sinceChapter: rel.sinceChapter,
      });
    }
    this.pending = [];
  }
}

/* ═══════════════════════════════════════════════════════════
   CORE: Generate Wiki for Chapter (DB-backed)
   ═══════════════════════════════════════════════════════════ */

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

  // Check if already processed
  if (!force) {
    const processed = await api.wikiGetProcessed(filePath);
    if (processed.includes(chapterIndex)) return;
  }

  // Clean reprocessing: clear old chapter data first
  if (force) {
    if (api.wikiClearChapterData) {
      await api.wikiClearChapterData(filePath, chapterIndex);
    } else {
      await api.wikiUnmarkProcessed(filePath, chapterIndex);
    }
  }

  await api.wikiUpsertMeta(filePath, bookTitle);

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

  if (parsed.mc_entity_id) {
    await api.wikiSetMCEntityId(filePath, parsed.mc_entity_id);
  }

  const chapterDataList = getChapterDataFromResponse(parsed, chapterIndex);
  for (const chapterData of chapterDataList) {
    if (isAborted()) return;
    await writeResponseToDB(filePath, chapterData.chapter_index, chapterData);
  }

  // Post-processing cleanup
  await postProcessCleanup(filePath);
}

/** Process multiple chapters in a single AI call */
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

  // Post-processing cleanup after the full batch
  if (!isAborted()) {
    await postProcessCleanup(filePath);
  }

  return processed;
}

/* ═══════════════════════════════════════════════════════════
   BUILD TIERED CONTEXT FROM DB
   ═══════════════════════════════════════════════════════════ */

async function buildContextFromDB(filePath: string, currentChapter: number) {
  const api = window.electronAPI!;

  // Recent summaries (last 8 chapters)
  const fromCh = Math.max(0, currentChapter - 8);
  const recentSummaries = currentChapter > 0
    ? await api.wikiGetChapterSummaries(filePath, fromCh, currentChapter - 1)
    : [];

  // ALL entries
  const allEntries = await api.wikiGetEntries(filePath);

  // Batch-fetch ALL aliases (avoid N+1) — fallback to per-entry if function unavailable
  const aliasesByEntry = new Map<string, Array<{ alias: string; alias_type: string; relevance: number }>>();
  if (api.wikiGetAllAliases) {
    const allAliasRows = await api.wikiGetAllAliases(filePath);
    for (const a of allAliasRows) {
      const list = aliasesByEntry.get(a.entry_id) ?? [];
      list.push({ alias: a.alias, alias_type: a.alias_type, relevance: a.relevance });
      aliasesByEntry.set(a.entry_id, list);
    }
  } else {
    for (const e of allEntries) {
      const aliases = await api.wikiGetAliases(filePath, e.id);
      aliasesByEntry.set(e.id, aliases);
    }
  }

  // Recent entities (appeared in last 8 chapters)
  const recentEntityRows = await api.wikiGetRecentEntities(filePath, 8, currentChapter - 1);
  const recentEntityIds = new Set(recentEntityRows.map(e => e.id));

  // Roster: recent + all significant (deduped)
  const rosterEntries = [...recentEntityRows];
  for (const e of allEntries) {
    if (!recentEntityIds.has(e.id) && e.significance >= 2) {
      rosterEntries.push(e);
    }
  }

  // For roster, filter aliases to relevance >= 3 for context
  const rosterAliases = new Map<string, string[]>();
  for (const e of rosterEntries) {
    const aliases = (aliasesByEntry.get(e.id) ?? [])
      .filter(a => a.relevance >= 3)
      .map(a => a.alias);
    if (aliases.length > 0) rosterAliases.set(e.id, aliases);
  }

  // Relationships for roster entities
  const recentRelationships = new Map<string, { target_name: string; relation: string }[]>();
  const nameMap = new Map(allEntries.map(e => [e.id, e.name]));

  for (const e of rosterEntries) {
    const rels = await api.wikiGetRelationships(filePath, e.id, currentChapter - 1);
    if (rels.length > 0) {
      recentRelationships.set(
        e.id,
        rels.slice(0, 3).map(r => ({
          target_name: (r.source_id === e.id ? nameMap.get(r.target_id) : nameMap.get(r.source_id)) ?? r.target_id,
          relation: r.relation,
        })),
      );
    }
  }

  // Active arcs
  const activeArcRows = await api.wikiGetActiveArcs(filePath);
  const activeArcs = await Promise.all(
    activeArcRows.map(async a => {
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

  // Entity index (includes short descriptions so AI can recognize characters)
  const entityIndex = await api.wikiGetEntityIndex(filePath);

  return buildTieredContext({
    recentSummaries: recentSummaries.map(s => ({
      chapter_index: s.chapter_index,
      summary: s.summary,
      mood: s.mood,
    })),
    recentEntities: rosterEntries.map(e => ({
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
    entityIndex: entityIndex.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      short_description: (allEntries.find(a => a.id === e.id)?.short_description) ?? "",
      aliases: e.aliases,
    })),
  });
}

/* ═══════════════════════════════════════════════════════════
   WRITE AI RESPONSE TO DB (with all quality gates)
   ═══════════════════════════════════════════════════════════ */

async function writeResponseToDB(
  filePath: string,
  chapterIndex: number,
  response: AIWikiChapterData,
): Promise<void> {
  const api = window.electronAPI!;

  // Chapter summary
  if (response.chapter_summary && response.chapter_summary.summary) {
    await api.wikiUpsertChapterSummary(filePath, {
      chapterIndex,
      summary: response.chapter_summary.summary,
      keyEvents: (response.chapter_summary.key_events ?? []).join(","),
      activeEntities: "",
      mood: response.chapter_summary.mood ?? "",
    });
  }

  // ── Build Entity Resolver from all existing entries + aliases ──
  const existingEntries = await api.wikiGetEntries(filePath);
  let allAliasRows: Array<{ entry_id: string; alias: string; alias_type: string; relevance: number }> = [];
  if (api.wikiGetAllAliases) {
    allAliasRows = await api.wikiGetAllAliases(filePath);
  } else {
    for (const e of existingEntries) {
      const aliases = await api.wikiGetAliases(filePath, e.id);
      for (const a of aliases) {
        allAliasRows.push({ entry_id: e.id, alias: a.alias, alias_type: a.alias_type, relevance: a.relevance });
      }
    }
  }
  const resolver = new EntityResolver(
    existingEntries.map(e => ({ id: e.id, name: e.name, type: e.type, significance: e.significance })),
    allAliasRows,
  );

  // Deferred relationship queue — flush after all entities exist
  const relQueue = new RelationshipQueue();

  // ── Process AI-suggested entity merges ──
  if (response.entity_merges) {
    for (const merge of response.entity_merges) {
      if (!merge.source_id || !merge.target_id || merge.source_id === merge.target_id) continue;
      const sourceExists = existingEntries.some(e => e.id === merge.source_id);
      const targetExists = existingEntries.some(e => e.id === merge.target_id);
      if (sourceExists && targetExists) {
        try {
          console.info(`Wiki: AI-suggested merge "${merge.source_id}" → "${merge.target_id}": ${merge.reason ?? "no reason"}`);
          await api.wikiMergeEntries(filePath, merge.source_id, merge.target_id);
          resolver.register(merge.source_id, merge.source_id, "", []);
        } catch (err) {
          console.warn(`Wiki: merge failed "${merge.source_id}" → "${merge.target_id}":`, err);
        }
      }
    }
  }

  // ── New entries — with entity resolution ──
  for (const entry of response.new_entries) {
    if (!entry.id || !entry.name) continue;
    const type = validateType(entry.type);

    // Extract alias strings for resolution
    const aliasStrings = (entry.aliases ?? []).map(a => typeof a === "string" ? a : a.alias).filter(Boolean);

    // Try to resolve this entity against existing entries
    const match = resolver.resolve(entry.name, type, aliasStrings);

    if (match && match.id !== entry.id) {
      // ── Merge into existing entry ──
      console.info(`Wiki resolve: "${entry.name}" → existing "${match.id}" (${match.reason}, score=${match.score})`);

      const existing = await api.wikiGetEntry(filePath, match.id);
      if (existing) {
        // Update existing entry with new info (don't overwrite what's already good)
        await api.wikiUpsertEntry({
          id: existing.id,
          filePath,
          name: existing.name, // keep canonical name
          type: existing.type as WikiEntryType,
          shortDescription: existing.short_description || entry.shortDescription,
          description: existing.description
            ? (entry.description && !existing.description.includes(entry.description)
              ? `${existing.description}\n\n${entry.description}`
              : existing.description)
            : entry.description,
          color: existing.color,
          firstAppearance: Math.min(existing.first_appearance, entry.firstAppearance ?? chapterIndex),
          significance: Math.max(existing.significance, entry.significance ?? 1),
          status: entry.status ?? existing.status,
        });

        // Add gated aliases (including the new name if different from existing)
        const gatewayAliases = gateAliases(entry.aliases ?? []);
        if (entry.name.toLowerCase() !== existing.name.toLowerCase()) {
          gatewayAliases.push({ alias: entry.name, alias_type: "name", relevance: 4 });
        }
        if (gatewayAliases.length > 0) {
          await api.wikiAddAliases(filePath, existing.id, gatewayAliases);
        }

        if (entry.details && entry.details.length > 0) {
          await api.wikiAddDetails(filePath, existing.id, mapDetailsForDB(entry.details));
        }

        // Queue relationships (deferred)
        if (entry.relationships) {
          for (const rel of entry.relationships) {
            relQueue.add({
              sourceId: existing.id,
              targetId: rel.targetId,
              relation: rel.relation,
              sinceChapter: rel.since ?? chapterIndex,
            });
          }
        }

        await api.wikiAddAppearance(filePath, existing.id, chapterIndex);

        // Register remapping so future references in this batch resolve correctly
        resolver.register(entry.id, entry.name, type, aliasStrings);
        continue;
      }
    }

    // ── Create new entry ──
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

    // Add gated aliases
    const gatewayAliases = gateAliases(entry.aliases ?? []);
    if (gatewayAliases.length > 0) {
      await api.wikiAddAliases(filePath, entry.id, gatewayAliases);
    }

    if (entry.details && entry.details.length > 0) {
      await api.wikiAddDetails(filePath, entry.id, mapDetailsForDB(entry.details));
    }

    // Queue relationships (deferred)
    if (entry.relationships) {
      for (const rel of entry.relationships) {
        relQueue.add({
          sourceId: entry.id,
          targetId: rel.targetId,
          relation: rel.relation,
          sinceChapter: rel.since ?? chapterIndex,
        });
      }
    }

    await api.wikiAddAppearance(filePath, entry.id, chapterIndex);

    // Register in resolver for subsequent entries in same batch
    resolver.register(entry.id, entry.name, type, aliasStrings);
  }

  // ── Updates to existing entries ──
  for (const update of response.updates) {
    if (!update.id) continue;

    // Resolve ID through entity resolver
    const resolvedId = resolver.lookupId(update.id) ?? update.id;

    const existing = await api.wikiGetEntry(filePath, resolvedId);
    if (!existing) continue;

    // Update fields
    if (update.significance || update.status || update.descriptionAppend) {
      const shouldAppend = update.descriptionAppend &&
        !existing.description.includes(update.descriptionAppend);

      await api.wikiUpsertEntry({
        id: existing.id,
        filePath,
        name: existing.name,
        type: existing.type,
        shortDescription: existing.short_description,
        description: shouldAppend
          ? (existing.description ? `${existing.description}\n\n${update.descriptionAppend}` : update.descriptionAppend!)
          : existing.description,
        color: existing.color,
        firstAppearance: existing.first_appearance,
        significance: update.significance ?? existing.significance,
        status: update.status ?? existing.status,
      });
    }

    if (update.newAliases && update.newAliases.length > 0) {
      await api.wikiAddAliases(filePath, resolvedId, gateAliases(update.newAliases));
    }

    if (update.details && update.details.length > 0) {
      await api.wikiAddDetails(filePath, resolvedId, mapDetailsForDB(update.details));
    }

    // Supersede old details when facts change
    if (update.supersede && update.supersede.length > 0) {
      for (const s of update.supersede) {
        if (s.category) {
          await api.wikiSupersedeDetails(filePath, resolvedId, s.category, chapterIndex);
        }
      }
    }

    // Queue relationships (deferred)
    if (update.relationships) {
      for (const rel of update.relationships) {
        relQueue.add({
          sourceId: resolvedId,
          targetId: rel.targetId,
          relation: rel.relation,
          sinceChapter: rel.since ?? chapterIndex,
        });
      }
    }

    await api.wikiAddAppearance(filePath, resolvedId, chapterIndex);
  }

  // ── Flush deferred relationships (all entities now exist) ──
  await relQueue.flush(filePath, resolver);

  // ── Arc updates ──
  if (response.arc_updates) {
    for (const arcUpdate of response.arc_updates) {
      if (!arcUpdate.arc_id) continue;
      const existingArcs = await api.wikiGetAllArcs(filePath);
      const arc = existingArcs.find(a => a.id === arcUpdate.arc_id);
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

  // ── New arcs ──
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
          const resolvedEntId = resolver.lookupId(ent.entry_id) ?? ent.entry_id;
          const entExists = await api.wikiGetEntry(filePath, resolvedEntId);
          if (entExists) {
            await api.wikiAddArcEntity(filePath, newArc.id, resolvedEntId, ent.role || "");
          }
        }
      }
    }
  }

  // ── Arc amendments ──
  if (response.arc_amendments) {
    for (const amendment of response.arc_amendments) {
      if (amendment.action === "merge" && amendment.source_arc_ids && amendment.target_arc_id) {
        await api.wikiMergeArcs(filePath, amendment.source_arc_ids, amendment.target_arc_id);
      } else if (amendment.action === "delete" && amendment.arc_id) {
        await api.wikiDeleteArc(filePath, amendment.arc_id);
      }
    }
  }

  // ── MC stats ──
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

/* ═══════════════════════════════════════════════════════════
   POST-PROCESSING CLEANUP

   Runs after writing chapter data. Purges junk entries,
   removes orphaned data, and handles auto-dedup.
   ═══════════════════════════════════════════════════════════ */

async function postProcessCleanup(filePath: string): Promise<void> {
  const api = window.electronAPI!;

  // 1. Purge null/empty entries from truncated AI responses
  const purged = await api.wikiPurgeNullEntries(filePath);
  if (purged > 0) {
    console.info(`Wiki cleanup: purged ${purged} empty entries`);
  }
}

/* ═══════════════════════════════════════════════════════════
   PARSE AI RESPONSE

   Handles JSON extraction, truncation repair, and salvaging
   of partial responses from the AI.
   ═══════════════════════════════════════════════════════════ */

export function parseWikiResponse(raw: string): AIWikiResponse | null {
  let cleaned = raw;

  // Extract from ```json ... ``` fence if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1];
  cleaned = cleaned.trim();

  // Try parsing with progressively more aggressive fixes
  const attempts: Array<() => string> = [
    () => sanitizeJSONControlChars(cleaned),
    () => sanitizeJSONControlChars(sanitizeUnescapedQuotes(cleaned)),
  ];

  for (const makeFixed of attempts) {
    const fixed = makeFixed();

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

    const repaired = repairTruncatedJSON(fixed);
    const parsed = tryParseJSON(repaired);
    if (parsed) {
      console.warn("Wiki response salvaged (truncated)");
      return validateWikiResponse(parsed);
    }
  }

  // Last resort: salvage complete batch entries
  // Try with unescaped-quote fix first (dialogue quotes like "Tarot" inside strings
  // corrupt bracket-depth tracking without sanitization)
  const sanitized = sanitizeJSONControlChars(sanitizeUnescapedQuotes(cleaned));
  const salvaged = salvageBatchEntries(sanitized) ?? salvageBatchEntries(cleaned);
  if (salvaged) {
    console.warn("Wiki response salvaged (%d batch entries from truncated response)", salvaged.batch!.length);
    return salvaged;
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
  if (!Array.isArray(d.entity_merges)) d.entity_merges = [];
  d.new_entries = d.new_entries.filter(e =>
    e &&
    typeof e.id === "string" && e.id.trim().length > 0 &&
    typeof e.name === "string" && e.name.trim().length > 0 &&
    typeof e.type === "string" && VALID_ENTRY_TYPES.has(e.type) &&
    typeof e.shortDescription === "string" && e.shortDescription.trim().length > 0,
  );
  d.updates = d.updates.filter(u => u && typeof u.id === "string" && u.id.trim().length > 0);
  return d;
}

function validateWikiResponse(parsed: AIWikiResponse): AIWikiResponse {
  if (parsed.batch) {
    parsed.batch = parsed.batch
      .filter(d => d && typeof d.chapter_index === "number")
      .map(validateChapterData);
    return parsed;
  }
  if (!Array.isArray(parsed.new_entries)) parsed.new_entries = [];
  if (!Array.isArray(parsed.updates)) parsed.updates = [];
  if (!Array.isArray(parsed.arc_updates)) parsed.arc_updates = [];
  if (!Array.isArray(parsed.new_arcs)) parsed.new_arcs = [];
  if (!Array.isArray(parsed.arc_amendments)) parsed.arc_amendments = [];
  parsed.new_entries = (parsed.new_entries ?? []).filter(e => e && typeof e.id === "string" && typeof e.name === "string");
  parsed.updates = (parsed.updates ?? []).filter(u => u && typeof u.id === "string");
  return parsed;
}

function getChapterDataFromResponse(response: AIWikiResponse, fallbackChapterIndex: number): AIWikiChapterData[] {
  if (response.batch && response.batch.length > 0) return response.batch;
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
        let j = i + 1;
        while (j < s.length && (s[j] === " " || s[j] === "\t" || s[j] === "\n" || s[j] === "\r")) j++;
        const next = j < s.length ? s[j] : "";
        if (next === "" || next === "," || next === ":" || next === "}" || next === "]") {
          inString = false;
          result += ch;
        } else {
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

  repaired = repaired.replace(/,\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*$/, "");
  repaired = repaired.replace(/(\{)\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*$/, "$1");
  repaired = repaired.replace(/,\s*"(?:[^"\\]|\\.)*$/, "");
  repaired = repaired.replace(/,\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, "");
  repaired = repaired.replace(/,\s*$/, "");

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

  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, "");
  while (stack.length > 0) repaired += stack.pop()!;

  return repaired;
}

function salvageBatchEntries(raw: string): AIWikiResponse | null {
  const batchMatch = raw.match(/"batch"\s*:\s*\[/);
  if (!batchMatch || batchMatch.index === undefined) return null;

  const batchStart = batchMatch.index + batchMatch[0].length;

  let mcEntityId: string | undefined;
  const mcMatch = raw.match(/"mc_entity_id"\s*:\s*"([^"]+)"/);
  if (mcMatch) mcEntityId = mcMatch[1];

  const entries: AIWikiChapterData[] = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let objStart = -1;

  for (let i = batchStart; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;

    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const objStr = raw.slice(objStart, i + 1);
        const parsed = tryParseJSON(objStr);
        if (parsed && typeof (parsed as Record<string, unknown>).chapter_index === "number") {
          entries.push(validateChapterData(parsed as unknown as AIWikiChapterData));
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }

  if (entries.length === 0) return null;

  const result: AIWikiResponse = { batch: entries } as AIWikiResponse;
  if (mcEntityId) (result as Record<string, unknown>).mc_entity_id = mcEntityId;

  const mcStatsMatch = raw.match(/"mc_stats"\s*:\s*\[/);
  if (mcStatsMatch && mcStatsMatch.index !== undefined) {
    const statsStart = mcStatsMatch.index + mcStatsMatch[0].length;
    const statsEnd = raw.indexOf("]", statsStart);
    if (statsEnd !== -1) {
      const statsStr = "[" + raw.slice(statsStart, statsEnd + 1);
      const statsParsed = tryParseJSON(statsStr);
      if (Array.isArray(statsParsed)) {
        (result as Record<string, unknown>).mc_stats = statsParsed;
      }
    }
  }

  return result;
}

/* ═══════════════════════════════════════════════════════════
   DISPLAY HELPERS
   ═══════════════════════════════════════════════════════════ */

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
    chapterAppearances: maxChapter != null ? appearances.filter(c => c <= maxChapter) : appearances,
    details: details.map(d => ({
      chapterIndex: d.chapter_index,
      content: d.content,
      category: d.category,
      relevance: d.relevance ?? 3,
      isSuperseded: (d.is_superseded ?? 0) === 1,
      supersededChapter: d.superseded_chapter ?? undefined,
      sourceText: d.source_text ?? "",
    })),
    relationships: relationships
      .filter(r => r.source_id === entryId)
      .map(r => ({
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
    details: entry.details.filter(d => d.chapterIndex <= maxChapter),
    relationships: entry.relationships.filter(r => r.since <= maxChapter),
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
