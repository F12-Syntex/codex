"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Sparkles, ExternalLink } from "lucide-react";
import type { ThemeClasses } from "../lib/types";
import type { BuddyMessage, ChapterReader } from "@/lib/ai-buddy";
import { AIChat } from "@/components/ai-chat";

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
  theme, filePath, bookTitle, currentChapter, totalChapters,
  wikiEntryCount, readChapter, onEntityClick, onClose, onDetach, onWikiUpdated,
}: AIBuddyPanelProps) {
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
    <div
      className="absolute bottom-full right-0 z-50 mb-3 flex flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-[var(--bg-overlay)] shadow-lg shadow-black/40 backdrop-blur-xl"
      style={{
        width: "min(540px, calc(100vw - 1.5rem))",
        height: "min(640px, calc(100vh - 140px))",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          <span className="text-xs font-medium text-white/50">Buddy</span>
          {wikiEntryCount > 0 && (
            <span className="text-xs text-white/15">&middot; {wikiEntryCount} wiki entries</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={onDetach} className="flex h-6 w-6 items-center justify-center rounded-lg text-white/15 transition-colors hover:bg-white/[0.04] hover:text-white/40" title="Open in separate window">
            <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
          </button>
          <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded-lg text-white/15 transition-colors hover:bg-white/[0.04] hover:text-white/40">
            <X className="h-3 w-3" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="h-px bg-white/[0.04]" />

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
    </div>
  );
}
