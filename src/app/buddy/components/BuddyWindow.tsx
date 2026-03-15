"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles } from "lucide-react";
import type { BuddyMessage, ChapterReader } from "@/lib/ai-buddy";
import { AIChat } from "@/components/ai-chat";
import { WindowHeader } from "@/components/window-header";

interface BuddyWindowProps {
  filePath: string;
  bookTitle: string;
  currentChapter: number;
  totalChapters: number;
}

export function BuddyWindow({ filePath, bookTitle, currentChapter, totalChapters }: BuddyWindowProps) {
  const [zoom, setZoom] = useState(100);
  const [wikiEntryCount, setWikiEntryCount] = useState(0);
  const [bookChapters, setBookChapters] = useState<Array<{ paragraphs: string[] }> | null>(null);

  // Restore messages from the pop-out source (persisted in settings)
  const [initialMessages, setInitialMessages] = useState<BuddyMessage[] | undefined>(undefined);

  // Load book content once on mount so readChapter can be sync
  useEffect(() => {
    const format = new URLSearchParams(window.location.search).get("format") || "EPUB";
    window.electronAPI?.getBookContent(filePath, format).then((content: { chapters: Array<{ paragraphs: string[] }> } | undefined) => {
      if (content?.chapters) setBookChapters(content.chapters);
    });
  }, [filePath]);

  // Load persisted messages (from when user popped out)
  useEffect(() => {
    window.electronAPI?.getSetting(`buddyMessages:${filePath}`).then((raw) => {
      if (raw) {
        try {
          const msgs = JSON.parse(raw) as BuddyMessage[];
          setInitialMessages(msgs);
        } catch { setInitialMessages([]); }
      } else {
        setInitialMessages([]);
      }
    });
  }, [filePath]);

  useEffect(() => {
    window.electronAPI?.wikiGetEntries(filePath).then((entries) => setWikiEntryCount(entries?.length ?? 0));
  }, [filePath]);

  const readChapter: ChapterReader = useCallback((idx: number) => {
    return bookChapters?.[idx]?.paragraphs?.join("\n") ?? null;
  }, [bookChapters]);

  // Persist messages on change (for round-tripping with the panel)
  const handleMessagesChange = useCallback((msgs: BuddyMessage[]) => {
    window.electronAPI?.setSetting(`buddyMessages:${filePath}`, JSON.stringify(msgs));
  }, [filePath]);

  if (initialMessages === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-inset)]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-[var(--accent-brand)]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-inset)]">
      <WindowHeader
        icon={<Sparkles className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={1.5} />}
        title="AI Buddy"
        subtitle={bookTitle}
        zoomKey="buddy"
        zoom={zoom}
        onZoomChange={setZoom}
      >
        {wikiEntryCount > 0 && (
          <span className="ml-2 text-xs text-white/15">{wikiEntryCount} wiki entries</span>
        )}
      </WindowHeader>

      <div className="flex flex-1 flex-col overflow-hidden" style={{ zoom: zoom / 100 }}>
        <AIChat
          filePath={filePath}
          bookTitle={bookTitle}
          currentChapter={currentChapter}
          totalChapters={totalChapters}
          initialMessages={initialMessages}
          onMessagesChange={handleMessagesChange}
          readChapter={readChapter}
          wikiEntryCount={wikiEntryCount}
          variant="window"
          maxWidth="700px"
        />
      </div>
    </div>
  );
}
