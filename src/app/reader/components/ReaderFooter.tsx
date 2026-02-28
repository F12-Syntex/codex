"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ThemeClasses } from "../lib/types";

interface ReaderFooterProps {
  currentPage: number;
  totalPages: number;
  chapterIndex: number;
  chapterCount: number;
  theme: ThemeClasses;
  immersiveMode: boolean;
  immersiveVisible: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export const FOOTER_HEIGHT = 44;

export function ReaderFooter({
  currentPage,
  totalPages,
  chapterIndex,
  chapterCount,
  theme,
  immersiveMode,
  immersiveVisible,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: ReaderFooterProps) {
  const isVisible = !immersiveMode || immersiveVisible;

  return (
    <footer
      className={`shrink-0 border-t ${theme.border} ${theme.surface} transition-all duration-300`}
      style={{
        height: `${FOOTER_HEIGHT}px`,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(100%)",
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      <div className="flex h-full items-center justify-between px-4">
        {/* Previous button */}
        <button
          onClick={onPrev}
          disabled={!canGoPrev}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${theme.btn} disabled:opacity-30`}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>

        {/* Page info */}
        <div className="flex items-center gap-4">
          <span className={`text-[12px] tabular-nums ${theme.muted}`}>
            Page {currentPage + 1} of {totalPages}
          </span>
          <span className={`text-[11px] ${theme.muted} opacity-50`}>·</span>
          <span className={`text-[12px] tabular-nums ${theme.muted}`}>
            Chapter {chapterIndex + 1}/{chapterCount}
          </span>
        </div>

        {/* Next button */}
        <button
          onClick={onNext}
          disabled={!canGoNext}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${theme.btn} disabled:opacity-30`}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{ backgroundColor: "var(--accent-brand)", opacity: 0.15 }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: totalPages > 1 ? `${((currentPage + 1) / totalPages) * 100}%` : "100%",
            backgroundColor: "var(--accent-brand)",
            opacity: 0.7,
          }}
        />
      </div>
    </footer>
  );
}
