"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  BookOpen,
  Clock,
  BookOpenCheck,
  CheckCircle,
  Trash2,
  ArrowRightLeft,
  Check,
  ChevronLeft,
  FolderOpen,
  Info,
  Library,
  ListFilter,
  Plus,
  Sparkles,
} from "lucide-react";
import { BLOOM_MASK, BookCard, coverRadius, extractDominantColor, SPINE_STYLE } from "./book-card";
import { SelectionBar } from "./selection-bar";
import { ToolbarScrollContext } from "./content-toolbar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BLUR_FADE_LIMIT, BlurFade, blurFadeDelay } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassModal } from "@/components/ui/glass-modal";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Tilt } from "@/components/ui/tilt";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { ViewMode } from "./content-toolbar";
import type { CoverStyle } from "@/lib/theme";
import type { MockItem } from "@/lib/mock-data";
import type { Section, NavView } from "@/components/sidebar/app-sidebar";
import { cn } from "@/lib/utils";
import { bookProgress } from "@/lib/reading-progress";

interface ContentGridProps {
  items: MockItem[];
  viewMode: ViewMode;
  coverStyle: CoverStyle;
  showFormatBadge: boolean;
  onMoveItem: (id: number, targetView: NavView) => void;
  onDeleteItem: (id: number) => void;
  onTransferItem: (id: number, targetSection: Section) => void;
  onOpenItem?: (item: MockItem) => void;
  onViewDetails?: (item: MockItem) => void;
  activeView: NavView;
  section: Section;
  selectedIds: Set<number>;
  onToggleSelect: (id: number, shiftKey: boolean) => void;
  onClearSelection: () => void;
  onBatchDelete: (ids: Set<number>) => void;
  onBatchMove: (ids: Set<number>, targetView: NavView) => void;
  readingProgress?: Record<string, { chapter: number; totalChapters: number }>;
  /** Optional — shows an Import action in the Bookshelf / Series empty state. */
  onImport?: () => void;
  /** Active format filter (e.g. "PDF"); the empty state then talks about it. */
  filterLabel?: string;
  /** Clears the format filter (offered by the filtered empty state). */
  onClearFilter?: () => void;
  /**
   * Optional page header (pass `<ContentToolbar … />`). When given it renders
   * inside the scroll area: the title scrolls away and the toolbar's control
   * cluster stays pinned on an Edge Blur strip.
   */
  header?: React.ReactNode;
  /** Accepted series of a book (Series view grouping + "Vol. n" badges). */
  seriesOf?: (filePath: string) => { name: string; number: number | null } | undefined;
  /** Offered by the Series view when nothing is grouped yet. */
  onDetectSeries?: () => void;
}

type ReadingProgress = Record<string, { chapter: number; totalChapters: number }>;

const bookMoveTargets: { view: NavView; label: string; icon: typeof Clock }[] = [
  { view: "bookshelf", label: "Bookshelf", icon: BookOpen },
  { view: "read-later", label: "Read Later", icon: Clock },
  { view: "reading", label: "Reading", icon: BookOpenCheck },
  { view: "finished", label: "Finished", icon: CheckCircle },
];

const comicMoveTargets: { view: NavView; label: string; icon: typeof Clock }[] = [
  { view: "series", label: "Series", icon: BookOpen },
  { view: "read-later", label: "Read Later", icon: Clock },
  { view: "reading", label: "Reading", icon: BookOpenCheck },
  // Label only: the id stays `completed`. "Finished" everywhere in the UI.
  { view: "completed", label: "Finished", icon: CheckCircle },
];

/** Grid page rhythm (conventions §5): shared 32px gutter, clears the dock. */
const COVER_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-8";
const PAGE_PAD = "px-8 pt-3 pb-36";
/* No `mask-image` on the scroller: a masked ancestor is a Backdrop Root and
   would kill the glass inside it (cards, badges). The pinned toolbar's Edge
   Blur strip softens content as it slides under the header instead. */

/**
 * Entrance props for the i-th item: 30ms stagger capped at 12 (conventions
 * §8); past BLUR_FADE_LIMIT items render static, so a 1,000-book library
 * doesn't start 1,000 filter animations on every view switch.
 */
