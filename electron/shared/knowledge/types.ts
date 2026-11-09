/**
 * Knowledge (wiki) contracts (owner: WS-B). FROZEN at the end of Phase 0: additive changes only.
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * Chapter numbers: every `chapter*` / `*Chapter` field below is a 0-based spine index unless the
 * field name says `label`. Labels shown to users and models are 1-based "story numbers" from
 * `shared/pipeline/classify.ts` and always rendered as "Chapter <label>".
 *
 * Spoiler rule: ingestion may run ahead of the reader, but EVERY read is clamped to a `Frontier`.
 */

import type { ParaId } from "../pipeline/types";

// ── Frontier ────────────────────────────────────────────────────────────────

/** How far the reader has read. Reads return nothing from after it.
 *  - mode "frontier" (default): furthest *finished* chapter (+ current chapter up to `paraId`).
 *  - mode "position": the current reading position, even if behind the frontier.
 *  - mode "off": no gating (wiki window "Show everything").
 *  `chapterIndex` is -1 when nothing has been finished yet. */
export interface Frontier {
  chapterIndex: number;
  /** Last visible paragraph of the current chapter, when the reader is inside `chapterIndex + 1`. */
  paraId?: ParaId;
  mode: "frontier" | "position" | "off";
}

/** Reported by the reader on every position change (`knowledge:position`).
 *  The frontier advances to `max(previous, chapterIndex)` when `atChapterEnd` (last page reached,
 *  TTS/speed reader finished it, or ≥ 90% of its pages viewed). `via: "jump"` never advances it. */
export interface ReadingPosition {
  chapterIndex: number;
  paraId?: ParaId;
  atChapterEnd: boolean;
  via: "page" | "tts" | "speed" | "jump";
}

// ── Entities ────────────────────────────────────────────────────────────────

export type WikiEntryType = "character" | "item" | "location" | "event" | "concept";

/** Lightweight row for highlighting (`knowledge:entityIndex`). Only aliases with
 *  `first_chapter ≤ frontier` and relevance ≥ 3 are included. */
export interface EntityIndexItem {
  id: string;
  name: string;
  aliases: string[];
  type: WikiEntryType;
  color: string;
}

export interface EntityDetail {
  chapter: number;
  category: string;
  content: string;
  /** Supporting quote from the chapter text, when the model supplied one. */
  source?: string;
  /** True when a later detail (≤ frontier) of the same category replaced it. */
  superseded: boolean;
  /** Additive (Phase 2b): 1–5 importance from ingestion (the wiki archives < 2). */
  relevance?: number;
}

export interface EntityRelationship {
  targetId: string;
  targetName: string;
  relation: string;
  since: number;
}

/** An entity as it was known at the frontier. */
export interface EntitySnapshot {
  id: string;
  name: string;
  type: WikiEntryType;
  aliases: string[];
  /** Latest version with chapter ≤ frontier (from `wiki_entry_versions`). */
  shortDescription: string;
  status: string;
  significance: number;
  firstAppearance: number;
  /** Last chapter ≤ frontier with an appearance. */
  lastSeen: number;
  color?: string;
  details: EntityDetail[];
  relationships: EntityRelationship[];
  // Additive (Phase 2b) — filled by `knowledge:entity` only (the wiki article page):
  /** Long description. It is not versioned, so it is only included when nothing about the entry
   *  happens after the frontier (or the frontier is "off"). */
  description?: string;
  /** Aliases (≤ frontier) with their kind and 1–5 relevance; `aliases` keeps the plain names. */
  aliasDetails?: { alias: string; type: string; relevance: number }[];
  /** Chapters ≤ frontier the entry appears in, ascending. */
  appearances?: number[];
}

// ── Context for prompts ─────────────────────────────────────────────────────

export type KnowledgeContextPurpose =
  | "ingest" | "format" | "assistant" | "explain" | "recap" | "simulate" | "comments" | "lookup";

export interface KnowledgeContextRequest {
  filePath: string;
  /** Default: the book's current `knowledge:frontier`. */
  frontier?: Frontier;
  purpose: KnowledgeContextPurpose;
  /** Hard cap on `KnowledgeContext.text` length, in characters. */
  budgetChars: number;
  /** Pre-scanned for mentioned names/aliases → relevance boost. */
  focusText?: string;
  focusEntityIds?: string[];
  /** Additive (Phase 1): first chapter whose summary to include (recap windows). Default: as many
   *  recent summaries as the budget allows. */
  summaryFrom?: number;
}

