"use client";

/**
 * SearchOverlay — Spotlight for your library.
 *
 * Adapted from 21st.dev "Apple Spotlight" (samitkapoor, id 9513 — the big
 * pill field that morphs into a results sheet, blur-in placeholder) and
 * "Command Palette" (ebnsina, id 44074 — grouped results, a single highlight
 * that glides between options, pointer-follows-highlight, Kbd footer).
 * Re-tokenised to Codex glass; search logic unchanged.
 */

import { useState, useRef, useEffect, useCallback, useMemo, useId } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search, CornerDownLeft, BookOpen } from "lucide-react";
import type { MockItem, LibraryData } from "@/lib/mock-data";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  bookData: LibraryData;
  comicData: LibraryData;
  /** Optional: open the chosen result (Enter / click). */
  onOpenItem?: (item: MockItem) => void;
}

interface SearchResult {
  section: string;
  item: MockItem;
}

function getAllItems(bookData: LibraryData, comicData: LibraryData): SearchResult[] {
  const results: SearchResult[] = [];
  for (const items of Object.values(bookData)) {
    if (items) items.forEach((item) => results.push({ section: "Books", item }));
  }
  for (const items of Object.values(comicData)) {
    if (items) items.forEach((item) => results.push({ section: "Comics", item }));
  }
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.item.title)) return false;
    seen.add(r.item.title);
    return true;
  });
}

