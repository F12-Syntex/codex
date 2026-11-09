/**
 * Frontier-gated reads (owner: WS-B). Every function takes a `Frontier` and returns only what was
 * known at it: entries first seen ≤ frontier, the latest description/status/significance version
 * ≤ frontier (`wiki_entry_versions`), aliases with `first_chapter` ≤ frontier, details,
 * relationships, summaries, arcs and beats ≤ frontier.
 *
 * Legacy rows written by the old renderer path have no versions / alias chapters; they fall back
 * to the entry row and `first_appearance` respectively.
 */

import type { SqlDb } from "../db/sql";
import type {
  ArcItem, ChapterSummaryItem, EntityDetail, EntityIndexItem, EntityRelationship, EntitySnapshot, Frontier, MCStat,
  WikiArcItem, WikiEntryListItem, WikiEntryType, WikiRelationshipItem, WikiSnapshot,
} from "../shared/knowledge/types";
import { maxChapterSql } from "./frontier";
import { getMCEntityId, getWikiMeta, tableExists, validateType, type EntryVersionRow, type WikiEntryRow } from "./store";

export type ChapterLabeler = (chapterIndex: number) => string;
/** Until WS-C's `classify.ts` labels are wired in: 1-based spine numbers. */
export const defaultLabel: ChapterLabeler = (i) => String(i + 1);

/** Relations that read the same from either end (shown on both entities). */
const SYMMETRIC = new Set([
  "friend", "ally", "rival", "enemy", "acquaintance", "colleague", "partner", "sibling", "spouse", "relative",
  "lover", "romantic-interest", "ex-partner", "betrothed", "allied-with", "at-war-with", "opposes",
]);

export interface VersionView {
  shortDescription: string;
  status: string;
  significance: number;
}

/** Latest version ≤ frontier per entry (entries without any versions are absent from the map). */
export function versionsAt(db: SqlDb, filePath: string, f: Frontier): { at: Map<string, VersionView>; versioned: Set<string> } {
  const at = new Map<string, VersionView>();
  const versioned = new Set<string>();
  if (!tableExists(db, "wiki_entry_versions")) return { at, versioned };
  for (const r of db.all<{ entry_id: string }>("SELECT DISTINCT entry_id FROM wiki_entry_versions WHERE file_path = ?", [filePath])) {
    versioned.add(r.entry_id);
  }
  const rows = db.all<EntryVersionRow>(
    "SELECT * FROM wiki_entry_versions WHERE file_path = ? AND chapter_index <= ? ORDER BY entry_id, chapter_index",
    [filePath, maxChapterSql(f)],
  );
  for (const r of rows) at.set(r.entry_id, { shortDescription: r.short_description, status: r.status, significance: r.significance });
  return { at, versioned };
}

function viewOf(e: WikiEntryRow, v: { at: Map<string, VersionView>; versioned: Set<string> }): VersionView {
  const hit = v.at.get(e.id);
  if (hit) return hit;
  if (!v.versioned.has(e.id)) return { shortDescription: e.short_description ?? "", status: e.status ?? "active", significance: e.significance ?? 1 };
  // Versions exist but all are after the frontier (e.g. first_appearance edited later).
  return { shortDescription: "", status: "active", significance: 1 };
}

export function visibleEntries(db: SqlDb, filePath: string, f: Frontier): WikiEntryRow[] {
  return db.all<WikiEntryRow>(
    "SELECT * FROM wiki_entries WHERE file_path = ? AND first_appearance <= ? AND trim(name) != '' ORDER BY first_appearance ASC, name ASC",
    [filePath, maxChapterSql(f)],
  );
}

function aliasRows(db: SqlDb, filePath: string, f: Frontier, minRelevance: number, entryId?: string): { entry_id: string; alias: string; relevance: number }[] {
  const hasFirst = aliasHasFirstChapter(db);
  const firstExpr = hasFirst ? "COALESCE(a.first_chapter, e.first_appearance)" : "e.first_appearance";
  return db.all<{ entry_id: string; alias: string; relevance: number }>(
    `SELECT a.entry_id, a.alias, a.relevance FROM wiki_aliases a
     JOIN wiki_entries e ON e.file_path = a.file_path AND e.id = a.entry_id
     WHERE a.file_path = ? AND a.relevance >= ? AND ${firstExpr} <= ? ${entryId ? "AND a.entry_id = ?" : ""}
     ORDER BY a.relevance DESC, a.alias ASC`,
    entryId ? [filePath, minRelevance, maxChapterSql(f), entryId] : [filePath, minRelevance, maxChapterSql(f)],
  );
}

