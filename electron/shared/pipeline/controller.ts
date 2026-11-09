/**
 * Framework-free controller behind `useChapterPipeline` (owner: WS-C).
 *
 * PURE: no `electron`, Node, DOM or React imports; all I/O is injected, so it is unit-tested
 * under `node --test` (electron/pipeline-controller.test.ts) and wrapped by the React hook with
 * `useSyncExternalStore` (src/app/reader/hooks/useChapterPipeline.ts).
 *
 * It loads the book (`book:content`), the chapter's artifacts (`chapters:artifacts`), the lexicon
 * and the frontier-gated entity index, rebuilds the `RenderedChapter` whenever any input changes,
 * and listens to `ai:event`s (artifact / lexicon / knowledge / frontier) to refresh. Results of
 * superseded requests (the reader moved on) are discarded.
 */

import type { AIEvent, ChapterArtifacts } from "../ai/types";
import type {
  Annotation, BlockMarker, BookContentV2, EntityMatcher, LayerState, Lexicon, RenderedChapter, SourceChapter,
} from "./types";
import { buildChapter } from "./build";
import { isFormatFresh, isRewriteFresh } from "./layers";
import { EMPTY_LEXICON } from "./lexicon";

export interface ChapterPipelineSources {
  getBook(filePath: string): Promise<BookContentV2>;
  /** The current lexicon. With `version` (from a `lexicon` event), it must resolve to that version
   *  or newer: a cached copy older than `version` is refetched (QA-P1-3). */
  getLexicon(version?: string): Promise<Lexicon>;
  /** Optional until WS-D's `chapters:artifacts` exists; rejections are treated as "no layers". */
  getArtifacts?(filePath: string, chapterIndex: number): Promise<ChapterArtifacts | null>;
  /** Frontier-gated entities (`knowledge:entityIndex`); rejections are treated as "none". */
  getEntities?(filePath: string): Promise<EntityMatcher[]>;
  /** `ai:event` stream; returns an unsubscriber. */
  subscribe?(listener: (e: AIEvent) => void): () => void;
  onError?(what: "book" | "artifacts" | "entities" | "lexicon", err: unknown): void;
}

export interface ChapterPipelineOptions {
  /** Show the rewrite layer if one is available and fresh (per-book pref, e.g. concise on). */
  showRewrite: boolean;
  /** Show the format layer if one is available and fresh. */
  showFormat: boolean;
  /** Highlight entities (≤ frontier). */
  entities: boolean;
  /** Also build `original` (no rewrite/format layers), for `readAloud: "original"`. */
  withOriginal: boolean;
  annotations: Annotation[];
  blocks: BlockMarker[];
}

export interface ChapterPipelineState {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  filePath: string | null;
  chapterIndex: number;
  book: BookContentV2 | null;
  source: SourceChapter | null;
  /** The displayed variant: page, speed reader and TTS (`paras[i].speech`) all read this. */
  chapter: RenderedChapter | null;
  /** Lexicon only, no rewrite/format; null unless `withOriginal`. */
  original: RenderedChapter | null;
  artifacts: ChapterArtifacts | null;
  layers: { rewrite: LayerState; format: LayerState };
  lexicon: Lexicon;
}

export interface ChapterPipeline {
  getState(): ChapterPipelineState;
  /** Notified after every state change. Returns an unsubscriber. */
  subscribe(cb: () => void): () => void;
  setTarget(filePath: string | null, chapterIndex: number): void;
  setOptions(patch: Partial<ChapterPipelineOptions>): void;
  /** Force a reload of one input (e.g. after `chapters:clear`). */
  refresh(what: "book" | "artifacts" | "entities" | "lexicon"): void;
  /** Re-subscribe to `ai:event`s after `detach` (React StrictMode remounts); refreshes inputs. */
  attach(): void;
  /** Stop listening to `ai:event`s (the pipeline keeps its state and can `attach` again). */
  detach(): void;
  /** Resolves once no load is in flight (tests, imperative callers). */
  idle(): Promise<void>;
  dispose(): void;
}