export interface ChapterSummaryItem {
  chapter: number;
  /** 1-based story number, e.g. "12" or "Prologue". */
  label: string;
  summary: string;
  mood?: string;
}

export interface ArcItem {
  id: string;
  name: string;
  type: string;
  status: string;
  latestBeat?: string;
}

export interface MCStat {
  name: string;
  value: string | null;
}

export interface KnowledgeContext {
  frontier: Frontier;
  /** Selected by mention in focusText, then recency, then significance. */
  entities: EntitySnapshot[];
  summaries: ChapterSummaryItem[];
  /** As of the frontier. */
  arcs: ArcItem[];
  /** Main-character stat block, if the book has one. */
  mc?: { entityId: string; stats: MCStat[] };
  /** Prompt-ready rendering of the above, ≤ budgetChars; numbering always "Chapter <label>". */
  text: string;
}

// ── Search ──────────────────────────────────────────────────────────────────

/** Full-text hit (FTS5 BM25 in production; LIKE fallback under sql.js, which lacks FTS5). */
export interface SearchHit {
  chapterIndex: number;
  paraId: ParaId;
  snippet: string;
  /** Higher is better; only comparable within one result set. */
  score: number;
}

// ── Edits ───────────────────────────────────────────────────────────────────

/** Every wiki mutation from the UI or the assistant goes through `knowledge:edits:apply`. */
export type WikiEdit =
  | { op: "create"; entry: { id?: string; name: string; type: WikiEntryType; shortDescription: string; firstAppearance: number; aliases?: string[] } }
  | { op: "update"; id: string; fields: Partial<{ name: string; type: WikiEntryType; shortDescription: string; status: string; significance: number }>; asOfChapter: number }
  | { op: "delete"; id: string }
  | { op: "alias"; id: string; aliases: string[]; asOfChapter: number }
  | { op: "relate"; sourceId: string; targetId: string; relation: string; sinceChapter: number }
  /** Uses the DB's transactional merge with undo snapshot (`mergeWikiEntries`). */
  | { op: "merge"; sourceId: string; targetId: string };

export interface ApplyResult {
  applied: number;
  failed: { edit: WikiEdit; reason: string }[];
  /** `wiki_merge_log` ids created by merge edits (for undo). */
  mergeLogIds: number[];
  /** Additive (Phase 1): `knowledge_edit_log` ids, one per applied edit, in order. Pass one to
   *  `knowledge:edits:undo` to revert that edit (merges revert through `wiki_merge_log`). */
  undoIds?: number[];
}

// ── Wiki window bulk read ───────────────────────────────────────────────────

export interface WikiEntryListItem {
  id: string;
  name: string;
  type: WikiEntryType;
  color: string;
  /** As of the snapshot frontier. */
  shortDescription: string;
  status: string;
  significance: number;
  firstAppearance: number;
  lastSeen: number;
  aliases: string[];
  appearanceCount: number;
}

export interface WikiRelationshipItem {
  sourceId: string;
  targetId: string;
  relation: string;
  since: number;
  until: number | null;
  description: string;
}

export interface WikiArcBeatItem {
  chapter: number;
  type: string;
  description: string;
}

export interface WikiArcItem {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  startChapter: number;
  endChapter: number | null;
  beats: WikiArcBeatItem[];
}

/** Result of `knowledge:wiki`: everything the wiki window lists, clamped to `frontier`.
 *  Per-entity details come from `knowledge:entity`. */
export interface WikiSnapshot {
  filePath: string;
  bookTitle: string;
  /** The frontier actually applied (mode "off" ⇒ ungated). */
  frontier: Frontier;
  entries: WikiEntryListItem[];
  relationships: WikiRelationshipItem[];
  summaries: (ChapterSummaryItem & { keyEvents: string[] })[];
  arcs: WikiArcItem[];
  mc?: { entityId: string; stats: (MCStat & { category: string; active: boolean; chapter: number })[] };
  /** Chapters with a completed knowledge run (any frontier). */
  processedChapters: number[];
  /** Additive (Phase 2b): merges whose entries are both visible at the frontier, newest first.
   *  Revert one with `knowledge:edits:undo(undoId)`. */
  mergeLog?: WikiMergeItem[];
}

