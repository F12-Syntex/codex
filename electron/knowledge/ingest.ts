/**
 * Knowledge ingestion (owner: WS-B). Replaces `generateWikiForChapter` / `writeResponseToDB`.
 *
 * Guarantees (AI_AUDIT S1-3):
 * - The whole model response for a chapter is applied in ONE transaction, with the resolver
 *   built inside it (no stale snapshots, no half-written chapters).
 * - Idempotent: a `knowledge_runs` row per (book, chapterId). Re-ingesting a done chapter is a
 *   no-op unless forced; a forced retry first undoes exactly what the previous run did
 *   (`created_ids` holds the run's ledger), then applies the new response in the same transaction.
 * - Serialised per book through `KnowledgeLane`; concurrent requests for the same chapter join.
 * - Aborts before the transaction leave nothing behind; the transaction itself is synchronous.
 * - Entity versions (`wiki_entry_versions`) are written whenever description, status or
 *   significance change; new aliases record `first_chapter`.
 */

import type { SqlDb } from "../db/sql";
import { AIError } from "../ai/errors";
import type { AIEvent } from "../shared/ai/types";
import type { SourceChapter } from "../shared/pipeline/types";
import { aliasStrings, gateAliases, type GatedAlias } from "./alias-gate";
import { getContext } from "./context";
import { getChapterDataFromResponse, parseWikiResponse, type AIWikiChapterData, type AIWikiResponse } from "./parse";
import { buildIngestUserPrompt, INGEST_CONTEXT_BUDGET, INGEST_PROMPT_VERSION, INGEST_SYSTEM_PROMPT } from "./prompts";
import { defaultLabel, type ChapterLabeler } from "./read";
import { EntityResolver } from "./resolver";
import {
  addArcEntity, addWikiAppearance, addWikiRelationship, clearChapterWikiData, deleteArc, ensureBaselineVersion,
  getAllArcs, getMCEntityId, markChapterProcessed, mergeArcs, mergeWikiEntries, supersedeWikiDetails,
  TYPE_COLORS, unmergeWikiEntries, unmarkChapterProcessed, upsertChapterSummary, upsertWikiMeta, validateType,
  writeVersion, type MCStatRow, type WikiArcBeatRow, type WikiArcRow, type WikiEntryRow,
} from "./store";

/** Bump when ingestion semantics change: done runs at an older version re-run when requested. */
export const KNOWLEDGE_TASK_VERSION = 1 * 100 + INGEST_PROMPT_VERSION;

/** Chapters above this are skipped (legacy rule). */
export const MAX_INGEST_CHARS = 500_000;

// ── Run ledger (stored in knowledge_runs.created_ids) ───────────────────────

type EntryFields = Pick<WikiEntryRow, "name" | "type" | "short_description" | "description" | "color" | "first_appearance" | "significance" | "status">;
type ArcFields = Pick<WikiArcRow, "name" | "description" | "arc_type" | "status" | "start_chapter" | "end_chapter">;

export interface RunLedger {
  v: 1;
  entries: string[];
  entryPatches: { id: string; before: EntryFields; after: EntryFields }[];
  aliases: [entryId: string, alias: string][];
  details: number[];
  relationships: number[];
  arcs: string[];
  arcPatches: { id: string; before: ArcFields; after: ArcFields }[];
  arcEntities: [arcId: string, entryId: string][];
  removedArcs: { arc: WikiArcRow; beats: WikiArcBeatRow[]; entities: { entry_id: string; role: string }[] }[];
  merges: number[];
  mcStats: { key: string; before: MCStatRow | null }[];
  mcEntity?: { before: string | null };
  /** Whether the summary row existed before (legacy data) — then it is not ours to delete. */
  summary: boolean;
}

function emptyLedger(): RunLedger {
  return {
    v: 1, entries: [], entryPatches: [], aliases: [], details: [], relationships: [], arcs: [], arcPatches: [],
    arcEntities: [], removedArcs: [], merges: [], mcStats: [], summary: false,
  };
}

export interface KnowledgeRunRow {
  file_path: string;
  chapter_id: string;
  chapter_index: number;
  task_version: number;
  status: "done" | "skipped" | "running" | "error";
  created_ids: string;
  updated_at: number;
}

export function getRun(db: SqlDb, filePath: string, chapterId: string): KnowledgeRunRow | null {
  return db.get<KnowledgeRunRow>("SELECT * FROM knowledge_runs WHERE file_path = ? AND chapter_id = ?", [filePath, chapterId]) ?? null;
}

function parseLedger(raw: string): RunLedger | null {
  try {
    const v = JSON.parse(raw) as RunLedger;
    return v && v.v === 1 ? { ...emptyLedger(), ...v } : null;
  } catch {
    return null;
  }
}

