"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  GitBranch,
  X,
  Trash2,
  AudioLines,
  Loader2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemeClasses, TTSStatus } from "../lib/types";
import { fmtCh } from "@/lib/chapter-labels";
import { visibleChapterNo } from "../lib/chapter-number";
import { formatHms } from "../lib/format";
import { AudioWaveform } from "@/components/ui/audio-waveform";
import { ChromeButton, PillDivider, PANEL_SPRING, riseIn } from "./chrome";

interface ReaderFooterProps {
  currentPage: number;
  totalPages: number;
  chapterIndex: number;
  chapterCount: number;
  chapterLabels?: Record<number, number>;
  chapterTitle: string;
  theme: ThemeClasses;
  immersiveMode: boolean;
  immersiveVisible: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Jump to a page within the current chapter (enables the scrubber). */
  onSeekPage?: (page: number) => void;
  // TTS
  ttsStatus: TTSStatus;
  estimatedSeconds: number;
  /** Playback controls (read aloud + speed reader) in the pill. */
  showPlayback?: boolean;
  showTTS?: boolean;
  onTTSToggle?: () => void;
  speedReaderActive?: boolean;
  onSpeedReaderToggle?: () => void;
  // Branch mode
  branchMode?: boolean;
  branchEntityName?: string;
  onExitBranch?: () => void;
  savedBranches?: SimBranchRow[];
  showBranchList?: boolean;
  onToggleBranchList?: () => void;
  onLoadBranch?: (branch: SimBranchRow) => void;
  onDeleteBranch?: (branchId: string) => void;
  activeBranchId?: string;
}

/** Height of the footer zone; the glass pill floats centred inside it. */
export const FOOTER_HEIGHT = 60;

/* ── Page scrubber ─────────────────────────────────────────
 * Adapted from 21st.dev "Playback Scrubber" (sltowl/matte-scrub-slider):
 * rail + accent fill + playhead that appears on hover, hover readout,
 * pointer-capture dragging and keyboard seeking.
 */

function PageScrubber({
  page,
  pages,
  onSeek,
  disabled,
}: {
  page: number;
  pages: number;
  onSeek?: (page: number) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverPage, setHoverPage] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const interactive = !!onSeek && !disabled && pages > 1;
  // Page 1 of 2 reads 50%, the last page 100% — never an empty rail.
  const frac = pages > 0 ? Math.min(1, (page + 1) / pages) : 1;

  const pageAt = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const x = Math.min(r.width, Math.max(0, clientX - r.left));
      setHoverX(x);
      return Math.min(pages - 1, Math.max(0, Math.ceil((x / Math.max(1, r.width)) * pages) - 1));
    },
    [pages],
  );

  const seek = (p: number) => {
    if (p !== page) onSeek?.(p);
  };

  return (
    <div
      role="slider"
      aria-label="Page in chapter"
      aria-valuemin={1}
      aria-valuemax={pages}
      aria-valuenow={page + 1}
      aria-disabled={!interactive}
      tabIndex={interactive ? 0 : -1}
      className={cn(
        "focus-ring group/scrub flex h-6 w-full items-center rounded-full px-1.5",
        interactive ? "cursor-pointer" : "cursor-default",
      )}
      onPointerDown={(e) => {
        if (!interactive) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        seek(pageAt(e.clientX));
      }}
      onPointerMove={(e) => {
        if (!interactive) return;
        const p = pageAt(e.clientX);
        setHoverPage(p);
        if (dragging) seek(p);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onPointerLeave={() => !dragging && setHoverPage(null)}
      onKeyDown={(e) => {
        if (!interactive) return;
        const d = ({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 } as Record<string, number>)[e.key];
        if (d === undefined && e.key !== "Home" && e.key !== "End") return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Home") seek(0);
        else if (e.key === "End") seek(pages - 1);
        else seek(Math.min(pages - 1, Math.max(0, page + d)));
      }}
    >
      <div ref={trackRef} className="relative flex h-full w-full items-center">
      {/* Rail */}
      <div
        className={cn(
          "relative h-1 w-full overflow-hidden rounded-full bg-fill-secondary transition-[height] duration-200 ease-apple",
          interactive && "group-hover/scrub:h-1.5",
          dragging && "h-1.5",
        )}
      >
        <div
          className={cn("absolute inset-0 origin-left rounded-full bg-brand", !dragging && "transition-transform duration-300 ease-apple")}
          style={{ transform: `scaleX(${frac})` }}
        />
      </div>
      {/* Playhead */}
      {interactive && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-sm ring-2 ring-[var(--material-regular)]",
            "scale-0 opacity-0 transition-[transform,opacity] duration-200 ease-spring group-hover/scrub:scale-100 group-hover/scrub:opacity-100",
            dragging && "scale-100 opacity-100",
            !dragging && "transition-[left,transform,opacity]",
          )}
          style={{ left: `${frac * 100}%` }}
        />
      )}
      {/* Hover readout */}
      <AnimatePresence>
        {interactive && hoverPage !== null && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.95, transition: { duration: 0.1 } }}
            transition={PANEL_SPRING}
            className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-elevated px-2 py-1 text-2xs font-medium tabular-nums text-label shadow-md hairline"
            style={{ left: hoverX }}
          >
            Page {hoverPage + 1}
          </motion.span>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────── */

