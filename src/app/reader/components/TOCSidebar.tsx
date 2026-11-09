"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { fmtCh } from "@/lib/chapter-labels";
import { X, Search, List, Bookmark, Sparkles, Paintbrush, BookMarked, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FluidHoverHighlight, useFluidHover } from "@/components/ui/fluid-hover-highlight";
import { PANEL_SPRING, LAYOUT_SPRING, stopNavKeys } from "./chrome";
import type { BookChapter, ReaderBookmark, ThemeClasses } from "../lib/types";

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
  chapterLabels?: Record<number, number>;
  onSelectChapter: (index: number) => void;
  onJumpToBookmark: (bookmark: ReaderBookmark) => void;
  onDeleteBookmark: (id: number) => void;
  onClose: () => void;
}

// Remember scroll position across open/close cycles
let savedScrollTop: number | null = null;

export function TOCSidebar({
  chapters,
  currentChapter,
  bookmarks,
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
  chapterLabels = {},
  onSelectChapter,
  onJumpToBookmark,
  onDeleteBookmark,
  onClose,
}: TOCSidebarProps) {
  const reduceMotion = useReducedMotion();
  const hover = useFluidHover();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("chapters");
  const [searchQuery, setSearchQuery] = useState("");
  const [renderLimit, setRenderLimit] = useState(60);

  const hasRestoredScroll = useRef(false);

  // Expand render limit after first paint so the sidebar opens instantly
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRenderLimit(Infinity));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Reset limit when search changes so results appear immediately
  useEffect(() => { setRenderLimit(searchQuery ? Infinity : 60); }, [searchQuery]);

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

  // Restore saved scroll position or scroll to current chapter
  // Runs when renderLimit changes so it fires after the full list renders
  useEffect(() => {
    if (!listRef.current || searchQuery || tab !== "chapters") return;
    if (hasRestoredScroll.current) return;
    if (renderLimit < Infinity) return; // wait for full render
    hasRestoredScroll.current = true;
    if (savedScrollTop !== null) {
      listRef.current.scrollTop = savedScrollTop;
    } else {
      const activeItem = listRef.current.querySelector("[data-active-chapter]");
      activeItem?.scrollIntoView({ block: "center" });
    }
  }, [renderLimit, searchQuery, tab]);

  // Continuously track scroll position so it's always up to date
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handler = () => { savedScrollTop = el.scrollTop; };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  // Focus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const progressPct = chapters.length > 0 ? ((currentChapter + 1) / chapters.length) * 100 : 0;
  const currentNo = fmtCh(currentChapter, chapterLabels) ?? currentChapter + 1;

  return (
    <motion.div
      ref={sidebarRef}
      initial={reduceMotion ? false : { opacity: 0, x: -20, scale: 0.98, filter: "blur(4px)" }}
      animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: -14, scale: 0.98, filter: "blur(2px)", transition: { duration: 0.16 } }}
      transition={PANEL_SPRING}
      onKeyDown={stopNavKeys}
      className="glass-thin grain absolute bottom-3 left-3 top-1 z-20 flex w-80 origin-left flex-col overflow-hidden rounded-2xl shadow-lg"
    >
      {/* ── Header ─────────────────────────────────── */}
      <div className="relative shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold leading-tight text-label">Contents</h2>
            <p className="mt-0.5 text-xs tabular-nums text-label-tertiary">
              Chapter {currentNo} of {chapters.length} · {Math.round(progressPct)}%
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close contents"
            className="focus-ring pressable flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary transition-colors duration-150 hover:bg-fill-secondary hover:text-label"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </div>

        {/* Book progress */}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-fill-secondary">
          <motion.div
            className="h-full origin-left rounded-full bg-brand"
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: progressPct / 100 }}
            transition={{ type: "spring", bounce: 0, duration: 0.8, delay: 0.1 }}
          />
        </div>

        <SegmentedControl
          className="mt-4"
          size="sm"
          fill
          value={tab}
          onValueChange={setTab}
          options={[
            { value: "chapters", label: "Chapters", icon: <List strokeWidth={1.75} /> },
            {
              value: "bookmarks",
              label: "Bookmarks",
              icon: <Bookmark strokeWidth={1.75} />,
              badge: bookmarks.length > 0 ? bookmarks.length : undefined,
            },
          ]}
        />

        {/* Search */}
        <label className="mt-2.5 flex h-8 items-center gap-2 rounded-full bg-fill-tertiary px-3 transition-shadow duration-150 focus-within:ring-2 focus-within:ring-brand/40">
          <Search className="size-3.5 shrink-0 text-label-tertiary" strokeWidth={1.75} />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tab === "chapters" ? "Search chapters" : "Search bookmarks"}
            className="min-w-0 flex-1 bg-transparent text-sm text-label outline-none placeholder:text-label-tertiary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="focus-ring flex size-4 shrink-0 items-center justify-center rounded-full bg-label-tertiary text-canvas transition-colors hover:bg-label-secondary"
            >
              <X className="size-2.5" strokeWidth={3} />
            </button>
          )}
        </label>
      </div>

      <div className="mx-4 h-px shrink-0 bg-separator" />

      {/* ── Content ────────────────────────────────── */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        <div {...hover.handlers} className="relative p-2">
          <FluidHoverHighlight hover={hover} className="rounded-md" />
          {tab === "chapters" ? (
            filteredChapters.length === 0 ? (
              <p className="py-10 text-center text-xs text-label-tertiary">No chapters match “{searchQuery}”</p>
            ) : (
              filteredChapters.slice(0, renderLimit).map(({ i, displayTitle }) => {
                const canEnrich = enrichEnabled;
                const isEnriching = enrichingChapter === i;

                const canFormat = formattingEnabled && !formattedChapters[i];
                const isFormatting = formattingChapter === i;

                const isEnriched = !!enrichedNames[i];
                const isFormatted = !!formattedChapters[i];
                const isWikiProcessed = wikiProcessedChapters.has(i);
                const hasIndicators = (enrichEnabled && isEnriched) || (formattingEnabled && isFormatted) || (wikiEnabled && isWikiProcessed);
                const isCurrent = i === currentChapter;
                const isRead = i < currentChapter;

                return (
                  <div
                    key={i}
                    data-fluid-item
                    {...(isCurrent ? { "data-active-chapter": true } : {})}
                    className="group relative flex h-8 w-full items-center gap-2 rounded-md pl-1.5 pr-1.5"
                  >
                    {isCurrent && (
                      <motion.span
                        layoutId="toc-current-chapter"
                        transition={LAYOUT_SPRING}
                        className="absolute inset-0 rounded-md bg-brand/15"
                      />
                    )}

                    {/* Progress tick */}
                    <span className="relative flex w-2 shrink-0 justify-center" aria-hidden>
                      {isCurrent ? (
                        <span className="size-1.5 rounded-full bg-brand shadow-[0_0_8px_0_var(--accent-brand)]" />
                      ) : (
                        <span className={cn("h-3 w-0.5 rounded-full", isRead ? "bg-brand/45" : "bg-fill")} />
                      )}
                    </span>

                    <span
                      className={cn(
                        "relative w-6 shrink-0 text-right text-2xs tabular-nums",
                        isCurrent ? "font-semibold text-brand" : "text-label-tertiary",
                      )}
                    >
                      {fmtCh(i, chapterLabels) ?? ""}
                    </span>

                    <button
                      onClick={() => { onSelectChapter(i); onClose(); }}
                      className={cn(
                        "focus-ring relative flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left text-sm",
                        isCurrent ? "font-medium text-brand" : isRead ? "text-label-tertiary" : "text-label",
                      )}
                      title={displayTitle}
                    >
                      <span className="truncate">{displayTitle}</span>
                      {hasIndicators && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-brand/60">
                          {enrichEnabled && isEnriched && <Sparkles className="size-3" strokeWidth={2} />}
                          {formattingEnabled && isFormatted && <Paintbrush className="size-3" strokeWidth={2} />}
                          {wikiEnabled && isWikiProcessed && <BookMarked className="size-3" strokeWidth={2} />}
                        </span>
                      )}
                    </button>

                    {(isEnriching || isFormatting) && (
                      <Loader2 className="relative size-3.5 shrink-0 animate-spin text-brand" strokeWidth={1.75} />
                    )}
                    {canEnrich && !isEnriching && !isFormatting && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onEnrichChapter?.(i); }}
                        className="focus-ring relative flex size-6 shrink-0 items-center justify-center rounded-full text-brand opacity-0 transition-[opacity,background-color] duration-150 hover:bg-brand/15 focus-visible:opacity-100 group-hover:opacity-100"
                        title="Rename with AI"
                      >
                        <Sparkles className="size-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                    {canFormat && !isEnriching && !isFormatting && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onFormatChapter?.(i); }}
                        className="focus-ring relative flex size-6 shrink-0 items-center justify-center rounded-full text-brand opacity-0 transition-[opacity,background-color] duration-150 hover:bg-brand/15 focus-visible:opacity-100 group-hover:opacity-100"
                        title="Format with AI"
                      >
                        <Paintbrush className="size-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                );
              })
            )
          ) : filteredBookmarks.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <div className="mb-3 grid size-11 place-items-center rounded-full bg-fill-tertiary text-label-tertiary">
                <Bookmark className="size-5" strokeWidth={1.75} />
              </div>
              <p className="text-headline text-label">{searchQuery ? "No matches" : "No bookmarks yet"}</p>
              <p className="mt-1 text-xs text-label-tertiary">
                Press <kbd className="rounded-xs bg-fill-tertiary px-1 py-px text-2xs font-medium text-label-secondary">Ctrl B</kbd> on any page
              </p>
            </div>
          ) : (
            filteredBookmarks.map((bm) => (
              <div
                key={bm.id}
                data-fluid-item
                className="group relative flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5"
              >
                <Bookmark className="relative size-4 shrink-0 fill-brand/20 text-brand" strokeWidth={1.75} />
                <button
                  onClick={() => {
                    onJumpToBookmark(bm);
                    onClose();
                  }}
                  className="focus-ring relative flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm text-left"
                >
                  <span className="truncate text-sm text-label">{bm.label}</span>
                  <span className="text-2xs tabular-nums text-label-tertiary">
                    Chapter {bm.chapterIndex + 1} · Page {bm.paragraphIndex + 1}
                  </span>
                </button>
                <button
                  onClick={() => onDeleteBookmark(bm.id)}
                  aria-label="Delete bookmark"
                  className="focus-ring relative flex size-6 shrink-0 items-center justify-center rounded-full text-label-tertiary opacity-0 transition-[opacity,color,background-color] duration-150 hover:bg-fill-tertiary hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
