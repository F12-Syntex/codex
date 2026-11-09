"use client";

/**
 * useReaderAnchors — the reader's ParaRef-anchored user data (owner: WS-C, Phase 2c).
 *
 *   user comments  → `book:annotations:*`  (never touched by clearing AI output)
 *   quotes         → legacy `quotes` rows + `book:anchors` (ParaRef + quote text)
 *   bookmarks      → legacy `bookmarks` rows + `book:anchors`
 *   read marks     → `book:readMarks:*` (furthest paragraph read aloud / speed-read, per chapter)
 *
 * The first load of a book runs its one-time legacy migration in main (index anchors → ParaRef,
 * re-anchored by quote text), so nothing here ever deals with paragraph indices.
 */

import { useCallback, useEffect, useState } from "react";
import type { AnchorKind, BookAnchor, BookAnnotation, ChapterId, ParaId, ParaRef } from "@shared/pipeline/types";
import { hasRpc } from "@/lib/ai/rpc";
import { book } from "@/lib/book/bridge";

export interface ReaderAnchors {
  comments: BookAnnotation[];
  anchors: BookAnchor[];
  readMarks: Record<ChapterId, ParaId>;
  loaded: boolean;
  addComment: (ref: ParaRef, text: string, quote: string) => Promise<void>;
  deleteComment: (id: number) => Promise<void>;
  setAnchor: (a: BookAnchor) => Promise<void>;
  deleteAnchor: (kind: AnchorKind, refId: string) => Promise<void>;
  /** Advance (never rewind) the chapter's read mark. `isAfter(prev)` decides "further". */
  markRead: (chapterId: ChapterId, paraId: ParaId, isAfter: (prevParaId: ParaId) => boolean) => void;
}

const warn = (what: string) => (err: unknown) => console.warn(`[reader] ${what} failed`, err);

export function useReaderAnchors(filePath: string): ReaderAnchors {
  const [comments, setComments] = useState<BookAnnotation[]>([]);
  const [anchors, setAnchors] = useState<BookAnchor[]>([]);
  const [readMarks, setReadMarks] = useState<Record<ChapterId, ParaId>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!filePath || !hasRpc()) return;
    let alive = true;
    // Annotations first: its handler runs the book's legacy migration the other two then read.
    book.annotations(filePath)
      .then(async (list) => {
        if (!alive) return;
        setComments(list.filter((a) => a.kind === "comment"));
        const [anc, marks] = await Promise.all([book.anchors(filePath), book.readMarks(filePath)]);
        if (!alive) return;
        setAnchors(anc);
        setReadMarks(marks);
      })
      .catch(warn("loading annotations"))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [filePath]);

  const addComment = useCallback(async (ref: ParaRef, text: string, quote: string) => {
    if (!text.trim()) return;
    try {
      const a = await book.addAnnotation({ filePath, chapterId: ref.chapterId, paraId: ref.paraId, kind: "comment", text: text.trim(), quote });
      setComments((prev) => [...prev, a]);
    } catch (err) {
      warn("adding a comment")(err);
    }
  }, [filePath]);

  const deleteComment = useCallback(async (id: number) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    await book.deleteAnnotation(id).catch(warn("deleting a comment"));
  }, []);

  const setAnchor = useCallback(async (a: BookAnchor) => {
    setAnchors((prev) => [...prev.filter((x) => !(x.kind === a.kind && x.refId === a.refId)), a]);
    await book.setAnchor(a).catch(warn("saving an anchor"));
  }, []);

  const deleteAnchor = useCallback(async (kind: AnchorKind, refId: string) => {
    setAnchors((prev) => prev.filter((x) => !(x.kind === kind && x.refId === refId)));
    await book.deleteAnchor(kind, refId).catch(warn("deleting an anchor"));
  }, []);

  const markRead = useCallback((chapterId: ChapterId, paraId: ParaId, isAfter: (prev: ParaId) => boolean) => {
    setReadMarks((prev) => {
      const cur = prev[chapterId];
      if (cur === paraId || (cur && !isAfter(cur))) return prev;
      book.setReadMark(filePath, chapterId, paraId).catch(warn("saving the read mark"));
      return { ...prev, [chapterId]: paraId };
    });
  }, [filePath]);

  return { comments, anchors, readMarks, loaded, addComment, deleteComment, setAnchor, deleteAnchor, markRead };
}
