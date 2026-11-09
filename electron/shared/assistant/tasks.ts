/**
 * Assistant-area task I/O and stored shapes (owner: WS-E). Additive to the Phase 0 contracts;
 * re-exported from `./types`. AI_AUDIT Appendix A.
 *
 * PURE: no `electron`, Node or DOM imports.
 */

import type { ParaRef } from "../pipeline/types";
import type { SrsGrade, SrsState } from "../srs";
import type { AssistantQuickAction } from "./types";

export type { SrsGrade, SrsState } from "../srs";

// ── assistant.turn ──────────────────────────────────────────────────────────

/** Submitted by `assistant:send` (never by renderers directly). The thread's mode, the history and
 *  the seed are read from the thread store; `messageId` is the assistant placeholder to fill. */
export interface AssistantTurnInput {
  threadId: string;
  messageId: string;
  filePath: string;
  bookTitle?: string;
  quickAction?: AssistantQuickAction;
}

/** What the job resolves with (the message itself is persisted by the task). */
export interface AssistantTurnOutput {
  messageId: string;
  toolRounds: number;
  proposal: boolean;
}

// ── selection.define / selection.translate ──────────────────────────────────

export interface DefineInput {
  term: string;
  /** The sentence the term appears in (never text after the selection's paragraph). */
  sentence: string;
  bookTitle?: string;
  /** BCP-47; default `AISettings.targetLanguage`. When set and not English, `translation` is filled. */
  targetLanguage?: string;
  ref?: ParaRef;
}

export interface DefineResult {
  lemma: string;
  /** Part of speech, e.g. "noun". */
  pos: string;
  ipa?: string;
  /** Meaning in this sentence, ≤ 20 words. */
  inContext: string;
  general: string;
  example?: string;
  translation?: { lang: string; text: string };
  /** Proper noun from the story → route to the "Who's this?" card instead. */
  properNoun?: boolean;
}

export interface TranslateInput {
  text: string;
  sentence?: string;
  targetLanguage?: string;
  bookTitle?: string;
}

export interface TranslateResult {
  /** Target language (BCP-47). */
  lang: string;
  text: string;
  /** Detected source language, when the model reports it. */
  sourceLang?: string;
  /** Short note on idiom, register or wordplay, if any. */
  note?: string;
}

// ── quote.classify ──────────────────────────────────────────────────────────

export type QuoteKind = "dialogue" | "inner_thought" | "narration" | "description" | "quote";

export interface QuoteClassifyInput {
  filePath: string;
  quote: string;
  ref?: ParaRef;
  bookTitle?: string;
  chapterTitle?: string;
  /** Text before the quote (and the quote's own paragraph). Never text after it. */
  surrounding?: string;
}

export interface QuoteClassifyResult {
  /** Entity id (≤ frontier), "narrator" or "unknown". */
  speaker: string;
  /** Display name for `speaker` when it is an entity. */
  speakerName?: string;
  kind: QuoteKind;
}

// ── branch.continue (Simulate) ──────────────────────────────────────────────

export interface BranchChoice {
  label: string;
  description: string;
}

export interface BranchContinueInput {
  filePath: string;
  /** Branch point: the story diverges after this paragraph. */
  ref: ParaRef;
  entityId?: string;
  entityName?: string;
  /** The reader's direction for this segment. */
  direction: string;
  /** Earlier segments of the same branch, oldest first. */
  history: { userInput: string; paragraphs: string[] }[];
  bookTitle?: string;
}

export interface BranchContinueResult {
  /** Escaped, `<p>`-wrapped html (only `<p>`, `<em>`, `<strong>`, `<br>`). */
  paragraphs: string[];
  choices: BranchChoice[];
}

/** A stored "what if" branch (`assistant_branches`). */
export interface SimBranch {
  id: string;
  filePath: string;
  ref: ParaRef;
  chapterIndex: number;
  entityId?: string;
  entityName?: string;
  title: string;
  segmentCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SimSegment {
  id: number;
  branchId: string;
  index: number;
  userInput: string;
  paragraphs: string[];
  choices: BranchChoice[];
  createdAt: number;
}

export interface CreateBranchRequest {
  filePath: string;
  ref: ParaRef;
  chapterIndex: number;
  entityId?: string;
  entityName?: string;
  title?: string;
}

// ── Vocabulary deck ─────────────────────────────────────────────────────────

export interface VocabItem {
  id: number;
  filePath: string | null;
  ref: ParaRef | null;
  term: string;
  lemma: string | null;
  /** The sentence the word was saved from. */
  context: string | null;
  definition: string | null;
  translation: string | null;
  createdAt: number;
  srs: SrsState;
}

export interface NewVocabItem {
  filePath?: string;
  ref?: ParaRef;
  term: string;
  lemma?: string;
  context?: string;
  definition?: string;
  translation?: string;
}

export interface VocabFilter {
  filePath?: string;
  /** Only cards with `dueAt ≤ now`. */
  dueOnly?: boolean;
  limit?: number;
}

export interface VocabStats {
  total: number;
  due: number;
  /** reps > 0 */
  learned: number;
  /** never reviewed */
  fresh: number;
}

export type VocabGrade = SrsGrade;
