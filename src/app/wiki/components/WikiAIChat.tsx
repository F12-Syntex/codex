"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles, ChevronDown, Maximize2, Minimize2,
} from "lucide-react";
import type { ChapterLabels } from "@/lib/chapter-labels";
import type { BuddyMessage } from "@/lib/ai-buddy";
import { AIChat } from "@/components/ai-chat";

interface WikiAIChatProps {
  filePath: string;
  bookTitle: string;
  onEntryClick: (id: string) => void;
  chapterLabels?: ChapterLabels;
  onOpenChange?: (isOpen: boolean, isExpanded: boolean) => void;
}

export function WikiAIChat({ filePath, bookTitle, onEntryClick, chapterLabels = {}, onOpenChange }: WikiAIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [totalChapters, setTotalChapters] = useState(0);
  const [wikiEntryCount, setWikiEntryCount] = useState(0);

  useEffect(() => {
    onOpenChange?.(isOpen, isExpanded);
  }, [isOpen, isExpanded, onOpenChange]);

  // Get total chapters and wiki count for context
  useEffect(() => {
    if (!filePath) return;
    window.electronAPI?.wikiGetEntries(filePath).then((entries) => {
      setWikiEntryCount(entries?.length ?? 0);
    });
    window.electronAPI?.wikiGetAllChapterSummaries(filePath).then((summaries) => {
      setTotalChapters(summaries?.length ?? 0);
    });
  }, [filePath]);

  // Closed state: floating pill button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/[0.08] px-4 py-2.5 text-xs font-medium text-white/50 transition-all hover:border-white/[0.12] hover:text-white/70 hover:shadow-lg hover:shadow-black/20"
        style={{
          background: "var(--bg-surface)",
          boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
        Ask about this book
      </button>
    );
  }

  // Open state: chat panel using shared AIChat
  return (
    <div
      className={`absolute z-20 flex flex-col border-t border-white/[0.06] transition-all duration-200 ${
        isExpanded ? "inset-0 border-t-0" : "bottom-0 left-0 right-0"
      }`}
      style={{
        height: isExpanded ? "100%" : "clamp(280px, 45%, 420px)",
        background: "var(--bg-surface)",
      }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          <span className="text-xs font-medium text-white/60">Wiki AI</span>
          <span className="text-xs text-white/25">{bookTitle}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={() => { setIsOpen(false); setIsExpanded(false); }}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50"
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <AIChat
        filePath={filePath}
        bookTitle={bookTitle}
        currentChapter={Math.max(0, totalChapters - 1)}
        totalChapters={totalChapters}
        onEntityClick={onEntryClick}
        wikiEntryCount={wikiEntryCount}
        variant="panel"
        maxWidth="100%"
      />
    </div>
  );
}
