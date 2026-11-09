/**
 * Text pipeline contracts (owner: WS-C). FROZEN at the end of Phase 0: additive changes only.
 *
 * PURE: no `electron`, Node or DOM imports. Imported by main (electron tsconfig) and by the
 * renderer through the `@shared/*` path alias.
 *
 * Fixed layer order (AI_AUDIT §4.5):
 *   0 source → 1 rewrite → 2 format → 3 sanitize → 4 lexicon → 5 annotate → 6 decorate → 7 project
 *
 * Everything derived from book text is anchored by stable ids (`ChapterId`, `ParaId`), never by
 * array index. A layer may only replace a paragraph's html, drop it, or merge it into another
 * paragraph; it may never reorder or insert paragraphs.
 */

// ── Identity ────────────────────────────────────────────────────────────────

/**
 * Stable paragraph id: `"p" + base36(fnv1a64(normalize(text) + "|" + kind)) + "." + occurrence`.
 * `occurrence` disambiguates identical paragraphs inside one chapter (0-based, in document order).
 * Survives re-parse as long as the parser's splitting logic (`parserVersion`) is unchanged.
 */
export type ParaId = string;

/** Stable chapter id: `"c" + base36(fnv1a64(spineHref || `${index}`))`. Survives re-parse. */
export type ChapterId = string;

/** A fully-qualified paragraph anchor. Every persisted anchor (comment, quote, bookmark, read mark,
 *  branch point, TTS position, citation) is a `ParaRef`, resolved with `resolveAnchor`. */
export interface ParaRef {
  filePath: string;
  chapterId: ChapterId;
  paraId: ParaId;
}

// ── Layer 0: source ─────────────────────────────────────────────────────────

export type SourceParaKind = "text" | "image" | "heading" | "rule" | "block";

export interface SourcePara {
  id: ParaId;
  /** 0-based position in the chapter's source order. Informational only; never persist it. */
  index: number;
  kind: SourceParaKind;
  /** Sanitized (`book` policy) html. Plain-text sources are escaped and wrapped in `<p>`. */
  html: string;
  /** Visible plain text of `html` (no tags, entities decoded). AI inputs use this, pre-lexicon. */
  text: string;
}

export interface SourceChapter {
  id: ChapterId;
  /** 0-based spine index. Display labels come from `shared/pipeline/classify.ts`, not from this. */
  index: number;
  title: string;
  /** Hash over the chapter's paragraph ids and html; artifacts record it to detect staleness. */
  sourceHash: string;
  paras: SourcePara[];
}

export interface TocEntry {
  label: string;
  chapterIndex: number;
  /** Present once the parser emits ids (WS-C Phase 1). */
  chapterId?: ChapterId;
}

/** Result of `book:content`. The format is resolved in main; renderers never guess it. */
export interface BookContentV2 {
  /** Stable per-file id (hash of the file path); not the library row id. */
  bookId: string;
  /** Bump whenever paragraph splitting changes; ParaIds are only stable within one version. */
  parserVersion: number;
  isImageBook: boolean;
  toc: TocEntry[];
  chapters: (SourceChapter & {
    /** Legacy mirrors of `paras[].text` / `paras[].html`, kept until Phase 3. */
    paragraphs: string[];
    htmlParagraphs: string[];
  })[];
  /** Pass-through of the legacy `BookContent` presentation hints. */
  fontFamily?: string;
  fontSizePx?: number;
  css?: string;
}

// ── Layer 1: rewrite (polish | concise) ─────────────────────────────────────

/** Keyed by SOURCE ParaId, strictly 1:1. A dropped paragraph is explicit, never a missing key. */
export type RewriteEntry = { html: string } | { dropped: true };

export type RewriteMode = "polish" | "concise";

export interface RewriteLayer {
  mode: RewriteMode;
  /** Hash of this layer's content; the format layer records it as `baseHash`. */
  artifactHash: string;
  /** `SourceChapter.sourceHash` the layer was produced from; mismatch → stale. */
  sourceHash: string;
  paras: Record<ParaId, RewriteEntry>;
}

// ── Layer 2: format (markup only) ───────────────────────────────────────────

/** Markup-only. Text must be preserved (validated in main). Keys absent → paragraph unchanged. */
export type FormatEntry = { html: string } | { mergedInto: ParaId };

export interface FormatLayer {
  artifactHash: string;
  /** What the layer was applied on top of. */
  base: "source" | "rewrite";
  /** `sourceHash` (base "source") or the rewrite layer's `artifactHash` (base "rewrite").
   *  If it does not match the current base, the layer is stale and must be ignored. */
  baseHash: string;
  paras: Record<ParaId, FormatEntry>;
}

// ── Layer 4: lexicon (word replacements) ────────────────────────────────────

export type LexiconScope = "display" | "speech" | "both";

export interface LexiconEntry {
  from: string;
  to: string;
  scope: LexiconScope;
  /** "smart": whole-word, case-preserving (god→ascendant, God→Ascendant, GOD→ASCENDANT).
   *  "exact": case-sensitive literal match. */
  match: "smart" | "exact";
}

export interface Lexicon {
  /** Changes whenever entries change; part of `RenderedChapter.variantKey`. */
  version: string;
  entries: LexiconEntry[];
}