const aliasColCache = new WeakMap<SqlDb, boolean>();
function aliasHasFirstChapter(db: SqlDb): boolean {
  const hit = aliasColCache.get(db);
  if (hit) return true;
  const has = db.all<{ name: string }>("PRAGMA table_info(wiki_aliases)").some((c) => c.name === "first_chapter");
  if (has) aliasColCache.set(db, true);
  return has;
}

/** Highlight index (`knowledge:entityIndex`): aliases with relevance ≥ 3 and first_chapter ≤ frontier. */
export function getEntityIndexAt(db: SqlDb, filePath: string, f: Frontier): EntityIndexItem[] {
  const entries = visibleEntries(db, filePath, f);
  const byEntry = new Map<string, string[]>();
  for (const a of aliasRows(db, filePath, f, 3)) {
    const list = byEntry.get(a.entry_id) ?? [];
    list.push(a.alias);
    byEntry.set(a.entry_id, list);
  }
  return entries.map((e) => ({
    id: e.id,
    name: e.name,
    aliases: (byEntry.get(e.id) ?? []).filter((a) => a.toLowerCase() !== e.name.toLowerCase()),
    type: validateType(e.type),
    color: e.color || "blue",
  }));
}

function lastSeenMap(db: SqlDb, filePath: string, f: Frontier): Map<string, { last: number; count: number }> {
  const m = new Map<string, { last: number; count: number }>();
  for (const r of db.all<{ entry_id: string; last: number; count: number }>(
    "SELECT entry_id, MAX(chapter_index) AS last, COUNT(*) AS count FROM wiki_appearances WHERE file_path = ? AND chapter_index <= ? GROUP BY entry_id",
    [filePath, maxChapterSql(f)],
  )) m.set(r.entry_id, { last: Number(r.last), count: Number(r.count) });
  return m;
}