const fade = (i: number) => ({ delay: blurFadeDelay(i), skip: i >= BLUR_FADE_LIMIT });

/** Small thumbnail radius: rounded covers → rounded-sm, sharp → rounded-xs. */
const thumbRadius = (coverStyle: CoverStyle) => (coverStyle === "rounded" ? "rounded-sm" : "rounded-xs");

/* ── Shared pieces ──────────────────────────────────────── */

/**
 * Book progress for a library card: the one formula (`@/lib/reading-progress`, shared with the
 * reader). Position alone tops out at 99%; 100% means the book is on the Finished shelf.
 */
function bookPct(progress: ReadingProgress, filePath: string, finished = false): number | null {
  const p = progress[filePath];
  if (!p || p.totalChapters <= 0) return null;
  return bookProgress({ chapterIndex: p.chapter, totalChapters: p.totalChapters, finished });
}

/** "Chapter 8 of 20 · 35%" — the one progress caption. */
function progressCaption(progress: ReadingProgress, filePath: string, finished = false): string | null {
  const pct = bookPct(progress, filePath, finished);
  if (pct == null) return null;
  const p = progress[filePath];
  return `Chapter ${Math.min(p.chapter + 1, p.totalChapters)} of ${p.totalChapters} · ${Math.round(pct)}%`;
}

/** Shelves whose books count as finished (100%). */
const isFinishedView = (view: NavView) => view === "finished" || view === "completed";

function CoverThumb({
  item,
  className,
  onImageLoad,
}: {
  item: MockItem;
  className?: string;
  onImageLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-fill-tertiary", className)}>
      {item.cover ? (
        <img
          src={item.cover}
          alt={item.title}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onLoad={onImageLoad}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: item.gradient }} />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={SPINE_STYLE} />
      <div aria-hidden className="pointer-events-none absolute inset-0 hairline" style={{ borderRadius: "inherit" }} />
    </div>
  );
}

