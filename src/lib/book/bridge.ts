/**
 * Typed renderer wrappers for `book:*` and `lexicon:*` (owner WS-C).
 * `lexicon` events (src/lib/ai/events.ts) announce a new lexicon version.
 */

import type { ChapterId, LexiconEntry, ParaId, ParaRef } from "@shared/pipeline/types";
import { rpc } from "@/lib/ai/rpc";

export const book = {
  /** Parsed, sanitized, id-assigned content; format resolved in main (no guessing). */
  content: (filePath: string) => rpc("book:content", filePath),
  reveal: (filePath: string, ref: ParaRef) => rpc("book:reveal", filePath, ref),
  readMarks: (filePath: string) => rpc("book:readMarks:get", filePath),
  setReadMark: (filePath: string, chapterId: ChapterId, paraId: ParaId) =>
    rpc("book:readMarks:set", filePath, chapterId, paraId),
} as const;

export const lexicon = {
  get: () => rpc("lexicon:get"),
  set: (entries: LexiconEntry[]) => rpc("lexicon:set", entries),
} as const;
