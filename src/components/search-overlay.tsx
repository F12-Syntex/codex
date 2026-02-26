"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, CornerDownLeft } from "lucide-react";
import { bookData, mangaData, type MockItem } from "@/lib/mock-data";

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
  for (const items of Object.values(bookData)) {
    if (items) items.forEach((item) => results.push({ section: "Books", item }));
  }
  for (const items of Object.values(mangaData)) {
    if (items) items.forEach((item) => results.push({ section: "Manga", item }));
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
      <span style={{ color: "var(--accent-brand)" }} className="font-semibold">
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
      className="overlay-backdrop fixed inset-0 z-50 flex justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="overlay-panel mt-[20vh] h-fit w-full max-w-[520px] px-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 rounded-lg bg-[var(--bg-overlay)]/80 px-4 py-3 shadow-lg shadow-black/20 backdrop-blur-xl border border-white/[0.06]">
          <Search className="h-4 w-4 shrink-0 text-white/30" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            spellCheck={false}
            className="flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/25"
          />
          {hasQuery && (
            <span className="text-[11px] text-white/20">{filtered.length} results</span>
          )}
        </div>

        {/* Results dropdown */}
        {(hasResults || (hasQuery && !hasResults)) && (
          <div
            ref={resultsRef}
            className="mt-2 max-h-[45vh] overflow-y-auto rounded-lg border border-white/[0.06] bg-[var(--bg-overlay)] shadow-lg shadow-black/20"
          >
            {hasQuery && !hasResults && (
              <div className="px-4 py-8 text-center">
                <p className="text-[13px] text-white/25">
                  Nothing found for <span className="text-white/40">&ldquo;{query}&rdquo;</span>
                </p>
              </div>
            )}

            {Array.from(grouped.entries()).map(([section, items]) => (
              <div key={section} className="p-1.5">
                <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-white/20">
                  {section}
                </p>
                {items.map((r) => {
                  const idx = flatIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={r.item.title}
                      data-selected={isSelected}
                      className="relative flex cursor-default items-center gap-3 rounded-lg px-2.5 py-2 transition-colors"
                      style={
                        isSelected
                          ? { backgroundColor: "var(--accent-brand-subtle)" }
                          : undefined
                      }
                    >
                      {isSelected && (
                        <div
                          className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full"
                          style={{ backgroundColor: "var(--accent-brand)" }}
                        />
                      )}
                      <div
                        className="relative h-9 w-6 shrink-0 overflow-hidden rounded-lg"
                        style={{ background: r.item.gradient }}
                      >
                        <img src={r.item.cover} alt={r.item.title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                        <div className="absolute inset-0 shadow-[inset_0_0_10px_rgba(0,0,0,0.25)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-white/80">
                          {highlightMatch(r.item.title, query)}
                        </p>
                        <p className="truncate text-[11px] text-white/30">
                          {highlightMatch(r.item.author, query)}
                        </p>
                      </div>
                      {isSelected && (
                        <CornerDownLeft className="h-3 w-3 shrink-0 text-white/15" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
