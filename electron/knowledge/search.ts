/**
 * Full-text search over a book's paragraphs (owner: WS-B), always clamped to the frontier.
 *
 * Production (better-sqlite3): FTS5 table `book_fts`, ranked by BM25. Tests (sql.js, no FTS5):
 * plain table `book_text` with a LIKE scan and a term-frequency score — same interface.
 * The index is built lazily from `BookContentReader.getBook` and rebuilt when the book's
 * parser version or chapter source hashes change. Building yields between chapters.
 */

import type { SqlDb } from "../db/sql";
import { hashOf } from "../shared/ai/hash";
import type { Frontier, SearchHit } from "../shared/knowledge/types";
import type { ParaId } from "../shared/pipeline/types";
import { tableExists } from "./store";

/** What indexing needs from WS-C's `BookContentReader`. */
export interface BookSource {
  getBook(filePath: string): Promise<{
    parserVersion: number;
    chapters: { index: number; sourceHash: string; paras: { id: ParaId; kind: string; text: string }[] }[];
  }>;
}

export type SearchBackend = "fts5" | "like";

export function searchBackend(db: SqlDb): SearchBackend {
  return tableExists(db, "book_fts") ? "fts5" : "like";
}

function textTable(db: SqlDb): string {
  return searchBackend(db) === "fts5" ? "book_fts" : "book_text";
}

export function isIndexed(db: SqlDb, filePath: string): boolean {
  return !!db.get("SELECT 1 FROM book_fts_state WHERE file_path = ?", [filePath]);
}

const building = new Map<string, Promise<boolean>>();

/**
 * Build (or rebuild) the index for a book when missing or stale. Concurrent calls share one build.
 * Returns true if it (re)built.
 */
export function ensureIndexed(
  db: SqlDb,
  filePath: string,
  source: BookSource,
  opts: { yieldEvery?: () => Promise<void> } = {},
): Promise<boolean> {
  const running = building.get(filePath);
  if (running) return running;
  const p = (async () => {
    const book = await source.getBook(filePath);
    const key = hashOf(book.parserVersion, book.chapters.map((c) => c.sourceHash));
    const state = db.get<{ source_key: string }>("SELECT source_key FROM book_fts_state WHERE file_path = ?", [filePath]);
    if (state?.source_key === key) return false;
    const pause = opts.yieldEvery ?? (() => new Promise<void>((r) => setImmediate(r)));
    const table = textTable(db);
    db.run("DELETE FROM book_fts_state WHERE file_path = ?", [filePath]);
    db.run(`DELETE FROM ${table} WHERE file_path = ?`, [filePath]);
    for (const ch of book.chapters) {
      db.transaction(() => {
        let ord = 0;
        for (const p of ch.paras) {
          const text = p.text?.trim();
          if (p.kind === "image" || !text) {
            ord++;
            continue;
          }
          db.run(`INSERT INTO ${table} (text, file_path, chapter_index, para_id, ord) VALUES (?, ?, ?, ?, ?)`, [text, filePath, ch.index, p.id, ord]);
          ord++;
        }
      });
      await pause();
    }
    db.run(
      "INSERT OR REPLACE INTO book_fts_state (file_path, source_key, chapters, indexed_at) VALUES (?, ?, ?, ?)",
      [filePath, key, book.chapters.length, Date.now()],
    );
    return true;
  })().finally(() => building.delete(filePath));
  building.set(filePath, p);
  return p;
}

export function dropIndex(db: SqlDb, filePath: string): void {
  db.run(`DELETE FROM ${textTable(db)} WHERE file_path = ?`, [filePath]);
  db.run("DELETE FROM book_fts_state WHERE file_path = ?", [filePath]);
}

/** Ordinal of a paragraph in its chapter's index, or null if not indexed. */
export function paraOrd(db: SqlDb, filePath: string, chapterIndex: number, paraId: ParaId): number | null {
  const r = db.get<{ ord: number }>(`SELECT ord FROM ${textTable(db)} WHERE file_path = ? AND chapter_index = ? AND para_id = ?`, [filePath, chapterIndex, paraId]);
  return r ? Number(r.ord) : null;
}

/** SQL clamp: chapters ≤ frontier, plus the next chapter up to the frontier paragraph. */
function clamp(db: SqlDb, filePath: string, f: Frontier): { sql: string; params: (string | number)[] } {
  if (f.mode === "off") return { sql: "1 = 1", params: [] };
  if (f.paraId) {
    const ord = paraOrd(db, filePath, f.chapterIndex + 1, f.paraId);
    if (ord != null) {
      return { sql: "(chapter_index <= ? OR (chapter_index = ? AND ord <= ?))", params: [f.chapterIndex, f.chapterIndex + 1, ord] };
    }
  }
  return { sql: "chapter_index <= ?", params: [f.chapterIndex] };
}

