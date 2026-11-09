"use client";

/**
 * The detached Buddy window: the unified assistant (`<AssistantPanel host="buddy">`) beside a
 * companion card. Conversations live in main (`assistant_threads`), so opening the window picks up
 * the conversation the reader was having (the `threadId` URL param, or the most recent thread)
 * instead of starting empty — the old window replaced its history with whatever the last panel had
 * written to `buddyMessages:<path>`.
 */

import { useEffect, useMemo, useState } from "react";
import { Sparkles, BookOpen, Library } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Frontier } from "@shared/knowledge/types";
import { AssistantPanel } from "@/components/assistant";
import { WindowChrome, WindowShell } from "@/components/ui/window-chrome";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { assistant } from "@/lib/assistant/bridge";
import { hasRpc } from "@/lib/ai/rpc";
import { useEntityIndex, useFrontier } from "@/lib/knowledge/useKnowledge";

interface BuddyWindowProps {
  filePath: string;
  bookTitle: string;
  /** Reader position when the window was opened (fallback until the frontier loads). */
  currentChapter: number;
  totalChapters: number;
  /** Continue this conversation (set when the reader detaches its panel). */
  threadId?: string | null;
}

/** 1-based chapter the reader has reached, from the spoiler frontier. */
function reachedChapter(frontier: Frontier | null, fallback: number): number {
  if (!frontier || frontier.mode === "off") return fallback + 1;
  return Math.max(1, frontier.chapterIndex + (frontier.paraId ? 2 : 1));
}

export function BuddyWindow({ filePath, bookTitle, currentChapter, totalChapters, threadId }: BuddyWindowProps) {
  const [zoom, setZoom] = useState(100);
  const reduceMotion = useReducedMotion();
  const frontier = useFrontier(filePath);
  const entities = useEntityIndex(filePath, frontier);
  const wikiEntryCount = entities.data?.length ?? 0;

  // Resolve the conversation to continue BEFORE mounting the panel (it reads `threadId` once).
  const canResolve = !!filePath && hasRpc();
  const [resolvedThread, setResolvedThread] = useState<string | null | undefined>(threadId ?? undefined);
  const initialThread = canResolve ? resolvedThread : null;
  useEffect(() => {
    if (resolvedThread !== undefined || !canResolve) return;
    let alive = true;
    assistant
      .threads(filePath)
      .then((list) => {
        if (alive) setResolvedThread(list[0]?.id ?? null);
      })
      .catch(() => {
        if (alive) setResolvedThread(null);
      });
    return () => {
      alive = false;
    };
  }, [filePath, canResolve, resolvedThread]);

  const chapter = reachedChapter(frontier, currentChapter);
  const frontierLabel = frontier?.mode === "off" ? undefined : `Chapter ${chapter}`;
  const progress = totalChapters > 0 ? Math.min(1, chapter / totalChapters) : 0;

  const openEntity = useMemo(
    () => (entryId: string) => void window.electronAPI?.openWiki({ filePath, title: bookTitle, entryId }),
    [filePath, bookTitle],
  );

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

  if (initialThread === undefined) {
    return (
      <WindowShell>
        {chrome}
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <span className="relative flex size-20 items-center justify-center">
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-brand/40 blur-xl"
              animate={reduceMotion ? undefined : { scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="relative flex size-full items-center justify-center rounded-full bg-brand text-brand-fg shadow-[0_0_24px_-6px_var(--accent-brand)]">
              <Sparkles className="size-10" strokeWidth={1.25} />
            </span>
          </span>
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
          <h2 className="line-clamp-3 text-title font-display text-label text-balance">{bookTitle}</h2>

          <div className="mt-8 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-label-secondary">
                  <BookOpen className="size-3.5 text-label-tertiary" strokeWidth={1.75} />
                  Chapter {chapter}
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
            Spoiler-safe: your buddy only knows what you&rsquo;ve read, up to chapter {chapter}.
          </p>
        </aside>

        {/* Conversation — the panel is its own glass surface (no glass-in-glass). */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl animate-sheet-in" style={{ zoom: zoom / 100 }}>
          <AssistantPanel
            host="buddy"
            filePath={filePath}
            bookTitle={bookTitle}
            threadId={initialThread}
            frontierLabel={frontierLabel}
            onOpenEntity={openEntity}
            className="rounded-2xl"
          />
        </div>
      </div>
    </WindowShell>
  );
}