function highlightMatch(text: string, query: string, onAccent: boolean) {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className={cn("font-semibold", onAccent ? "underline decoration-1 underline-offset-2" : "text-brand")}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

const PANEL_SPRING = { type: "spring", stiffness: 520, damping: 40, mass: 0.8 } as const;

export function SearchOverlay({ open, onClose, bookData, comicData, onOpenItem }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const highlightId = useId();
  const reduce = useReducedMotion();

  useEffect(() => setMounted(true), []);

  const allItems = useMemo(() => getAllItems(bookData, comicData), [bookData, comicData]);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allItems.filter(
      (r) =>
        r.item.title.toLowerCase().includes(q) ||
        r.item.author.toLowerCase().includes(q)
    );
  }, [query, allItems]);

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

  const openResult = useCallback(
    (r: SearchResult | undefined) => {
      if (!r || !onOpenItem) return;
      onOpenItem(r.item);
      onClose();
    },
    [onOpenItem, onClose]
  );

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
      if (e.key === "Enter") {
        e.preventDefault();
        openResult(filtered[selectedIndex]);
      }
    },
    [onClose, filtered, selectedIndex, openResult]
  );

  if (!mounted) return null;

  const hasResults = filtered.length > 0;
  const hasQuery = query.trim().length > 0;
  let flatIndex = 0;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div key="spotlight" className="fixed inset-0 z-[100] flex justify-center" onKeyDown={handleKeyDown}>
          {/* Scrim — light, Spotlight never blacks out the desktop */}
          <motion.div
            className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search library"
            className={cn(
              "glass-thick grain relative mt-[16vh] flex h-fit w-full max-w-160 flex-col overflow-hidden text-label transition-[border-radius] duration-300 ease-apple",
              hasQuery ? "rounded-2xl" : "rounded-3xl",
            )}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scaleX: 1.04, scaleY: 0.96, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, scaleX: 1, scaleY: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98, filter: "blur(6px)" }}
            transition={reduce ? { duration: 0 } : PANEL_SPRING}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Field */}
            <div className="flex h-16 shrink-0 items-center gap-3.5 px-5">
              <Search className="size-5 shrink-0 text-label-tertiary" strokeWidth={2} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or author"
                spellCheck={false}
                role="combobox"
                aria-expanded={hasResults}
                aria-autocomplete="list"
                className="min-w-0 flex-1 bg-transparent text-xl font-normal tracking-tight text-label outline-none placeholder:text-label-tertiary"
              />
              <Kbd>esc</Kbd>
            </div>

            {/* Results sheet */}
            <AnimatePresence initial={false}>
              {hasQuery && (
                <motion.div
                  key="sheet"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.12, duration: 0.42 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-separator" />

                  <div ref={resultsRef} role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
                    {!hasResults && (
                      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                        <span className="inline-flex size-11 items-center justify-center rounded-full bg-fill-tertiary text-label-tertiary">
                          <BookOpen className="size-5" strokeWidth={1.75} />
                        </span>
                        <div>
                          <p className="text-base font-medium text-label">No matches</p>
                          <p className="mt-1 text-xs text-label-secondary">
                            Nothing in your library matches &ldquo;{query}&rdquo;.
                          </p>
                        </div>
                      </div>
                    )}

                    {Array.from(grouped.entries()).map(([section, items]) => (
                      <div key={section} role="group" aria-label={section} className="pb-1">
                        <div className="flex h-7 items-center justify-between px-2.5">
                          <span className="text-section">{section}</span>
                          <span className="text-2xs tabular-nums text-label-quaternary">{items.length}</span>
                        </div>

                        {items.map((r) => {
                          const idx = flatIndex++;
                          const isSelected = idx === selectedIndex;
                          return (
                            <div
                              key={r.item.title}
                              role="option"
                              aria-selected={isSelected}
                              data-selected={isSelected}
                              onPointerMove={() => idx !== selectedIndex && setSelectedIndex(idx)}
                              onClick={() => openResult(r)}
                              className={cn(
                                "relative flex h-14 cursor-default items-center gap-3 rounded-lg px-2.5",
                                onOpenItem && "cursor-pointer",
                              )}
                            >
                              {isSelected && (
                                <motion.span
                                  layoutId={highlightId}
                                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 42 }}
                                  className="absolute inset-0 rounded-lg bg-brand shadow-[0_0_24px_-8px_var(--accent-brand)]"
                                />
                              )}

                              {/* Cover */}
                              <div className="relative h-10 w-7 shrink-0 overflow-hidden rounded-xs shadow-sm hairline">
                                {r.item.cover ? (
                                  <img
                                    src={r.item.cover}
                                    alt=""
                                    className="size-full bg-fill-tertiary object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="size-full" style={{ background: r.item.gradient }} />
                                )}
                              </div>

                              {/* Text */}
                              <div className={cn("relative min-w-0 flex-1", isSelected ? "text-brand-fg" : "text-label")}>
                                <p className="truncate text-sm font-medium">
                                  {highlightMatch(r.item.title, query, isSelected)}
                                </p>
                                <p
                                  className={cn(
                                    "mt-0.5 truncate text-xs",
                                    isSelected ? "text-brand-fg/75" : "text-label-secondary",
                                  )}
                                >
                                  {highlightMatch(r.item.author, query, isSelected)}
                                </p>
                              </div>

                              <span
                                className={cn(
                                  "relative inline-flex h-5 shrink-0 items-center rounded-full px-2 text-2xs font-semibold tracking-wide uppercase",
                                  isSelected ? "bg-brand-fg/20 text-brand-fg" : "bg-fill-tertiary text-label-secondary",
                                )}
                              >
                                {r.item.format}
                              </span>

                              <CornerDownLeft
                                className={cn(
                                  "relative size-3.5 shrink-0 transition-opacity duration-150",
                                  isSelected ? "text-brand-fg/80 opacity-100" : "opacity-0",
                                )}
                                strokeWidth={2}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex h-10 items-center justify-between border-t border-separator px-4 text-2xs text-label-tertiary">
                    <span className="tabular-nums">
                      {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-3.5">
                      <span className="flex items-center gap-1.5">
                        <span className="flex gap-0.5">
                          <Kbd>↑</Kbd>
                          <Kbd>↓</Kbd>
                        </span>
                        Navigate
                      </span>
                      {onOpenItem && (
                        <span className="flex items-center gap-1.5">
                          <Kbd>↵</Kbd>
                          Open
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Kbd>esc</Kbd>
                        Close
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