export function ReaderFooter({
  currentPage,
  totalPages,
  chapterIndex,
  chapterCount,
  chapterTitle,
  immersiveMode,
  immersiveVisible,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onSeekPage,
  ttsStatus,
  estimatedSeconds,
  showPlayback = false,
  showTTS = false,
  onTTSToggle,
  speedReaderActive = false,
  onSpeedReaderToggle,
  branchMode = false,
  branchEntityName,
  onExitBranch,
  savedBranches = [],
  showBranchList = false,
  onToggleBranchList,
  onLoadBranch,
  onDeleteBranch,
  activeBranchId,
  chapterLabels = {},
}: ReaderFooterProps) {
  const reduceMotion = useReducedMotion();
  const isVisible = !immersiveMode || immersiveVisible;
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Live countdown — syncs to estimatedSeconds on paragraph transitions, ticks independently
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const prevEstimateRef = useRef(0);

  useEffect(() => {
    // Resync whenever the estimate changes (new paragraph) or TTS starts/stops
    setDisplaySeconds(Math.round(estimatedSeconds));
    prevEstimateRef.current = estimatedSeconds;
  }, [estimatedSeconds]);

  useEffect(() => {
    if (ttsStatus !== "playing") return;
    const id = setInterval(() => {
      setDisplaySeconds(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [ttsStatus]);

  const ttsActive = ttsStatus !== "idle";
  const eta = ttsActive ? formatHms(displaySeconds) : "";

  // Book percentage lives only in the Contents header (chapter-based, like
  // the library). The footer speaks pages-in-chapter: "Chapter 6 · ── · 1 of 2".
  const chapterNo = fmtCh(chapterIndex, chapterLabels) ?? chapterIndex + 1;
  const shownNo = visibleChapterNo(chapterTitle, chapterNo);

  return (
    <footer
      data-reader-footer
      className="relative flex shrink-0 items-center justify-center px-4 transition-[opacity,transform] duration-500 ease-apple"
      style={{
        height: `${FOOTER_HEIGHT}px`,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(70%)",
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      {/* The popover is a sibling of the glass pill, not a child: glass in glass double-blurs. */}
      <div className="relative min-w-0 max-w-full">
      <div className="glass relative flex h-10 min-w-0 max-w-full items-center gap-0.5 rounded-full p-1">
        {branchMode ? (
          /* ── Branch mode ───────────────────────────── */
          <>
            <button
              onClick={onExitBranch}
              className="focus-ring pressable flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-fill-tertiary px-3 text-xs font-medium text-label transition-colors duration-150 hover:bg-fill-secondary"
            >
              <X className="size-3.5" strokeWidth={2} />
              Exit
            </button>
            <div className="flex min-w-0 items-center gap-2 px-3">
              <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand">
                <GitBranch className="size-3.5" strokeWidth={2} />
                Branch
              </span>
              <span className="size-0.5 shrink-0 rounded-full bg-label-quaternary" />
              <span className="min-w-0 max-w-56 truncate text-xs text-label-secondary">{branchEntityName}</span>
            </div>
          </>
        ) : (
          /* ── Reading mode ──────────────────────────── */
          <>
            <ChromeButton onClick={onPrev} disabled={!canGoPrev} title="Previous page (←)" aria-label="Previous page">
              <ChevronLeft strokeWidth={2} />
            </ChromeButton>

            <div className="flex min-w-0 items-center gap-3 px-2">
              {/* Chapter */}
              <div className="flex min-w-0 max-w-56 items-baseline gap-1.5" title={`Chapter ${chapterNo} of ${chapterCount} — ${chapterTitle}`}>
                {shownNo != null && (
                  <span className="shrink-0 text-2xs font-semibold tabular-nums text-label-secondary">{shownNo}</span>
                )}
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={chapterTitle}
                    initial={reduceMotion ? false : { opacity: 0, filter: "blur(3px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
                    exit={{ opacity: 0, filter: "blur(3px)", transition: { duration: 0.12 } }}
                    className="min-w-0 truncate text-xs text-label-secondary"
                  >
                    {chapterTitle}
                  </motion.span>
                </AnimatePresence>
              </div>

              {/* Scrubber */}
              <div className="w-32 shrink-0 lg:w-48">
                <PageScrubber page={currentPage} pages={totalPages} onSeek={onSeekPage} />
              </div>

              {/* Page in chapter */}
              <span className="shrink-0 text-xs font-medium tabular-nums text-label-secondary" title="Page in this chapter">
                {currentPage + 1}
                <span className="font-normal"> of {totalPages}</span>
              </span>
            </div>

            <ChromeButton onClick={onNext} disabled={!canGoNext} title="Next page (→)" aria-label="Next page">
              <ChevronRight strokeWidth={2} />
            </ChromeButton>
          </>
        )}

        {/* ── Playback & branches ─────────────────────── */}
        {(showPlayback || savedBranches.length > 0 || ttsActive) && <PillDivider />}

        {showPlayback && onTTSToggle && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onTTSToggle}
            title={ttsActive ? "Read aloud — time left in chapter" : "Read aloud"}
            aria-label="Read aloud"
            aria-pressed={showTTS || ttsActive}
            className={cn(
              "focus-ring pressable flex h-8 shrink-0 items-center justify-center gap-2 rounded-full transition-colors duration-150",
              ttsActive
                ? "bg-brand/15 px-3 text-brand hover:bg-brand/20"
                : showTTS
                  ? "w-8 bg-brand/15 text-brand"
                  : "w-8 text-label-secondary hover:bg-fill-tertiary hover:text-label",
            )}
          >
            {ttsStatus === "synthesizing" ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
            ) : ttsActive ? (
              <AudioWaveform label="Reading aloud" bars={5} barWidth={2} gap={2} height={14} playing={ttsStatus === "playing"} />
            ) : (
              <AudioLines className="size-4" strokeWidth={1.75} />
            )}
            {ttsActive && <span className="w-13 text-left text-xs font-medium tabular-nums">{eta}</span>}
          </button>
        )}
        {!showPlayback && ttsActive && (
          /* Status-only indicator when playback lives elsewhere */
          <span className="flex h-8 items-center gap-2 rounded-full bg-brand/15 px-3 text-brand">
            <AudioWaveform label="Reading aloud" bars={5} barWidth={2} gap={2} height={14} playing={ttsStatus === "playing"} />
            <span className="w-13 text-xs font-medium tabular-nums">{eta}</span>
          </span>
        )}

        {showPlayback && onSpeedReaderToggle && (
          <ChromeButton onMouseDown={(e) => e.stopPropagation()} onClick={onSpeedReaderToggle} active={speedReaderActive} title="Speed reader" aria-label="Speed reader">
            <Zap strokeWidth={1.75} />
          </ChromeButton>
        )}

        {savedBranches.length > 0 && (
          <button
            onClick={onToggleBranchList}
            title="Saved branches"
            className={cn(
              "focus-ring pressable flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium tabular-nums transition-colors duration-150",
              showBranchList ? "bg-brand/15 text-brand" : "text-label-secondary hover:bg-fill-tertiary hover:text-label",
            )}
          >
            <GitBranch className="size-3.5" strokeWidth={1.75} />
            {savedBranches.length}
          </button>
        )}
      </div>

        {/* ── Branch list popover ─────────────────────── */}
        <AnimatePresence>
          {showBranchList && savedBranches.length > 0 && (
            <motion.div
              {...riseIn}
              transition={PANEL_SPRING}
              className="glass-thick absolute bottom-full right-0 mb-3 w-72 origin-bottom-right rounded-xl p-1"
            >
              <div className="px-2.5 pb-1.5 pt-2 text-section">Saved branches</div>
              <div className="max-h-60 overflow-y-auto">
                {savedBranches.map((branch) => (
                  <div
                    key={branch.id}
                    className={cn(
                      "group flex min-h-11 items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors duration-150 hover:bg-fill-quaternary",
                      activeBranchId === branch.id && "bg-brand/10",
                    )}
                  >
                    <button
                      onClick={() => onLoadBranch?.(branch)}
                      className="focus-ring flex min-w-0 flex-1 flex-col items-start rounded-sm"
                    >
                      <span className={cn("w-full truncate text-left text-sm", activeBranchId === branch.id ? "text-brand" : "text-label")}>
                        {branch.entity_name}
                      </span>
                      <span className="text-2xs tabular-nums text-label-secondary">
                        Ch. {branch.chapter_index + 1} · {new Date(branch.created_at).toLocaleDateString()}
                      </span>
                    </button>
                    {confirmDelete === branch.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => {
                            onDeleteBranch?.(branch.id);
                            setConfirmDelete(null);
                          }}
                          className="focus-ring pressable h-6 rounded-sm bg-danger/15 px-2 text-2xs font-medium text-danger transition-colors hover:bg-danger/25"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="focus-ring pressable h-6 rounded-sm px-2 text-2xs text-label-secondary transition-colors hover:bg-fill-tertiary"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(branch.id)}
                        className="focus-ring pressable flex size-7 shrink-0 items-center justify-center rounded-full text-label-tertiary opacity-0 transition-[opacity,color,background-color] duration-150 hover:bg-fill-tertiary hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                        title="Delete branch"
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </footer>
  );
}
