/**
 * Wiki edits from the UI and the assistant (`knowledge:edits:apply`), with an undo log
 * (owner: WS-B). Every edit is applied in its own savepoint inside one transaction: a failing
 * edit is reported in `failed` and leaves no trace, the others still apply.
 *
 * Undo: merges use the DB merge's own undo snapshot (`wiki_merge_log`); every other edit records
 * a full before-snapshot of the entries it touches in `knowledge_edit_log`.
 */

import type { SqlDb } from "../db/sql";
import type { ApplyResult, WikiEdit } from "../shared/knowledge/types";
import { gateAliases } from "./alias-gate";
import {
  addWikiRelationship, ensureBaselineVersion, mergeWikiEntries, TYPE_COLORS, uniqueEntryId, unmergeWikiEntries,
  validateType, writeVersion, type EntryVersionRow, type WikiEntryRow,
} from "./store";

interface EntrySnapshot {
  entry: WikiEntryRow;
  aliases: Record<string, unknown>[];
  details: Record<string, unknown>[];
  relationships: Record<string, unknown>[];
  appearances: number[];
  versions: EntryVersionRow[];
  arcEntities: { arc_id: string; role: string }[];
}

type UndoRecord =
  | { kind: "restore"; snapshots: EntrySnapshot[]; createdIds: string[]; relIds: number[] }
  | { kind: "merge"; mergeLogId: number };