/** One entity as known at the frontier (`knowledge:entity`), or null if not yet introduced. */
export function getEntityAt(db: SqlDb, filePath: string, id: string, f: Frontier): EntitySnapshot | null {
  const e = db.get<WikiEntryRow>("SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, id]);
  const max = maxChapterSql(f);
  if (!e || e.first_appearance > max) return null;
  const snap = snapshotsFor(db, filePath, [e], f)[0];
  if (!snap) return null;
  // Article extras (Phase 2b). The long description accumulates over chapters and is not
  // versioned: show it only when nothing about the entry happens after the frontier.
  const last = db.get<{ last: number | null }>(
    `SELECT MAX(ch) AS last FROM (
       SELECT MAX(chapter_index) AS ch FROM wiki_appearances WHERE file_path = ? AND entry_id = ?
       UNION ALL SELECT MAX(chapter_index) FROM wiki_details WHERE file_path = ? AND entry_id = ?
       UNION ALL SELECT MAX(since_chapter) FROM wiki_relationships WHERE file_path = ? AND (source_id = ? OR target_id = ?)
     )`,
    [filePath, id, filePath, id, filePath, id, id],
  )?.last;
  const versionMax = tableExists(db, "wiki_entry_versions")
    ? db.get<{ last: number | null }>("SELECT MAX(chapter_index) AS last FROM wiki_entry_versions WHERE file_path = ? AND entry_id = ?", [filePath, id])?.last
    : null;
  const touched = Math.max(e.first_appearance, Number(last ?? -1), Number(versionMax ?? -1));
  if (e.description && (f.mode === "off" || touched <= max)) snap.description = e.description;
  snap.aliasDetails = aliasDetailRows(db, filePath, f, id).filter((a) => a.alias.toLowerCase() !== e.name.toLowerCase());
  snap.appearances = db
    .all<{ chapter_index: number }>(
      "SELECT chapter_index FROM wiki_appearances WHERE file_path = ? AND entry_id = ? AND chapter_index <= ? ORDER BY chapter_index ASC",
      [filePath, id, max],
    )
    .map((r) => Number(r.chapter_index));
  return snap;
}

/** Aliases ≤ frontier with kind and relevance (every relevance), strongest first. */
function aliasDetailRows(db: SqlDb, filePath: string, f: Frontier, entryId: string): { alias: string; type: string; relevance: number }[] {
  const firstExpr = aliasHasFirstChapter(db) ? "COALESCE(a.first_chapter, e.first_appearance)" : "e.first_appearance";
  return db
    .all<{ alias: string; alias_type: string | null; relevance: number | null }>(
      `SELECT a.alias, a.alias_type, a.relevance FROM wiki_aliases a
       JOIN wiki_entries e ON e.file_path = a.file_path AND e.id = a.entry_id
       WHERE a.file_path = ? AND a.entry_id = ? AND ${firstExpr} <= ?
       ORDER BY a.relevance DESC, a.alias ASC`,
      [filePath, entryId, maxChapterSql(f)],
    )
    .map((a) => ({ alias: a.alias, type: a.alias_type || "name", relevance: Number(a.relevance ?? 3) }));
}

/** Snapshots for several entries at once (batched queries). */
export function snapshotsFor(db: SqlDb, filePath: string, entries: WikiEntryRow[], f: Frontier): EntitySnapshot[] {
  if (entries.length === 0) return [];
  const max = maxChapterSql(f);
  const versions = versionsAt(db, filePath, f);
  const seen = lastSeenMap(db, filePath, f);
  const ids = new Set(entries.map((e) => e.id));
  // Large sets: scan the book instead of binding thousands of parameters (sql.js caps at 999).
  const many = ids.size > 300;
  const idList = many ? [] : [...ids];
  const inIds = (col: string) => (many ? "1 = 1" : `${col} IN (${idList.map(() => "?").join(",")})`);

  const aliases = new Map<string, string[]>();
  for (const a of aliasRows(db, filePath, f, 2)) {
    if (!ids.has(a.entry_id)) continue;
    const list = aliases.get(a.entry_id) ?? [];
    list.push(a.alias);
    aliases.set(a.entry_id, list);
  }

  const details = new Map<string, EntityDetail[]>();
  for (const d of db.all<{ entry_id: string; chapter_index: number; category: string; content: string; source_text: string | null; is_superseded: number; superseded_chapter: number | null; relevance: number | null }>(
    `SELECT entry_id, chapter_index, category, content, source_text, is_superseded, superseded_chapter, relevance FROM wiki_details
     WHERE file_path = ? AND chapter_index <= ? AND ${inIds("entry_id")}
     ORDER BY chapter_index ASC, relevance DESC, id ASC`,
    [filePath, max, ...idList],
  )) {
    if (!ids.has(d.entry_id)) continue;
    const list = details.get(d.entry_id) ?? [];
    const superseded = d.is_superseded === 1 && d.superseded_chapter != null && d.superseded_chapter <= max;
    const item: EntityDetail = { chapter: d.chapter_index, category: d.category, content: d.content, superseded };
    if (d.source_text) item.source = d.source_text;
    if (d.relevance != null) item.relevance = Number(d.relevance);
    list.push(item);
    details.set(d.entry_id, list);
  }

  // Names of every visible entry (relationship targets must be visible too).
  const names = new Map<string, string>();
  for (const r of db.all<{ id: string; name: string }>("SELECT id, name FROM wiki_entries WHERE file_path = ? AND first_appearance <= ?", [filePath, max])) {
    names.set(r.id, r.name);
  }
  const rels = new Map<string, EntityRelationship[]>();
  for (const r of db.all<{ source_id: string; target_id: string; relation: string; since_chapter: number; until_chapter: number | null }>(
    `SELECT source_id, target_id, relation, since_chapter, until_chapter FROM wiki_relationships
     WHERE file_path = ? AND since_chapter <= ? AND (${inIds("source_id")} OR ${inIds("target_id")})
     ORDER BY since_chapter ASC, id ASC`,
    [filePath, max, ...idList, ...idList],
  )) {
    if (r.until_chapter != null && r.until_chapter <= max) continue; // ended (as far as the reader knows)
    const push = (from: string, to: string) => {
      if (!ids.has(from) || !names.has(to)) return;
      const list = rels.get(from) ?? [];
      if (!list.some((x) => x.targetId === to && x.relation === r.relation)) {
        list.push({ targetId: to, targetName: names.get(to)!, relation: r.relation, since: r.since_chapter });
      }
      rels.set(from, list);
    };
    push(r.source_id, r.target_id);
    if (SYMMETRIC.has(r.relation.toLowerCase())) push(r.target_id, r.source_id);
  }

  return entries.map((e) => {
    const v = viewOf(e, versions);
    const s = seen.get(e.id);
    const snap: EntitySnapshot = {
      id: e.id,
      name: e.name,
      type: validateType(e.type),
      aliases: (aliases.get(e.id) ?? []).filter((a) => a.toLowerCase() !== e.name.toLowerCase()),
      shortDescription: v.shortDescription,
      status: v.status,
      significance: v.significance,
      firstAppearance: e.first_appearance,
      lastSeen: Math.max(e.first_appearance, s?.last ?? e.first_appearance),
      color: e.color || "blue",
      details: details.get(e.id) ?? [],
      relationships: rels.get(e.id) ?? [],
    };
    return snap;
  });
}

/** Summaries ≤ frontier, optionally within [from, to]. */
export function summariesAt(
  db: SqlDb,
  filePath: string,
  f: Frontier,
  labelOf: ChapterLabeler = defaultLabel,
  from = 0,
  to = Number.MAX_SAFE_INTEGER,
): (ChapterSummaryItem & { keyEvents: string[] })[] {
  const hi = Math.min(maxChapterSql(f), to);
  return db
    .all<{ chapter_index: number; summary: string; mood: string | null; key_events: string | null }>(
      "SELECT chapter_index, summary, mood, key_events FROM wiki_chapter_summaries WHERE file_path = ? AND chapter_index >= ? AND chapter_index <= ? ORDER BY chapter_index ASC",
      [filePath, Math.max(0, from), hi],
    )
    .map((s) => {
      const item: ChapterSummaryItem & { keyEvents: string[] } = {
        chapter: s.chapter_index,
        label: labelOf(s.chapter_index),
        summary: s.summary,
        keyEvents: (s.key_events ?? "").split(",").map((k) => k.trim()).filter(Boolean),
      };
      if (s.mood) item.mood = s.mood;
      return item;
    });
}

/** Arcs as of the frontier: started ≤ frontier; resolution/end hidden if after it. */
export function arcsAt(db: SqlDb, filePath: string, f: Frontier): WikiArcItem[] {
  const max = maxChapterSql(f);
  const arcs = db.all<{ id: string; name: string; description: string; arc_type: string; status: string; start_chapter: number; end_chapter: number | null }>(
    "SELECT * FROM wiki_arcs WHERE file_path = ? AND start_chapter <= ? ORDER BY start_chapter ASC",
    [filePath, max],
  );
  const beats = new Map<string, { chapter: number; type: string; description: string }[]>();
  for (const b of db.all<{ arc_id: string; chapter_index: number; beat_type: string; description: string }>(
    "SELECT arc_id, chapter_index, beat_type, description FROM wiki_arc_beats WHERE file_path = ? AND chapter_index <= ? ORDER BY chapter_index ASC, id ASC",
    [filePath, max],
  )) {
    const list = beats.get(b.arc_id) ?? [];
    list.push({ chapter: b.chapter_index, type: b.beat_type, description: b.description });
    beats.set(b.arc_id, list);
  }
  return arcs.map((a) => {
    const ended = a.end_chapter != null && a.end_chapter <= max;
    const arcBeats = beats.get(a.id) ?? [];
    // Status as of the frontier: an arc that ends later is still unfolding; if its latest
    // visible beat is a climax, say so.
    // Arc status is not versioned: when it ended after the frontier, infer it from the latest
    // visible beat instead of revealing the ending.
    let status = a.status;
    if (!ended && (status === "resolved" || status === "abandoned")) {
      const last = arcBeats[arcBeats.length - 1]?.type;
      status = last === "setup" ? "setup" : last === "climax" ? "climax" : "active";
    }
    return {
      id: a.id,
      name: a.name,
      description: a.description ?? "",
      type: a.arc_type ?? "plot",
      status,
      startChapter: a.start_chapter,
      endChapter: ended ? a.end_chapter : null,
      beats: arcBeats,
    };
  });
}

export function arcItems(arcs: WikiArcItem[]): ArcItem[] {
  return arcs.map((a) => {
    const last = a.beats[a.beats.length - 1];
    const item: ArcItem = { id: a.id, name: a.name, type: a.type, status: a.status };
    if (last) item.latestBeat = `[${last.type}] ${last.description}`;
    return item;
  });
}

export function mcAt(db: SqlDb, filePath: string, f: Frontier): WikiSnapshot["mc"] {
  const entityId = getMCEntityId(db, filePath);
  if (!entityId) return undefined;
  const entry = db.get<{ first_appearance: number }>("SELECT first_appearance FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, entityId]);
  const max = maxChapterSql(f);
  if (!entry || entry.first_appearance > max) return undefined;
  // Stats are not versioned: a stat last updated after the frontier is hidden entirely.
  const stats = db
    .all<{ display_name: string; value: string | null; category: string; is_active: number; last_chapter: number }>(
      "SELECT display_name, value, category, is_active, last_chapter FROM wiki_mc_stats WHERE file_path = ? AND last_chapter <= ? ORDER BY category, display_name",
      [filePath, max],
    )
    .map((s) => ({ name: s.display_name, value: s.value, category: s.category, active: s.is_active === 1, chapter: s.last_chapter }));
  return { entityId, stats };
}

export function mcStatsBrief(mc: WikiSnapshot["mc"]): { entityId: string; stats: MCStat[] } | undefined {
  if (!mc) return undefined;
  return { entityId: mc.entityId, stats: mc.stats.filter((s) => s.active).map((s) => ({ name: s.name, value: s.value })) };
}

/** Chapters with a completed knowledge run (new or legacy), any frontier. */
export function processedChapters(db: SqlDb, filePath: string): number[] {
  const set = new Set<number>();
  for (const r of db.all<{ chapter_index: number }>("SELECT chapter_index FROM wiki_processed WHERE file_path = ?", [filePath])) set.add(r.chapter_index);
  if (tableExists(db, "knowledge_runs")) {
    for (const r of db.all<{ chapter_index: number }>("SELECT chapter_index FROM knowledge_runs WHERE file_path = ? AND status = 'done'", [filePath])) {
      set.add(r.chapter_index);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** Everything the wiki window lists (`knowledge:wiki`). */
export function buildWikiSnapshot(db: SqlDb, filePath: string, f: Frontier, labelOf: ChapterLabeler = defaultLabel): WikiSnapshot {
  const max = maxChapterSql(f);
  const entries = visibleEntries(db, filePath, f);
  const versions = versionsAt(db, filePath, f);
  const seen = lastSeenMap(db, filePath, f);
  const aliases = new Map<string, string[]>();
  for (const a of aliasRows(db, filePath, f, 2)) {
    const list = aliases.get(a.entry_id) ?? [];
    list.push(a.alias);
    aliases.set(a.entry_id, list);
  }
  const visible = new Set(entries.map((e) => e.id));
  const list: WikiEntryListItem[] = entries.map((e) => {
    const v = viewOf(e, versions);
    const s = seen.get(e.id);
    return {
      id: e.id,
      name: e.name,
      type: validateType(e.type) as WikiEntryType,
      color: e.color || "blue",
      shortDescription: v.shortDescription,
      status: v.status,
      significance: v.significance,
      firstAppearance: e.first_appearance,
      lastSeen: Math.max(e.first_appearance, s?.last ?? e.first_appearance),
      aliases: (aliases.get(e.id) ?? []).filter((a) => a.toLowerCase() !== e.name.toLowerCase()),
      appearanceCount: s?.count ?? 0,
    };
  });
  const relationships: WikiRelationshipItem[] = db
    .all<{ source_id: string; target_id: string; relation: string; since_chapter: number; until_chapter: number | null; description: string | null }>(
      "SELECT source_id, target_id, relation, since_chapter, until_chapter, description FROM wiki_relationships WHERE file_path = ? AND since_chapter <= ? ORDER BY since_chapter ASC, id ASC",
      [filePath, max],
    )
    .filter((r) => visible.has(r.source_id) && visible.has(r.target_id))
    .map((r) => ({
      sourceId: r.source_id,
      targetId: r.target_id,
      relation: r.relation,
      since: r.since_chapter,
      until: r.until_chapter != null && r.until_chapter <= max ? r.until_chapter : null,
      description: r.description ?? "",
    }));
  const snap: WikiSnapshot = {
    filePath,
    bookTitle: getWikiMeta(db, filePath)?.book_title ?? "",
    frontier: f,
    entries: list,
    relationships,
    summaries: summariesAt(db, filePath, f, labelOf),
    arcs: arcsAt(db, filePath, f),
    processedChapters: processedChapters(db, filePath),
  };
  const mc = mcAt(db, filePath, f);
  if (mc) snap.mc = mc;
  return snap;
}
