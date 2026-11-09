/**
 * Stable ids for books, chapters and paragraphs (owner: WS-C). AI_AUDIT §4.4.4.
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * - ParaId   = "p" + base36(fnv1a64(normalize(text) + "|" + kind)) + "." + occurrence
 *              (paragraphs without visible text, e.g. images, hash their html instead)
 * - ChapterId = "c" + base36(fnv1a64(spineHref || `${index}`))
 * - bookId   = "b" + base36(fnv1a64(filePath))
 *
 * Ids only change when the paragraph's own text changes, so edits elsewhere in the chapter (or
 * re-parsing) leave every other anchor in place. Bump `PARSER_VERSION` whenever paragraph
 * splitting or `normalizeForId` changes.
 */

import { fnv1a64Base36, hashOf } from "../ai/hash";
import type { ChapterId, ParaId, SourceParaKind } from "./types";

/** v1 = legacy index-keyed parser; v2 = ids + sanitizer + escaped plain text. */
export const PARSER_VERSION = 2;

/** Whitespace-insensitive, Unicode-normalized form used for hashing. Case is kept. */
export function normalizeForId(text: string): string {
  return text.normalize("NFC").replace(/[\s ​]+/g, " ").trim();
}

/** The id without its occurrence suffix. */
export function paraIdBase(text: string, kind: SourceParaKind, html = ""): string {
  const norm = normalizeForId(text);
  return "p" + fnv1a64Base36((norm || html) + "|" + kind);
}

/** Assign ids in document order; identical paragraphs get `.0`, `.1`, … */
export function assignParaIds(paras: readonly { text: string; kind: SourceParaKind; html: string }[]): ParaId[] {
  const seen = new Map<string, number>();
  return paras.map((p) => {
    const base = paraIdBase(p.text, p.kind, p.html);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}.${n}`;
  });
}

export function chapterIdOf(spineHref: string | undefined, index: number): ChapterId {
  return "c" + fnv1a64Base36(spineHref || `${index}`);
}

export function bookIdOf(filePath: string): string {
  return "b" + fnv1a64Base36(filePath);
}

/** Hash over paragraph ids and html (image html is already covered by its id). */
export function sourceHashOf(paras: readonly { id: ParaId; kind: SourceParaKind; html: string }[]): string {
  return hashOf(...paras.map((p) => (p.kind === "image" ? p.id : `${p.id}\u0001${p.html}`)));
}

/** Split a ParaId into its base and occurrence. */
export function parseParaId(id: ParaId): { base: string; occurrence: number } | null {
  const m = /^(p[0-9a-z]+)\.(\d+)$/.exec(id);
  return m ? { base: m[1], occurrence: Number(m[2]) } : null;
}