export function tokenize(query: string): string[] {
  const seen = new Set<string>();
  for (const t of query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (t.length >= 2 || /\p{N}/u.test(t)) seen.add(t);
    if (seen.size >= 8) break;
  }
  return [...seen];
}

/** Ranked hits, clamped to the frontier. Searches whatever is indexed (see `ensureIndexed`). */
export function searchBook(db: SqlDb, filePath: string, query: string, frontier: Frontier, limit = 20): SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const lim = Math.max(1, Math.min(200, Math.floor(limit)));
  const c = clamp(db, filePath, frontier);
  return searchBackend(db) === "fts5" ? searchFts(db, filePath, tokens, c, lim) : searchLike(db, filePath, tokens, c, lim);
}

function searchFts(db: SqlDb, filePath: string, tokens: string[], c: { sql: string; params: (string | number)[] }, limit: number): SearchHit[] {
  const terms = tokens.map((t) => `"${t.replace(/"/g, '""')}"`);
  if (tokens.length > 1) terms.unshift(`"${tokens.join(" ")}"`); // phrase match ranks first
  const match = terms.join(" OR ");
  const rows = db.all<{ chapter_index: number; para_id: string; snippet: string; score: number }>(
    `SELECT chapter_index, para_id, snippet(book_fts, 0, '', '', '…', 24) AS snippet, -bm25(book_fts) AS score
     FROM book_fts WHERE book_fts MATCH ? AND file_path = ? AND ${c.sql}
     ORDER BY bm25(book_fts) LIMIT ?`,
    [match, filePath, ...c.params, limit],
  );
  return rows.map((r) => ({ chapterIndex: Number(r.chapter_index), paraId: r.para_id, snippet: r.snippet, score: Number(r.score) }));
}

const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

function searchLike(db: SqlDb, filePath: string, tokens: string[], c: { sql: string; params: (string | number)[] }, limit: number): SearchHit[] {
  const ors = tokens.map(() => "text LIKE ? ESCAPE '\\'").join(" OR ");
  const rows = db.all<{ chapter_index: number; para_id: string; text: string }>(
    `SELECT chapter_index, para_id, text FROM book_text WHERE file_path = ? AND ${c.sql} AND (${ors}) ORDER BY chapter_index, ord LIMIT 5000`,
    [filePath, ...c.params, ...tokens.map((t) => `%${escLike(t)}%`)],
  );
  const phrase = tokens.length > 1 ? tokens.join(" ") : null;
  const scored = rows.map((r) => {
    const lower = r.text.toLowerCase();
    let score = 0;
    let first = -1;
    for (const t of tokens) {
      let n = 0;
      for (let i = lower.indexOf(t); i !== -1; i = lower.indexOf(t, i + t.length)) {
        n++;
        if (first === -1 || i < first) first = i;
      }
      if (n > 0) score += 1 + Math.log(n); // distinct terms dominate, repeats add a little
    }
    if (phrase && lower.includes(phrase)) score += tokens.length;
    score /= 1 + Math.log(1 + r.text.length / 400); // mild length normalisation (BM25-ish)
    return { chapterIndex: Number(r.chapter_index), paraId: r.para_id, snippet: snippetAround(r.text, first), score };
  });
  return scored.sort((a, b) => b.score - a.score || a.chapterIndex - b.chapterIndex).slice(0, limit);
}

function snippetAround(text: string, at: number, width = 160): string {
  if (text.length <= width) return text;
  const start = Math.max(0, Math.min(text.length - width, (at < 0 ? 0 : at) - Math.floor(width / 3)));
  const s = text.slice(start, start + width).trim();
  return `${start > 0 ? "…" : ""}${s}${start + width < text.length ? "…" : ""}`;
}

/** Paragraph texts from the index, clamped to the frontier (assistant `read_passage`, recap). */
export function readIndexedParas(
  db: SqlDb,
  filePath: string,
  chapterIndex: number,
  fromOrd: number,
  toOrd: number,
  frontier: Frontier,
): { paraId: ParaId; ord: number; text: string }[] {
  const c = clamp(db, filePath, frontier);
  return db
    .all<{ para_id: string; ord: number; text: string }>(
      `SELECT para_id, ord, text FROM ${textTable(db)} WHERE file_path = ? AND chapter_index = ? AND ord >= ? AND ord <= ? AND ${c.sql} ORDER BY ord`,
      [filePath, chapterIndex, fromOrd, toOrd, ...c.params],
    )
    .map((r) => ({ paraId: r.para_id, ord: Number(r.ord), text: r.text }));
}
