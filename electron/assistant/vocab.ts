/**
 * Vocabulary deck store (`vocab_items`, owner: WS-E). AI_AUDIT §6 F4.
 * Scheduling is SM-2 from `shared/srs.ts`; review writes are single-row updates.
 */

import type { SqlDb } from "../db/sql";
import type { NewVocabItem, VocabFilter, VocabItem, VocabStats } from "../shared/assistant/types";
import { newSrsState, reviewSrs, type SrsGrade } from "../shared/srs";

interface VocabRow {
  id: number; file_path: string | null; chapter_id: string | null; para_id: string | null; term: string;
  lemma: string | null; context: string | null; definition: string | null; translation: string | null;
  created_at: number; due_at: number; interval_days: number; ease: number; reps: number; lapses: number;
}

function toItem(r: VocabRow): VocabItem {
  return {
    id: Number(r.id),
    filePath: r.file_path,
    ref: r.file_path && r.chapter_id && r.para_id ? { filePath: r.file_path, chapterId: r.chapter_id, paraId: r.para_id } : null,
    term: r.term,
    lemma: r.lemma,
    context: r.context,
    definition: r.definition,
    translation: r.translation,
    createdAt: Number(r.created_at),
    srs: {
      intervalDays: Number(r.interval_days),
      ease: Number(r.ease),
      reps: Number(r.reps),
      lapses: Number(r.lapses),
      dueAt: Number(r.due_at),
    },
  };
}

const clip = (s: string | undefined, n: number) => (s === undefined ? null : s.trim().slice(0, n) || null);

export class VocabStore {
  constructor(private readonly db: SqlDb, private readonly now: () => number = () => Date.now()) {}

  get(id: number): VocabItem | null {
    const r = this.db.get<VocabRow>("SELECT * FROM vocab_items WHERE id = ?", [id]);
    return r ? toItem(r) : null;
  }

  list(filter: VocabFilter = {}): VocabItem[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.filePath !== undefined) {
      where.push("file_path = ?");
      params.push(filter.filePath);
    }
    if (filter.dueOnly) {
      where.push("due_at <= ?");
      params.push(this.now());
    }
    const limit = Math.max(1, Math.min(filter.limit ?? 1000, 5000));
    const sql = `SELECT * FROM vocab_items ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${filter.dueOnly ? "due_at ASC" : "created_at DESC"} LIMIT ${limit}`;
    return this.db.all<VocabRow>(sql, params).map(toItem);
  }

  /** Saving the same term twice for the same book updates the existing card (keeps its schedule). */
  add(item: NewVocabItem): VocabItem {
    const term = item.term.trim().slice(0, 120);
    if (!term) throw new Error("vocab: empty term");
    const filePath = item.filePath ?? item.ref?.filePath ?? null;
    return this.db.transaction(() => {
      const existing = this.db.get<VocabRow>(
        "SELECT * FROM vocab_items WHERE COALESCE(file_path, '') = ? AND lower(term) = lower(?)",
        [filePath ?? "", term],
      );
      if (existing) {
        this.db.run(
          `UPDATE vocab_items SET lemma = COALESCE(?, lemma), context = COALESCE(?, context), definition = COALESCE(?, definition),
             translation = COALESCE(?, translation), chapter_id = COALESCE(?, chapter_id), para_id = COALESCE(?, para_id) WHERE id = ?`,
          [clip(item.lemma, 120), clip(item.context, 600), clip(item.definition, 600), clip(item.translation, 600),
            item.ref?.chapterId ?? null, item.ref?.paraId ?? null, existing.id],
        );
        return this.get(Number(existing.id))!;
      }
      const now = this.now();
      const s = newSrsState(now);
      const r = this.db.run(
        `INSERT INTO vocab_items (file_path, chapter_id, para_id, term, lemma, context, definition, translation, created_at,
           due_at, interval_days, ease, reps, lapses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [filePath, item.ref?.chapterId ?? null, item.ref?.paraId ?? null, term, clip(item.lemma, 120), clip(item.context, 600),
          clip(item.definition, 600), clip(item.translation, 600), now, s.dueAt, s.intervalDays, s.ease, s.reps, s.lapses],
      );
      return this.get(r.lastInsertRowid)!;
    });
  }

  review(id: number, grade: SrsGrade): VocabItem {
    return this.db.transaction(() => {
      const cur = this.get(id);
      if (!cur) throw new Error(`vocab: item ${id} not found`);
      const s = reviewSrs(cur.srs, grade, this.now());
      this.db.run(
        "UPDATE vocab_items SET due_at = ?, interval_days = ?, ease = ?, reps = ?, lapses = ? WHERE id = ?",
        [s.dueAt, s.intervalDays, s.ease, s.reps, s.lapses, id],
      );
      return { ...cur, srs: s };
    });
  }

  remove(id: number): boolean {
    return this.db.run("DELETE FROM vocab_items WHERE id = ?", [id]).changes > 0;
  }

  stats(filePath?: string): VocabStats {
    const where = filePath !== undefined ? "WHERE file_path = ?" : "";
    const params = filePath !== undefined ? [this.now(), filePath] : [this.now()];
    const r = this.db.get<{ total: number; due: number; learned: number; fresh: number }>(
      `SELECT COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN due_at <= ? THEN 1 ELSE 0 END), 0) AS due,
         COALESCE(SUM(CASE WHEN reps > 0 THEN 1 ELSE 0 END), 0) AS learned,
         COALESCE(SUM(CASE WHEN reps = 0 AND lapses = 0 AND interval_days = 0 THEN 1 ELSE 0 END), 0) AS fresh
       FROM vocab_items ${where}`,
      params,
    );
    return { total: Number(r?.total ?? 0), due: Number(r?.due ?? 0), learned: Number(r?.learned ?? 0), fresh: Number(r?.fresh ?? 0) };
  }
}
