"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { X, Search, List, Bookmark, Sparkles, Paintbrush, BookMarked, Loader2 } from "lucide-react";
import type { BookChapter, ReaderBookmark, ThemeClasses } from "../lib/types";
import { needsEnrichment } from "@/lib/ai-prompts";

type Tab = "chapters" | "bookmarks";

interface TOCSidebarProps {
  chapters: BookChapter[];
  currentChapter: number;
  bookmarks: ReaderBookmark[];
  theme: ThemeClasses;
  enrichedNames?: Record<number, string>;
  enrichEnabled?: boolean;
  enrichingChapter?: number | null;
  onEnrichChapter?: (index: number) => void;
  formattingEnabled?: boolean;
  formattedChapters?: Record<number, string[]>;
  formattingChapter?: number | null;
  onFormatChapter?: (index: number) => void;
  wikiEnabled?: boolean;
  wikiProcessedChapters?: Set<number>;
  readChapters?: Set<number>;
  onSelectChapter: (index: number) => void;
  onJumpToBookmark: (bookmark: ReaderBookmark) => void;
  onDeleteBookmark: (id: number) => void;
  onClose: () => void;
}

export function TOCSidebar({
  chapters,
  currentChapter,
  bookmarks,
  theme,
  enrichedNames = {},
  enrichEnabled = false,
  enrichingChapter = null,
  onEnrichChapter,
  formattingEnabled = false,
  formattedChapters = {},
  formattingChapter = null,
  onFormatChapter,
  wikiEnabled = false,
  wikiProcessedChapters = new Set(),
  readChapters = new Set(),
  onSelectChapter,
  onJumpToBookmark,
  onDeleteBookmark,
  onClose,
}: TOCSidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("chapters");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter chapters by search (use enriched name only when enabled)
  const filteredChapters = useMemo(() => {
    const mapped = chapters.map((ch, i) => ({
      ch, i,
      displayTitle: enrichEnabled && enrichedNames[i] ? enrichedNames[i] : ch.title,
    }));
    if (!searchQuery.trim()) return mapped;
    const q = searchQuery.toLowerCase();
    return mapped.filter(({ displayTitle }) => displayTitle.toLowerCase().includes(q));
  }, [chapters, searchQuery, enrichedNames, enrichEnabled]);

  // Filter bookmarks by search
  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return bookmarks;
    const q = searchQuery.toLowerCase();
    return bookmarks.filter((bm) => bm.label.toLowerCase().includes(q));
  }, [bookmarks, searchQuery]);

  // Click outside to close (ignore clicks on header toolbar buttons)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sidebarRef.current && !sidebarRef.current.contains(target)) {
        const header = document.querySelector("[data-reader-header]");
        if (header?.contains(target)) return;
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Scroll to current chapter on mount
  useEffect(() => {
    if (listRef.current && !searchQuery && tab === "chapters") {
      const activeItem = listRef.current.querySelector("[data-active-chapter]");
      activeItem?.scrollIntoView({ block: "center" });
    }
  }, [searchQuery, tab]);

  // Focus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      ref={sidebarRef}
      className={`absolute left-0 top-0 z-20 flex h-full w-[320px] flex-col ${theme.panel} border-r ${theme.border} shadow-lg shadow-black/30`}
      style={{ animation: "slideInLeft 0.2s ease" }}
    >
      {/* Header with tabs */}
      <div className={`flex items-center justify-between border-b px-3 py-2 ${theme.border}`}>
        <div className={`flex items-center gap-1 rounded-lg p-0.5 ${theme.subtle}`}>
          <button
            onClick={() => setTab("chapters")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === "chapters" ? theme.btnActive : theme.btn
            }`}
          >
            <List className="h-3.5 w-3.5" strokeWidth={1.5} />
            Chapters
          </button>
          <button
            onClick={() => setTab("bookmarks")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === "bookmarks" ? theme.btnActive : theme.btn
            }`}
          >
            <Bookmark className="h-3.5 w-3.5" strokeWidth={1.5} />
            Bookmarks
            {bookmarks.length > 0 && (
              <span className={`ml-0.5 text-xs ${theme.muted}`}>({bookmarks.length})</span>
            )}
          </button>
        </div>
        <button
          onClick={onClose}
          className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Search */}
      <div className={`border-b px-3 py-2 ${theme.border}`}>
        <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${theme.input}`}>
          <Search className={`h-3.5 w-3.5 shrink-0 ${theme.muted}`} strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tab === "chapters" ? "Search chapters..." : "Search bookmarks..."}
            className={`w-full bg-transparent text-xs outline-none placeholder:opacity-40 ${theme.text}`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-lg ${theme.btn}`}
            >
              <X className="h-2.5 w-2.5" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-1.5">
        {tab === "chapters" ? (
          filteredChapters.length === 0 ? (
            <p className={`py-8 text-center text-xs ${theme.muted}`}>No chapters found</p>
          ) : (
            filteredChapters.map(({ ch, i, displayTitle }) => {
              const canEnrich = enrichEnabled && needsEnrichment(ch.title);
              const isEnriching = enrichingChapter === i;

              const canFormat = formattingEnabled && !formattedChapters[i];
              const isFormatting = formattingChapter === i;

              const isEnriched = !!enrichedNames[i];
              const isFormatted = !!formattedChapters[i];
              const isWikiProcessed = wikiProcessedChapters.has(i);
              const hasIndicators = (enrichEnabled && isEnriched) || (formattingEnabled && isFormatted) || (wikiEnabled && isWikiProcessed);
              const isRead = readChapters.has(i);

              return (
                <div
                  key={i}
                  {...(i === currentChapter ? { "data-active-chapter": true } : {})}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    i === currentChapter ? theme.btnActive : theme.btn
                  } ${isRead && i !== currentChapter ? "opacity-40" : ""}`}
                >
                  <span className={`w-5 shrink-0 text-right tabular-nums text-xs ${theme.muted}`}>
                    {i + 1}
                  </span>
                  <button
                    onClick={() => { onSelectChapter(i); onClose(); }}
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    <span>{displayTitle}</span>
                    {hasIndicators && (
                      <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
                        {enrichEnabled && isEnriched && (
                          <Sparkles className="inline h-2.5 w-2.5 text-[var(--accent-brand)] opacity-50" strokeWidth={1.5} />
                        )}
                        {formattingEnabled && isFormatted && (
                          <Paintbrush className="inline h-2.5 w-2.5 text-[var(--accent-brand)] opacity-50" strokeWidth={1.5} />
                        )}
                        {wikiEnabled && isWikiProcessed && (
                          <BookMarked className="inline h-2.5 w-2.5 text-[var(--accent-brand)] opacity-50" strokeWidth={1.5} />
                        )}
                      </span>
                    )}
                  </button>
                  {(isEnriching || isFormatting) && (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--accent-brand)]" strokeWidth={1.5} />
                  )}
                  {canEnrich && !isEnriching && !isFormatting && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEnrichChapter?.(i); }}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg opacity-0 transition-all group-hover:opacity-100 ${theme.btn}`}
                      title="Rename with AI"
                    >
                      <Sparkles className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={1.5} />
                    </button>
                  )}
                  {canFormat && !isEnriching && !isFormatting && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onFormatChapter?.(i); }}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg opacity-0 transition-all group-hover:opacity-100 ${theme.btn}`}
                      title="Format with AI"
                    >
                      <Paintbrush className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              );
            })
          )
        ) : filteredBookmarks.length === 0 ? (
          <div className={`py-8 text-center ${theme.muted}`}>
            <Bookmark className="mx-auto mb-2 h-8 w-8 opacity-30" strokeWidth={1.5} />
            <p className="text-xs">No bookmarks yet</p>
            <p className="mt-1 text-xs opacity-60">Press Ctrl+B to add one</p>
          </div>
        ) : (
          filteredBookmarks.map((bm) => (
            <div
              key={bm.id}
              className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:${theme.subtle}`}
            >
              <button
                onClick={() => {
                  onJumpToBookmark(bm);
                  onClose();
                }}
                className="flex min-w-0 flex-1 flex-col gap-0.5"
              >
                <span className={`truncate text-sm ${theme.text}`}>{bm.label}</span>
                <span className={`text-xs ${theme.muted}`}>
                  Chapter {bm.chapterIndex + 1} · Page {bm.paragraphIndex + 1}
                </span>
              </button>
              <button
                onClick={() => onDeleteBookmark(bm.id)}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-all group-hover:opacity-100 ${theme.btn}`}
              >
                <X className="h-3 w-3" strokeWidth={1.5} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