// ── Layers 5–6: annotate + decorate ─────────────────────────────────────────

/** An entity that may be highlighted. Callers pass only entities ≤ frontier. */
export interface EntityMatcher {
  id: string;
  /** Raw name plus aliases (pre-lexicon; the pipeline applies the display lexicon to them). */
  names: string[];
  color: string;
  type: string;
}

/** Offsets are UTF-16 code-unit offsets into `RenderedPara.text` (visible, post-lexicon). */
export type Annotation =
  | { kind: "entity"; paraId: ParaId; start: number; end: number; entityId: string; color: string }
  | { kind: "highlight"; paraId: ParaId; quote: string; id: string; tone: "quote" | "vocab" }
  | { kind: "search"; paraId: ParaId; start: number; end: number };

/** Block-level decorations rendered as attributes on the paragraph element. */
export interface BlockMarker {
  paraId: ParaId;
  comments?: { ai: number; user: number };
  bookmark?: boolean;
  branchPoint?: boolean;
  readMark?: boolean;
}

// ── Layer 7: projections ────────────────────────────────────────────────────

/** One spoken word. `start`/`end` index into `RenderedPara.speech.text`; `domWord` is the index
 *  of the matching word in `tokenizeVisible(RenderedPara.html).words` (for highlighting). */
export interface SpeechToken {
  start: number;
  end: number;
  domWord: number;
}

export interface RenderedPara {
  /** Id of the source paragraph this rendered paragraph represents. */
  id: ParaId;
  sourceIndex: number;
  /** True when the paragraph is dropped (rewrite) or merged into another (format). */
  hidden: boolean;
  mergedInto?: ParaId;
  /** Source paragraphs folded into this one (itself first), for anchor resolution. */
  covers: ParaId[];
  /** sanitized → lexicon(display) → decorated. Safe to render with innerHTML. */
  html: string;
  /** Visible text (post display-lexicon). Used for matching, search and the speed reader. */
  text: string;
  /** Speech-scope lexicon applied, `[data-tts-skip]` subtrees excluded. Null for hidden/image. */
  speech: { text: string; tokens: SpeechToken[] } | null;
}

export interface RenderedChapter {
  chapterId: ChapterId;
  /** hash(sourceHash, rewrite/format artifactHash, lexicon.version). Changes ⇒ re-render; TTS
   *  finishes the current paragraph and resumes at `resolveAnchor(new, currentParaId) + 1`. */
  variantKey: string;
  /** Same order and length as `SourceChapter.paras`. */
  paras: RenderedPara[];
  /** Indices into `paras` with `hidden === false`, in order. */
  visible: number[];
  byId: Record<ParaId, number>;
}

export interface BuildOptions {
  rewrite?: RewriteLayer | null;
  format?: FormatLayer | null;
  lexicon: Lexicon;
  entities?: EntityMatcher[];
  annotations?: Annotation[];
  blocks?: BlockMarker[];
}

/** Sanitizer policies: `book` for parsed source html, `ai-format` for AI-produced markup. */
export type SanitizePolicy = "book" | "ai-format";

/** One Edge-TTS word boundary (as returned by `tts:synthesize`). Offsets are in the TTS unit. */
export interface SpeechBoundary {
  text: string;
  offset: number;
  duration: number;
}

// ── Function signatures implemented by WS-C (shared/pipeline/*.ts) ──────────
// Declared as types (not `declare function`) so this file stays runtime-free. Implementations
// must be assignable to these, e.g. `export const buildChapter: BuildChapterFn = (src, o) => …`.

/** `shared/pipeline/build.ts`. Pure and deterministic. */
export type BuildChapterFn = (src: SourceChapter, opts: BuildOptions) => RenderedChapter;

/** `shared/pipeline/build.ts`. Equal to `buildChapter(src, opts).variantKey` without building. */
export type VariantKeyOfFn = (src: SourceChapter, opts: Pick<BuildOptions, "rewrite" | "format" | "lexicon">) => string;

/** `shared/pipeline/build.ts`. Index into `ch.paras` of the rendered para showing `paraId`:
 *  follows `mergedInto`; dropped → next visible (or last visible); unknown id → -1. */
export type ResolveAnchorFn = (ch: RenderedChapter, paraId: ParaId) => number;

/** `shared/pipeline/speech.ts`. Visible words of `html`, skipping `[data-tts-skip]` subtrees. */
export type TokenizeVisibleFn = (html: string) => { text: string; words: { start: number; end: number }[] };

/** `shared/pipeline/speech.ts`. For each boundary i, the token index j it corresponds to (-1 if none). */
export type AlignBoundariesFn = (tokens: SpeechToken[], speechText: string, boundaries: SpeechBoundary[]) => number[];

/** `shared/pipeline/sanitize.ts`. Allowlist sanitizer; tokenizer-based, no DOM. Default policy "book". */
export type SanitizeHtmlFn = (html: string, policy?: SanitizePolicy) => string;

/** `shared/pipeline/lexicon.ts`. Replaces in text nodes only. */
export type ApplyLexiconFn = (html: string, lex: Lexicon, scope: "display" | "speech") => string;
