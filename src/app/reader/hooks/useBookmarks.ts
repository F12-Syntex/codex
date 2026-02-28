"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ReaderBookmark } from "../lib/types";

interface UseBookmarksOptions {
  filePath: string;
  chapterIndex: number;
  paragraphIndex: number;
  chapterTitle: string;
}

export function useBookmarks({ filePath, chapterIndex, paragraphIndex, chapterTitle }: UseBookmarksOptions) {
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([]);

  // Load bookmarks on mount or when file changes
  useEffect(() => {
    if (!filePath) return;
    window.electronAPI
      ?.getBookmarks(filePath)
      .then(setBookmarks)
      .catch(() => setBookmarks([]));
  }, [filePath]);

  // Current bookmark at this position (if any)
  const currentBookmark = useMemo(() => {
    return bookmarks.find(
      (b) => b.chapterIndex === chapterIndex && b.paragraphIndex === paragraphIndex
    ) ?? null;
  }, [bookmarks, chapterIndex, paragraphIndex]);

  // Toggle bookmark at current position
  const toggleBookmark = useCallback(() => {
    if (!filePath) return;

    if (currentBookmark) {
      // Remove existing bookmark
      window.electronAPI?.deleteBookmark(currentBookmark.id).then(() => {
        setBookmarks((prev) => prev.filter((b) => b.id !== currentBookmark.id));
      });
    } else {
      // Add new bookmark
      const label = `${chapterTitle} — Para ${paragraphIndex + 1}`;
      window.electronAPI?.addBookmark(filePath, chapterIndex, paragraphIndex, label).then((bm) => {
        setBookmarks((prev) =>
          [...prev, bm].sort((a, b) => a.chapterIndex - b.chapterIndex || a.paragraphIndex - b.paragraphIndex)
        );
      });
    }
  }, [filePath, currentBookmark, chapterIndex, paragraphIndex, chapterTitle]);

  // Remove a specific bookmark
  const removeBookmark = useCallback((id: number) => {
    window.electronAPI?.deleteBookmark(id).then(() => {
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    });
  }, []);

  return {
    bookmarks,
    currentBookmark,
    toggleBookmark,
    removeBookmark,
  };
}
