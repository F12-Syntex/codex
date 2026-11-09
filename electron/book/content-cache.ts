/**
 * Main-side book content cache (owner: WS-C). Implements `BookContentReader` (AI_AUDIT §4.5 layer 0).
 *
 * - Parses with `parseBookContentV2` (sanitized, ids, hashes); the format is resolved here
 *   (library row first, then the file extension), so secondary windows never guess it (S2-15).
 * - LRU keyed by filePath + mtime + size + parserVersion; a changed file is re-parsed.
 * - Concurrent requests for the same file share one parse.
 *
 * No top-level `electron` import; all I/O is injectable for tests.
 */

import fs from "fs";
import path from "path";
import type { BookContentReader, BookContentV2, SourceChapter } from "../shared/pipeline/types";
import { PARSER_VERSION } from "../shared/pipeline/ids";
import { toSourceChapter } from "../shared/pipeline/source";

export interface ContentCacheDeps {
  parse(filePath: string, format: string): Promise<BookContentV2>;
  /** Library format for the file (e.g. "EPUB"), or null if unknown. */
  lookupFormat?(filePath: string): string | null;
  /** Null when the file doesn't exist. */
  stat?(filePath: string): { mtimeMs: number; size: number } | null;
  /** Max books kept (default 4). */
  maxEntries?: number;
  /** Rough cap on cached html/text characters (default 300M). */
  maxChars?: number;
}

interface Entry {
  key: string;
  book: BookContentV2;
  chars: number;
}

export function formatFromExtension(filePath: string): string {
  return path.extname(filePath).slice(1).toUpperCase();
}

function defaultStat(filePath: string): { mtimeMs: number; size: number } | null {
  try {
    const s = fs.statSync(filePath);
    return { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}

function sizeOf(book: BookContentV2): number {
  let n = 0;
  for (const ch of book.chapters) {
    for (const p of ch.paras) n += p.html.length + p.text.length;
    // legacy mirrors are separate strings for text books (shared refs for image books)
    if (!book.isImageBook) for (const h of ch.htmlParagraphs) n += h.length;
  }
  return n;
}

export class BookContentCache implements BookContentReader {
  private readonly entries = new Map<string, Entry>(); // filePath → entry, in LRU order
  private readonly pending = new Map<string, Promise<BookContentV2>>(); // cache key → parse
  private readonly maxEntries: number;
  private readonly maxChars: number;

  constructor(private readonly deps: ContentCacheDeps) {
    this.maxEntries = Math.max(1, deps.maxEntries ?? 4);
    this.maxChars = deps.maxChars ?? 300_000_000;
  }

  resolveFormat(filePath: string): string {
    let fmt: string | null = null;
    try {
      fmt = this.deps.lookupFormat?.(filePath) ?? null;
    } catch {
      fmt = null;
    }
    return (fmt || formatFromExtension(filePath)).toUpperCase();
  }

  private keyOf(filePath: string): string {
    const st = (this.deps.stat ?? defaultStat)(filePath);
    if (!st) throw new Error(`Book file not found: ${filePath}`);
    return `${filePath}|${st.mtimeMs}|${st.size}|${PARSER_VERSION}`;
  }

  async getBook(filePath: string): Promise<BookContentV2> {
    const key = this.keyOf(filePath);
    const hit = this.entries.get(filePath);
    if (hit && hit.key === key) {
      this.entries.delete(filePath);
      this.entries.set(filePath, hit); // refresh LRU position
      return hit.book;
    }
    const inflight = this.pending.get(key);
    if (inflight) return inflight;

    const p = this.deps.parse(filePath, this.resolveFormat(filePath)).then(
      (book) => {
        this.pending.delete(key);
        // Only store if the file didn't change while parsing.
        if (this.safeKey(filePath) === key) this.store(filePath, { key, book, chars: sizeOf(book) });
        return book;
      },
      (err) => {
        this.pending.delete(key);
        throw err;
      },
    );
    this.pending.set(key, p);
    return p;
  }

  async getChapter(filePath: string, chapterIndex: number): Promise<SourceChapter> {
    const book = await this.getBook(filePath);
    const ch = book.chapters[chapterIndex];
    if (!Number.isInteger(chapterIndex) || !ch) {
      throw new RangeError(`Chapter ${chapterIndex} out of range (0..${book.chapters.length - 1}) for ${filePath}`);
    }
    return toSourceChapter(ch);
  }

  /** Drop one book (or everything). */
  invalidate(filePath?: string): void {
    if (filePath === undefined) this.entries.clear();
    else this.entries.delete(filePath);
  }

  /** Diagnostics/tests. */
  get size(): number {
    return this.entries.size;
  }

  private safeKey(filePath: string): string | null {
    try {
      return this.keyOf(filePath);
    } catch {
      return null;
    }
  }

  private store(filePath: string, e: Entry): void {
    this.entries.delete(filePath);
    this.entries.set(filePath, e);
    let total = 0;
    for (const x of this.entries.values()) total += x.chars;
    // Evict least recently used, but always keep the newest entry.
    for (const [fp, x] of this.entries) {
      if (this.entries.size <= 1) break;
      if (this.entries.size <= this.maxEntries && total <= this.maxChars) break;
      this.entries.delete(fp);
      total -= x.chars;
    }
  }
}

// ── Process-wide instance ───────────────────────────────────────────────────

let shared: BookContentCache | null = null;

/**
 * Configure the process-wide cache (called by `registerBook` with a library-backed format lookup).
 * Replaces any previous instance (and its cached books).
 */
export function configureBookContentCache(deps: ContentCacheDeps): BookContentCache {
  shared = new BookContentCache(deps);
  return shared;
}

/**
 * The `BookContentReader` other main-side modules use (TaskContext.books, knowledge search,
 * assistant tools). Lazily created with extension-based format detection if `registerBook`
 * hasn't configured it yet.
 */
export function getBookContentReader(): BookContentCache {
  if (!shared) {
    // Lazy require keeps adm-zip/pdf-parse out of modules that only need the type.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseBookContentV2 } = require("../book-parser") as typeof import("../book-parser");
    shared = new BookContentCache({ parse: parseBookContentV2 });
  }
  return shared;
}

/** Test helper. */
export function _resetBookContentCacheForTests(): void {
  shared = null;
}
