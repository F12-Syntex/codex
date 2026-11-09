"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Search, X, ChevronRight } from "lucide-react";
import type { TocEntry, ThemeClasses } from "../lib/types";
import { cn } from "@/lib/utils";
import { FluidHoverHighlight, useFluidHover } from "@/components/ui/fluid-hover-highlight";

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
  const hover = useFluidHover();

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
      {/* ── Title page ─────────────────────────────── */}
      <div className="relative mx-auto w-full max-w-2xl shrink-0 pb-6 pt-6 text-center">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-32 w-96 -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
        <p className="relative text-section text-brand">Table of Contents</p>
        <h2 className={cn("relative mt-2 text-large-title", theme.text)}>Contents</h2>
        <div className="relative mx-auto mt-3 flex items-center justify-center gap-3">
          <span className="h-px w-10 bg-separator-strong" />
          <span className="text-xs tabular-nums text-label-tertiary">{entries.length} chapters</span>
          <span className="h-px w-10 bg-separator-strong" />
        </div>

        {entries.length > 10 && (
          <label className="relative mx-auto mt-5 flex h-8 max-w-72 items-center gap-2 rounded-full bg-fill-tertiary px-3 transition-shadow duration-150 focus-within:ring-2 focus-within:ring-brand/40">
            <Search className="size-3.5 shrink-0 text-label-tertiary" strokeWidth={1.75} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chapters"
              className="min-w-0 flex-1 bg-transparent text-sm text-label outline-none placeholder:text-label-tertiary"
            />
            {search ? (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="focus-ring flex size-4 shrink-0 items-center justify-center rounded-full bg-label-tertiary text-canvas transition-colors hover:bg-label-secondary"
              >
                <X className="size-2.5" strokeWidth={3} />
              </button>
            ) : (
              <kbd className="shrink-0 rounded-xs bg-fill-tertiary px-1.5 py-px text-2xs font-medium text-label-tertiary">Ctrl F</kbd>
            )}
          </label>
        )}
      </div>

      {/* ── Entries ────────────────────────────────── */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto pb-6">
        <div {...hover.handlers} className="relative mx-auto max-w-2xl">
          <FluidHoverHighlight hover={hover} className="rounded-md" />
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-label-tertiary">
              <Search className="mb-3 size-8 opacity-40" strokeWidth={1.5} />
              <p className="text-xs">{search ? "No matching entries" : "No entries found"}</p>
            </div>
          ) : (
            filtered.map((entry, i) => {
              const isCurrent = entry.chapterIndex === currentChapter;
              return (
                <button
                  key={i}
                  data-fluid-item
                  onClick={() => onSelectChapter(entry.chapterIndex)}
                  className="focus-ring group relative flex h-10 w-full items-center gap-3 rounded-md px-3 text-left"
                >
                  <span
                    className={cn(
                      "w-7 shrink-0 text-right text-xs tabular-nums transition-colors duration-150",
                      isCurrent ? "font-semibold text-brand" : "text-label-tertiary group-hover:text-label-secondary",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 truncate font-display text-base transition-opacity duration-150",
                      isCurrent ? "font-semibold text-brand" : cn(theme.text, "opacity-85 group-hover:opacity-100"),
                    )}
                  >
                    {entry.displayLabel}
                  </span>
                  {/* Dotted leader */}
                  <span aria-hidden className="mx-1 h-px min-w-6 flex-1 translate-y-1 border-b border-dotted border-separator-strong" />
                  {isCurrent ? (
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand/15 px-2 py-0.5 text-2xs font-semibold text-brand">
                      <span className="size-1.5 rounded-full bg-brand" />
                      Reading
                    </span>
                  ) : (
                    <ChevronRight
                      className="size-4 shrink-0 -translate-x-1 text-label-tertiary opacity-0 transition-all duration-200 ease-apple group-hover:translate-x-0 group-hover:opacity-100"
                      strokeWidth={1.75}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
