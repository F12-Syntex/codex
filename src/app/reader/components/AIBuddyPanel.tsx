"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Sparkles, ExternalLink } from "lucide-react";
import type { ThemeClasses } from "../lib/types";
import type { BuddyMessage, ChapterReader } from "@/lib/ai-buddy";
import { AIChat } from "@/components/ai-chat";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";

interface AIBuddyPanelProps {
  theme: ThemeClasses;
  filePath: string;
  bookTitle: string;
  currentChapter: number;
  totalChapters: number;
  wikiEntryCount: number;
  readChapter: ChapterReader;
  onEntityClick: (entityId: string) => void;
  onClose: () => void;
  onDetach: () => void;
  onWikiUpdated?: () => void;
}

export function AIBuddyPanel({
  filePath, bookTitle, currentChapter, totalChapters,
  wikiEntryCount, readChapter, onEntityClick, onClose, onDetach, onWikiUpdated,
}: AIBuddyPanelProps) {
  const reduce = useReducedMotion();
  const [messages, setMessages] = useState<BuddyMessage[]>([]);

  // Load persisted messages on mount
  useEffect(() => {
    window.electronAPI?.getSetting(`buddyMessages:${filePath}`).then((raw) => {
      if (raw) {
        try { setMessages(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  }, [filePath]);

  // Persist messages whenever they change
  const handleMessagesChange = useCallback((msgs: BuddyMessage[]) => {
    setMessages(msgs);
    window.electronAPI?.setSetting(`buddyMessages:${filePath}`, JSON.stringify(msgs));
  }, [filePath]);

  return (
    <motion.div
      className="glass absolute bottom-full right-0 z-50 mb-3 flex flex-col overflow-hidden rounded-2xl text-label"
      style={{
        width: "min(540px, calc(100vw - 1.5rem))",
        height: "min(640px, calc(100vh - 140px))",
        transformOrigin: "100% 100%",
      }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.94, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 420, damping: 32, mass: 0.85 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex h-13 shrink-0 items-center gap-2.5 border-b border-separator pr-3 pl-4">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Sparkles className="size-3.5" strokeWidth={2} />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="font-display text-base font-semibold text-label">Buddy</span>
          {wikiEntryCount > 0 && (
            <Badge variant="outline" className="tabular-nums">
              {wikiEntryCount} wiki {wikiEntryCount === 1 ? "entry" : "entries"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDetach}
            title="Open in separate window"
            aria-label="Open in separate window"
            className="focus-ring pressable inline-flex size-7 items-center justify-center rounded-full text-label-tertiary transition-colors hover:bg-fill-tertiary hover:text-label"
          >
            <ExternalLink className="size-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring pressable inline-flex size-7 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary transition-colors hover:bg-fill-secondary hover:text-label"
          >
            <X className="size-3.5" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      <AIChat
        filePath={filePath}
        bookTitle={bookTitle}
        currentChapter={currentChapter}
        totalChapters={totalChapters}
        initialMessages={messages}
        onMessagesChange={handleMessagesChange}
        readChapter={readChapter}
        onEntityClick={onEntityClick}
        wikiEntryCount={wikiEntryCount}
        onWikiUpdated={onWikiUpdated}
        variant="panel"
        maxWidth="500px"
      />
    </motion.div>
  );
}
