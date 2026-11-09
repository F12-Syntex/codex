"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, BookOpen, Library } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { BuddyMessage, ChapterReader } from "@/lib/ai-buddy";
import { AIChat } from "@/components/ai-chat";
import { WindowChrome, WindowShell } from "@/components/ui/window-chrome";
import { ShimmerText } from "@/components/ui/shimmer-text";

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
  const reduceMotion = useReducedMotion();

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

  const chrome = (
    <WindowChrome
      icon={<Sparkles strokeWidth={1.75} />}
      title="AI Buddy"
      subtitle={bookTitle}
      zoomKey="buddy"
      zoom={zoom}
      onZoomChange={setZoom}
    />
  );

  const progress = totalChapters > 0 ? Math.min(1, (currentChapter + 1) / totalChapters) : 0;

  /** Living ink orb — the buddy's face. */
  const orb = (size: "md" | "lg") => (
    <span className={`relative flex items-center justify-center ${size === "lg" ? "size-20" : "size-10"}`}>
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-brand/40 blur-xl"
        animate={reduceMotion ? undefined : { scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="relative flex size-full items-center justify-center rounded-full bg-brand text-brand-fg shadow-[0_0_24px_-6px_var(--accent-brand)] ring-[0.5px] ring-separator-strong ring-inset">
        <Sparkles className={size === "lg" ? "size-10" : "size-4"} strokeWidth={size === "lg" ? 1.25 : 1.75} />
      </span>
    </span>
  );

  if (initialMessages === undefined) {
    return (
      <WindowShell>
        {chrome}
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          {orb("lg")}
          <ShimmerText className="text-sm">Waking your reading buddy…</ShimmerText>
        </div>
      </WindowShell>
    );
  }

  return (
    <WindowShell>
      {chrome}

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* Companion card */}
        <aside className="glass-thin grain relative hidden w-64 shrink-0 flex-col overflow-hidden rounded-2xl p-5 animate-slide-in-left lg:flex">
          {/* No avatar here: the conversation's empty state carries the one Buddy mark. */}
          <h2 className="line-clamp-3 text-title font-display text-label text-balance">{bookTitle}</h2>

          <div className="mt-8 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-label-secondary">
                  <BookOpen className="size-3.5 text-label-tertiary" strokeWidth={1.75} />
                  Chapter {currentChapter + 1}
                </span>
                <span className="tabular-nums text-label-secondary">of {totalChapters}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-xs bg-fill-tertiary">
                <motion.div
                  className="h-full rounded-xs bg-brand"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.9 }}
                />
              </div>
            </div>
            {wikiEntryCount > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-label-secondary">
                  <Library className="size-3.5 text-label-tertiary" strokeWidth={1.75} />
                  Wiki knowledge
                </span>
                <span className="tabular-nums text-label-secondary">{wikiEntryCount} entries</span>
              </div>
            )}
          </div>

          <p className="mt-auto text-2xs leading-relaxed text-label-secondary">
            Spoiler-safe: your buddy only knows what you&rsquo;ve read up to chapter {currentChapter + 1}.
          </p>
        </aside>

        {/* Conversation */}
        <div className="glass-thin grain relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl animate-sheet-in">
          {/* Compact identity strip (narrow windows) */}
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-separator px-4 lg:hidden">
            {orb("md")}
            <div className="min-w-0">
              <p className="truncate text-headline text-label">Reading buddy</p>
              <p className="truncate text-2xs tabular-nums text-label-secondary">
                Ch. {currentChapter + 1} of {totalChapters}{wikiEntryCount > 0 && ` · ${wikiEntryCount} wiki entries`}
              </p>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ zoom: zoom / 100 }}>
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
      </div>
    </WindowShell>
  );
}
