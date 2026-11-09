"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Maximize2, Minimize2, PanelLeft, ALargeSmall,
  Bookmark, BookmarkCheck, AudioLines, Sparkles, Zap, Quote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WindowControls } from "@/components/window-controls";
import type { ReadingTheme, ThemeClasses } from "../lib/types";
import { ChromeButton, PillDivider, PAPER_SWATCHES } from "./chrome";

interface ReaderHeaderProps {
  title: string;
  author: string;
  /** Current chapter — shown under the book title. */
  chapterTitle?: string;
  theme: ThemeClasses;
  readingTheme: ReadingTheme;
  maximized: boolean;
  isFullscreen: boolean;
  hasMultipleChapters: boolean;
  isImageBook: boolean;
  isBookmarked: boolean;
  isTTSActive: boolean;
  showTOC: boolean;
  showTTS: boolean;
  showTextSettings: boolean;
  showAI: boolean;
  speedReaderActive: boolean;
  /**
   * When true, Read Aloud and Speed Reader live in the footer pill instead of
   * the header (the default composition). Set false to keep them up here —
   * the Reader does in focus mode, where the footer hides. The Speed Reader
   * toggle always shows here while it is active (the footer is unmounted then).
   */
  playbackInFooter?: boolean;
  onThemeChange: (theme: ReadingTheme) => void;
  onTOCToggle: () => void;
  onTTSToggle: () => void;
  onTextSettingsToggle: () => void;
  onBookmarkToggle: () => void;
  onFullscreenToggle: () => void;
  onAIToggle: () => void;
  onSpeedReaderToggle: () => void;
  onOpenQuotes?: () => void;
}

const stop = (e: React.MouseEvent) => e.stopPropagation();

/**
 * Reader header — no bar. The paper runs to the window edge and the chrome
 * floats on it: a navigation pill on the left, the book title set in serif in
 * the middle, a tool pill and the shared caption buttons on the right.
 * `maximized` stays in the props contract; WindowControls tracks it itself.
 */
export function ReaderHeader({
  title,
  author,
  chapterTitle,
  readingTheme,
  isFullscreen,
  hasMultipleChapters,
  isImageBook,
  isBookmarked,
  isTTSActive,
  showTOC,
  showTTS,
  showTextSettings,
  showAI,
  speedReaderActive,
  playbackInFooter = true,
  onThemeChange,
  onTOCToggle,
  onTTSToggle,
  onTextSettingsToggle,
  onBookmarkToggle,
  onFullscreenToggle,
  onAIToggle,
  onSpeedReaderToggle,
  onOpenQuotes,
}: ReaderHeaderProps) {
  const reduceMotion = useReducedMotion();
  const showLeftPill = hasMultipleChapters || !isImageBook;

  return (
    <div className="app-drag-region relative flex h-13 min-w-0 items-center gap-2 pl-3" data-reader-header>
      {/* ── Left: navigation pill ─────────────────────────── */}
      <div className="flex min-w-0 flex-1 basis-0 items-center">
        {showLeftPill && (
          <div className="app-no-drag glass-thin flex h-10 items-center gap-0.5 rounded-full p-1">
            {hasMultipleChapters && (
              <ChromeButton onMouseDown={stop} onClick={onTOCToggle} active={showTOC} title="Contents & bookmarks" aria-label="Contents">
                <PanelLeft strokeWidth={1.75} />
              </ChromeButton>
            )}
            {!isImageBook && (
              <ChromeButton
                onClick={onBookmarkToggle}
                active={isBookmarked}
                title="Bookmark this page (Ctrl+B)"
                aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={isBookmarked ? "on" : "off"}
                    initial={reduceMotion ? false : { scale: 0.5, opacity: 0, y: -4 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 520, damping: 26 }}
                    className="inline-flex"
                  >
                    {isBookmarked ? (
                      <BookmarkCheck strokeWidth={1.75} className="fill-brand/25" />
                    ) : (
                      <Bookmark strokeWidth={1.75} />
                    )}
                  </motion.span>
                </AnimatePresence>
              </ChromeButton>
            )}
          </div>
        )}
      </div>

      {/* ── Centre: serif title + chapter ─────────────────── */}
      <div className="pointer-events-none flex min-w-0 max-w-[min(44%,560px)] shrink flex-col items-center justify-center text-center">
        <span className="max-w-full truncate font-display text-sm font-semibold tracking-tight text-label" title={author ? `${title} — ${author}` : title}>
          {title}
        </span>
        <div className="relative h-3.5 w-full overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={chapterTitle ?? author}
              initial={reduceMotion ? false : { opacity: 0, y: 6, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
              transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
              className="block truncate text-2xs text-label-secondary"
            >
              {chapterTitle || author}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Right: tool pill + window controls ────────────── */}
      <div className="flex h-full min-w-0 flex-1 basis-0 items-center justify-end gap-1.5">
        <div className="app-no-drag glass-thin flex h-10 shrink-0 items-center gap-0.5 rounded-full p-1">
          {isImageBook ? (
            /* Image books have no text settings — paper chips live here */
            <div role="radiogroup" aria-label="Page colour" className="flex items-center gap-1 px-1">
              {PAPER_SWATCHES.map((s) => (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={readingTheme === s.id}
                  title={s.label}
                  onClick={() => onThemeChange(s.id)}
                  className={cn(
                    "focus-ring pressable size-6 rounded-full hairline transition-shadow duration-200",
                    readingTheme === s.id && "ring-2 ring-brand ring-offset-2 ring-offset-transparent",
                  )}
                  style={{ backgroundColor: s.paper }}
                />
              ))}
            </div>
          ) : (
            <>
              <ChromeButton onMouseDown={stop} onClick={onTextSettingsToggle} active={showTextSettings} title="Appearance" aria-label="Text & page appearance">
                <ALargeSmall strokeWidth={1.75} />
              </ChromeButton>
              {!playbackInFooter && (
                <ChromeButton onMouseDown={stop} onClick={onTTSToggle} active={isTTSActive || showTTS} title="Read aloud" aria-label="Read aloud">
                  <AudioLines strokeWidth={1.75} />
                </ChromeButton>
              )}
              {(!playbackInFooter || speedReaderActive) && (
                <ChromeButton
                  onMouseDown={stop}
                  onClick={onSpeedReaderToggle}
                  active={speedReaderActive}
                  title={speedReaderActive ? "Exit speed reader (Esc)" : "Speed reader"}
                  aria-label={speedReaderActive ? "Exit speed reader" : "Speed reader"}
                >
                  <Zap strokeWidth={1.75} />
                </ChromeButton>
              )}
              {onOpenQuotes && (
                <ChromeButton onMouseDown={stop} onClick={onOpenQuotes} title="Saved quotes" aria-label="Saved quotes">
                  <Quote strokeWidth={1.75} />
                </ChromeButton>
              )}
              <ChromeButton onMouseDown={stop} onClick={onAIToggle} active={showAI} title="AI tools" aria-label="AI tools">
                <Sparkles strokeWidth={1.75} />
              </ChromeButton>
            </>
          )}
          <PillDivider />
          <ChromeButton onClick={onFullscreenToggle} title={isFullscreen ? "Exit full screen" : "Full screen"} aria-label="Toggle full screen">
            {isFullscreen ? <Minimize2 strokeWidth={1.75} /> : <Maximize2 strokeWidth={1.75} />}
          </ChromeButton>
        </div>

        {/* Window controls — the same caption buttons as every other window */}
        <WindowControls />
      </div>
    </div>
  );
}
