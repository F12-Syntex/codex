/**
 * Assistant contracts (owner: WS-E). FROZEN at the end of Phase 0: additive changes only.
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * One Assistant panel replaces Buddy panel, Buddy window, Wiki AI chat and the Explain panel.
 * Threads live in main (`assistant_threads` / `assistant_messages`). Answers are rendered as
 * React elements from `MessageBlock`s — never with innerHTML.
 */

import type { AIErrorInfo, Usage } from "../ai/types";
import type { WikiEdit } from "../knowledge/types";
import type { ParaRef } from "../pipeline/types";

export type AssistantMode = "chat" | "explain" | "recap" | "lookup";

export type AssistantQuickAction = "recap" | "characters" | "arcs" | "relationships";

/** Optional starting context for a thread or a turn. */
export interface AssistantSeed {
  /** Explain / Ask about a selection. Text after the selection is never sent. */
  selection?: { ref: ParaRef; text: string };
  entityId?: string;
  quickAction?: AssistantQuickAction;
}

export interface AssistantThread {
  id: string;
  filePath: string;
  mode: AssistantMode;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export type MessageBlock =
  /** Markdown subset: p, strong, em, ul/ol, h3/h4, blockquote, code. Markers already removed. */
  | { type: "markdown"; text: string }
  /** Rendered as an EntityCard-lite. */
  | { type: "entity"; entityId: string }
  /** A quoted book passage. */
  | { type: "passage"; ref: ParaRef; text: string };

/** Parsed from `[[cite:<chapterLabel>:<paraOrdinal>]]`; markers past the frontier are dropped. */
export interface Citation {
  ref: ParaRef;
  chapterIndex: number;
  /** e.g. "Ch 12 ¶4". */
  label: string;
  /** Additive (WS-E Phase 1): the cited paragraph's text (≤ 280 chars) for hover previews. */
  snippet?: string;
}

export interface WikiProposal {
  id: string;
  edits: WikiEdit[];
  status: "pending" | "applied" | "rejected";
}

export interface AssistantMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  blocks: MessageBlock[];
  citations: Citation[];
  /** Entity ids parsed from `[[entity:<id>|<Name>]]`, ≤ frontier. */
  entityLinks: string[];
  /** From the terminal `propose_wiki_edits` tool; applied only after user confirmation. */
  proposal?: WikiProposal;
  status: "streaming" | "done" | "error";
  error?: AIErrorInfo;
  createdAt: number;
  usage?: Usage[];
}

/** Tools available to `assistant.turn`, executed in main and always clamped to the frontier. */
export type AssistantToolName = "search_book" | "read_passage" | "get_entity" | "list_summaries" | "propose_wiki_edits";

// ── Additive (WS-E Phase 1): task I/O, simulate branches, vocabulary deck ───
export * from "./tasks";
