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