const DEFAULT_OPTIONS: ChapterPipelineOptions = {
  showRewrite: true, showFormat: true, entities: true, withOriginal: false, annotations: [], blocks: [],
};

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createChapterPipeline(sources: ChapterPipelineSources, initial?: Partial<ChapterPipelineOptions>): ChapterPipeline {
  let opts: ChapterPipelineOptions = { ...DEFAULT_OPTIONS, ...initial };
  const listeners = new Set<() => void>();
  const inflight = new Set<Promise<unknown>>();
  let disposed = false;

  // inputs
  let filePath: string | null = null;
  let chapterIndex = -1;
  let book: BookContentV2 | null = null;
  let bookError: string | null = null;
  let bookLoading = false;
  let lexicon: Lexicon | null = null;
  let artifacts: ChapterArtifacts | null = null;
  let artifactsKey: string | null = null; // `${filePath}#${chapterIndex}` the artifacts belong to
  let artifactsLoading = false;
  let entities: EntityMatcher[] = [];
  // request generations (stale results are dropped)
  const gen = { book: 0, artifacts: 0, entities: 0, lexicon: 0 };

  let state: ChapterPipelineState = {
    status: "idle", error: null, filePath: null, chapterIndex: -1, book: null, source: null, chapter: null,
    original: null, artifacts: null, layers: { rewrite: "none", format: "none" }, lexicon: EMPTY_LEXICON,
  };

  // memo of the last build inputs
  let lastBuild: { inputs: unknown[]; chapter: RenderedChapter | null; original: RenderedChapter | null } | null = null;

  const emit = () => {
    for (const l of Array.from(listeners)) {
      try { l(); } catch { /* listener errors must not break the pipeline */ }
    }
  };

  const track = <T>(p: Promise<T>): Promise<T> => {
    inflight.add(p);
    const done = () => inflight.delete(p);
    p.then(done, done);
    return p;
  };

  function recompute(): void {
    if (disposed) return;
    const key = filePath === null ? null : `${filePath}#${chapterIndex}`;
    const arts = artifactsKey === key ? artifacts : null;
    const src = book && chapterIndex >= 0 && chapterIndex < book.chapters.length ? book.chapters[chapterIndex] : null;

    let status: ChapterPipelineState["status"];
    let error: string | null = null;
    if (filePath === null) status = "idle";
    else if (bookError) { status = "error"; error = bookError; }
    else if (book && !src) { status = "error"; error = `Chapter ${chapterIndex} out of range`; }
    else if (!book || bookLoading || !lexicon || (artifactsLoading && artifactsKey !== key)) status = "loading";
    else status = "ready";

    const rewrite = opts.showRewrite ? arts?.rewrite ?? null : null;
    const format = opts.showFormat ? arts?.format ?? null : null;
    let chapter: RenderedChapter | null = null;
    let original: RenderedChapter | null = null;
    if (src && lexicon && status === "ready") {
      const inputs = [src, rewrite, format, lexicon, opts.entities ? entities : null, opts.annotations, opts.blocks, opts.withOriginal];
      if (lastBuild && lastBuild.inputs.length === inputs.length && lastBuild.inputs.every((v, i) => v === inputs[i])) {
        chapter = lastBuild.chapter;
        original = lastBuild.original;
      } else {
        const common = { lexicon, entities: opts.entities ? entities : [], annotations: opts.annotations, blocks: opts.blocks };
        chapter = buildChapter(src, { ...common, rewrite, format });
        original = opts.withOriginal ? (rewrite || format ? buildChapter(src, common) : chapter) : null;
        lastBuild = { inputs, chapter, original };
      }
    }

    const layerState = (has: unknown, shown: boolean, fresh: boolean): LayerState =>
      !has ? "none" : !shown ? "hidden" : fresh ? "applied" : "stale";
    const rwFresh = !!src && isRewriteFresh(src, arts?.rewrite);
    const appliedRw = opts.showRewrite && rwFresh ? arts!.rewrite! : null;
    const layers = {
      rewrite: layerState(arts?.rewrite, opts.showRewrite, rwFresh),
      format: layerState(arts?.format, opts.showFormat, !!src && isFormatFresh(src, appliedRw, arts?.format)),
    };

    state = {
      status, error, filePath, chapterIndex, book, source: src, chapter, original, artifacts: arts, layers,
      lexicon: lexicon ?? EMPTY_LEXICON,
    };
    emit();
  }

  function loadBook(): void {
    const fp = filePath;
    const g = ++gen.book;
    if (fp === null) return;
    bookLoading = true;
    bookError = null;
    track(sources.getBook(fp)).then(
      (b) => {
        if (disposed || g !== gen.book) return;
        book = b;
        bookLoading = false;
        recompute();
      },
      (err) => {
        if (disposed || g !== gen.book) return;
        sources.onError?.("book", err);
        book = null;
        bookLoading = false;
        bookError = errText(err);
        recompute();
      },
    );
  }

  function loadArtifacts(): void {
    const fp = filePath;
    const idx = chapterIndex;
    const g = ++gen.artifacts;
    if (fp === null || idx < 0) return;
    const key = `${fp}#${idx}`;
    if (!sources.getArtifacts) {
      artifacts = null;
      artifactsKey = key;
      return;
    }
    artifactsLoading = true;
    const finish = (a: ChapterArtifacts | null) => {
      if (disposed || g !== gen.artifacts) return;
      artifacts = a;
      artifactsKey = key;
      artifactsLoading = false;
      recompute();
    };
    track(sources.getArtifacts(fp, idx)).then(
      (a) => finish(a ?? null),
      (err) => {
        sources.onError?.("artifacts", err);
        finish(null);
      },
    );
  }

  function loadEntities(): void {
    const fp = filePath;
    const g = ++gen.entities;
    if (fp === null || !sources.getEntities) {
      entities = [];
      return;
    }
    track(sources.getEntities(fp)).then(
      (list) => {
        if (disposed || g !== gen.entities) return;
        entities = Array.isArray(list) ? list : [];
        recompute();
      },
      (err) => {
        if (disposed || g !== gen.entities) return;
        sources.onError?.("entities", err);
        entities = [];
        recompute();
      },
    );
  }

  function loadLexicon(version?: string): void {
    const g = ++gen.lexicon;
    track(sources.getLexicon(version)).then(
      (lex) => {
        if (disposed || g !== gen.lexicon) return;
        if (!lexicon || lex.version !== lexicon.version) lexicon = lex;
        recompute();
      },
      (err) => {
        if (disposed || g !== gen.lexicon) return;
        sources.onError?.("lexicon", err);
        lexicon = lexicon ?? EMPTY_LEXICON;
        recompute();
      },
    );
  }

  const onEvent = (e: AIEvent) => {
    if (disposed) return;
    switch (e.type) {
      case "artifact":
        if (e.filePath === filePath && e.chapterIndex === chapterIndex) loadArtifacts();
        break;
      case "lexicon":
        if (!lexicon || e.version !== lexicon.version) loadLexicon(e.version);
        break;
      case "knowledge":
      case "frontier":
        if (e.filePath === filePath) loadEntities();
        break;
    }
  };
  let unsubscribe: (() => void) | null = null;
  const attach = () => {
    if (!unsubscribe && !disposed) unsubscribe = sources.subscribe?.(onEvent) ?? null;
  };
  const detach = () => {
    unsubscribe?.();
    unsubscribe = null;
  };
  attach();

  loadLexicon();

  return {
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    setTarget(fp, idx) {
      if (disposed || (fp === filePath && idx === chapterIndex)) return;
      const bookChanged = fp !== filePath;
      filePath = fp;
      chapterIndex = fp === null ? -1 : idx;
      if (bookChanged) {
        book = null;
        bookError = null;
        entities = [];
        lastBuild = null;
        loadBook();
        loadEntities();
      }
      loadArtifacts();
      recompute();
    },
    setOptions(patch) {
      if (disposed) return;
      const next = { ...opts, ...patch };
      const changed = (Object.keys(next) as (keyof ChapterPipelineOptions)[]).some((k) => next[k] !== opts[k]);
      if (!changed) return;
      opts = next;
      recompute();
    },
    refresh(what) {
      if (disposed) return;
      if (what === "book") { lastBuild = null; loadBook(); }
      else if (what === "artifacts") loadArtifacts();
      else if (what === "entities") loadEntities();
      else loadLexicon();
      recompute();
    },
    async idle() {
      while (inflight.size > 0) await Promise.allSettled(Array.from(inflight));
    },
    attach() {
      if (unsubscribe) return;
      attach();
      // Events may have been missed while detached: refresh the event-driven inputs.
      if (filePath !== null) { loadArtifacts(); loadEntities(); }
      loadLexicon();
    },
    detach,
    dispose() {
      disposed = true;
      listeners.clear();
      detach();
    },
  };
}
