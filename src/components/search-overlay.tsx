"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, ArrowRight, BookOpen, Hash } from "lucide-react";
import { initialBookData, initialComicData, type MockItem } from "@/lib/mock-data";

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface SearchResult {
  section: string;
  item: MockItem;
}

function getAllItems(): SearchResult[] {
  const results: SearchResult[] = [];
  for (const items of Object.values(initialBookData)) {
    if (items) items.forEach((item) => results.push({ section: "Books", item }));
  }
  for (const items of Object.values(initialComicData)) {
    if (items) items.forEach((item) => results.push({ section: "Comics", item }));
  }
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.item.title)) return false;
    seen.add(r.item.title);
    return true;
  });
}

const allItems = getAllItems();

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: "var(--accent-brand)" }} className="font-medium">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allItems.filter(
      (r) =>
        r.item.title.toLowerCase().includes(q) ||
        r.item.author.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of filtered) {
      const arr = map.get(r.section) || [];
      arr.push(r);
      map.set(r.section, arr);
    }
    return map;
  }, [filtered]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!resultsRef.current) return;
    const el = resultsRef.current.querySelector("[data-selected='true']");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
    },
    [onClose, filtered.length]
  );

  if (!open) return null;

  let flatIndex = 0;
  const hasResults = filtered.length > 0;
  const hasQuery = query.trim().length > 0;

  return createPortal(
    <div
      className="overlay-backdrop fixed inset-0 z-50 flex justify-center bg-black/50 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="overlay-panel mt-[18vh] h-fit w-full max-w-[560px] px-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[var(--bg-overlay)] shadow-2xl shadow-black/40">
          {/* Search input */}
          <div className="flex items-center gap-3 px-5 py-4">
            <Search className="h-5 w-5 shrink-0 text-white/20" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your library..."
              spellCheck={false}
              className="flex-1 bg-transparent text-[15px] text-white/90 outline-none placeholder:text-white/20"
            />
            <kbd className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/20">ESC</kbd>
          </div>

          {/* Divider + results */}
          {(hasResults || hasQuery) && (
            <>
              <div className="mx-4 h-px bg-white/[0.06]" />

              <div ref={resultsRef} className="max-h-[50vh] overflow-y-auto py-2">
                {/* No results */}
                {hasQuery && !hasResults && (
                  <div className="flex flex-col items-center gap-2 px-4 py-10">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04]">
                      <Search className="h-4 w-4 text-white/15" />
                    </div>
                    <p className="text-[13px] text-white/30">
                      No results for &ldquo;<span className="text-white/50">{query}</span>&rdquo;
                    </p>
                  </div>
                )}

                {/* Grouped results */}
                {Array.from(grouped.entries()).map(([section, items]) => (
                  <div key={section}>
                    <div className="flex items-center gap-2 px-5 pb-1 pt-3">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-white/20">
                        {section}
                      </span>
                      <span className="text-[11px] text-white/10">{items.length}</span>
                    </div>

                    <div className="px-2">
                      {items.map((r) => {
                        const idx = flatIndex++;
                        const isSelected = idx === selectedIndex;
                        return (
                          <div
                            key={r.item.title}
                            data-selected={isSelected}
                            className={`flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                              isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                            }`}
                          >
                            {/* Cover thumbnail */}
                            <div className="relative h-11 w-8 shrink-0 overflow-hidden rounded-md">
                              <img
                                src={r.item.cover}
                                alt={r.item.title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>

                            {/* Text */}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium text-white/80">
                                {highlightMatch(r.item.title, query)}
                              </p>
                              <div className="mt-0.5 flex items-center gap-2">
                                <p className="truncate text-[11px] text-white/30">
                                  {highlightMatch(r.item.author, query)}
                                </p>
                                <span className="shrink-0 rounded-[4px] bg-white/[0.06] px-1.5 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-white/30">
                                  {r.item.format}
                                </span>
                              </div>
                            </div>

                            {/* Arrow for selected */}
                            {isSelected && (
                              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/20" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              {hasResults && (
                <>
                  <div className="mx-4 h-px bg-white/[0.06]" />
                  <div className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-[11px] text-white/15">
                      {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-3 text-[11px] text-white/15">
                      <span className="flex items-center gap-1">
                        <kbd className="rounded bg-white/[0.06] px-1 py-px text-[10px]">&uarr;&darr;</kbd>
                        navigate
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded bg-white/[0.06] px-1 py-px text-[10px]">&crarr;</kbd>
                        open
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Empty state — no query yet */}
          {!hasQuery && (
            <>
              <div className="mx-4 h-px bg-white/[0.06]" />
              <div className="flex flex-col items-center gap-2 px-4 py-10">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04]">
                  <BookOpen className="h-4 w-4 text-white/15" />
                </div>
                <p className="text-[13px] text-white/25">Search by title or author</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