/** Additive (Phase 2b): one entry of the wiki's merge history. */
export interface WikiMergeItem {
  /** `wiki_merge_log` id. */
  id: number;
  /** `knowledge_edit_log` id to pass to `knowledge:edits:undo`. */
  undoId: number;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  mergedAt: string;
}

// ── Main-side reader (used by tasks via TaskContext.knowledge) ──────────────

/** Synchronous: backed by better-sqlite3 on the main thread. Every method is frontier-gated. */
export interface KnowledgeReader {
  getFrontier(filePath: string): Frontier;
  getContext(req: KnowledgeContextRequest): KnowledgeContext;
  getEntityIndex(filePath: string, frontier: Frontier): EntityIndexItem[];
  getEntity(filePath: string, id: string, frontier: Frontier): EntitySnapshot | null;
  search(filePath: string, query: string, frontier: Frontier, limit: number): SearchHit[];
}

// ── Additive (Phase 1, WS-B): recap, lookup and ingest task I/O ─────────────

/** Whether a "Previously on…" recap should be offered now (`knowledge:recapStatus`).
 *  Due when the book is reopened after > 8 h away, or ≥ 3 chapters were finished since the last
 *  recap, the frontier is ≥ 1, and no recap was shown in this session yet. */
export interface RecapStatus {
  due: boolean;
  reason: "away" | "progress" | null;
  frontier: Frontier;
  /** Chapter range the recap would cover (0-based, inclusive). Empty when `toChapter < fromChapter`. */
  fromChapter: number;
  toChapter: number;
  /** 1-based story labels of the range, e.g. "41" / "45". */
  fromLabel: string;
  toLabel: string;
  /** Time away before this session, if known. */
  awayMs: number | null;
}

/** `book.recap` input (submitted with `ai:submit`, priority Interactive). */
export interface RecapInput {
  filePath: string;
  /** Default: the book's frontier. */
  frontier?: Frontier;
  bookTitle?: string;
  /** Default: `RecapStatus.awayMs`; widens the chapter window (3–8 chapters). */
  awayMs?: number;
}

/** `book.recap` output (AI_AUDIT Appendix A, plus range and the last paragraph read). */
export interface RecapOutput {
  bullets: string[];
  leftOff: string;
  /** Subset of the entities given to the model. */
  entityIds: string[];
  fromChapter: number;
  toChapter: number;
  fromLabel: string;
  toLabel: string;
  /** Plain text of the last paragraph read (for the "Where we left off" quote). */
  leftOffQuote?: string;
  /** Whether chapter summaries were available or raw excerpts had to be used. */
  source: "summaries" | "excerpts" | "mixed";
}

/** `entity.lookup` input: a name that is not (yet) in the wiki. */
export interface EntityLookupInput {
  filePath: string;
  name: string;
  /** Default: the book's frontier. */
  frontier?: Frontier;
  bookTitle?: string;
}

/** `entity.lookup` output (AI_AUDIT Appendix A). `refs` only cite passages ≤ frontier. */
export interface EntityLookupOutput {
  name: string;
  type: WikiEntryType;
  description: string;
  /** 0–1. 0 when the passages were insufficient. */
  confidence: number;
  refs: ParaId[];
  /** Chapter of each ref, same order (for citation chips). */
  refChapters: number[];
}

/** `chapter.knowledge` input. Runs on the per-book lane `knowledge:<filePath>`. */
export interface KnowledgeIngestInput {
  filePath: string;
  chapterIndex: number;
  /** Re-run even if the chapter already has a completed run (the old run is undone first). */
  force?: boolean;
  bookTitle?: string;
}

export interface KnowledgeIngestOutput {
  filePath: string;
  chapterIndex: number;
  chapterId: string;
  /** "skipped": too large / image chapter; "unchanged": already ingested at this task version. */
  status: "done" | "skipped" | "unchanged";
  createdEntries: number;
  updatedEntries: number;
}
