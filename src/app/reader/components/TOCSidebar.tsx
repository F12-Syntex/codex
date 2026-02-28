"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { X, Search, List, Bookmark } from "lucide-react";
import type { BookChapter, ReaderBookmark, ThemeClasses } from "../lib/types";

type Tab = "chapters" | "bookmarks";

interface TOCSidebarProps {
  chapters: BookChapter[];
  currentChapter: number;
  bookmarks: ReaderBookmark[];
  theme: ThemeClasses;
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

  // Filter chapters by search
  const filteredChapters = useMemo(() => {
    if (!searchQuery.trim()) return chapters.map((ch, i) => ({ ch, i }));
    const q = searchQuery.toLowerCase();
    return chapters
      .map((ch, i) => ({ ch, i }))
      .filter(({ ch }) => ch.title.toLowerCase().includes(q));
  }, [chapters, searchQuery]);

  // Filter bookmarks by search
  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return bookmarks;
    const q = searchQuery.toLowerCase();
    return bookmarks.filter((bm) => bm.label.toLowerCase().includes(q));
  }, [bookmarks, searchQuery]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0);
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
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
              tab === "chapters" ? theme.btnActive : theme.btn
            }`}
          >
            <List className="h-3.5 w-3.5" strokeWidth={1.5} />
            Chapters
          </button>
          <button
            onClick={() => setTab("bookmarks")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
              tab === "bookmarks" ? theme.btnActive : theme.btn
            }`}
          >
            <Bookmark className="h-3.5 w-3.5" strokeWidth={1.5} />
            Bookmarks
            {bookmarks.length > 0 && (
              <span className={`ml-0.5 text-[11px] ${theme.muted}`}>({bookmarks.length})</span>
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
            className={`w-full bg-transparent text-[12px] outline-none placeholder:opacity-40 ${theme.text}`}
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
            <p className={`py-8 text-center text-[12px] ${theme.muted}`}>No chapters found</p>
          ) : (
            filteredChapters.map(({ ch, i }) => (
              <button
                key={i}
                onClick={() => {
                  onSelectChapter(i);
                  onClose();
                }}
                {...(i === currentChapter ? { "data-active-chapter": true } : {})}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors ${
                  i === currentChapter ? theme.btnActive : theme.btn
                }`}
              >
                <span className={`w-5 shrink-0 text-right tabular-nums text-[11px] ${theme.muted}`}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{ch.title}</span>
              </button>
            ))
          )
        ) : filteredBookmarks.length === 0 ? (
          <div className={`py-8 text-center ${theme.muted}`}>
            <Bookmark className="mx-auto mb-2 h-8 w-8 opacity-30" strokeWidth={1.5} />
            <p className="text-[12px]">No bookmarks yet</p>
            <p className="mt-1 text-[11px] opacity-60">Press Ctrl+B to add one</p>
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
                <span className={`truncate text-[13px] ${theme.text}`}>{bm.label}</span>
                <span className={`text-[11px] ${theme.muted}`}>
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