export function snapshotEntry(db: SqlDb, filePath: string, id: string): EntrySnapshot | null {
  const entry = db.get<WikiEntryRow>("SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, id]);
  if (!entry) return null;
  return {
    entry,
    aliases: db.all("SELECT * FROM wiki_aliases WHERE file_path = ? AND entry_id = ?", [filePath, id]),
    details: db.all("SELECT * FROM wiki_details WHERE file_path = ? AND entry_id = ?", [filePath, id]),
    relationships: db.all("SELECT * FROM wiki_relationships WHERE file_path = ? AND (source_id = ? OR target_id = ?)", [filePath, id, id]),
    appearances: db.all<{ chapter_index: number }>("SELECT chapter_index FROM wiki_appearances WHERE file_path = ? AND entry_id = ?", [filePath, id]).map((r) => r.chapter_index),
    versions: db.all<EntryVersionRow>("SELECT * FROM wiki_entry_versions WHERE file_path = ? AND entry_id = ?", [filePath, id]),
    arcEntities: db.all<{ arc_id: string; role: string }>("SELECT arc_id, role FROM wiki_arc_entities WHERE file_path = ? AND entry_id = ?", [filePath, id]),
  };
}

/** Put an entry back exactly as snapshotted (replacing whatever is there now). */
export function restoreEntry(db: SqlDb, filePath: string, s: EntrySnapshot): void {
  const e = s.entry;
  db.run("DELETE FROM wiki_entry_versions WHERE file_path = ? AND entry_id = ?", [filePath, e.id]);
  db.run("DELETE FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, e.id]); // cascades
  db.run(
    "INSERT INTO wiki_entries (id, file_path, name, type, short_description, description, color, first_appearance, significance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [e.id, filePath, e.name, e.type, e.short_description, e.description, e.color, e.first_appearance, e.significance, e.status],
  );
  const insertRow = (table: string, row: Record<string, unknown>) => {
    const cols = Object.keys(row);
    db.run(
      `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      cols.map((c) => row[c] as string | number | null),
    );
  };
  for (const a of s.aliases) insertRow("wiki_aliases", a);
  for (const d of s.details) insertRow("wiki_details", d);
  for (const r of s.relationships) {
    const other = r.source_id === e.id ? r.target_id : r.source_id;
    if (db.get("SELECT 1 FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, other as string])) insertRow("wiki_relationships", r);
  }
  for (const ch of s.appearances) db.run("INSERT OR IGNORE INTO wiki_appearances (file_path, entry_id, chapter_index) VALUES (?, ?, ?)", [filePath, e.id, ch]);
  for (const v of s.versions) insertRow("wiki_entry_versions", v as unknown as Record<string, unknown>);
  for (const ae of s.arcEntities) {
    if (db.get("SELECT 1 FROM wiki_arcs WHERE file_path = ? AND id = ?", [filePath, ae.arc_id])) {
      db.run("INSERT OR IGNORE INTO wiki_arc_entities (file_path, arc_id, entry_id, role) VALUES (?, ?, ?, ?)", [filePath, ae.arc_id, e.id, ae.role]);
    }
  }
}

class EditError extends Error {}

/** Make the entries row reflect its latest version (versions are the source of truth). */
function syncRowToLatestVersion(db: SqlDb, filePath: string, id: string): void {
  const v = db.get<EntryVersionRow>(
    "SELECT * FROM wiki_entry_versions WHERE file_path = ? AND entry_id = ? ORDER BY chapter_index DESC LIMIT 1",
    [filePath, id],
  );
  if (v) {
    db.run("UPDATE wiki_entries SET short_description = ?, status = ?, significance = ? WHERE file_path = ? AND id = ?", [v.short_description, v.status, v.significance, filePath, id]);
  }
}

function applyOne(db: SqlDb, filePath: string, edit: WikiEdit): { undo: UndoRecord; chapters: number[]; mergeLogId?: number } {
  const getEntry = (id: string) => db.get<WikiEntryRow>("SELECT * FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, id]);
  const need = (id: string) => {
    const e = getEntry(id);
    if (!e) throw new EditError(`unknown entry "${id}"`);
    return e;
  };
  const chapterOf = (n: unknown, name: string) => {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) throw new EditError(`${name} must be a chapter index ≥ 0`);
    return Math.floor(n);
  };

  switch (edit.op) {
    case "create": {
      const en = edit.entry;
      if (!en || typeof en.name !== "string" || !en.name.trim()) throw new EditError("entry.name is required");
      const first = chapterOf(en.firstAppearance, "entry.firstAppearance");
      const type = validateType(en.type);
      let id = en.id?.trim();
      if (id) {
        if (getEntry(id)) throw new EditError(`entry "${id}" already exists`);
      } else {
        id = uniqueEntryId(db, filePath, en.name);
      }
      const desc = typeof en.shortDescription === "string" ? en.shortDescription.trim() : "";
      db.run(
        "INSERT INTO wiki_entries (id, file_path, name, type, short_description, description, color, first_appearance, significance, status) VALUES (?, ?, ?, ?, ?, '', ?, ?, 1, 'active')",
        [id, filePath, en.name.trim(), type, desc, TYPE_COLORS[type], first],
      );
      writeVersion(db, filePath, id, first, { shortDescription: desc, status: "active", significance: 1 });
      db.run("INSERT OR IGNORE INTO wiki_appearances (file_path, entry_id, chapter_index) VALUES (?, ?, ?)", [filePath, id, first]);
      addAliasesAt(db, filePath, id, en.aliases ?? [], first);
      return { undo: { kind: "restore", snapshots: [], createdIds: [id], relIds: [] }, chapters: [first] };
    }
    case "update": {
      const before = need(edit.id);
      const snap = snapshotEntry(db, filePath, edit.id)!;
      const at = chapterOf(edit.asOfChapter, "asOfChapter");
      const f = edit.fields ?? {};
      if (typeof f.name === "string" && f.name.trim()) db.run("UPDATE wiki_entries SET name = ? WHERE file_path = ? AND id = ?", [f.name.trim(), filePath, edit.id]);
      if (f.type) {
        const t = validateType(f.type);
        db.run("UPDATE wiki_entries SET type = ?, color = ? WHERE file_path = ? AND id = ?", [t, before.type === t ? before.color : TYPE_COLORS[t], filePath, edit.id]);
      }
      if (f.shortDescription !== undefined || f.status !== undefined || f.significance !== undefined) {
        ensureBaselineVersion(db, filePath, before);
        const base = db.get<EntryVersionRow>(
          "SELECT * FROM wiki_entry_versions WHERE file_path = ? AND entry_id = ? AND chapter_index <= ? ORDER BY chapter_index DESC LIMIT 1",
          [filePath, edit.id, at],
        );
        const sig = typeof f.significance === "number" && Number.isFinite(f.significance)
          ? Math.max(1, Math.min(4, Math.round(f.significance)))
          : base?.significance ?? before.significance;
        writeVersion(db, filePath, edit.id, Math.max(at, before.first_appearance), {
          shortDescription: typeof f.shortDescription === "string" ? f.shortDescription.trim() : base?.short_description ?? before.short_description,
          status: typeof f.status === "string" && f.status ? f.status : base?.status ?? before.status,
          significance: sig,
        });
        syncRowToLatestVersion(db, filePath, edit.id);
      }
      return { undo: { kind: "restore", snapshots: [snap], createdIds: [], relIds: [] }, chapters: [at] };
    }
    case "delete": {
      const e = need(edit.id);
      const snap = snapshotEntry(db, filePath, edit.id)!;
      db.run("DELETE FROM wiki_entry_versions WHERE file_path = ? AND entry_id = ?", [filePath, edit.id]);
      db.run("DELETE FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, edit.id]);
      return { undo: { kind: "restore", snapshots: [snap], createdIds: [], relIds: [] }, chapters: [e.first_appearance] };
    }
    case "alias": {
      need(edit.id);
      const at = chapterOf(edit.asOfChapter, "asOfChapter");
      if (!Array.isArray(edit.aliases) || edit.aliases.length === 0) throw new EditError("aliases is empty");
      const snap = snapshotEntry(db, filePath, edit.id)!;
      addAliasesAt(db, filePath, edit.id, edit.aliases, at);
      return { undo: { kind: "restore", snapshots: [snap], createdIds: [], relIds: [] }, chapters: [at] };
    }
    case "relate": {
      need(edit.sourceId);
      need(edit.targetId);
      if (edit.sourceId === edit.targetId) throw new EditError("an entry cannot relate to itself");
      if (typeof edit.relation !== "string" || !edit.relation.trim()) throw new EditError("relation is required");
      const since = chapterOf(edit.sinceChapter, "sinceChapter");
      const relId = addWikiRelationship(db, filePath, { sourceId: edit.sourceId, targetId: edit.targetId, relation: edit.relation.trim(), sinceChapter: since });
      if (relId == null) throw new EditError("relationship already exists");
      return { undo: { kind: "restore", snapshots: [], createdIds: [], relIds: [relId] }, chapters: [since] };
    }
    case "merge": {
      if (edit.sourceId === edit.targetId) throw new EditError("cannot merge an entry into itself");
      need(edit.sourceId);
      const target = need(edit.targetId);
      const logId = mergeWikiEntries(db, filePath, edit.sourceId, edit.targetId);
      if (logId == null) throw new EditError("merge failed");
      return { undo: { kind: "merge", mergeLogId: logId }, chapters: [target.first_appearance], mergeLogId: logId };
    }
    default:
      throw new EditError(`unknown op "${(edit as { op?: unknown }).op}"`);
  }
}

function addAliasesAt(db: SqlDb, filePath: string, entryId: string, aliases: string[], chapter: number): void {
  // User/assistant aliases are trusted names, but contextual ones are still downgraded.
  for (const a of gateAliases(aliases.map((alias) => ({ alias, alias_type: "name", relevance: 4 })))) {
    const existing = db.get<{ first_chapter: number | null }>(
      "SELECT first_chapter FROM wiki_aliases WHERE file_path = ? AND entry_id = ? AND alias = ?",
      [filePath, entryId, a.alias],
    );
    if (existing) {
      db.run(
        "UPDATE wiki_aliases SET relevance = MAX(relevance, ?), first_chapter = MIN(COALESCE(first_chapter, ?), ?) WHERE file_path = ? AND entry_id = ? AND alias = ?",
        [a.relevance, chapter, chapter, filePath, entryId, a.alias],
      );
    } else {
      db.run(
        "INSERT INTO wiki_aliases (file_path, entry_id, alias, alias_type, relevance, first_chapter) VALUES (?, ?, ?, ?, ?, ?)",
        [filePath, entryId, a.alias, a.alias_type, a.relevance, chapter],
      );
    }
  }
}

export interface ApplyEditsOutcome extends ApplyResult {
  /** Chapters touched (for the `knowledge` event). */
  chapters: number[];
}

export function applyEdits(db: SqlDb, filePath: string, edits: WikiEdit[], now: number = Date.now()): ApplyEditsOutcome {
  const result: ApplyEditsOutcome = { applied: 0, failed: [], mergeLogIds: [], undoIds: [], chapters: [] };
  if (!Array.isArray(edits)) return result;
  const chapters = new Set<number>();
  db.transaction(() => {
    for (const edit of edits) {
      try {
        db.transaction(() => {
          const r = applyOne(db, filePath, edit);
          const logId = db.run(
            "INSERT INTO knowledge_edit_log (file_path, op, edit, undo, created_at) VALUES (?, ?, ?, ?, ?)",
            [filePath, edit.op, JSON.stringify(edit), JSON.stringify(r.undo), now],
          ).lastInsertRowid;
          result.undoIds!.push(logId);
          if (r.mergeLogId != null) result.mergeLogIds.push(r.mergeLogId);
          for (const c of r.chapters) chapters.add(c);
        });
        result.applied++;
      } catch (err) {
        result.failed.push({ edit, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  });
  result.chapters = [...chapters].sort((a, b) => a - b);
  return result;
}

/** Revert one applied edit. Returns false if unknown or already undone. */
export function undoEdit(db: SqlDb, filePath: string, undoId: number, now: number = Date.now()): boolean {
  return db.transaction(() => {
    const row = db.get<{ undo: string; undone_at: number | null }>(
      "SELECT undo, undone_at FROM knowledge_edit_log WHERE id = ? AND file_path = ?",
      [undoId, filePath],
    );
    if (!row || row.undone_at != null) return false;
    const u = JSON.parse(row.undo) as UndoRecord;
    if (u.kind === "merge") {
      unmergeWikiEntries(db, filePath, u.mergeLogId);
    } else {
      for (const id of u.relIds) db.run("DELETE FROM wiki_relationships WHERE file_path = ? AND id = ?", [filePath, id]);
      for (const id of u.createdIds) {
        db.run("DELETE FROM wiki_entry_versions WHERE file_path = ? AND entry_id = ?", [filePath, id]);
        db.run("DELETE FROM wiki_entries WHERE file_path = ? AND id = ?", [filePath, id]);
      }
      for (const s of u.snapshots) restoreEntry(db, filePath, s);
    }
    db.run("UPDATE knowledge_edit_log SET undone_at = ? WHERE id = ?", [now, undoId]);
    return true;
  });
}
