/**
 * Frontier-clamped view of one book for a single assistant turn (owner: WS-E).
 *
 * Wraps WS-C's `BookContentReader` (async) and the reader's `Frontier`, and is the ONLY way the
 * assistant tools and the citation resolver touch book text, so nothing past the frontier can
 * leak. One extra "window" may be opened for the paragraph the user selected (the reader can see
 * it on screen even after a TOC jump): that chapter becomes readable up to the selection, never
 * beyond it, and never the chapters in between.
 */

import type { Frontier } from "../shared/knowledge/types";
import type { BookContentV2, ParaRef, SourceChapter } from "../shared/pipeline/types";
import { visibleParaCount } from "../shared/assistant/frontier";
import { normalizeChapterLabel, type MarkerResolver, type ResolvedCite } from "../shared/assistant/markers";
import type { BookContentReader } from "./contracts";
import { clip } from "./text";

/** Chapter → story label ("12", "Prologue"). WS-C's `shared/pipeline/classify.ts` provides the real one. */
export type ChapterLabeler = (book: BookContentV2) => string[];

export const defaultLabeler: ChapterLabeler = (book) => book.chapters.map((c) => String(c.index + 1));

export interface ExtraWindow {
  chapterIndex: number;
  /** 0-based index of the last visible paragraph. */
  upToPara: number;
}

export class BookView {
  private book: BookContentV2 | null = null;
  private labels: string[] = [];
  private labelIndex = new Map<string, number>();
  private chapters = new Map<number, SourceChapter>();
  private extra: ExtraWindow | null = null;

  constructor(
    readonly filePath: string,
    readonly frontier: Frontier,
    private readonly reader: BookContentReader | null,
    private readonly labeler: ChapterLabeler = defaultLabeler,
  ) {}

  async load(): Promise<this> {
    if (this.book || !this.reader) return this;
    try {
      this.book = await this.reader.getBook(this.filePath);
    } catch {
      this.book = null;
    }
    if (this.book) {
      this.labels = this.labeler(this.book);
      this.labels.forEach((l, i) => this.labelIndex.set(l.toLowerCase(), i));
      for (const c of this.book.chapters) this.chapters.set(c.index, c);
    }
    return this;
  }

  get available(): boolean {
    return !!this.book;
  }

  get chapterCount(): number {
    return this.book?.chapters.length ?? 0;
  }

  /** Allow `ref`'s chapter up to and including `ref`'s paragraph (the user's selection). */
  openWindow(ref: ParaRef): ExtraWindow | null {
    const ch = this.byId(ref.chapterId);
    if (!ch) return null;
    const at = ch.paras.findIndex((p) => p.id === ref.paraId);
    if (at < 0) return null;
    this.extra = { chapterIndex: ch.index, upToPara: at };
    return this.extra;
  }

  label(chapterIndex: number): string {
    return this.labels[chapterIndex] ?? String(chapterIndex + 1);
  }

  /** "12", "Chapter 12", "ch 12" → chapter index, or undefined. */
  indexOfLabel(input: string | number): number | undefined {
    const l = normalizeChapterLabel(input).toLowerCase();
    const hit = this.labelIndex.get(l);
    if (hit !== undefined) return hit;
    // Fall back to a plain 1-based number when the labeler uses words ("Prologue") elsewhere.
    if (/^\d+$/.test(l) && !this.labels.length) return Number(l) - 1;
    return undefined;
  }

  async chapter(index: number): Promise<SourceChapter | null> {
    const hit = this.chapters.get(index);
    if (hit) return hit;
    if (!this.reader) return null;
    try {
      const c = await this.reader.getChapter(this.filePath, index);
      if (c) this.chapters.set(index, c);
      return c ?? null;
    } catch {
      return null;
    }
  }

  byId(chapterId: string): SourceChapter | null {
    for (const c of this.chapters.values()) if (c.id === chapterId) return c;
    return null;
  }

  /** Number of leading paragraphs of `ch` the reader may see. */
  visibleCount(ch: SourceChapter): number {
    let n = visibleParaCount(this.frontier, ch);
    if (this.extra && this.extra.chapterIndex === ch.index) n = Math.max(n, Math.min(ch.paras.length, this.extra.upToPara + 1));
    return n;
  }

  isVisible(ch: SourceChapter, paraIndex: number): boolean {
    return paraIndex >= 0 && paraIndex < this.visibleCount(ch);
  }

  /** Is any part of chapter `index` readable? (Cheap: no chapter load needed for whole chapters.) */
  chapterReadable(index: number): boolean {
    if (this.frontier.mode === "off") return true;
    if (index <= this.frontier.chapterIndex) return true;
    if (index === this.frontier.chapterIndex + 1 && this.frontier.paraId) return true;
    return !!this.extra && this.extra.chapterIndex === index;
  }

  /** Indices of every chapter with readable text, ascending. */
  readableChapters(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.chapterCount; i++) if (this.chapterReadable(i)) out.push(i);
    return out;
  }

  /** Resolver for `[[cite:<label>:<ordinal>]]` markers (ordinal = 1-based paragraph position). */
  resolver(isEntityVisible: (id: string) => boolean): MarkerResolver {
    return {
      resolveCite: (label: string, ordinal: number): ResolvedCite | null => {
        const idx = this.indexOfLabel(label);
        if (idx === undefined) return null;
        const ch = this.chapters.get(idx);
        if (!ch) return null;
        const pi = ordinal - 1;
        if (!this.isVisible(ch, pi)) return null;
        const p = ch.paras[pi];
        return {
          ref: { filePath: this.filePath, chapterId: ch.id, paraId: p.id },
          chapterIndex: ch.index,
          label: `Ch ${this.label(ch.index)} ¶${ordinal}`,
          snippet: clip(p.text.replace(/\s+/g, " ").trim(), 280),
        };
      },
      isEntityVisible,
    };
  }
}
