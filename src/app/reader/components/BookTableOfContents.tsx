"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Search, X, ChevronRight } from "lucide-react";
import type { TocEntry, ThemeClasses } from "../lib/types";

interface BookTableOfContentsProps {
  toc: TocEntry[];
  currentChapter: number;
  theme: ThemeClasses;
  enrichedNames?: Record<number, string>;
  enrichEnabled?: boolean;
  onSelectChapter: (index: number) => void;
}

/** Patterns that indicate a chapter is a table of contents page */
const TOC_PATTERNS = [
  /^(table\s+of\s+contents|contents|toc)$/i,
];

/** Check if a chapter title looks like a TOC page */
export function isTOCChapter(title: string): boolean {
  const trimmed = title.trim();
  return TOC_PATTERNS.some((p) => p.test(trimmed));
}

export function BookTableOfContents({
  toc,
  currentChapter,
  theme,
  enrichedNames = {},
  enrichEnabled = false,
  onSelectChapter,
}: BookTableOfContentsProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Use enriched names when available
  const entries = useMemo(() => {
    return toc.map((entry) => ({
      ...entry,
      displayLabel: enrichEnabled && enrichedNames[entry.chapterIndex]
        ? enrichedNames[entry.chapterIndex]
        : entry.label,
    }));
  }, [toc, enrichedNames, enrichEnabled]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => e.displayLabel.toLowerCase().includes(q));
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

          <h2 className={`text-center text-sm font-medium tracking-wide uppercase ${theme.text}`}
            style={{ letterSpacing: "0.15em" }}
          >
            Contents
          </h2>

          <p className={`mt-1.5 text-center text-xs ${theme.muted}`}>
            {entries.length} chapters
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
                className={`w-full bg-transparent text-xs outline-none placeholder:opacity-40 ${theme.text}`}
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
              <p className="text-xs">
                {search ? "No matching entries" : "No entries found"}
              </p>
            </div>
          ) : (
            <div className="space-y-[2px]">
              {filtered.map((entry, i) => (
                <button
                  key={i}
                  onClick={() => onSelectChapter(entry.chapterIndex)}
                  className="group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150"
                >
                  {/* Accent left bar on hover */}
                  <div
                    className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    style={{ backgroundColor: "var(--accent-brand)" }}
                  />

                  {/* Hover background */}
                  <div className={`absolute inset-0 rounded-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${theme.subtle}`} />

                  {/* Number */}
                  <span className={`relative z-[1] w-6 shrink-0 text-right tabular-nums text-xs transition-colors ${theme.muted} group-hover:opacity-80`}>
                    {i + 1}
                  </span>

                  {/* Title */}
                  <span className={`relative z-[1] min-w-0 flex-1 text-sm transition-colors ${theme.text} opacity-80 group-hover:opacity-100`}>
                    {entry.displayLabel}
                  </span>

                  {/* Current chapter indicator */}
                  {entry.chapterIndex === currentChapter && (
                    <span
                      className="relative z-[1] h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: "var(--accent-brand)" }}
                    />
                  )}

                  {/* Arrow indicator */}
                  <ChevronRight
                    className={`relative z-[1] h-3.5 w-3.5 shrink-0 translate-x-0 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-60 ${theme.muted}`}
                    strokeWidth={1.5}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Bottom padding for scroll */}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}