// ── Apply ───────────────────────────────────────────────────────────────────

const ENTRY_FIELDS: (keyof EntryFields)[] = ["name", "type", "short_description", "description", "color", "first_appearance", "significance", "status"];
const ARC_FIELDS: (keyof ArcFields)[] = ["name", "description", "arc_type", "status", "start_chapter", "end_chapter"];

function pick<T extends object, K extends keyof T>(row: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = row[k];
  return out;
}

export interface ApplyChapterInput {
  filePath: string;
  chapterIndex: number;
  chapterId: string;
  bookTitle?: string;
  data: AIWikiChapterData;
  mcEntityId?: string;
  now?: number;
}

export interface ApplyChapterResult {
  ledger: RunLedger;
  createdEntries: number;
  updatedEntries: number;
}

/**
 * Apply one chapter's model output. Must run inside a transaction (`ingest` does that); the
 * resolver is built here, inside it, from the current rows.
 */
export function applyChapterData(db: SqlDb, input: ApplyChapterInput): ApplyChapterResult {
  const { filePath, chapterIndex: ch, data } = input;
  const L = emptyLedger();
  const touched = new Set<string>();

  if (input.bookTitle) upsertWikiMeta(db, filePath, input.bookTitle);
  else if (!db.get("SELECT 1 FROM wiki_meta WHERE file_path = ?", [filePath])) upsertWikiMeta(db, filePath, "");

  if (input.mcEntityId) {
    L.mcEntity = { before: getMCEntityId(db, filePath) };
    db.run("UPDATE wiki_meta SET mc_entity_id = ? WHERE file_path = ?", [input.mcEntityId, filePath]);
  }

  // Chapter summary
  if (data.chapter_summary && typeof data.chapter_summary.summary === "string" && data.chapter_summary.summary.trim()) {
    L.summary = !!db.get("SELECT 1 FROM wiki_chapter_summaries WHERE file_path = ? AND chapter_index = ?", [filePath, ch]);
    upsertChapterSummary(db, filePath, {
      chapterIndex: ch,
      summary: data.chapter_summary.summary.trim(),
      keyEvents: (Array.isArray(data.chapter_summary.key_events) ? data.chapter_summary.key_events : []).map(String).join(","),
      activeEntities: "",
      mood: typeof data.chapter_summary.mood === "string" ? data.chapter_summary.mood : "",
    });
  }

  // Resolver over the current rows (inside the transaction).
  const entries = db.all<WikiEntryRow>("SELECT * FROM wiki_entries WHERE file_path = ?", [filePath]);
  const resolver = new EntityResolver(
    entries.map((e) => ({ id: e.id, name: e.name, type: e.type, significance: e.significance })),
    db.all<{ entry_id: string; alias: string; relevance: number }>("SELECT entry_id, alias, relevance FROM wiki_aliases WHERE file_path = ?", [filePath]),
  );
  const getEntry = (id: string) => db.get<WikiEntryRow>("SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, id]);

  /** Patch an entry, recording before/after for undo, and version it when it changes. */
  const patchEntry = (id: string, patch: Partial<EntryFields>) => {
    const row = getEntry(id);
    if (!row) return;
    const before = pick(row, ENTRY_FIELDS);
    const after = { ...before, ...patch } as EntryFields;
    if (ENTRY_FIELDS.every((k) => before[k] === after[k])) return;
    ensureBaselineVersion(db, filePath, row);
    db.run(
      "UPDATE wiki_entries SET name = ?, type = ?, short_description = ?, description = ?, color = ?, first_appearance = ?, significance = ?, status = ? WHERE file_path = ? AND id = ?",
      [after.name, after.type, after.short_description, after.description, after.color, after.first_appearance, after.significance, after.status, filePath, id],
    );
    const versionChanged = before.short_description !== after.short_description || before.status !== after.status || before.significance !== after.significance;
    // Earlier first appearance (out-of-order ingestion): it must be visible from there on.
    if (versionChanged || after.first_appearance < before.first_appearance) {
      writeVersion(db, filePath, id, Math.max(ch, after.first_appearance), {
        shortDescription: after.short_description, status: after.status, significance: after.significance,
      });
    }
    L.entryPatches.push({ id, before, after });
  };

  const addAliases = (entryId: string, aliases: GatedAlias[]) => {
    for (const a of aliases) {
      const existing = db.get<{ relevance: number; alias_type: string }>(
        "SELECT relevance, alias_type FROM wiki_aliases WHERE file_path = ? AND entry_id = ? AND alias = ?",
        [filePath, entryId, a.alias],
      );
      if (existing) {
        if (a.relevance > existing.relevance) {
          db.run("UPDATE wiki_aliases SET relevance = ?, alias_type = ? WHERE file_path = ? AND entry_id = ? AND alias = ?", [a.relevance, a.alias_type, filePath, entryId, a.alias]);
        }
        continue;
      }
      db.run(
        "INSERT INTO wiki_aliases (file_path, entry_id, alias, alias_type, relevance, first_chapter) VALUES (?, ?, ?, ?, ?, ?)",
        [filePath, entryId, a.alias, a.alias_type, a.relevance, ch],
      );
      L.aliases.push([entryId, a.alias]);
    }
  };

  const addDetails = (entryId: string, details: AIWikiChapterData["new_entries"][number]["details"]) => {
    if (!Array.isArray(details)) return;
    for (const d of details) {
      if (!d || typeof d.content !== "string" || !d.content.trim()) continue;
      const content = d.content.trim();
      if (db.get("SELECT 1 FROM wiki_details WHERE file_path = ? AND entry_id = ? AND content = ? LIMIT 1", [filePath, entryId, content])) continue;
      const rel = typeof d.relevance === "number" ? Math.max(1, Math.min(5, Math.round(d.relevance))) : 3;
      L.details.push(db.run(
        "INSERT INTO wiki_details (file_path, entry_id, chapter_index, category, content, relevance, source_text) VALUES (?, ?, ?, ?, ?, ?, ?)",
        // Details always belong to the chapter being ingested (the model's chapterIndex is not trusted).
        [filePath, entryId, ch, typeof d.category === "string" && d.category ? d.category : "info", content, rel, typeof d.source === "string" ? d.source : ""],
      ).lastInsertRowid);
    }
  };

  const pendingRels: { sourceId: string; targetId: string; relation: string; since: number }[] = [];
  const queueRels = (sourceId: string, rels: unknown) => {
    if (!Array.isArray(rels)) return;
    for (const r of rels as { targetId?: unknown; relation?: unknown; since?: unknown }[]) {
      if (!r || typeof r.targetId !== "string" || typeof r.relation !== "string" || !r.relation.trim()) continue;
      const since = typeof r.since === "number" && Number.isFinite(r.since) ? Math.min(Math.max(0, Math.floor(r.since)), ch) : ch;
      if (!pendingRels.some((p) => p.sourceId === sourceId && p.targetId === r.targetId && p.relation === r.relation)) {
        pendingRels.push({ sourceId, targetId: r.targetId, relation: (r.relation as string).trim(), since });
      }
    }
  };

  // ── Model-suggested merges ──
  for (const m of data.entity_merges ?? []) {
    if (!m || !m.source_id || !m.target_id || m.source_id === m.target_id) continue;
    const src = resolver.lookupId(m.source_id);
    const tgt = resolver.lookupId(m.target_id);
    if (!src || !tgt || src === tgt || !getEntry(src) || !getEntry(tgt)) continue;
    const logId = mergeWikiEntries(db, filePath, src, tgt);
    if (logId != null) {
      L.merges.push(logId);
      resolver.remap(src, tgt);
    }
  }

  let created = 0;
  // ── New entries (resolved against existing ones) ──
  for (const entry of data.new_entries ?? []) {
    if (!entry || !entry.id || !entry.name) continue;
    const type = validateType(entry.type);
    const names = aliasStrings(entry.aliases);
    const match = resolver.resolve(entry.name, type, names);
    const targetId = match?.id ?? (resolver.has(entry.id) ? entry.id : undefined);
    const existing = targetId ? getEntry(targetId) : undefined;

    if (existing) {
      const desc = existing.description
        ? entry.description && !existing.description.includes(entry.description)
          ? `${existing.description}\n\n${entry.description}`
          : existing.description
        : entry.description ?? "";
      patchEntry(existing.id, {
        short_description: existing.short_description || entry.shortDescription || "",
        description: desc,
        first_appearance: Math.min(existing.first_appearance, ch),
        significance: Math.max(existing.significance, clampSig(entry.significance, existing.significance)),
        status: typeof entry.status === "string" && entry.status ? entry.status : existing.status,
      });
      const gated = gateAliases(entry.aliases);
      if (entry.name.toLowerCase() !== existing.name.toLowerCase()) gated.push({ alias: entry.name, alias_type: "name", relevance: 4 });
      addAliases(existing.id, gated);
      addDetails(existing.id, entry.details);
      queueRels(existing.id, entry.relationships);
      addWikiAppearance(db, filePath, existing.id, ch);
      resolver.register(entry.id, entry.name, type, names, existing.id);
      touched.add(existing.id);
      continue;
    }

    // Create
    const sig = clampSig(entry.significance, 1);
    const status = typeof entry.status === "string" && entry.status ? entry.status : "active";
    db.run(
      "INSERT INTO wiki_entries (id, file_path, name, type, short_description, description, color, first_appearance, significance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [entry.id, filePath, entry.name, type, entry.shortDescription || "", entry.description || "", entry.color || TYPE_COLORS[type] || "blue", ch, sig, status],
    );
    writeVersion(db, filePath, entry.id, ch, { shortDescription: entry.shortDescription || "", status, significance: sig });
    L.entries.push(entry.id);
    created++;
    addAliases(entry.id, gateAliases(entry.aliases));
    addDetails(entry.id, entry.details);
    queueRels(entry.id, entry.relationships);
    addWikiAppearance(db, filePath, entry.id, ch);
    resolver.register(entry.id, entry.name, type, names);
  }

  // ── Updates to existing entries ──
  for (const update of data.updates ?? []) {
    if (!update || !update.id) continue;
    const id = resolver.lookupId(update.id) ?? update.id;
    const existing = getEntry(id);
    if (!existing) continue;
    const append = typeof update.descriptionAppend === "string" ? update.descriptionAppend.trim() : "";
    patchEntry(id, {
      description: append && !existing.description.includes(append)
        ? (existing.description ? `${existing.description}\n\n${append}` : append)
        : existing.description,
      significance: typeof update.significance === "number" && update.significance ? clampSig(update.significance, existing.significance) : existing.significance,
      status: typeof update.status === "string" && update.status ? update.status : existing.status,
    });
    addAliases(id, gateAliases(update.newAliases));
    addDetails(id, update.details);
    for (const s of update.supersede ?? []) {
      if (s && typeof s.category === "string" && s.category) supersedeWikiDetails(db, filePath, id, s.category, ch);
    }
    queueRels(id, update.relationships);
    addWikiAppearance(db, filePath, id, ch);
    if (!L.entries.includes(id)) touched.add(id);
  }

  // ── Relationships (after every entity exists) ──
  for (const r of pendingRels) {
    const src = resolver.lookupId(r.sourceId) ?? r.sourceId;
    const tgt = resolver.lookupId(r.targetId) ?? r.targetId;
    if (src === tgt) continue;
    const relId = addWikiRelationship(db, filePath, { sourceId: src, targetId: tgt, relation: r.relation, sinceChapter: r.since });
    if (relId != null) L.relationships.push(relId);
  }

  // ── Arcs ──
  const arcById = () => new Map(getAllArcs(db, filePath).map((a) => [a.id, a]));
  const patchArc = (arc: WikiArcRow, patch: Partial<ArcFields>) => {
    const before = pick(arc, ARC_FIELDS);
    const after = { ...before, ...patch } as ArcFields;
    if (ARC_FIELDS.every((k) => before[k] === after[k])) return;
    db.run(
      "UPDATE wiki_arcs SET name = ?, description = ?, arc_type = ?, status = ?, start_chapter = ?, end_chapter = ? WHERE file_path = ? AND id = ?",
      [after.name, after.description, after.arc_type, after.status, after.start_chapter, after.end_chapter, filePath, arc.id],
    );
    L.arcPatches.push({ id: arc.id, before, after });
  };
  const addBeat = (arcId: string, beat: { beat_type?: unknown; description?: unknown } | undefined) => {
    if (!beat || typeof beat.description !== "string" || !beat.description.trim()) return;
    db.run(
      "INSERT INTO wiki_arc_beats (file_path, arc_id, chapter_index, beat_type, description) VALUES (?, ?, ?, ?, ?)",
      [filePath, arcId, ch, typeof beat.beat_type === "string" ? beat.beat_type : "escalation", beat.description.trim()],
    );
  };

  for (const u of data.arc_updates ?? []) {
    if (!u || !u.arc_id) continue;
    const arc = arcById().get(u.arc_id);
    if (!arc) continue;
    const status = typeof u.status === "string" && u.status ? u.status : arc.status;
    patchArc(arc, { status, end_chapter: status === "resolved" || status === "abandoned" ? ch : arc.end_chapter });
    addBeat(arc.id, u.beat);
  }

  for (const a of data.new_arcs ?? []) {
    if (!a || !a.id || !a.name) continue;
    const existing = arcById().get(a.id);
    if (existing) {
      patchArc(existing, { name: a.name, description: a.description || existing.description, arc_type: a.arc_type || existing.arc_type });
    } else {
      db.run(
        "INSERT INTO wiki_arcs (id, file_path, name, description, arc_type, status, start_chapter, end_chapter) VALUES (?, ?, ?, ?, ?, 'setup', ?, NULL)",
        [a.id, filePath, a.name, a.description || "", a.arc_type || "plot", ch],
      );
      L.arcs.push(a.id);
    }
    addBeat(a.id, a.initial_beat);
    for (const ent of a.entities ?? []) {
      if (!ent || !ent.entry_id) continue;
      const entId = resolver.lookupId(ent.entry_id) ?? ent.entry_id;
      if (!getEntry(entId)) continue;
      if (db.get("SELECT 1 FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ? AND entry_id = ?", [filePath, a.id, entId])) continue;
      addArcEntity(db, filePath, a.id, entId, ent.role || "");
      L.arcEntities.push([a.id, entId]);
    }
  }

  for (const am of data.arc_amendments ?? []) {
    if (!am) continue;
    const snapshot = (arcId: string) => {
      const arc = db.get<WikiArcRow>("SELECT * FROM wiki_arcs WHERE file_path = ? AND id = ?", [filePath, arcId]);
      if (!arc) return;
      L.removedArcs.push({
        arc,
        beats: db.all<WikiArcBeatRow>("SELECT * FROM wiki_arc_beats WHERE file_path = ? AND arc_id = ?", [filePath, arcId]),
        entities: db.all<{ entry_id: string; role: string }>("SELECT entry_id, role FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ?", [filePath, arcId]),
      });
    };
    if (am.action === "merge" && Array.isArray(am.source_arc_ids) && am.target_arc_id) {
      if (!db.get("SELECT 1 FROM wiki_arcs WHERE file_path = ? AND id = ?", [filePath, am.target_arc_id])) continue;
      for (const s of am.source_arc_ids) if (s !== am.target_arc_id) snapshot(s);
      mergeArcs(db, filePath, am.source_arc_ids, am.target_arc_id);
    } else if (am.action === "delete" && am.arc_id) {
      snapshot(am.arc_id);
      deleteArc(db, filePath, am.arc_id);
    }
  }

  // ── MC stats ──
  for (const stat of data.mc_stats ?? []) {
    if (!stat || !stat.key || !stat.category || !stat.name) continue;
    if (!L.mcStats.some((m) => m.key === stat.key)) {
      L.mcStats.push({ key: stat.key, before: db.get<MCStatRow>("SELECT * FROM wiki_mc_stats WHERE file_path = ? AND stat_key = ?", [filePath, stat.key]) ?? null });
    }
    db.run(`
      INSERT INTO wiki_mc_stats (file_path, stat_key, category, display_name, value, is_active, last_chapter)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path, stat_key) DO UPDATE SET
        category = excluded.category, display_name = excluded.display_name, value = excluded.value,
        is_active = excluded.is_active, last_chapter = excluded.last_chapter
    `, [filePath, stat.key, stat.category, stat.name, stat.value == null ? null : String(stat.value), stat.is_active === false ? 0 : 1, ch]);
  }

  markChapterProcessed(db, filePath, ch); // legacy mirror (old wiki UI reads wiki_processed)
  return { ledger: L, createdEntries: created, updatedEntries: touched.size };
}

function clampSig(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(1, Math.min(4, Math.round(v))) : fallback;
}

// ── Undo ────────────────────────────────────────────────────────────────────

/** Revert what a run did (reverse order of `applyChapterData`). Call inside a transaction. */
export function undoLedger(db: SqlDb, filePath: string, ch: number, L: RunLedger): void {
  // MC stats
  for (const m of [...L.mcStats].reverse()) {
    if (m.before) {
      const b = m.before;
      db.run(
        "UPDATE wiki_mc_stats SET category = ?, display_name = ?, value = ?, is_active = ?, last_chapter = ? WHERE file_path = ? AND stat_key = ?",
        [b.category, b.display_name, b.value, b.is_active, b.last_chapter, filePath, m.key],
      );
    } else {
      db.run("DELETE FROM wiki_mc_stats WHERE file_path = ? AND stat_key = ?", [filePath, m.key]);
    }
  }
  // Arcs removed by amendments come back (beats re-attached by id).
  for (const r of [...L.removedArcs].reverse()) {
    const a = r.arc;
    db.run(
      "INSERT OR IGNORE INTO wiki_arcs (id, file_path, name, description, arc_type, status, start_chapter, end_chapter) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [a.id, filePath, a.name, a.description, a.arc_type, a.status, a.start_chapter, a.end_chapter],
    );
    for (const b of r.beats) {
      const moved = db.run("UPDATE wiki_arc_beats SET arc_id = ? WHERE id = ? AND file_path = ?", [a.id, b.id, filePath]).changes;
      if (!moved) {
        db.run(
          "INSERT INTO wiki_arc_beats (id, file_path, arc_id, chapter_index, beat_type, description) VALUES (?, ?, ?, ?, ?, ?)",
          [b.id, filePath, a.id, b.chapter_index, b.beat_type, b.description],
        );
      }
    }
    for (const e of r.entities) {
      if (db.get("SELECT 1 FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, e.entry_id])) {
        db.run("INSERT OR IGNORE INTO wiki_arc_entities (file_path, arc_id, entry_id, role) VALUES (?, ?, ?, ?)", [filePath, a.id, e.entry_id, e.role]);
      }
    }
  }
  for (const [arcId, entryId] of L.arcEntities) {
    db.run("DELETE FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ? AND entry_id = ?", [filePath, arcId, entryId]);
  }
  db.run("DELETE FROM wiki_arc_beats WHERE file_path = ? AND chapter_index = ?", [filePath, ch]);
  for (const p of [...L.arcPatches].reverse()) {
    const cur = db.get<WikiArcRow>("SELECT * FROM wiki_arcs WHERE file_path = ? AND id = ?", [filePath, p.id]);
    if (!cur) continue;
    // Restore only the fields nobody changed since (later runs keep their edits).
    const restored = { ...pick(cur, ARC_FIELDS) };
    for (const k of ARC_FIELDS) if (cur[k] === p.after[k]) (restored as Record<string, unknown>)[k] = p.before[k];
    db.run(
      "UPDATE wiki_arcs SET name = ?, description = ?, arc_type = ?, status = ?, start_chapter = ?, end_chapter = ? WHERE file_path = ? AND id = ?",
      [restored.name, restored.description, restored.arc_type, restored.status, restored.start_chapter, restored.end_chapter, filePath, p.id],
    );
  }
  for (const id of L.arcs) {
    const others = db.get("SELECT 1 FROM wiki_arc_beats WHERE file_path = ? AND arc_id = ? AND chapter_index != ? LIMIT 1", [filePath, id, ch]);
    if (!others) deleteArc(db, filePath, id);
  }
  // Relationships, details, supersessions, appearances, aliases
  for (const id of L.relationships) db.run("DELETE FROM wiki_relationships WHERE file_path = ? AND id = ?", [filePath, id]);
  for (const id of L.details) db.run("DELETE FROM wiki_details WHERE file_path = ? AND id = ?", [filePath, id]);
  db.run("UPDATE wiki_details SET is_superseded = 0, superseded_chapter = NULL WHERE file_path = ? AND superseded_chapter = ?", [filePath, ch]);
  db.run("DELETE FROM wiki_appearances WHERE file_path = ? AND chapter_index = ?", [filePath, ch]);
  for (const [entryId, alias] of L.aliases) {
    db.run("DELETE FROM wiki_aliases WHERE file_path = ? AND entry_id = ? AND alias = ?", [filePath, entryId, alias]);
  }
  // Entry patches and versions
  for (const p of [...L.entryPatches].reverse()) {
    const cur = db.get<WikiEntryRow>("SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, p.id]);
    if (!cur) continue;
    const restored = { ...pick(cur, ENTRY_FIELDS) };
    for (const k of ENTRY_FIELDS) if (cur[k] === p.after[k]) (restored as Record<string, unknown>)[k] = p.before[k];
    db.run(
      "UPDATE wiki_entries SET name = ?, type = ?, short_description = ?, description = ?, color = ?, first_appearance = ?, significance = ?, status = ? WHERE file_path = ? AND id = ?",
      [restored.name, restored.type, restored.short_description, restored.description, restored.color, restored.first_appearance, restored.significance, restored.status, filePath, p.id],
    );
  }
  db.run("DELETE FROM wiki_entry_versions WHERE file_path = ? AND chapter_index = ?", [filePath, ch]);
  // Created entries go unless later chapters already rely on them.
  for (const id of L.entries) {
    const usedElsewhere =
      db.get("SELECT 1 FROM wiki_appearances WHERE file_path = ? AND entry_id = ? AND chapter_index != ? LIMIT 1", [filePath, id, ch]) ||
      db.get("SELECT 1 FROM wiki_details WHERE file_path = ? AND entry_id = ? AND chapter_index != ? LIMIT 1", [filePath, id, ch]);
    if (usedElsewhere) {
      const e = db.get<WikiEntryRow>("SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, id]);
      if (e) ensureBaselineVersion(db, filePath, e);
      continue;
    }
    db.run("DELETE FROM wiki_entry_versions WHERE file_path = ? AND entry_id = ?", [filePath, id]);
    db.run("DELETE FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, id]);
  }
  if (!L.summary) db.run("DELETE FROM wiki_chapter_summaries WHERE file_path = ? AND chapter_index = ?", [filePath, ch]);
  for (const logId of [...L.merges].reverse()) unmergeWikiEntries(db, filePath, logId);
  if (L.mcEntity) db.run("UPDATE wiki_meta SET mc_entity_id = ? WHERE file_path = ?", [L.mcEntity.before, filePath]);
  unmarkChapterProcessed(db, filePath, ch);
}

/** Undo one chapter's run(s) and forget them. Legacy chapters (no run row) fall back to the old
 *  per-chapter clear. Returns true if anything was cleared. Runs in its own transaction. */
export function clearChapterKnowledge(db: SqlDb, filePath: string, chapterIndex: number): boolean {
  return db.transaction(() => {
    const runs = db.all<KnowledgeRunRow>("SELECT * FROM knowledge_runs WHERE file_path = ? AND chapter_index = ?", [filePath, chapterIndex]);
    if (runs.length === 0) {
      const legacy = !!db.get("SELECT 1 FROM wiki_processed WHERE file_path = ? AND chapter_index = ?", [filePath, chapterIndex]);
      clearChapterWikiData(db, filePath, chapterIndex);
      return legacy;
    }
    for (const r of runs) {
      const L = parseLedger(r.created_ids);
      if (L) undoLedger(db, filePath, r.chapter_index, L);
      else clearChapterWikiData(db, filePath, r.chapter_index);
      db.run("DELETE FROM knowledge_runs WHERE file_path = ? AND chapter_id = ?", [filePath, r.chapter_id]);
    }
    return true;
  });
}

// ── Lane ────────────────────────────────────────────────────────────────────

/**
 * Per-book serial lane. Jobs for one book run one at a time in arrival order; a second request
 * for a chapter that is queued or running joins the first instead of running again.
 * (The scheduler's `lane()` gives the same guarantee across jobs; this one also covers direct
 * callers such as the recap task's inline ingest.)
 */
export class KnowledgeLane {
  private tails = new Map<string, Promise<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();

  run<T>(filePath: string, key: string, fn: () => Promise<T>): Promise<T> {
    const id = `${filePath}\u0000${key}`;
    const joined = this.inflight.get(id);
    if (joined) return joined as Promise<T>;
    const prev = this.tails.get(filePath) ?? Promise.resolve();
    const p = prev.then(fn, fn);
    // Settle bookkeeping is registered on `p` itself, before any caller can await it, so a
    // request made after completion never joins a finished run.
    const tail: Promise<void> = p.then(
      () => this.settle(filePath, id, p, tail),
      () => this.settle(filePath, id, p, tail),
    );
    this.tails.set(filePath, tail);
    this.inflight.set(id, p);
    return p;
  }

  private settle(filePath: string, id: string, p: Promise<unknown>, tail: Promise<void>): void {
    if (this.inflight.get(id) === p) this.inflight.delete(id);
    if (this.tails.get(filePath) === tail) this.tails.delete(filePath);
  }

  /** Number of keys queued or running (tests/diagnostics). */
  get size(): number {
    return this.inflight.size;
  }
}

export const knowledgeLane = new KnowledgeLane();

// ── Ingest one chapter ──────────────────────────────────────────────────────

export interface IngestDeps {
  db: SqlDb;
  getChapter(filePath: string, chapterIndex: number): Promise<SourceChapter>;
  /** One model call; returns the raw text. Throws `AIError` (e.g. "truncated" with `partial`). */
  complete(req: { system: string; user: string; signal: AbortSignal }): Promise<string>;
  labelOf?: ChapterLabeler;
  emit?(e: AIEvent): void;
  lane?: KnowledgeLane;
  now?(): number;
  log?(level: "debug" | "info" | "warn", msg: string, data?: unknown): void;
}

export interface IngestRequest {
  filePath: string;
  chapterIndex: number;
  bookTitle?: string;
  force?: boolean;
  signal: AbortSignal;
}

export interface IngestResult {
  filePath: string;
  chapterIndex: number;
  chapterId: string;
  status: "done" | "skipped" | "unchanged";
  createdEntries: number;
  updatedEntries: number;
}

function chapterText(ch: SourceChapter): string {
  return ch.paras.filter((p) => p.kind !== "image" && p.text.trim()).map((p) => p.text).join("\n\n");
}

/** Ingest a chapter through the per-book lane. */
export function ingestChapter(deps: IngestDeps, req: IngestRequest): Promise<IngestResult> {
  const lane = deps.lane ?? knowledgeLane;
  return lane.run(req.filePath, `ingest:${req.chapterIndex}`, () => ingestNow(deps, req));
}

async function ingestNow(deps: IngestDeps, req: IngestRequest): Promise<IngestResult> {
  const db = deps.db;
  const filePath = req.filePath;
  const now = deps.now ?? Date.now;
  const labelOf = deps.labelOf ?? defaultLabel;
  throwIfAborted(req.signal);

  const chapter = await deps.getChapter(filePath, req.chapterIndex);
  const ch = chapter.index;
  const base: Omit<IngestResult, "status"> = { filePath, chapterIndex: ch, chapterId: chapter.id, createdEntries: 0, updatedEntries: 0 };

  const prev = getRun(db, filePath, chapter.id);
  if (prev && (prev.status === "done" || prev.status === "skipped") && prev.task_version >= KNOWLEDGE_TASK_VERSION && !req.force) {
    return { ...base, status: "unchanged" };
  }
  // Processed by the legacy renderer path (no run row): keep it unless forced.
  if (!prev && !req.force && db.get("SELECT 1 FROM wiki_processed WHERE file_path = ? AND chapter_index = ?", [filePath, ch])) {
    return { ...base, status: "unchanged" };
  }

  const text = chapterText(chapter);
  if (!text.trim() || text.length > MAX_INGEST_CHARS || text.includes("data:image/")) {
    db.transaction(() => {
      writeRun(db, filePath, chapter, "skipped", emptyLedger(), now());
      markChapterProcessed(db, filePath, ch);
    });
    return { ...base, status: "skipped" };
  }

  const context = getContext(
    db,
    { filePath, frontier: { chapterIndex: ch - 1, mode: "frontier" }, purpose: "ingest", budgetChars: INGEST_CONTEXT_BUDGET, focusText: text },
    { frontierOf: () => ({ chapterIndex: ch - 1, mode: "frontier" }), labelOf },
  );
  const bookTitle = req.bookTitle ?? db.get<{ book_title: string }>("SELECT book_title FROM wiki_meta WHERE file_path = ?", [filePath])?.book_title ?? "";
  const user = buildIngestUserPrompt({ bookTitle, chapterIndex: ch, label: labelOf(ch), chapterTitle: chapter.title, text, context: context.text });

  let raw: string;
  let salvaged = false;
  try {
    raw = await deps.complete({ system: INGEST_SYSTEM_PROMPT, user, signal: req.signal });
  } catch (err) {
    // A truncated response still carries complete chapter objects worth keeping.
    const partial = err instanceof AIError && err.code === "truncated" ? err.partial?.text : undefined;
    if (!partial) throw err;
    raw = partial;
    salvaged = true;
  }
  throwIfAborted(req.signal);

  const parsed = parseWikiResponse(raw);
  const data = parsed ? pickChapter(parsed, ch) : null;
  if (!data) {
    throw new AIError(salvaged ? "truncated" : "parse", salvaged ? "Knowledge response was truncated before any chapter completed" : "Could not parse the knowledge response");
  }
  if (salvaged) deps.log?.("warn", `knowledge: salvaged a truncated response for chapter ${ch}`);

  const result = db.transaction(() => {
    const existing = getRun(db, filePath, chapter.id);
    if (existing) {
      const L = parseLedger(existing.created_ids);
      if (L) undoLedger(db, filePath, existing.chapter_index, L);
      else clearChapterWikiData(db, filePath, existing.chapter_index);
    } else if (db.get("SELECT 1 FROM wiki_processed WHERE file_path = ? AND chapter_index = ?", [filePath, ch])) {
      clearChapterWikiData(db, filePath, ch); // legacy-processed chapter being re-run
    }
    const applied = applyChapterData(db, {
      filePath, chapterIndex: ch, chapterId: chapter.id, bookTitle: req.bookTitle, data,
      mcEntityId: typeof parsed?.mc_entity_id === "string" && parsed.mc_entity_id ? parsed.mc_entity_id : undefined,
    });
    writeRun(db, filePath, chapter, "done", applied.ledger, now());
    return applied;
  });

  deps.emit?.({ type: "knowledge", filePath, chapters: [ch], reason: "ingest" });
  return { ...base, status: "done", createdEntries: result.createdEntries, updatedEntries: result.updatedEntries };
}

function pickChapter(parsed: AIWikiResponse, ch: number): AIWikiChapterData | null {
  const list = getChapterDataFromResponse(parsed, ch);
  const data = list.find((d) => d.chapter_index === ch) ?? (list.length === 1 ? list[0] : null);
  if (!data) return null;
  const rootStats = (parsed as { mc_stats?: AIWikiChapterData["mc_stats"] }).mc_stats;
  if (!data.mc_stats?.length && Array.isArray(rootStats)) data.mc_stats = rootStats;
  return { ...data, chapter_index: ch };
}

function writeRun(db: SqlDb, filePath: string, chapter: SourceChapter, status: KnowledgeRunRow["status"], ledger: RunLedger, at: number): void {
  db.run(`
    INSERT INTO knowledge_runs (file_path, chapter_id, chapter_index, task_version, status, created_ids, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path, chapter_id) DO UPDATE SET
      chapter_index = excluded.chapter_index, task_version = excluded.task_version, status = excluded.status,
      created_ids = excluded.created_ids, updated_at = excluded.updated_at
  `, [filePath, chapter.id, chapter.index, KNOWLEDGE_TASK_VERSION, status, JSON.stringify(ledger), at]);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new AIError("cancelled", "Cancelled");
}
