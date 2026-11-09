/**
 * Layer 0: source (owner: WS-C). Turns parser output into id-anchored `SourceChapter`s.
 *
 * PURE: no `electron`, Node or DOM imports. The parser (`electron/book-parser.ts`) produces the
 * legacy `{ title, paragraphs, htmlParagraphs }` chapters with sanitized html; `toBookContentV2`
 * adds kinds, visible text, ids and hashes, and keeps the legacy arrays as mirrors (same index ⇒
 * same paragraph), so index-keyed legacy data can be re-anchored with `paras[idx].id`.
 */

import type { BookContentV2, ChapterId, SourceChapter, SourcePara, SourceParaKind, TocEntry } from "./types";
import { walkText, tokenizeHtml, escapeAttr } from "./html";
import { assignParaIds, bookIdOf, chapterIdOf, PARSER_VERSION, sourceHashOf } from "./ids";

/** Visible text of html: entities decoded, block boundaries as "\n", runs of spaces collapsed. */
export function htmlToText(html: string): string {
  return walkText(html)
    .text.replace(/[ \t\r\f]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

const HEADING_RE = /^h[1-6]$/;

/** Classify a (sanitized) paragraph by its first element and whether it has visible text. */
export function classifyPara(html: string, text: string): SourceParaKind {
  const tokens = tokenizeHtml(html);
  const first = tokens.find((t) => t.type === "start" || (t.type === "text" && t.raw.trim() !== ""));
  const hasImg = tokens.some((t) => t.type === "start" && t.name === "img");
  if (!text && hasImg) return "image";
  if (first && first.type === "start") {
    if (HEADING_RE.test(first.name)) return "heading";
    if (first.name === "hr" && !text) return "rule";
    if (first.name !== "p" && first.name !== "span" && first.name !== "em" && first.name !== "strong"
      && first.name !== "i" && first.name !== "b" && first.name !== "br") {
      return text ? "block" : hasImg ? "image" : "block";
    }
  }
  return "text";
}

export interface LegacyChapterLike {
  title: string;
  paragraphs: string[];
  htmlParagraphs: string[];
  /** Spine href (EPUB) used for the ChapterId; index otherwise. */
  sourceKey?: string;
}

export interface LegacyBookLike {
  chapters: LegacyChapterLike[];
  isImageBook: boolean;
  toc: { label: string; chapterIndex: number }[];
  fontFamily?: string;
  fontSizePx?: number;
  css?: string;
}

/** Build one SourceChapter from already-sanitized html paragraphs. */
export function buildSourceChapter(input: {
  index: number;
  title: string;
  key?: string;
  /** Sanitized html per paragraph, plus an optional kind override (image books). */
  paras: { html: string; kind?: SourceParaKind }[];
}): SourceChapter {
  const drafts = input.paras.map((p) => {
    const text = p.kind === "image" ? "" : htmlToText(p.html);
    const kind = p.kind ?? classifyPara(p.html, text);
    return { html: p.html, text, kind };
  });
  const ids = assignParaIds(drafts);
  const paras: SourcePara[] = drafts.map((d, i) => ({ id: ids[i], index: i, kind: d.kind, html: d.html, text: d.text }));
  return {
    id: chapterIdOf(input.key, input.index),
    index: input.index,
    title: input.title,
    sourceHash: sourceHashOf(paras),
    paras,
  };
}

/**
 * Legacy parser output → `BookContentV2`. Image books (CBZ) carry bare data URIs in the legacy
 * arrays; their paras get `<img>` html and kind "image", and the legacy mirrors stay as they were.
 */
export function toBookContentV2(filePath: string, legacy: LegacyBookLike): BookContentV2 {
  const keys = new Map<string, number>();
  const chapters = legacy.chapters.map((ch, index) => {
    const paras = legacy.isImageBook
      ? ch.htmlParagraphs.map((uri) => ({ html: `<img src="${escapeAttr(uri)}" alt="">`, kind: "image" as const }))
      : ch.htmlParagraphs.map((html) => ({ html }));
    // A spine href listed twice would collide; later copies get an occurrence suffix.
    let key = ch.sourceKey;
    if (key) {
      const n = keys.get(key) ?? 0;
      keys.set(key, n + 1);
      if (n > 0) key = `${key}#${n}`;
    }
    const src = buildSourceChapter({ index, title: ch.title, key, paras });
    return { ...src, paragraphs: ch.paragraphs, htmlParagraphs: ch.htmlParagraphs };
  });
  const toc: TocEntry[] = legacy.toc.map((e) => ({
    label: e.label,
    chapterIndex: e.chapterIndex,
    chapterId: chapters[e.chapterIndex]?.id,
  }));
  const out: BookContentV2 = {
    bookId: bookIdOf(filePath),
    parserVersion: PARSER_VERSION,
    isImageBook: legacy.isImageBook,
    toc,
    chapters,
  };
  if (legacy.fontFamily !== undefined) out.fontFamily = legacy.fontFamily;
  if (legacy.fontSizePx !== undefined) out.fontSizePx = legacy.fontSizePx;
  if (legacy.css !== undefined) out.css = legacy.css;
  return out;
}

export function findChapterById(book: BookContentV2, id: ChapterId): BookContentV2["chapters"][number] | null {
  return book.chapters.find((c) => c.id === id) ?? null;
}

/** Strip the legacy mirrors (e.g. before handing a chapter to an AI task). */
export function toSourceChapter(ch: SourceChapter & Partial<{ paragraphs: string[]; htmlParagraphs: string[] }>): SourceChapter {
  return { id: ch.id, index: ch.index, title: ch.title, sourceHash: ch.sourceHash, paras: ch.paras };
}
