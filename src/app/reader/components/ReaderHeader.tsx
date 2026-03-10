"use client";

import { Minus, Square, X, Copy, Maximize, Minimize, List, ALargeSmall, Bookmark, BookmarkCheck, AudioLines, Sparkles, Zap, Quote } from "lucide-react";
import type { ReadingTheme, ThemeClasses } from "../lib/types";

interface ReaderHeaderProps {
  title: string;
  author: string;
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

export function ReaderHeader({
  title,
  author,
  theme,
  readingTheme,
  maximized,
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
  return (
    <div className="flex h-11 min-w-0 items-center" data-reader-header>
      {/* TOC button */}
      <div className="flex h-full items-center">
        {hasMultipleChapters && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onTOCToggle}
            title="Table of Contents"
            className={`no-drag flex h-full w-10 items-center justify-center transition-colors ${
              showTOC ? theme.btnActive : theme.btn
            }`}
          >
            <List className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Title (draggable area) */}
      <div className="app-drag-region flex h-full min-w-0 flex-1 items-center gap-2 pl-3">
        <span className={`truncate text-sm font-medium ${theme.text}`}>{title}</span>
        {author && <span className={`truncate text-xs ${theme.muted}`}>{author}</span>}
      </div>

      {/* Controls */}
      <div className="no-drag flex shrink-0 items-center gap-1 pr-1">
        {/* Theme switcher */}
        <div className={`flex items-center gap-0.5 rounded-lg p-0.5 ${theme.subtle}`}>
          {(["dark", "light", "sepia"] as const).map((t) => (
            <button
              key={t}
              onClick={() => onThemeChange(t)}
              className={`rounded-lg px-2 py-1 text-xs font-medium capitalize transition-colors ${
                readingTheme === t ? theme.btnActive : theme.btn
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Text settings */}
        {!isImageBook && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onTextSettingsToggle}
            title="Text settings"
            className={`ml-1 flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              showTextSettings ? "bg-[var(--accent-brand)] text-white" : theme.btn
            }`}
          >
            <ALargeSmall className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}

        {/* Bookmark toggle */}
        {!isImageBook && (
          <button
            onClick={onBookmarkToggle}
            title="Bookmark current position (Ctrl+B)"
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              isBookmarked ? "bg-[var(--accent-brand)] text-white" : theme.btn
            }`}
          >
            {isBookmarked ? (
              <BookmarkCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <Bookmark className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        )}

        {/* Quotes */}
        {!isImageBook && onOpenQuotes && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onOpenQuotes}
            title="View saved quotes"
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
          >
            <Quote className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}

        {/* Speed Reader button */}
        {!isImageBook && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onSpeedReaderToggle}
            title="Speed Reader"
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              speedReaderActive ? "bg-[var(--accent-brand)] text-white" : theme.btn
            }`}
          >
            <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}

        {/* TTS button */}
        {!isImageBook && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onTTSToggle}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              isTTSActive ? "bg-[var(--accent-brand)] text-white" : theme.btn
            }`}
          >
            <AudioLines className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}

        {/* AI tools */}
        {!isImageBook && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onAIToggle}
            title="AI Tools"
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              showAI ? "bg-[var(--accent-brand)] text-white" : theme.btn
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}

        {/* Fullscreen */}
        <button
          onClick={onFullscreenToggle}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
        >
          {isFullscreen ? (
            <Minimize className="h-3.5 w-3.5" strokeWidth={1.5} />
          ) : (
            <Maximize className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* Window controls */}
      <div className="flex h-full shrink-0 items-center">
        <button
          onClick={() => window.electronAPI?.minimize()}
          className={`inline-flex h-full w-11 items-center justify-center transition-colors ${theme.btn}`}
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className={`inline-flex h-full w-11 items-center justify-center transition-colors ${theme.btn}`}
        >
          {maximized ? <Copy className="h-3 w-3" strokeWidth={1.5} /> : <Square className="h-3 w-3" strokeWidth={1.5} />}
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="inline-flex h-full w-11 items-center justify-center text-white/30 transition-colors hover:bg-[#e81123]/80 hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
