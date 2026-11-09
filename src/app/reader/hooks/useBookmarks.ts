"use client";

/**
 * Bookmarks (legacy `bookmarks` rows) anchored by ParaRef through `book:anchors` (Phase 2c).
 * A bookmark marks the first paragraph of the page it was made on; it is "on this page" when its
 * anchor resolves to a paragraph between the page's first and last visible paragraphs, whichever
 * rewrite/format variant is showing.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { BookAnchor, ParaRef } from "@shared/pipeline/types";
import type { ReaderBookmark } from "../lib/types";

interface UseBookmarksOptions {
  filePath: string;
  chapterIndex: number;
  chapterTitle: string;
  /** ParaRef of the page's first visible paragraph (null before the page is measured). */
  pageRef: ParaRef | null;
  /** Page paragraph index (`data-para-idx`) of the page's first visible paragraph. */
  pageParaIndex: number;
  /** True when `anchor` resolves onto the current page. */
  isOnPage: (anchor: BookAnchor) => boolean;
  anchors: BookAnchor[];
  setAnchor: (a: BookAnchor) => Promise<void>;
  deleteAnchor: (kind: "bookmark", refId: string) => Promise<void>;
}

const byPosition = (a: ReaderBookmark, b: ReaderBookmark) => a.chapterIndex - b.chapterIndex || a.paragraphIndex - b.paragraphIndex;

export function useBookmarks({
  filePath, chapterIndex, chapterTitle, pageRef, pageParaIndex, isOnPage, anchors, setAnchor, deleteAnchor,
}: UseBookmarksOptions) {
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([]);

  useEffect(() => {
    if (!filePath) return;
    window.electronAPI
      ?.getBookmarks(filePath)
      // The IPC can resolve null/undefined (no DB, or an older main): never spread a null row.
      .then((list) => setBookmarks(Array.isArray(list) ? list.filter((b): b is ReaderBookmark => !!b) : []))
      .catch(() => setBookmarks([]));
  }, [filePath]);

  const anchorOf = useMemo(() => {
    const m = new Map<string, BookAnchor>();
    for (const a of anchors) if (a.kind === "bookmark") m.set(a.refId, a);
    return m;
  }, [anchors]);

  /** A bookmark on the current page (by anchor; legacy rows without one match by chapter). */
  const currentBookmark = useMemo(() => {
    return bookmarks.find((b) => {
      if (b.chapterIndex !== chapterIndex) return false;
      const a = anchorOf.get(String(b.id));
      return a ? isOnPage(a) : b.paragraphIndex === pageParaIndex;
    }) ?? null;
  }, [bookmarks, chapterIndex, anchorOf, isOnPage, pageParaIndex]);

  const toggleBookmark = useCallback(async () => {
    if (!filePath) return;
    const api = window.electronAPI;
    if (!api) return;
    if (currentBookmark) {
      const id = currentBookmark.id;
      await api.deleteBookmark(id).catch(() => undefined);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
      void deleteAnchor("bookmark", String(id));
      return;
    }
    const bm = await api.addBookmark(filePath, chapterIndex, Math.max(0, pageParaIndex), chapterTitle).catch(() => null);
    if (!bm) return; // add failed: nothing to show (was a null-row crash in the sort)
    setBookmarks((prev) => [...prev, bm].sort(byPosition));
    if (pageRef) void setAnchor({ kind: "bookmark", refId: String(bm.id), filePath, chapterId: pageRef.chapterId, paraId: pageRef.paraId });
  }, [filePath, currentBookmark, chapterIndex, pageParaIndex, chapterTitle, pageRef, setAnchor, deleteAnchor]);

  const removeBookmark = useCallback((id: number) => {
    window.electronAPI?.deleteBookmark(id).then(() => {
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    }).catch(() => undefined);
    void deleteAnchor("bookmark", String(id));
  }, [deleteAnchor]);

  return { bookmarks, currentBookmark, toggleBookmark, removeBookmark, anchorOf };
}
