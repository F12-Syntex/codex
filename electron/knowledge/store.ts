/**
 * Knowledge store: the wiki tables behind `SqlDb` (owner: WS-B).
 *
 * The first half is a 1:1 port of the legacy wiki section of `electron/database.ts` (same SQL,
 * same semantics); `database.ts` keeps its exported functions and delegates here, so the legacy
 * `wiki:*` IPC handlers behave exactly as before until Phase 3 removes them.
 *
 * The second half holds helpers the new knowledge modules share (versions, ids, run bookkeeping).
 * Everything here is synchronous; wrap multi-statement writes in `db.transaction`.
 */

import type { SqlDb } from "../db/sql";
import type { WikiEntryType } from "../shared/knowledge/types";

// ── Row types (moved from database.ts, re-exported there) ───────────────────

export interface WikiEntryRow {
  id: string;
  file_path: string;
  name: string;
  type: string;
  short_description: string;
  description: string;
  color: string;
  first_appearance: number;
  significance: number;
  status: string;
}

export interface WikiDetailRow {
  id: number;
  file_path: string;
  entry_id: string;
  chapter_index: number;
  category: string;
  content: string;
  relevance: number;
  is_superseded: number;
  superseded_chapter: number | null;
  source_text?: string;
}

export interface WikiAliasRow {
  alias: string;
  alias_type: string;
  relevance: number;
}

export interface WikiRelationshipRow {
  id: number;
  file_path: string;
  source_id: string;
  target_id: string;
  relation: string;
  since_chapter: number;
  until_chapter: number | null;
  description: string;
}

export interface WikiChapterSummaryRow {
  file_path: string;
  chapter_index: number;
  summary: string;
  key_events: string;
  active_entities: string;
  mood: string;
}

export interface WikiArcRow {
  id: string;
  file_path: string;
  name: string;
  description: string;
  arc_type: string;
  status: string;
  start_chapter: number;
  end_chapter: number | null;
}

export interface WikiArcBeatRow {
  id: number;
  file_path: string;
  arc_id: string;
  chapter_index: number;
  beat_type: string;
  description: string;
}

export interface WikiMergeLogRow {
  id: number;
  file_path: string;
  source_id: string;
  target_id: string;
  source_name: string;
  target_name: string;
  source_snapshot: string;
  merged_at: string;
}

export interface MCStatRow {
  id: number;
  file_path: string;
  stat_key: string;
  category: string;
  display_name: string;
  value: string | null;
  is_active: number;
  last_chapter: number;
}

export type WikiAliasInput = string | { alias: string; alias_type?: string; relevance?: number };

export const WIKI_TABLES = [
  "wiki_arc_beats", "wiki_arc_entities", "wiki_arcs",
  "wiki_chapter_summaries", "wiki_appearances",
  "wiki_relationships", "wiki_details", "wiki_aliases",
  "wiki_entries", "wiki_processed", "wiki_mc_stats", "wiki_meta",
] as const;

/** Tables added by the knowledge area (cleared together with the wiki for a book). */
export const KNOWLEDGE_TABLES = ["wiki_entry_versions", "knowledge_runs"] as const;

export const TYPE_COLORS: Record<WikiEntryType, string> = {
  character: "blue",
  item: "amber",
  location: "emerald",
  event: "rose",
  concept: "violet",
};

export const VALID_TYPES: readonly WikiEntryType[] = ["character", "item", "location", "event", "concept"];

export function validateType(t: unknown): WikiEntryType {
  return VALID_TYPES.includes(t as WikiEntryType) ? (t as WikiEntryType) : "concept";
}

// ══ Legacy API (ported 1:1 from database.ts) ════════════════════════════════

// ── Entries ──

export function upsertWikiEntry(db: SqlDb, entry: {
  id: string;
  filePath: string;
  name: string;
  type: string;
  shortDescription?: string;
  description?: string;
  color?: string;
  firstAppearance?: number;
  significance?: number;
  status?: string;
}): void {
  db.run(`
    INSERT INTO wiki_entries (id, file_path, name, type, short_description, description, color, first_appearance, significance, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path, id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      short_description = excluded.short_description,
      description = excluded.description,
      color = excluded.color,
      first_appearance = excluded.first_appearance,
      significance = excluded.significance,
      status = excluded.status
  `, [
    entry.id,
    entry.filePath,
    entry.name,
    entry.type,
    entry.shortDescription ?? "",
    entry.description ?? "",
    entry.color ?? "blue",
    entry.firstAppearance ?? 0,
    entry.significance ?? 1,
    entry.status ?? "active",
  ]);
}

/** Remove wiki entries with empty/null name, id, or short_description (created by truncated AI responses). */
export function purgeNullWikiEntries(db: SqlDb, filePath: string): number {
  return db.run(
    `DELETE FROM wiki_entries
     WHERE file_path = ?
       AND (trim(name) = '' OR trim(id) = '' OR trim(COALESCE(short_description,'')) = '')`,
    [filePath],
  ).changes;
}

export function getWikiEntries(db: SqlDb, filePath: string): WikiEntryRow[] {
  return db.all<WikiEntryRow>("SELECT * FROM wiki_entries WHERE file_path = ? ORDER BY first_appearance ASC", [filePath]);
}

