"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "motion/react";
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
  const reduceMotion = useReducedMotion();

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

  // Closed state: floating glass pill
  if (!isOpen) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center">
        <motion.button
          onClick={() => setIsOpen(true)}
          initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
          className="glass focus-ring pressable pointer-events-auto group flex h-10 items-center gap-2.5 rounded-full pl-1.5 pr-4 text-sm font-medium text-label-secondary hover:text-label"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-brand text-brand-fg shadow-[0_0_24px_-6px_var(--accent-brand)]">
            <Sparkles className="size-3.5" strokeWidth={2} />
          </span>
          Ask about this book
        </motion.button>
      </div>
    );
  }

  // Open state: floating glass sheet hosting the shared AIChat
  return (
    <motion.div
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", bounce: 0.18, duration: 0.5 }}
      className={`glass-thick absolute z-20 flex flex-col overflow-hidden rounded-2xl ${
        isExpanded ? "inset-2" : "bottom-2 left-2 right-2"
      }`}
      style={{
        height: isExpanded ? undefined : "clamp(280px, 45%, 420px)",
      }}
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-separator pl-4 pr-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-brand/15 text-brand">
            <Sparkles className="size-3.5" strokeWidth={2} />
          </span>
          <span className="text-headline text-label">Wiki AI</span>
          <span className="truncate text-xs text-label-tertiary">{bookTitle}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="focus-ring pressable flex size-7 items-center justify-center rounded-full text-label-tertiary hover:bg-fill-tertiary hover:text-label"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <Minimize2 className="size-3.5" strokeWidth={1.75} />
            ) : (
              <Maximize2 className="size-3.5" strokeWidth={1.75} />
            )}
          </button>
          <button
            onClick={() => { setIsOpen(false); setIsExpanded(false); }}
            className="focus-ring pressable flex size-7 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary hover:bg-fill-secondary hover:text-label"
            title="Close"
          >
            <ChevronDown className="size-3.5" strokeWidth={2} />
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
    </motion.div>
  );
}