function SelectCheck({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
        selected ? "bg-brand text-brand-fg" : "shadow-[inset_0_0_0_1.5px_var(--separator-strong)]",
      )}
    >
      {selected && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

/** List-row progress: the shared ProgressBar plus a percentage. */
function ProgressBarInline({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ProgressBar value={pct} className="flex-1" />
      <span className="w-8 text-right text-2xs text-label-secondary tabular-nums">{Math.round(pct)}%</span>
    </div>
  );
}

/** Serif section header — editorial rhythm between shelves. No counts. */
function SectionHeader({ title }: { title: string }) {
  return <h2 className="text-title mb-4 font-display text-label">{title}</h2>;
}

/**
 * Library scroll region. With a `header`, renders it first inside the scroll
 * content and tells it (via ToolbarScrollContext) whether content has
 * scrolled under it.
 */
function LibraryScroll({
  header,
  children,
}: {
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const hasHeader = header != null;

  useEffect(() => {
    if (!hasHeader) return;
    const viewport = ref.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;
    const update = () => setScrolled(viewport.scrollTop > 4);
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    return () => viewport.removeEventListener("scroll", update);
  }, [hasHeader]);

  const ctx = useMemo(() => ({ scrolled }), [scrolled]);

  return (
    <ScrollArea ref={ref} className="min-h-0 flex-1">
      {hasHeader && <ToolbarScrollContext.Provider value={ctx}>{header}</ToolbarScrollContext.Provider>}
      {children}
    </ScrollArea>
  );
}

/* ── Empty states — copy and action per view ─────────────── */
function emptyStateFor(view: NavView, section: Section) {
  const isComics = section === "comic";
  const noun = isComics ? "comic" : "book";
  switch (view) {
    case "read-later":
      return {
        icon: Clock,
        title: "Nothing saved for later",
        description: `Right-click any ${noun} and choose Move to › Read Later.`,
        canImport: false,
      };
    case "reading":
      return {
        icon: BookOpenCheck,
        title: "Nothing in progress",
        description: `Open a ${noun} and it will wait for you here.`,
        canImport: false,
      };
    case "finished":
    case "completed":
      return {
        icon: CheckCircle,
        title: isComics ? "No finished comics yet" : "No finished books yet",
        description: `${isComics ? "Comics" : "Books"} you finish are collected here.`,
        canImport: false,
      };
    default:
      return {
        icon: Library,
        title: isComics ? "No series here yet" : "Your shelf is empty",
        description: isComics
          ? "Import CBZ or CBR archives and they’ll line up here, ready to read."
          : "Import EPUB, PDF or MOBI files and they’ll line up here, ready to read.",
        canImport: true,
      };
  }
}

/* ── Continue Reading — the hero ───────────────────────────
   One in-progress book spans the content width; two or three share the row
   (auto-fit). The card re-grades to its cover: a soft bloom in the cover's
   dominant colour sits behind it (21st.dev "Hero Carousel", crafterui,
   id 24752). */
function ContinueCard({
  item,
  coverStyle,
  pct,
  caption,
  selected,
  onResume,
}: {
  item: MockItem;
  coverStyle: CoverStyle;
  pct: number;
  caption: string | null;
  selected: boolean;
  onResume?: () => void;
}) {
  const radius = coverStyle === "rounded" ? "rounded-md" : "rounded-xs";
  const [glow, setGlow] = useState<string>(item.gradient);
  const extracted = useRef(false);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (extracted.current) return;
    extracted.current = true;
    try {
      setGlow(extractDominantColor(e.currentTarget));
    } catch {
      // cross-origin or decode error — keep the gradient
    }
  }, []);

  return (
    <SpotlightCard
      className={cn(
        "glass-thin grain flex h-full min-h-44 items-center gap-5 overflow-hidden rounded-2xl p-5 transition-shadow duration-200",
        selected && "shadow-[inset_0_0_0_1.5px_var(--accent-brand)]",
      )}
    >
      {/* Cover-colour bloom behind the cover */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 -left-20 -z-10 size-96 -translate-y-1/2 rounded-full opacity-25 blur-2xl transition-[background] duration-700 ease-apple"
        style={{ background: `radial-gradient(closest-side, ${glow}, transparent)` }}
      />

      <Tilt maxTilt={5} glare className={cn("shrink-0", radius)}>
        <CoverThumb
          item={item}
          onImageLoad={handleImageLoad}
          className={cn("aspect-[2/3] w-24 shadow-cover", radius)}
        />
      </Tilt>

      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        <div className="min-w-0">
          <p className="text-title line-clamp-2 font-display text-label" title={item.title}>{item.title}</p>
          <p className="mt-1 truncate text-sm text-label-secondary">{item.author}</p>
        </div>

        <div className="mt-auto flex items-end gap-4 pt-4">
          <div className="w-full max-w-72 min-w-0 flex-1">
            <ProgressBar value={pct} />
            <p className="mt-2 truncate text-xs text-label-secondary tabular-nums">
              {caption ?? `${Math.round(pct)}%`}
            </p>
          </div>
          <Button
            size="sm"
            className="ml-auto"
            disabled={!onResume}
            onClick={(e) => {
              e.stopPropagation();
              onResume?.();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <BookOpen strokeWidth={2} />
            Resume
          </Button>
        </div>
      </div>
    </SpotlightCard>
  );
}

/* ── Item context menu wrapper ──────────────────────────── */
function ItemContextMenu({
  itemId,
  filePath,
  activeView,
  section,
  onMove,
  onDelete,
  onTransfer,
  onViewDetails,
  children,
}: {
  itemId: number;
  filePath: string;
  activeView: NavView;
  section: Section;
  onMove: (id: number, view: NavView) => void;
  onDelete: (id: number) => void;
  onTransfer: (id: number, targetSection: Section) => void;
  onViewDetails?: () => void;
  children: React.ReactNode;
}) {
  const allTargets = section === "books" ? bookMoveTargets : comicMoveTargets;
  const targets = allTargets.filter((t) => t.view !== activeView);
  const transferLabel = section === "books" ? "Move to Comics" : "Move to Books";
  const transferSection: Section = section === "books" ? "comic" : "books";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        {onViewDetails && (
          <ContextMenuItem onClick={onViewDetails}>
            <Info className="size-4" strokeWidth={1.75} />
            View Details
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => window.electronAPI?.showItemInFolder(filePath)}>
          <FolderOpen className="size-4" strokeWidth={1.75} />
          Show in Folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuLabel>Move to</ContextMenuLabel>
        {targets.map((t) => (
          <ContextMenuItem key={t.view} onClick={() => onMove(itemId, t.view)}>
            <t.icon className="size-4" strokeWidth={1.75} />
            {t.label}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onTransfer(itemId, transferSection)}>
          <ArrowRightLeft className="size-4" strokeWidth={1.75} />
          {transferLabel}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => onDelete(itemId)}>
          <Trash2 className="size-4" strokeWidth={1.75} />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ── Group card — fanned covers for multi-book authors ── */
function GroupCard({
  items,
  author,
  coverStyle,
  unit = "books",
}: {
  items: MockItem[];
  /** Group name (author or series). */
  author: string;
  coverStyle: CoverStyle;
  unit?: string;
}) {
  const radius = coverRadius(coverStyle);
  const count = items.length;
  const covers = items.slice(0, 3);

  const layers =
    covers.length === 1
      ? [{ r: 0, x: 0, s: 1, z: 1 }]
      : covers.length === 2
      ? [
          { r: -5, x: -6, s: 0.96, z: 1 },
          { r: 3, x: 4, s: 1, z: 2 },
        ]
      : [
          { r: -7, x: -8, s: 0.93, z: 1 },
          { r: 0, x: 0, s: 0.96, z: 2 },
          { r: 5, x: 6, s: 1, z: 3 },
        ];

  return (
    <div className="group-card flex flex-col">
      {/* globals.css fans `.group-card-cover` and fades in `.group-card-glow` on hover */}
      <div className="relative">
        <div
          aria-hidden
          className="group-card-glow pointer-events-none absolute -inset-x-2 -bottom-5 h-16 opacity-0 transition-opacity duration-300"
          style={{ background: items[0].gradient, ...BLOOM_MASK }}
        />

        <div className="relative aspect-[2/3]">
          {covers.map((item, i) => {
            const l = layers[i];
            return (
              <div
                key={item.id}
                className={cn(
                  "group-card-cover absolute inset-0 overflow-hidden bg-fill-tertiary shadow-cover transition-transform duration-500 ease-spring",
                  radius,
                )}
                style={{
                  transform: `translateX(${l.x}px) rotate(${l.r}deg) scale(${l.s})`,
                  zIndex: l.z,
                  transformOrigin: "bottom center",
                  "--hover-transform": `translateX(${l.x * 1.8}px) rotate(${l.r * 1.4}deg) scale(${l.s}) translateY(-4px)`,
                } as React.CSSProperties}
              >
                {item.cover ? (
                  <img
                    src={item.cover}
                    alt={item.title}
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ imageRendering: "auto" }}
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0" style={{ background: item.gradient }} />
                )}
                <div aria-hidden className="pointer-events-none absolute inset-0" style={SPINE_STYLE} />
                <div aria-hidden className={cn("pointer-events-none absolute inset-0 hairline", radius)} />
              </div>
            );
          })}

          {/* Count */}
          <span
            className="glass absolute right-1.5 bottom-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold text-label tabular-nums"
            style={{ zIndex: 10 }}
          >
            {count}
          </span>
        </div>
      </div>

      {/* Same two-row caption as BookCard, on the column edge */}
      <div className="mt-3 flex h-9 min-w-0 flex-col justify-center">
        <p className="text-headline truncate text-label">{author}</p>
        <p className="truncate text-xs text-label-secondary">{count} {unit}</p>
      </div>
    </div>
  );
}

export function ContentGrid({ items, viewMode, coverStyle, showFormatBadge, onMoveItem, onDeleteItem, onTransferItem, onOpenItem, onViewDetails, activeView, section, selectedIds, onToggleSelect, onClearSelection, onBatchDelete, onBatchMove, readingProgress = {}, onImport, filterLabel, onClearFilter, header, seriesOf, onDetectSeries }: ContentGridProps) {
  const hasSelection = selectedIds.size > 0;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleItemClick = useCallback((e: React.MouseEvent, item: MockItem) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onToggleSelect(item.id, false);
    } else if (e.shiftKey && hasSelection) {
      e.preventDefault();
      onToggleSelect(item.id, true);
    } else if (hasSelection) {
      // If items are selected and user clicks without ctrl, clear selection
      onClearSelection();
    }
  }, [hasSelection, onToggleSelect, onClearSelection]);

  const handleItemDoubleClick = useCallback((item: MockItem) => {
    if (!hasSelection) onOpenItem?.(item);
  }, [hasSelection, onOpenItem]);

  if (items.length === 0) {
    const empty = filterLabel
      ? {
          icon: ListFilter,
          title: `No ${filterLabel} files`,
          description: `Nothing here matches the ${filterLabel} filter.`,
          canImport: false,
        }
      : emptyStateFor(activeView, section);
    const EmptyIcon = empty.icon;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header != null && (
          <ToolbarScrollContext.Provider value={{ scrolled: false }}>{header}</ToolbarScrollContext.Provider>
        )}
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 pb-24">
          <EmptyState
            icon={<EmptyIcon strokeWidth={1.5} />}
            title={empty.title}
            description={empty.description}
            action={
              filterLabel && onClearFilter ? (
                <Button variant="secondary" size="sm" onClick={onClearFilter}>
                  Clear Filter
                </Button>
              ) : empty.canImport && onImport ? (
                <Button size="sm" onClick={onImport}>
                  <Plus strokeWidth={2.25} />
                  Import
                </Button>
              ) : undefined
            }
          />
        </div>
      </div>
    );
  }

  const ctxProps = { activeView, section, onMove: onMoveItem, onDelete: onDeleteItem, onTransfer: onTransferItem };

  const finishedShelf = isFinishedView(activeView);
  const getPct = (filePath: string) => bookPct(readingProgress, filePath, finishedShelf);

  const allTargets = section === "books" ? bookMoveTargets : comicMoveTargets;
  const moveTargets = allTargets.filter((t) => t.view !== activeView);

  /* ── Batch selection chrome (all views) ─────── */
  const selectionChrome = (
    <>
      <SelectionBar
        count={selectedIds.size}
        moveTargets={moveTargets}
        onMove={(view) => onBatchMove(selectedIds, view)}
        onDelete={() => setConfirmDelete(true)}
        onClear={onClearSelection}
      />

      <GlassModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""}?`}
        subtitle="They’ll be removed from your library. Files on disk are not affected."
        width={400}
        hideClose
      >
        <GlassModal.Footer className="border-t-0 pt-2 pb-5">
          <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            autoFocus
            onClick={() => { onBatchDelete(selectedIds); setConfirmDelete(false); }}
          >
            <Trash2 strokeWidth={1.75} />
            Delete
          </Button>
        </GlassModal.Footer>
      </GlassModal>
    </>
  );

  let body: React.ReactNode;

  if (viewMode === "list") {
    /* ── List view — inset grouped rows ───────── */
    const thumb = thumbRadius(coverStyle);
    body = (
      <LibraryScroll header={header}>
        <div className={cn(PAGE_PAD, "pt-1")}>
          {/* Column headers */}
          <div className="flex h-7 items-center gap-3 px-3 text-section select-none">
            {hasSelection && <span className="w-4 shrink-0" />}
            <span className="w-7 shrink-0" />
            <span className="min-w-0 flex-1">Title</span>
            <span className="w-36 shrink-0">Progress</span>
            {showFormatBadge && <span className="w-14 shrink-0 text-right">Format</span>}
          </div>

          <div className="relative overflow-hidden rounded-lg bg-fill-quaternary">
            {items.map((item, i) => {
              const isSelected = selectedIds.has(item.id);
              const pct = getPct(item.filePath);
              return (
                <BlurFade key={item.id} {...fade(i)} yOffset={4}>
                  <ItemContextMenu itemId={item.id} filePath={item.filePath} {...ctxProps} onViewDetails={onViewDetails ? () => onViewDetails(item) : undefined}>
                    <div
                      onClick={(e) => handleItemClick(e, item)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      className={cn(
                        "relative flex h-14 cursor-default items-center gap-3 px-3 transition-colors duration-150 select-none",
                        isSelected ? "bg-brand/15" : "hover:bg-fill-tertiary",
                      )}
                    >
                      {i > 0 && (
                        <div
                          aria-hidden
                          className={cn("absolute top-0 right-0 h-px bg-separator", hasSelection ? "left-20" : "left-13")}
                        />
                      )}
                      {hasSelection && <SelectCheck selected={isSelected} />}
                      <CoverThumb item={item} className={cn("h-10 w-7 shadow-xs", thumb)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-label">{item.title}</p>
                        <p className="truncate text-xs text-label-secondary">{item.author}</p>
                      </div>
                      <div className="w-36 shrink-0">
                        {pct != null && <ProgressBarInline pct={pct} />}
                      </div>
                      {showFormatBadge && (
                        <span className="w-14 shrink-0 text-right text-2xs font-medium text-label-tertiary">
                          {item.format}
                        </span>
                      )}
                    </div>
                  </ItemContextMenu>
                </BlurFade>
              );
            })}
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-lg hairline" />
          </div>
        </div>
      </LibraryScroll>
    );
  } else if (viewMode === "detail") {
    /* ── Detail view — tiles that actually carry detail ───── */
    const thumb = thumbRadius(coverStyle);
    body = (
      <LibraryScroll header={header}>
        <div className={cn(PAGE_PAD, "grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4")}>
          {items.map((item, i) => {
            const isSelected = selectedIds.has(item.id);
            const pct = getPct(item.filePath);
            const caption = progressCaption(readingProgress, item.filePath, finishedShelf);
            const done = pct != null && pct >= 100;
            return (
              <BlurFade key={item.id} {...fade(i)}>
                <ItemContextMenu itemId={item.id} filePath={item.filePath} {...ctxProps} onViewDetails={onViewDetails ? () => onViewDetails(item) : undefined}>
                  <div
                    onClick={(e) => handleItemClick(e, item)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    className="cursor-default select-none"
                  >
                    <SpotlightCard
                      className={cn(
                        "flex h-full gap-4 rounded-lg p-3 transition-colors duration-150",
                        isSelected
                          ? "bg-brand/15 shadow-[inset_0_0_0_1.5px_var(--accent-brand)]"
                          : "bg-fill-quaternary hairline hover:bg-fill-tertiary",
                      )}
                    >
                      <CoverThumb item={item} className={cn("aspect-[2/3] w-20 shadow-cover", thumb)} />
                      <div className="flex min-w-0 flex-1 flex-col py-0.5">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-headline line-clamp-2 text-label">{item.title}</p>
                            <p className="mt-0.5 truncate text-xs text-label-secondary">{item.author}</p>
                          </div>
                          {hasSelection && <SelectCheck selected={isSelected} />}
                        </div>
                        <div className="mt-auto flex flex-col gap-1.5">
                          {pct != null && <ProgressBar value={pct} className="max-w-48" />}
                          <div className="flex h-4 items-center gap-2 text-xs">
                            <span className="min-w-0 flex-1 truncate text-label-secondary tabular-nums">
                              {done ? "Finished" : caption ?? "Not started"}
                            </span>
                            {showFormatBadge && (
                              <span className="shrink-0 text-2xs font-medium text-label-tertiary">{item.format}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </SpotlightCard>
                  </div>
                </ItemContextMenu>
              </BlurFade>
            );
          })}
        </div>
      </LibraryScroll>
    );
  } else if (viewMode === "group" || viewMode === "series") {
    /* ── Group view (by author, or by accepted series) ── */
    body = (
      <GroupView
        key={viewMode}
        groupBy={viewMode === "series" ? "series" : "author"}
        seriesOf={seriesOf}
        onDetectSeries={onDetectSeries}
        items={items}
        coverStyle={coverStyle}
        showFormatBadge={showFormatBadge}
        ctxProps={ctxProps}
        onViewDetails={onViewDetails}
        selectedIds={selectedIds}
        onItemClick={handleItemClick}
        onItemDoubleClick={handleItemDoubleClick}
        readingProgress={readingProgress}
        header={header}
      />
    );
  } else {
    /* ── Grid view — "Continue Reading" shelf + covers on the canvas ── */
    const inProgress = items
      .filter((item) => {
        const pct = getPct(item.filePath);
        return pct != null && pct < 100;
      })
      .slice(0, 3);
    const showShelf = inProgress.length > 0;

    body = (
      <LibraryScroll header={header}>
        <div className={PAGE_PAD}>
          {showShelf && (
            <section>
              <SectionHeader title="Continue Reading" />
              <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4">
                {inProgress.map((item, i) => (
                  <BlurFade key={item.id} {...fade(i)} className="h-full">
                    <ItemContextMenu itemId={item.id} filePath={item.filePath} {...ctxProps} onViewDetails={onViewDetails ? () => onViewDetails(item) : undefined}>
                      <div
                        onClick={(e) => handleItemClick(e, item)}
                        onDoubleClick={() => handleItemDoubleClick(item)}
                        className="h-full cursor-default select-none"
                      >
                        <ContinueCard
                          item={item}
                          coverStyle={coverStyle}
                          pct={getPct(item.filePath) ?? 0}
                          caption={progressCaption(readingProgress, item.filePath, finishedShelf)}
                          selected={selectedIds.has(item.id)}
                          onResume={onOpenItem && !hasSelection ? () => onOpenItem(item) : undefined}
                        />
                      </div>
                    </ItemContextMenu>
                  </BlurFade>
                ))}
              </div>
            </section>
          )}

          <div className={cn(COVER_GRID, showShelf && "mt-10")}>
            {items.map((item, i) => {
              const pct = getPct(item.filePath);
              return (
                <BlurFade key={item.id} {...fade(i)}>
                  <ItemContextMenu itemId={item.id} filePath={item.filePath} {...ctxProps} onViewDetails={onViewDetails ? () => onViewDetails(item) : undefined}>
                    <div
                      onClick={(e) => handleItemClick(e, item)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      className="cursor-default select-none"
                    >
                      <BookCard
                        {...item}
                        coverStyle={coverStyle}
                        showFormatBadge={showFormatBadge}
                        selected={selectedIds.has(item.id)}
                        progress={pct != null ? pct / 100 : undefined}
                      />
                    </div>
                  </ItemContextMenu>
                </BlurFade>
              );
            })}
          </div>
        </div>
      </LibraryScroll>
    );
  }

  return (
    <>
      {body}
      {selectionChrome}
    </>
  );
}

/* ── Group view component ────────────────────────────── */
function GroupView({
  groupBy,
  seriesOf,
  onDetectSeries,
  items,
  coverStyle,
  showFormatBadge,
  ctxProps,
  onViewDetails,
  selectedIds,
  onItemClick,
  onItemDoubleClick,
  readingProgress,
  header,
}: {
  items: MockItem[];
  coverStyle: CoverStyle;
  showFormatBadge: boolean;
  ctxProps: {
    activeView: NavView;
    section: Section;
    onMove: (id: number, view: NavView) => void;
    onDelete: (id: number) => void;
    onTransfer: (id: number, targetSection: Section) => void;
  };
  onViewDetails?: (item: MockItem) => void;
  selectedIds: Set<number>;
  onItemClick: (e: React.MouseEvent, item: MockItem) => void;
  onItemDoubleClick: (item: MockItem) => void;
  readingProgress: ReadingProgress;
  header?: React.ReactNode;
  groupBy: "author" | "series";
  seriesOf?: (filePath: string) => { name: string; number: number | null } | undefined;
  onDetectSeries?: () => void;
}) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const bySeries = groupBy === "series";

  /** Author groups; or series groups (volume order) followed by books outside any series. */
  const { groups, loose } = useMemo(() => {
    const map = new Map<string, MockItem[]>();
    const rest: MockItem[] = [];
    for (const item of items) {
      const key = bySeries ? seriesOf?.(item.filePath)?.name : item.author || "Unknown";
      if (!key) {
        rest.push(item);
        continue;
      }
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    if (bySeries) {
      const vol = (it: MockItem) => seriesOf?.(it.filePath)?.number ?? Infinity;
      for (const list of map.values()) list.sort((a, b) => vol(a) - vol(b) || a.title.localeCompare(b.title));
    }
    return {
      groups: Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      loose: rest,
    };
  }, [items, bySeries, seriesOf]);

  const volumeBadge = (item: MockItem) => {
    if (!bySeries) return undefined;
    const n = seriesOf?.(item.filePath)?.number;
    return n != null ? `Vol. ${n}` : undefined;
  };

  const renderBook = (item: MockItem, i: number) => {
    const pct = bookPct(readingProgress, item.filePath, isFinishedView(ctxProps.activeView));
    return (
    <BlurFade key={item.id} {...fade(i)}>
      <ItemContextMenu itemId={item.id} filePath={item.filePath} {...ctxProps} onViewDetails={onViewDetails ? () => onViewDetails(item) : undefined}>
        <div
          onClick={(e) => onItemClick(e, item)}
          onDoubleClick={() => onItemDoubleClick(item)}
          className="cursor-default select-none"
        >
          <BookCard
            {...item}
            coverStyle={coverStyle}
            showFormatBadge={showFormatBadge}
            selected={selectedIds.has(item.id)}
            progress={pct != null ? pct / 100 : undefined}
            badge={expandedGroup ? volumeBadge(item) : undefined}
          />
        </div>
      </ItemContextMenu>
    </BlurFade>
    );
  };

  if (expandedGroup) {
    const groupItems = groups.find(([author]) => author === expandedGroup)?.[1] ?? [];
    return (
      <LibraryScroll header={header}>
        <div className={cn(PAGE_PAD, "pt-1")}>
          <div className="mb-6 flex animate-blur-in items-center gap-4">
            <button
              type="button"
              onClick={() => setExpandedGroup(null)}
              className="focus-ring pressable inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-fill-tertiary pr-3 pl-2 text-xs font-medium text-label-secondary hover:bg-fill-secondary hover:text-label"
            >
              <ChevronLeft className="size-4" strokeWidth={2} />
              {bySeries ? "Series" : "Authors"}
            </button>
            <div className="flex min-w-0 items-baseline gap-2.5">
              <h2 className="text-title truncate text-label">{expandedGroup}</h2>
              <span className="shrink-0 text-sm text-label-tertiary tabular-nums">
                {groupItems.length} {bySeries ? (groupItems.length === 1 ? "volume" : "volumes") : groupItems.length === 1 ? "book" : "books"}
              </span>
            </div>
          </div>
          <div className={COVER_GRID}>{groupItems.map(renderBook)}</div>
        </div>
      </LibraryScroll>
    );
  }

  const noSeries = bySeries && groups.length === 0;

  return (
    <LibraryScroll header={header}>
      <div className={PAGE_PAD}>
        {/* Series view with nothing grouped yet: one quiet prompt above the shelf. */}
        {noSeries && onDetectSeries && (
          <div className="glass-thin mb-8 flex animate-fade-up items-center gap-4 rounded-2xl py-3 pr-3 pl-5">
            <Sparkles className="size-5 shrink-0 text-brand" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="text-headline text-label">Group volumes into series</p>
              <p className="truncate text-xs text-label-secondary">Codex reads titles and file names (and AI tags, if you ran them) to find volumes that belong together.</p>
            </div>
            <Button size="sm" onClick={onDetectSeries}>Detect Series</Button>
          </div>
        )}
        <div className={COVER_GRID}>
          {groups.map(([name, groupItems], i) =>
            groupItems.length === 1 && !bySeries ? (
              renderBook(groupItems[0], i)
            ) : (
              <BlurFade key={name} {...fade(i)}>
                <button
                  type="button"
                  onClick={() => setExpandedGroup(name)}
                  className="focus-ring block w-full cursor-default rounded-lg text-left"
                >
                  <GroupCard items={groupItems} author={name} coverStyle={coverStyle} unit={bySeries ? (groupItems.length === 1 ? "volume" : "volumes") : "books"} />
                </button>
              </BlurFade>
            )
          )}
          {loose.map((item, i) => renderBook(item, groups.length + i))}
        </div>
      </div>
    </LibraryScroll>
  );
}