export function getWikiEntry(db: SqlDb, filePath: string, entryId: string): WikiEntryRow | null {
  return db.get<WikiEntryRow>("SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, entryId]) ?? null;
}

export function deleteWikiEntry(db: SqlDb, filePath: string, entryId: string): void {
  db.run("DELETE FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, entryId]);
}

// ── Merge ──

/** Merge sourceId into targetId — moves all data, logs for undo. Returns the merge-log id, or
 *  null when either entry is missing (nothing changed). */
export function mergeWikiEntries(db: SqlDb, filePath: string, sourceId: string, targetId: string): number | null {
  return db.transaction(() => {
    const source = db.get<WikiEntryRow>("SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, sourceId]);
    const target = db.get<WikiEntryRow>("SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, targetId]);
    if (!source || !target) return null;

    // Snapshot source for undo
    const aliases = db.all<{ alias: string }>("SELECT alias FROM wiki_aliases WHERE file_path = ? AND entry_id = ?", [filePath, sourceId]).map((r) => r.alias);
    const details = db.all("SELECT * FROM wiki_details WHERE file_path = ? AND entry_id = ?", [filePath, sourceId]);
    const relationships = db.all("SELECT * FROM wiki_relationships WHERE file_path = ? AND (source_id = ? OR target_id = ?)", [filePath, sourceId, sourceId]);
    const appearances = db.all<{ chapter_index: number }>("SELECT chapter_index FROM wiki_appearances WHERE file_path = ? AND entry_id = ?", [filePath, sourceId]).map((r) => r.chapter_index);

    // Added in Phase 1 (older log rows lack them; unmerge treats them as optional): what the merge
    // changes on the target, the source's arc roles and version history, for a faithful undo.
    const arcEntitiesSnap = db.all("SELECT arc_id, role FROM wiki_arc_entities WHERE file_path = ? AND entry_id = ?", [filePath, sourceId]);
    const versions = tableExists(db, "wiki_entry_versions")
      ? db.all("SELECT * FROM wiki_entry_versions WHERE file_path = ? AND entry_id = ?", [filePath, sourceId])
      : [];
    const targetBefore = { description: target.description, significance: target.significance, first_appearance: target.first_appearance };
    const targetAliases = db.all<{ alias: string }>("SELECT alias FROM wiki_aliases WHERE file_path = ? AND entry_id = ?", [filePath, targetId]).map((r) => r.alias);
    const targetArcs = db.all<{ arc_id: string }>("SELECT arc_id FROM wiki_arc_entities WHERE file_path = ? AND entry_id = ?", [filePath, targetId]).map((r) => r.arc_id);
    const targetAppearances = db.all<{ chapter_index: number }>("SELECT chapter_index FROM wiki_appearances WHERE file_path = ? AND entry_id = ?", [filePath, targetId]).map((r) => r.chapter_index);
    const snapshot = JSON.stringify({ entry: source, aliases, details, relationships, appearances, arcEntities: arcEntitiesSnap, versions, targetBefore, targetAliases, targetArcs, targetAppearances });

    const logId = db.run(
      "INSERT INTO wiki_merge_log (file_path, source_id, target_id, source_name, target_name, source_snapshot) VALUES (?, ?, ?, ?, ?, ?)",
      [filePath, sourceId, targetId, source.name, target.name, snapshot],
    ).lastInsertRowid;

    // Append source description to target
    if (source.description) {
      const newDesc = target.description ? `${target.description}\n\n${source.description}` : source.description;
      db.run("UPDATE wiki_entries SET description = ? WHERE file_path = ? AND id = ?", [newDesc, filePath, targetId]);
    }

    // Bump significance
    if (source.significance > target.significance) {
      db.run("UPDATE wiki_entries SET significance = ? WHERE file_path = ? AND id = ?", [source.significance, filePath, targetId]);
    }

    // Use earliest first_appearance
    if (source.first_appearance < target.first_appearance) {
      db.run("UPDATE wiki_entries SET first_appearance = ? WHERE file_path = ? AND id = ?", [source.first_appearance, filePath, targetId]);
    }

    // Add source name + aliases as aliases of target
    db.run("INSERT OR IGNORE INTO wiki_aliases (file_path, entry_id, alias) VALUES (?, ?, ?)", [filePath, targetId, source.name]);
    for (const alias of aliases) {
      db.run("INSERT OR IGNORE INTO wiki_aliases (file_path, entry_id, alias) VALUES (?, ?, ?)", [filePath, targetId, alias]);
    }

    // Move details
    db.run("UPDATE wiki_details SET entry_id = ? WHERE file_path = ? AND entry_id = ?", [targetId, filePath, sourceId]);

    // Move appearances (ignore duplicates)
    for (const ch of appearances) {
      db.run("INSERT OR IGNORE INTO wiki_appearances (file_path, entry_id, chapter_index) VALUES (?, ?, ?)", [filePath, targetId, ch]);
    }

    // Move relationships — repoint source_id/target_id references
    db.run("UPDATE wiki_relationships SET source_id = ? WHERE file_path = ? AND source_id = ?", [targetId, filePath, sourceId]);
    db.run("UPDATE wiki_relationships SET target_id = ? WHERE file_path = ? AND target_id = ?", [targetId, filePath, sourceId]);

    // Clean up self-referencing relationships (both sides now point to targetId)
    db.run("DELETE FROM wiki_relationships WHERE file_path = ? AND source_id = target_id", [filePath]);

    // Clean up duplicate relationships (same source, target, relation)
    db.run(`DELETE FROM wiki_relationships WHERE file_path = ? AND id NOT IN (
      SELECT MIN(id) FROM wiki_relationships WHERE file_path = ? GROUP BY source_id, target_id, relation
    )`, [filePath, filePath]);

    // Move arc entity references
    const arcEntities = db.all<{ arc_id: string; role: string }>("SELECT arc_id, role FROM wiki_arc_entities WHERE file_path = ? AND entry_id = ?", [filePath, sourceId]);
    for (const ae of arcEntities) {
      db.run("INSERT OR IGNORE INTO wiki_arc_entities (file_path, arc_id, entry_id, role) VALUES (?, ?, ?, ?)", [filePath, ae.arc_id, targetId, ae.role]);
    }
    // Remove source arc entities before deleting entry
    db.run("DELETE FROM wiki_arc_entities WHERE file_path = ? AND entry_id = ?", [filePath, sourceId]);

    // Versions: keep the target's own history; the source's history is in the snapshot.
    if (tableExists(db, "wiki_entry_versions")) {
      db.run("DELETE FROM wiki_entry_versions WHERE file_path = ? AND entry_id = ?", [filePath, sourceId]);
    }

    // Delete source entry (cascades aliases, remaining references)
    db.run("DELETE FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, sourceId]);
    return logId;
  });
}

/** Undo a merge — restore the source entry from snapshot */
export function unmergeWikiEntries(db: SqlDb, filePath: string, mergeLogId: number): void {
  db.transaction(() => {
    const log = db.get<WikiMergeLogRow>("SELECT * FROM wiki_merge_log WHERE id = ? AND file_path = ?", [mergeLogId, filePath]);
    if (!log) return;

    const snapshot = JSON.parse(log.source_snapshot) as {
      entry: WikiEntryRow;
      aliases: string[];
      details: { chapter_index: number; category: string; content: string; entry_id: string }[];
      relationships: { id?: number; source_id: string; target_id: string; relation: string; since_chapter: number; until_chapter: number | null; description: string }[];
      appearances: number[];
      arcEntities?: { arc_id: string; role: string }[];
      versions?: { chapter_index: number; short_description: string; status: string; significance: number }[];
      targetBefore?: { description: string; significance: number; first_appearance: number };
      targetAliases?: string[];
      targetArcs?: string[];
      targetAppearances?: number[];
    };

    // Re-create the source entry
    const e = snapshot.entry;
    db.run(
      "INSERT OR IGNORE INTO wiki_entries (id, file_path, name, type, short_description, description, color, first_appearance, significance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [e.id, filePath, e.name, e.type, e.short_description, e.description, e.color, e.first_appearance, e.significance, e.status],
    );

    // Re-add aliases
    for (const alias of snapshot.aliases) {
      db.run("INSERT OR IGNORE INTO wiki_aliases (file_path, entry_id, alias) VALUES (?, ?, ?)", [filePath, e.id, alias]);
    }

    // Re-add details (they were moved, so move them back)
    for (const d of snapshot.details) {
      db.run(
        "UPDATE wiki_details SET entry_id = ? WHERE file_path = ? AND entry_id = ? AND chapter_index = ? AND category = ? AND content = ?",
        [e.id, filePath, log.target_id, d.chapter_index, d.category, d.content],
      );
    }

    // Re-add appearances (and drop the ones the merge copied onto the target, when known)
    for (const ch of snapshot.appearances) {
      db.run("INSERT OR IGNORE INTO wiki_appearances (file_path, entry_id, chapter_index) VALUES (?, ?, ?)", [filePath, e.id, ch]);
      if (snapshot.targetAppearances && !snapshot.targetAppearances.includes(ch)) {
        db.run("DELETE FROM wiki_appearances WHERE file_path = ? AND entry_id = ? AND chapter_index = ?", [filePath, log.target_id, ch]);
      }
    }

    // Remove source name from target aliases (unless the target had them before the merge)
    const keep = new Set(snapshot.targetAliases ?? []);
    for (const alias of [e.name, ...snapshot.aliases]) {
      if (keep.has(alias)) continue;
      db.run("DELETE FROM wiki_aliases WHERE file_path = ? AND entry_id = ? AND alias = ?", [filePath, log.target_id, alias]);
    }

    // Snapshots written since Phase 1 also restore relationships, arc roles, versions and the
    // target fields the merge changed.
    for (const r of snapshot.relationships) {
      if (r.id == null) continue;
      const exists = db.get("SELECT 1 FROM wiki_relationships WHERE id = ? AND file_path = ?", [r.id, filePath]);
      if (exists) {
        db.run("UPDATE wiki_relationships SET source_id = ?, target_id = ? WHERE id = ? AND file_path = ?", [r.source_id, r.target_id, r.id, filePath]);
      } else if (
        db.get("SELECT 1 FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, r.source_id]) &&
        db.get("SELECT 1 FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, r.target_id])
      ) {
        db.run(
          "INSERT INTO wiki_relationships (id, file_path, source_id, target_id, relation, since_chapter, until_chapter, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [r.id, filePath, r.source_id, r.target_id, r.relation, r.since_chapter, r.until_chapter, r.description ?? ""],
        );
      }
    }
    for (const ae of snapshot.arcEntities ?? []) {
      if (db.get("SELECT 1 FROM wiki_arcs WHERE file_path = ? AND id = ?", [filePath, ae.arc_id])) {
        db.run("INSERT OR IGNORE INTO wiki_arc_entities (file_path, arc_id, entry_id, role) VALUES (?, ?, ?, ?)", [filePath, ae.arc_id, e.id, ae.role]);
        // The merge copied this role onto the target; drop it unless the target had it before.
        if (snapshot.targetArcs && !snapshot.targetArcs.includes(ae.arc_id)) {
          db.run("DELETE FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ? AND entry_id = ?", [filePath, ae.arc_id, log.target_id]);
        }
      }
    }
    if (snapshot.versions && tableExists(db, "wiki_entry_versions")) {
      for (const v of snapshot.versions) {
        db.run(
          "INSERT OR IGNORE INTO wiki_entry_versions (file_path, entry_id, chapter_index, short_description, status, significance) VALUES (?, ?, ?, ?, ?, ?)",
          [filePath, e.id, v.chapter_index, v.short_description, v.status, v.significance],
        );
      }
    }
    if (snapshot.targetBefore) {
      const t = snapshot.targetBefore;
      db.run("UPDATE wiki_entries SET description = ?, significance = ?, first_appearance = ? WHERE file_path = ? AND id = ?", [t.description, t.significance, t.first_appearance, filePath, log.target_id]);
    }

    // Delete the merge log entry
    db.run("DELETE FROM wiki_merge_log WHERE id = ?", [mergeLogId]);
  });
}

/** Get all merge log entries for a book */
export function getWikiMergeLog(db: SqlDb, filePath: string): WikiMergeLogRow[] {
  return db.all<WikiMergeLogRow>("SELECT * FROM wiki_merge_log WHERE file_path = ? ORDER BY merged_at DESC", [filePath]);
}

// ── Aliases ──

export function addWikiAliases(db: SqlDb, filePath: string, entryId: string, aliases: WikiAliasInput[]): void {
  const sql = `
    INSERT INTO wiki_aliases (file_path, entry_id, alias, alias_type, relevance) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(file_path, entry_id, alias) DO UPDATE SET
      alias_type = CASE WHEN excluded.relevance > wiki_aliases.relevance THEN excluded.alias_type ELSE wiki_aliases.alias_type END,
      relevance = MAX(wiki_aliases.relevance, excluded.relevance)
  `;
  db.transaction(() => {
    for (const a of aliases) {
      const alias = typeof a === "string" ? a : a.alias;
      const alias_type = typeof a === "string" ? "name" : (a.alias_type ?? "name");
      const relevance = typeof a === "string" ? 3 : (a.relevance ?? 3);
      if (alias) db.run(sql, [filePath, entryId, alias, alias_type, relevance]);
    }
  });
}

export function getWikiAliases(db: SqlDb, filePath: string, entryId: string): WikiAliasRow[] {
  return db.all<WikiAliasRow>(
    "SELECT alias, alias_type, relevance FROM wiki_aliases WHERE file_path = ? AND entry_id = ? ORDER BY relevance DESC",
    [filePath, entryId],
  );
}

// ── Details ──

export function addWikiDetails(
  db: SqlDb,
  filePath: string,
  entryId: string,
  details: { chapterIndex: number; category: string; content: string; relevance?: number; sourceText?: string }[],
): void {
  db.transaction(() => {
    for (const d of details) {
      if (!d.content) continue;
      const content = String(d.content);
      // Dedup: skip if identical content already exists for this entry (any chapter)
      if (db.get("SELECT 1 FROM wiki_details WHERE file_path = ? AND entry_id = ? AND content = ? LIMIT 1", [filePath, entryId, content])) continue;
      db.run(
        "INSERT INTO wiki_details (file_path, entry_id, chapter_index, category, content, relevance, source_text) VALUES (@fp, @eid, @ch, @cat, @con, @rel, @src)",
        { fp: filePath, eid: entryId, ch: d.chapterIndex ?? 0, cat: d.category || "info", con: content, rel: d.relevance ?? 3, src: d.sourceText ?? "" },
      );
    }
  });
}

export function supersedeWikiDetails(db: SqlDb, filePath: string, entryId: string, category: string, currentChapter: number): void {
  db.run(
    "UPDATE wiki_details SET is_superseded = 1, superseded_chapter = ? WHERE file_path = ? AND entry_id = ? AND category = ? AND chapter_index < ? AND is_superseded = 0",
    [currentChapter, filePath, entryId, category, currentChapter],
  );
}

export function getWikiDetailsForEntry(db: SqlDb, filePath: string, entryId: string, maxChapter?: number): WikiDetailRow[] {
  if (maxChapter != null) {
    return db.all<WikiDetailRow>(
      "SELECT * FROM wiki_details WHERE file_path = ? AND entry_id = ? AND chapter_index <= ? ORDER BY chapter_index ASC",
      [filePath, entryId, maxChapter],
    );
  }
  return db.all<WikiDetailRow>("SELECT * FROM wiki_details WHERE file_path = ? AND entry_id = ? ORDER BY chapter_index ASC", [filePath, entryId]);
}

// ── Relationships ──

/** Returns the new row id, or null when skipped (self, duplicate, reverse duplicate, missing end). */
export function addWikiRelationship(
  db: SqlDb,
  filePath: string,
  rel: { sourceId: string; targetId: string; relation: string; sinceChapter: number; description?: string },
): number | null {
  if (rel.sourceId === rel.targetId) return null;
  const dupSql = "SELECT id FROM wiki_relationships WHERE file_path = ? AND source_id = ? AND target_id = ? AND relation = ?";
  if (db.get(dupSql, [filePath, rel.sourceId, rel.targetId, rel.relation])) return null;
  if (db.get(dupSql, [filePath, rel.targetId, rel.sourceId, rel.relation])) return null;
  if (!db.get("SELECT 1 FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, rel.sourceId])) return null;
  if (!db.get("SELECT 1 FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, rel.targetId])) return null;
  return db.run(
    "INSERT INTO wiki_relationships (file_path, source_id, target_id, relation, since_chapter, description) VALUES (?, ?, ?, ?, ?, ?)",
    [filePath, rel.sourceId, rel.targetId, rel.relation, rel.sinceChapter, rel.description ?? ""],
  ).lastInsertRowid;
}

export function getRelationshipsForEntry(db: SqlDb, filePath: string, entryId: string, maxChapter?: number): WikiRelationshipRow[] {
  if (maxChapter != null) {
    return db.all<WikiRelationshipRow>(
      "SELECT * FROM wiki_relationships WHERE file_path = ? AND (source_id = ? OR target_id = ?) AND since_chapter <= ? ORDER BY since_chapter ASC",
      [filePath, entryId, entryId, maxChapter],
    );
  }
  return db.all<WikiRelationshipRow>(
    "SELECT * FROM wiki_relationships WHERE file_path = ? AND (source_id = ? OR target_id = ?) ORDER BY since_chapter ASC",
    [filePath, entryId, entryId],
  );
}

export function getAllWikiRelationships(db: SqlDb, filePath: string): WikiRelationshipRow[] {
  return db.all<WikiRelationshipRow>("SELECT * FROM wiki_relationships WHERE file_path = ? ORDER BY since_chapter ASC", [filePath]);
}

// ── Appearances ──

export function addWikiAppearance(db: SqlDb, filePath: string, entryId: string, chapterIndex: number): void {
  db.run("INSERT OR IGNORE INTO wiki_appearances (file_path, entry_id, chapter_index) VALUES (?, ?, ?)", [filePath, entryId, chapterIndex]);
}

export function getAppearancesForEntry(db: SqlDb, filePath: string, entryId: string): number[] {
  return db
    .all<{ chapter_index: number }>("SELECT chapter_index FROM wiki_appearances WHERE file_path = ? AND entry_id = ? ORDER BY chapter_index ASC", [filePath, entryId])
    .map((r) => r.chapter_index);
}

export function getAllAppearanceCounts(db: SqlDb, filePath: string): { entry_id: string; count: number }[] {
  return db.all<{ entry_id: string; count: number }>(
    "SELECT entry_id, COUNT(*) as count FROM wiki_appearances WHERE file_path = ? GROUP BY entry_id",
    [filePath],
  );
}

// ── Chapter summaries ──

export function upsertChapterSummary(db: SqlDb, filePath: string, summary: {
  chapterIndex: number;
  summary: string;
  keyEvents?: string;
  activeEntities?: string;
  mood?: string;
}): void {
  db.run(`
    INSERT INTO wiki_chapter_summaries (file_path, chapter_index, summary, key_events, active_entities, mood)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path, chapter_index) DO UPDATE SET
      summary = excluded.summary,
      key_events = excluded.key_events,
      active_entities = excluded.active_entities,
      mood = excluded.mood
  `, [filePath, summary.chapterIndex, summary.summary, summary.keyEvents ?? "", summary.activeEntities ?? "", summary.mood ?? ""]);
}

export function getChapterSummaries(db: SqlDb, filePath: string, fromCh: number, toCh: number): WikiChapterSummaryRow[] {
  return db.all<WikiChapterSummaryRow>(
    "SELECT * FROM wiki_chapter_summaries WHERE file_path = ? AND chapter_index >= ? AND chapter_index <= ? ORDER BY chapter_index ASC",
    [filePath, fromCh, toCh],
  );
}

export function getAllChapterSummaries(db: SqlDb, filePath: string): WikiChapterSummaryRow[] {
  return db.all<WikiChapterSummaryRow>("SELECT * FROM wiki_chapter_summaries WHERE file_path = ? ORDER BY chapter_index ASC", [filePath]);
}

// ── Arcs ──

export function upsertArc(db: SqlDb, filePath: string, arc: {
  id: string;
  name: string;
  description?: string;
  arcType?: string;
  status?: string;
  startChapter: number;
  endChapter?: number | null;
}): void {
  db.run(`
    INSERT INTO wiki_arcs (id, file_path, name, description, arc_type, status, start_chapter, end_chapter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path, id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      arc_type = excluded.arc_type,
      status = excluded.status,
      start_chapter = excluded.start_chapter,
      end_chapter = excluded.end_chapter
  `, [arc.id, filePath, arc.name, arc.description ?? "", arc.arcType ?? "plot", arc.status ?? "active", arc.startChapter, arc.endChapter ?? null]);
}

export function getActiveArcs(db: SqlDb, filePath: string): WikiArcRow[] {
  return db.all<WikiArcRow>(
    "SELECT * FROM wiki_arcs WHERE file_path = ? AND status IN ('setup', 'active', 'climax') ORDER BY start_chapter ASC",
    [filePath],
  );
}

export function getAllArcs(db: SqlDb, filePath: string): WikiArcRow[] {
  return db.all<WikiArcRow>("SELECT * FROM wiki_arcs WHERE file_path = ? ORDER BY start_chapter ASC", [filePath]);
}

/** Returns the new beat id. */
export function addArcBeat(db: SqlDb, filePath: string, arcId: string, beat: { chapterIndex: number; beatType: string; description: string }): number {
  return db.run(
    "INSERT INTO wiki_arc_beats (file_path, arc_id, chapter_index, beat_type, description) VALUES (?, ?, ?, ?, ?)",
    [filePath, arcId, beat.chapterIndex, beat.beatType, beat.description],
  ).lastInsertRowid;
}

export function getArcBeats(db: SqlDb, filePath: string, arcId: string): WikiArcBeatRow[] {
  return db.all<WikiArcBeatRow>("SELECT * FROM wiki_arc_beats WHERE file_path = ? AND arc_id = ? ORDER BY chapter_index ASC", [filePath, arcId]);
}

export function addArcEntity(db: SqlDb, filePath: string, arcId: string, entryId: string, role: string): void {
  db.run("INSERT OR IGNORE INTO wiki_arc_entities (file_path, arc_id, entry_id, role) VALUES (?, ?, ?, ?)", [filePath, arcId, entryId, role]);
}

export function getArcEntities(db: SqlDb, filePath: string, arcId: string): { entry_id: string; role: string }[] {
  return db.all<{ entry_id: string; role: string }>("SELECT entry_id, role FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ?", [filePath, arcId]);
}

export function deleteArc(db: SqlDb, filePath: string, arcId: string): void {
  db.transaction(() => {
    db.run("DELETE FROM wiki_arc_beats WHERE file_path = ? AND arc_id = ?", [filePath, arcId]);
    db.run("DELETE FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ?", [filePath, arcId]);
    db.run("DELETE FROM wiki_arcs WHERE file_path = ? AND id = ?", [filePath, arcId]);
  });
}

export function mergeArcs(db: SqlDb, filePath: string, sourceArcIds: string[], targetArcId: string): void {
  db.transaction(() => {
    if (!db.get("SELECT id FROM wiki_arcs WHERE file_path = ? AND id = ?", [filePath, targetArcId])) return;
    for (const sourceId of sourceArcIds) {
      if (sourceId === targetArcId) continue;
      if (!db.get("SELECT id FROM wiki_arcs WHERE file_path = ? AND id = ?", [filePath, sourceId])) continue;
      // Move beats to target arc
      db.run("UPDATE wiki_arc_beats SET arc_id = ? WHERE file_path = ? AND arc_id = ?", [targetArcId, filePath, sourceId]);
      // Move entities to target arc (ignore duplicates)
      const entities = db.all<{ entry_id: string; role: string }>("SELECT entry_id, role FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ?", [filePath, sourceId]);
      for (const e of entities) {
        db.run("INSERT OR IGNORE INTO wiki_arc_entities (file_path, arc_id, entry_id, role) VALUES (?, ?, ?, ?)", [filePath, targetArcId, e.entry_id, e.role]);
      }
      // Delete source arc entities first, then arc (cascade handles beats)
      db.run("DELETE FROM wiki_arc_entities WHERE file_path = ? AND arc_id = ?", [filePath, sourceId]);
      db.run("DELETE FROM wiki_arcs WHERE file_path = ? AND id = ?", [filePath, sourceId]);
    }
  });
}

// ── Processing state (legacy; mirrored by knowledge_runs) ──

export function markChapterProcessed(db: SqlDb, filePath: string, chapterIndex: number): void {
  db.run("INSERT OR IGNORE INTO wiki_processed (file_path, chapter_index) VALUES (?, ?)", [filePath, chapterIndex]);
}

export function unmarkChapterProcessed(db: SqlDb, filePath: string, chapterIndex: number): void {
  db.run("DELETE FROM wiki_processed WHERE file_path = ? AND chapter_index = ?", [filePath, chapterIndex]);
}

export function getProcessedChapters(db: SqlDb, filePath: string): number[] {
  return db
    .all<{ chapter_index: number }>("SELECT chapter_index FROM wiki_processed WHERE file_path = ? ORDER BY chapter_index ASC", [filePath])
    .map((r) => r.chapter_index);
}

// ── Meta ──

export function getWikiMeta(db: SqlDb, filePath: string): { file_path: string; book_title: string; updated_at: string } | null {
  return db.get<{ file_path: string; book_title: string; updated_at: string }>("SELECT * FROM wiki_meta WHERE file_path = ?", [filePath]) ?? null;
}

export function upsertWikiMeta(db: SqlDb, filePath: string, bookTitle: string): void {
  db.run(`
    INSERT INTO wiki_meta (file_path, book_title, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(file_path) DO UPDATE SET
      book_title = excluded.book_title,
      updated_at = datetime('now')
  `, [filePath, bookTitle]);
}

// ── Entity index (legacy, ungated) ──

export function getEntityIndex(db: SqlDb, filePath: string): { id: string; name: string; type: string; color: string; aliases: string[] }[] {
  const rows = db.all<{ id: string; name: string; type: string; color: string; aliases_str: string | null }>(`
    SELECT e.id, e.name, e.type, e.color,
           GROUP_CONCAT(a.alias, '||') as aliases_str
    FROM wiki_entries e
    LEFT JOIN wiki_aliases a ON a.file_path = e.file_path AND a.entry_id = e.id AND a.relevance >= 3
    WHERE e.file_path = ?
    GROUP BY e.id
    ORDER BY e.first_appearance ASC
  `, [filePath]);
  return rows.map((r) => ({
    id: r.id, name: r.name, type: r.type, color: r.color,
    aliases: r.aliases_str ? r.aliases_str.split("||") : [],
  }));
}

export function getRecentEntities(db: SqlDb, filePath: string, lastNChapters: number, currentChapter: number): WikiEntryRow[] {
  const minChapter = Math.max(0, currentChapter - lastNChapters + 1);
  return db.all<WikiEntryRow>(`
    SELECT DISTINCT e.* FROM wiki_entries e
    JOIN wiki_appearances a ON a.file_path = e.file_path AND a.entry_id = e.id
    WHERE e.file_path = ? AND a.chapter_index >= ? AND a.chapter_index <= ?
    ORDER BY e.significance DESC, e.first_appearance ASC
  `, [filePath, minChapter, currentChapter]);
}

// ── Clear chapter data (legacy reprocessing) ──

export function clearChapterWikiData(db: SqlDb, filePath: string, chapterIndex: number): void {
  db.transaction(() => {
    db.run("DELETE FROM wiki_details WHERE file_path = ? AND chapter_index = ?", [filePath, chapterIndex]);
    db.run("DELETE FROM wiki_appearances WHERE file_path = ? AND chapter_index = ?", [filePath, chapterIndex]);
    db.run("DELETE FROM wiki_arc_beats WHERE file_path = ? AND chapter_index = ?", [filePath, chapterIndex]);
    db.run("DELETE FROM wiki_chapter_summaries WHERE file_path = ? AND chapter_index = ?", [filePath, chapterIndex]);
    db.run("DELETE FROM wiki_processed WHERE file_path = ? AND chapter_index = ?", [filePath, chapterIndex]);
  });
}

export function getAllWikiAliases(db: SqlDb, filePath: string): { entry_id: string; alias: string; alias_type: string; relevance: number }[] {
  return db.all<{ entry_id: string; alias: string; alias_type: string; relevance: number }>(
    "SELECT entry_id, alias, alias_type, relevance FROM wiki_aliases WHERE file_path = ? ORDER BY relevance DESC",
    [filePath],
  );
}

// ── MC stats ──

export function upsertMCStat(
  db: SqlDb,
  filePath: string,
  stat: { key: string; category: string; name: string; value: string | null; isActive: boolean; chapter: number },
): void {
  db.run(`
    INSERT INTO wiki_mc_stats (file_path, stat_key, category, display_name, value, is_active, last_chapter)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path, stat_key) DO UPDATE SET
      category = excluded.category,
      display_name = excluded.display_name,
      value = excluded.value,
      is_active = excluded.is_active,
      last_chapter = excluded.last_chapter
  `, [filePath, stat.key, stat.category, stat.name, stat.value ?? null, stat.isActive ? 1 : 0, stat.chapter]);
}

export function getMCStats(db: SqlDb, filePath: string): MCStatRow[] {
  return db.all<MCStatRow>("SELECT * FROM wiki_mc_stats WHERE file_path = ? ORDER BY category, display_name", [filePath]);
}

export function setMCEntityId(db: SqlDb, filePath: string, entityId: string): void {
  db.run("UPDATE wiki_meta SET mc_entity_id = ? WHERE file_path = ?", [entityId, filePath]);
}

export function getMCEntityId(db: SqlDb, filePath: string): string | null {
  return db.get<{ mc_entity_id: string | null }>("SELECT mc_entity_id FROM wiki_meta WHERE file_path = ?", [filePath])?.mc_entity_id ?? null;
}

// ── Clear ──

export function clearWiki(db: SqlDb, filePath: string): void {
  db.transaction(() => {
    for (const table of WIKI_TABLES) db.run(`DELETE FROM ${table} WHERE file_path = ?`, [filePath]);
    for (const table of KNOWLEDGE_TABLES) {
      if (tableExists(db, table)) db.run(`DELETE FROM ${table} WHERE file_path = ?`, [filePath]);
    }
  });
}

/** Clear ALL wiki data for ALL books */
export function clearAllWiki(db: SqlDb): void {
  db.transaction(() => {
    for (const table of WIKI_TABLES) db.run(`DELETE FROM ${table}`);
    db.run("DELETE FROM wiki_merge_log");
    for (const table of KNOWLEDGE_TABLES) {
      if (tableExists(db, table)) db.run(`DELETE FROM ${table}`);
    }
  });
}

// ── Legacy JSON blob migration ──

export function migrateJsonWiki(db: SqlDb, filePath: string): boolean {
  const raw = db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [`wiki:${filePath}`])?.value;
  if (!raw) return false;

  try {
    const wiki = JSON.parse(raw) as {
      bookTitle: string;
      entries: Record<string, {
        id: string; name: string; type: string; aliases: string[];
        shortDescription: string; description: string;
        firstAppearance: number; chapterAppearances: number[];
        details: { chapterIndex: number; content: string; category: string }[];
        relationships: { targetId: string; relation: string; since: number }[];
        color: string;
      }>;
      processedChapters: number[];
    };

    db.transaction(() => {
      upsertWikiMeta(db, filePath, wiki.bookTitle);
      for (const entry of Object.values(wiki.entries)) {
        upsertWikiEntry(db, {
          id: entry.id, filePath, name: entry.name, type: entry.type,
          shortDescription: entry.shortDescription, description: entry.description,
          color: entry.color, firstAppearance: entry.firstAppearance, significance: 1, status: "active",
        });
        if (entry.aliases?.length > 0) addWikiAliases(db, filePath, entry.id, entry.aliases);
        if (entry.details?.length > 0) {
          addWikiDetails(db, filePath, entry.id, entry.details.map((d) => ({ chapterIndex: d.chapterIndex, category: d.category, content: d.content })));
        }
        for (const rel of entry.relationships ?? []) {
          addWikiRelationship(db, filePath, { sourceId: entry.id, targetId: rel.targetId, relation: rel.relation, sinceChapter: rel.since });
        }
        for (const ch of entry.chapterAppearances ?? []) addWikiAppearance(db, filePath, entry.id, ch);
      }
      for (const ch of wiki.processedChapters ?? []) markChapterProcessed(db, filePath, ch);
    });

    db.run("DELETE FROM settings WHERE key = ?", [`wiki:${filePath}`]);
    return true;
  } catch (err) {
    console.error("Wiki migration failed:", err);
    return false;
  }
}

// ══ Shared helpers for the new knowledge modules ════════════════════════════

const tableCache = new WeakMap<SqlDb, Map<string, boolean>>();

/** Cached `sqlite_master` probe (tables never disappear at runtime). */
export function tableExists(db: SqlDb, name: string): boolean {
  let m = tableCache.get(db);
  if (!m) tableCache.set(db, (m = new Map()));
  const hit = m.get(name);
  if (hit) return true;
  const found = !!db.get("SELECT 1 FROM sqlite_master WHERE name = ? AND type IN ('table', 'view')", [name]);
  if (found) m.set(name, true);
  return found;
}

export interface EntryVersionRow {
  file_path: string;
  entry_id: string;
  chapter_index: number;
  short_description: string;
  status: string;
  significance: number;
}

/** If an entry has no version history yet (legacy data), record its current state as the
 *  baseline at its first appearance, so later versions don't hide it at earlier frontiers. */
export function ensureBaselineVersion(db: SqlDb, filePath: string, entry: WikiEntryRow): void {
  const has = db.get("SELECT 1 FROM wiki_entry_versions WHERE file_path = ? AND entry_id = ? LIMIT 1", [filePath, entry.id]);
  if (has) return;
  db.run(
    "INSERT OR IGNORE INTO wiki_entry_versions (file_path, entry_id, chapter_index, short_description, status, significance) VALUES (?, ?, ?, ?, ?, ?)",
    [filePath, entry.id, entry.first_appearance ?? 0, entry.short_description ?? "", entry.status ?? "active", entry.significance ?? 1],
  );
}

/** Upsert the version at `chapterIndex`. Returns true if a row was written. */
export function writeVersion(
  db: SqlDb,
  filePath: string,
  entryId: string,
  chapterIndex: number,
  v: { shortDescription: string; status: string; significance: number },
): void {
  db.run(`
    INSERT INTO wiki_entry_versions (file_path, entry_id, chapter_index, short_description, status, significance)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path, entry_id, chapter_index) DO UPDATE SET
      short_description = excluded.short_description, status = excluded.status, significance = excluded.significance
  `, [filePath, entryId, chapterIndex, v.shortDescription, v.status, v.significance]);
}

/** Make an id unique within the book: `slug`, `slug-2`, `slug-3`… */
export function uniqueEntryId(db: SqlDb, filePath: string, base: string): string {
  const slug = slugify(base) || "entry";
  let id = slug;
  for (let n = 2; db.get("SELECT 1 FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, id]); n++) id = `${slug}-${n}`;
  return id;
}

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
