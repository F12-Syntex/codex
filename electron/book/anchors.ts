/**
 * User data anchored by ParaRef (owner: WS-C). Backs `book:annotations:*` and `book:anchors:*`.
 *
 * - `annotations`: user comments (and highlights). AI comments are chapter artifacts, so clearing
 *   AI output can never delete what the user wrote (S1-6).
 * - `para_anchors`: the ParaRef of rows that still live in legacy tables (`quotes`, `bookmarks`),
 *   keyed by (kind, legacy row id). The legacy rows keep working for other windows; the reader
 *   resolves them by ParaId, so they survive rewrite/format layers (S2-7).
 */

import type { SqlDb } from "../db/sql";
import type { AnchorKind, BookAnchor, BookAnnotation, NewBookAnnotation } from "../shared/pipeline/types";

const MAX_TEXT = 10_000;
const MAX_QUOTE = 2_000;

interface AnnotationRow {
  id: number;
  file_path: string;
  chapter_id: string;
  para_id: string;
  kind: string;
  author: string;
  text: string | null;
  quote: string | null;
  created_at: number;
}

const toAnnotation = (r: AnnotationRow): BookAnnotation => ({
  id: Number(r.id),
  filePath: r.file_path,
  chapterId: r.chapter_id,
  paraId: r.para_id,
  kind: r.kind === "highlight" ? "highlight" : "comment",
  author: "user",
  text: r.text ?? "",
  quote: r.quote ?? "",
  createdAt: Number(r.created_at),
});

const str = (v: unknown, name: string): string => {
  if (typeof v !== "string" || !v) throw new Error(`book: ${name} must be a non-empty string`);
  return v;
};

export function listAnnotations(db: SqlDb, filePath: string): BookAnnotation[] {
  return db
    .all<AnnotationRow>("SELECT * FROM annotations WHERE file_path = ? ORDER BY created_at ASC, id ASC", [filePath])
    .map(toAnnotation);
}

export function addAnnotation(db: SqlDb, a: NewBookAnnotation, now: number = Date.now()): BookAnnotation {
  const filePath = str(a?.filePath, "filePath");
  const chapterId = str(a.chapterId, "chapterId");
  const paraId = str(a.paraId, "paraId");
  const kind = a.kind === "highlight" ? "highlight" : "comment";
  const text = typeof a.text === "string" ? a.text.slice(0, MAX_TEXT) : "";
  const quote = typeof a.quote === "string" ? a.quote.slice(0, MAX_QUOTE) : "";
  if (kind === "comment" && !text.trim()) throw new Error("book: a comment needs text");
  const r = db.run(
    "INSERT INTO annotations (file_path, chapter_id, para_id, kind, author, text, quote, created_at) VALUES (?, ?, ?, ?, 'user', ?, ?, ?)",
    [filePath, chapterId, paraId, kind, text, quote, now],
  );
  return toAnnotation(db.get<AnnotationRow>("SELECT * FROM annotations WHERE id = ?", [r.lastInsertRowid])!);
}

export function deleteAnnotation(db: SqlDb, id: number): void {
  if (typeof id !== "number" || !Number.isInteger(id)) throw new Error("book: annotation id must be an integer");
  db.run("DELETE FROM annotations WHERE id = ?", [id]);
}

interface AnchorRow {
  kind: string;
  ref_id: string;
  file_path: string;
  chapter_id: string;
  para_id: string;
  quote: string | null;
}

const isAnchorKind = (k: unknown): k is AnchorKind => k === "quote" || k === "bookmark";

const toAnchor = (r: AnchorRow): BookAnchor => {
  const a: BookAnchor = {
    kind: r.kind as AnchorKind,
    refId: r.ref_id,
    filePath: r.file_path,
    chapterId: r.chapter_id,
    paraId: r.para_id,
  };
  if (r.quote) a.quote = r.quote;
  return a;
};

export function listAnchors(db: SqlDb, filePath: string): BookAnchor[] {
  return db.all<AnchorRow>("SELECT * FROM para_anchors WHERE file_path = ? ORDER BY kind, ref_id", [filePath]).map(toAnchor);
}

export function setAnchor(db: SqlDb, a: BookAnchor): void {
  if (!isAnchorKind(a?.kind)) throw new Error("book: anchor kind must be quote|bookmark");
  db.run(
    `INSERT INTO para_anchors (kind, ref_id, file_path, chapter_id, para_id, quote) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (kind, ref_id) DO UPDATE SET file_path = excluded.file_path, chapter_id = excluded.chapter_id,
       para_id = excluded.para_id, quote = excluded.quote`,
    [
      a.kind, str(String(a.refId ?? ""), "refId"), str(a.filePath, "filePath"), str(a.chapterId, "chapterId"),
      str(a.paraId, "paraId"), typeof a.quote === "string" ? a.quote.slice(0, MAX_QUOTE) : null,
    ],
  );
}

export function deleteAnchor(db: SqlDb, kind: AnchorKind, refId: string): void {
  if (!isAnchorKind(kind)) throw new Error("book: anchor kind must be quote|bookmark");
  db.run("DELETE FROM para_anchors WHERE kind = ? AND ref_id = ?", [kind, String(refId)]);
}
