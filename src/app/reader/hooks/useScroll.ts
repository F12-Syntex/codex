"use client";

import { useState, useCallback, useRef } from "react";

interface UseScrollOptions {
  isImageBook: boolean;
  itemCount: number;
  onChapterChange?: (delta: -1 | 1) => void;
}

export function useScroll({ isImageBook, itemCount, onChapterChange }: UseScrollOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // For image books: current image index
  const [currentIndex, setCurrentIndex] = useState(0);

  // Calculate progress percentage
  const progress = isImageBook
    ? (itemCount > 1 ? Math.round((currentIndex / (itemCount - 1)) * 100) : 0)
    : (totalPages > 1 ? Math.round((currentPage / (totalPages - 1)) * 100) : 0);

  // Navigate to specific page (text books)
  const goToPage = useCallback((page: number) => {
    if (page < 0) {
      onChapterChange?.(-1);
      return;
    }
    if (page >= totalPages) {
      onChapterChange?.(1);
      return;
    }
    setCurrentPage(page);
  }, [totalPages, onChapterChange]);

  // Navigate pages
  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  // For image books: navigate by index
  const goToIndex = useCallback((index: number) => {
    if (index < 0) {
      onChapterChange?.(-1);
      return;
    }
    if (index >= itemCount) {
      onChapterChange?.(1);
      return;
    }
    setCurrentIndex(index);
  }, [itemCount, onChapterChange]);

  // Update total pages (called from TextContent)
  const setPageCount = useCallback((count: number) => {
    setTotalPages(count);
    // Clamp current page if needed
    if (currentPage >= count) {
      setCurrentPage(Math.max(0, count - 1));
    }
  }, [currentPage]);

  // Handle page change from scroll (called from TextContent)
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Scroll to a specific paragraph (for TTS sync)
  const scrollToParagraph = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el || isImageBook) return;

    const para = el.querySelector(`[data-para-index="${index}"]`) as HTMLElement | null;
    if (para) {
      // For column layout, we need to figure out which page contains this paragraph
      const paraRect = para.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      const containerWidth = containerRect.width;

      // Calculate which page the paragraph is on
      const scrollLeft = el.scrollLeft;
      const paraLeft = paraRect.left - containerRect.left + scrollLeft;
      const targetPage = Math.floor(paraLeft / containerWidth);

      if (targetPage !== currentPage) {
        setCurrentPage(targetPage);
      }
    }
  }, [isImageBook, currentPage]);

  // Reset scroll position
  const resetScroll = useCallback(() => {
    if (isImageBook) {
      setCurrentIndex(0);
    } else {
      setCurrentPage(0);
    }
  }, [isImageBook]);

  return {
    scrollRef,
    progress,
    // Pagination (text books)
    currentPage,
    totalPages,
    setPageCount,
    handlePageChange,
    goToPage,
    nextPage,
    prevPage,
    // Image navigation
    currentIndex,
    goToIndex,
    // TTS sync
    scrollToParagraph,
    // Reset
    resetScroll,
    // Convenience methods
    scrollNext: () => isImageBook ? goToIndex(currentIndex + 1) : nextPage(),
    scrollPrev: () => isImageBook ? goToIndex(currentIndex - 1) : prevPage(),
  };
}
