"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Search, X, ChevronRight } from "lucide-react";
import type { BookChapter, ThemeClasses } from "../lib/types";

interface BookTableOfContentsProps {
  chapters: BookChapter[];
  currentChapter: number;
  theme: ThemeClasses;
  onSelectChapter: (index: number) => void;
}

/** Patterns that indicate a chapter is a table of contents page */
const TOC_PATTERNS = [
  /^table\s+of\s+contents$/i,
  /^contents$/i,
  /^toc$/i,
];

/** Check if a chapter title looks like a TOC page */
export function isTOCChapter(title: string): boolean {
  const trimmed = title.trim();
  return TOC_PATTERNS.some((p) => p.test(trimmed));
}

export function BookTableOfContents({
  chapters,
  currentChapter,
  theme,
  onSelectChapter,
}: BookTableOfContentsProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const chapter = chapters[currentChapter];

  // Build TOC entries from the chapter paragraphs
  const entries = useMemo(() => {
    if (!chapter) return [];
    return chapter.paragraphs
      .map((text) => text.trim())
      .filter((text) => text.length > 0)
      .map((text) => {
        const matchIndex = findMatchingChapter(text, chapters);
        return { text, matchIndex };
      });
  }, [chapter, chapters]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => e.text.toLowerCase().includes(q));
  }, [entries, search]);

  // Focus search on Ctrl+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const matchedCount = entries.filter((e) => e.matchIndex !== -1).length;

  return (
    <div className="flex h-full flex-col">
      {/* Decorative header */}
      <div className="relative shrink-0 overflow-hidden pb-5 pt-4">
        {/* Accent gradient glow behind title */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-[120px] w-[400px] -translate-x-1/2 opacity-[0.04]"
          style={{
            background: "radial-gradient(ellipse at center, var(--accent-brand), transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-[640px]">
          {/* Small accent line */}
          <div
            className="mx-auto mb-4 h-[2px] w-12 rounded-full"
            style={{ backgroundColor: "var(--accent-brand)", opacity: 0.5 }}
          />

          <h2 className={`text-center text-[14px] font-medium tracking-wide uppercase ${theme.text}`}
            style={{ letterSpacing: "0.15em" }}
          >
            Contents
          </h2>

          <p className={`mt-1.5 text-center text-[11px] ${theme.muted}`}>
            {entries.length} entries · {matchedCount} linked
          </p>

          {/* Search bar */}
          {entries.length > 10 && (
            <div className={`mx-auto mt-4 flex max-w-[320px] items-center gap-2 rounded-lg px-3 py-2 ${theme.input} border ${theme.border}`}>
              <Search className={`h-3.5 w-3.5 shrink-0 ${theme.muted}`} strokeWidth={1.5} />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chapters..."
                className={`w-full bg-transparent text-[12px] outline-none placeholder:opacity-40 ${theme.text}`}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
                >
                  <X className="h-2.5 w-2.5" strokeWidth={2} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div>
        <div className={`mx-auto max-w-[640px] h-px ${theme.subtle}`} />
      </div>

      {/* Entries list */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-4">
        <div className="mx-auto max-w-[640px]">
          {filtered.length === 0 ? (
            <div className={`flex flex-col items-center py-12 ${theme.muted}`}>
              <Search className="mb-3 h-8 w-8 opacity-20" strokeWidth={1.5} />
              <p className="text-[12px]">
                {search ? "No matching entries" : "No entries found"}
              </p>
            </div>
          ) : (
            <div className="space-y-[2px]">
              {filtered.map((entry, i) => {
                const isLinked = entry.matchIndex !== -1;
                return (
                  <button
                    key={i}
                    onClick={() => isLinked && onSelectChapter(entry.matchIndex)}
                    disabled={!isLinked}
                    className="group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150"
                    style={{
                      animationDelay: `${i * 20}ms`,
                    }}
                  >
                    {/* Accent left bar on hover */}
                    {isLinked && (
                      <div
                        className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                        style={{ backgroundColor: "var(--accent-brand)" }}
                      />
                    )}

                    {/* Hover background */}
                    {isLinked && (
                      <div className={`absolute inset-0 rounded-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${theme.subtle}`} />
                    )}

                    {/* Number */}
                    <span className={`relative z-[1] w-6 shrink-0 text-right tabular-nums text-[11px] transition-colors ${
                      isLinked ? `${theme.muted} group-hover:opacity-80` : `${theme.muted} opacity-30`
                    }`}>
                      {i + 1}
                    </span>

                    {/* Title with dotted leader */}
                    <span className={`relative z-[1] min-w-0 flex-1 text-[13px] transition-colors ${
                      isLinked
                        ? `${theme.text} opacity-80 group-hover:opacity-100`
                        : `${theme.muted} opacity-40`
                    }`}>
                      {entry.text}
                    </span>

                    {/* Arrow indicator for linked entries */}
                    {isLinked && (
                      <ChevronRight
                        className={`relative z-[1] h-3.5 w-3.5 shrink-0 translate-x-0 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-60 ${theme.muted}`}
                        strokeWidth={1.5}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Bottom padding for scroll */}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}

/**
 * Try to match a TOC entry text to one of the book's chapters.
 */
function findMatchingChapter(entryText: string, chapters: BookChapter[]): number {
  const normalized = normalize(entryText);
  if (!normalized) return -1;

  // Exact title match (normalized)
  for (let i = 0; i < chapters.length; i++) {
    if (normalize(chapters[i].title) === normalized) return i;
  }

  // Entry text contained in chapter title or vice versa
  for (let i = 0; i < chapters.length; i++) {
    const chTitle = normalize(chapters[i].title);
    if (!chTitle) continue;
    if (chTitle.includes(normalized) || normalized.includes(chTitle)) return i;
  }

  // Strip common prefixes like "Chapter 1:", "Part I:", roman numerals, etc.
  const strippedEntry = stripPrefix(normalized);
  if (strippedEntry) {
    for (let i = 0; i < chapters.length; i++) {
      const strippedTitle = stripPrefix(normalize(chapters[i].title));
      if (strippedTitle && strippedTitle === strippedEntry) return i;
    }
  }

  return -1;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPrefix(s: string): string {
  return s
    .replace(/^(chapter|part|section|book|volume)\s+(\d+|[ivxlcdm]+)\s*/i, "")
    .replace(/^\d+\s*/, "")
    .trim();
}
