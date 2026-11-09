/**
 * Typed renderer wrappers for `book:*` and `lexicon:*` (owner WS-C).
 * `lexicon` events (src/lib/ai/events.ts) announce a new lexicon version.
 */

import type { AnchorKind, BookAnchor, ChapterId, LexiconEntry, NewBookAnnotation, ParaId, ParaRef } from "@shared/pipeline/types";
import { rpc } from "@/lib/ai/rpc";

export const book = {
  /** Parsed, sanitized, id-assigned content; format resolved in main (no guessing). */
  content: (filePath: string) => rpc("book:content", filePath),
  reveal: (filePath: string, ref: ParaRef) => rpc("book:reveal", filePath, ref),
  readMarks: (filePath: string) => rpc("book:readMarks:get", filePath),
  setReadMark: (filePath: string, chapterId: ChapterId, paraId: ParaId) =>
    rpc("book:readMarks:set", filePath, chapterId, paraId),
  /** User comments/highlights (ParaRef-anchored). The first call per book runs the legacy migration. */
  annotations: (filePath: string) => rpc("book:annotations:list", filePath),
  addAnnotation: (a: NewBookAnnotation) => rpc("book:annotations:add", a),
  deleteAnnotation: (id: number) => rpc("book:annotations:delete", id),
  /** ParaRefs of quotes/bookmarks (rows kept in legacy tables). */
  anchors: (filePath: string) => rpc("book:anchors:list", filePath),
  setAnchor: (a: BookAnchor) => rpc("book:anchors:set", a),
  deleteAnchor: (kind: AnchorKind, refId: string) => rpc("book:anchors:delete", kind, refId),
} as const;

export const lexicon = {
  get: () => rpc("lexicon:get"),
  set: (entries: LexiconEntry[]) => rpc("lexicon:set", entries),
} as const;
