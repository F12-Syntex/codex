/**
 * Knowledge events (owner: WS-B). Broadcast on the single `"ai:event"` stream so every window
 * (reader, wiki, buddy) refreshes highlights, cards and the wiki after ingest, edits, clears and
 * frontier moves (AI_AUDIT S2-13).
 */

import type { AIEvent, AIEventOf } from "../shared/ai/types";
import type { Frontier } from "../shared/knowledge/types";

export type KnowledgeEmitter = (e: AIEvent) => void;

export type KnowledgeChangeReason = AIEventOf<"knowledge">["reason"];

export function knowledgeEvent(filePath: string, chapters: number[], reason: KnowledgeChangeReason): AIEventOf<"knowledge"> {
  return { type: "knowledge", filePath, chapters: [...new Set(chapters)].sort((a, b) => a - b), reason };
}

export function frontierEvent(filePath: string, frontier: Frontier): AIEventOf<"frontier"> {
  return { type: "frontier", filePath, frontier };
}

/** Emitter that never throws into the caller (a closing window must not fail a DB write). */
export function safeEmitter(emit: KnowledgeEmitter | undefined): KnowledgeEmitter {
  return (e) => {
    if (!emit) return;
    try {
      emit(e);
    } catch (err) {
      console.warn("[knowledge] event emit failed", err);
    }
  };
}
