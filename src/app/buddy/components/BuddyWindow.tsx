"use client";

/**
 * The detached Buddy window: the unified assistant (`<AssistantPanel host="buddy">`) in a centred
 * reading column (answers keep a ≤ 672px measure). Progress lives once, in the title bar
 * ("Dune · Chapter 3 of 6"); the panel's empty state carries the spoiler line. Conversations live in
 * main (`assistant_threads`), so opening the window picks up the conversation the reader was having
 * (the `threadId` URL param, or the most recent thread) instead of starting empty.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Frontier } from "@shared/knowledge/types";
import { AssistantPanel } from "@/components/assistant";
import { WindowChrome, WindowShell } from "@/components/ui/window-chrome";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { assistant } from "@/lib/assistant/bridge";
import { hasRpc } from "@/lib/ai/rpc";
import { useFrontier } from "@/lib/knowledge/useKnowledge";

const noopSubscribe = () => () => {};

/**
 * Whether the RPC bridge exists, without a hydration branch (conventions §13.12): `null` on the
 * server and during hydration (render the "waking" state, like the server did), then the real answer.
 */
function useRpcReady(): boolean | null {
  return useSyncExternalStore<boolean | null>(noopSubscribe, hasRpc, () => null);
}

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
  const rpcReady = useRpcReady();

  // Resolve the conversation to continue BEFORE mounting the panel (it reads `threadId` once).
  const canResolve = !!filePath && rpcReady === true;
  const [resolvedThread, setResolvedThread] = useState<string | null | undefined>(threadId ?? undefined);
  const initialThread = rpcReady === null ? undefined : canResolve ? resolvedThread : null;
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
  const subtitle = totalChapters > 0 ? `${bookTitle} · Chapter ${Math.min(chapter, totalChapters)} of ${totalChapters}` : bookTitle;

  const openEntity = useMemo(
    () => (entryId: string) => void window.electronAPI?.openWiki({ filePath, title: bookTitle, entryId }),
    [filePath, bookTitle],
  );

  const chrome = (
    <WindowChrome
      icon={<Sparkles strokeWidth={1.75} />}
      title="AI Buddy"
      subtitle={subtitle}
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

      {/* Conversation — one centred column, so answers keep a readable measure (≤ 672px).
          The panel is its own glass surface (no glass-in-glass). */}
      <div className="flex min-h-0 flex-1 justify-center px-2 pb-2">
        <div
          className="relative flex min-h-0 w-full max-w-2xl min-w-0 flex-col overflow-hidden rounded-2xl animate-sheet-in"
          style={{ zoom: zoom / 100 }}
        >
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
