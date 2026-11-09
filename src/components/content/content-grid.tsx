"use client";

import { useState, useMemo, useCallback } from "react";
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
  Play,
  Plus,
} from "lucide-react";
import { BookCard, coverRadius, SPINE_STYLE } from "./book-card";
import { SelectionBar } from "./selection-bar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BlurFade } from "@/components/ui/blur-fade";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassModal } from "@/components/ui/glass-modal";
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
  /** Optional — shows an Import action in the empty state. */
  onImport?: () => void;
}

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
  { view: "completed", label: "Completed", icon: CheckCircle },
];

/** Grid page rhythm (conventions §5): shared 32px gutter, clears the dock. */
const COVER_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-8";
const PAGE_PAD = "px-8 pt-3 pb-36";
/** Content dissolves under the header instead of hard-clipping. */
const FADE_MASK = "[mask-image:linear-gradient(to_bottom,transparent,black_16px)]";

/** Stagger entrance 30ms per item, capped at 12 items (conventions §8). */
const stagger = (i: number) => Math.min(i, 12) * 0.03;

/** Small thumbnail radius: rounded covers → rounded-sm, sharp → rounded-xs. */
const thumbRadius = (coverStyle: CoverStyle) => (coverStyle === "rounded" ? "rounded-sm" : "rounded-xs");

/* ── Shared pieces ──────────────────────────────────────── */

function CoverThumb({ item, className }: { item: MockItem; className?: string }) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-fill-tertiary", className)}>
      {item.cover ? (
        <img
          src={item.cover}
          alt={item.title}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
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
      {selected && <Check className="size-2.5" strokeWidth={3.5} />}
    </span>
  );
}

function ProgressBarInline({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-fill-tertiary">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 ease-apple"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-2xs text-label-tertiary tabular-nums">{Math.round(pct)}%</span>
    </div>
  );
}

/** Serif section header — editorial rhythm between shelves. */
function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-5 flex items-baseline gap-2.5">
      <h2 className="text-title text-label">{title}</h2>
      {count != null && <span className="text-sm text-label-tertiary tabular-nums">{count}</span>}
    </div>
  );
}

/* ── Continue Reading card — glass hero tile ────────────── */
function ContinueCard({
  item,
  coverStyle,
  pct,
  chapter,
  totalChapters,
  selected,
  onResume,
}: {
  item: MockItem;
  coverStyle: CoverStyle;
  pct: number;
  chapter: number;
  totalChapters: number;
  selected: boolean;
  onResume?: () => void;
}) {
  const radius = thumbRadius(coverStyle);
  return (
    <SpotlightCard
      className={cn(
        "glass-thin grain flex h-full items-center gap-4 rounded-2xl p-3 pr-4 transition-shadow duration-200",
        selected && "shadow-[inset_0_0_0_1.5px_var(--accent-brand)]",
      )}
    >
      <Tilt maxTilt={5} glare className={cn("shrink-0", radius)}>
        <CoverThumb item={item} className={cn("aspect-[2/3] w-16 shadow-cover", radius)} />
      </Tilt>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-display text-lg font-semibold text-label">{item.title}</p>
        <p className="mt-0.5 truncate text-xs text-label-secondary">{item.author}</p>
        <ProgressBarInline pct={pct} className="mt-3" />
        {totalChapters > 0 && (
          <p className="mt-1 text-2xs text-label-tertiary tabular-nums">
            Chapter {chapter} of {totalChapters}
          </p>
        )}
      </div>
      {onResume && (
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label={`Resume ${item.title}`}
          title="Resume"
          className="shrink-0 rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            onResume();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <Play className="size-3.5 translate-x-px fill-current" strokeWidth={2} />
        </Button>
      )}
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
}: {
  items: MockItem[];
  author: string;
  coverStyle: CoverStyle;
}) {
  const radius = coverRadius(coverStyle);
  const count = items.length;
  const covers = items.slice(0, 3);

  const layers =
    covers.length === 2
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
      {/* Structure matters: globals.css fans `.group-card-cover` and fades the glow on hover */}
      <div className="relative mx-3">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 -bottom-1 h-10 rounded-full opacity-0 blur-2xl transition-opacity duration-300"
          style={{ background: items[0].gradient }}
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

      <div className="mt-3 min-w-0 px-3">
        <p className="text-headline truncate text-label">{author}</p>
        <p className="mt-0.5 truncate text-xs text-label-secondary">{count} books</p>
      </div>
    </div>
  );
}

export function ContentGrid({ items, viewMode, coverStyle, showFormatBadge, onMoveItem, onDeleteItem, onTransferItem, onOpenItem, onViewDetails, activeView, section, selectedIds, onToggleSelect, onClearSelection, onBatchDelete, onBatchMove, readingProgress = {}, onImport }: ContentGridProps) {
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
    const isComics = section === "comic";
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-8 pb-24">
        <EmptyState
          icon={<Library strokeWidth={1.5} />}
          title={isComics ? "No series here yet" : "Your shelf is empty"}
          description={
            isComics
              ? "Import CBZ or CBR archives and they’ll line up here, ready to read."
              : "Import EPUB, PDF or MOBI files and they’ll line up here, ready to read."
          }
          action={
            onImport ? (
              <Button size="sm" onClick={onImport} className="rounded-md">
                <Plus strokeWidth={2.25} />
                Import
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const ctxProps = { activeView, section, onMove: onMoveItem, onDelete: onDeleteItem, onTransfer: onTransferItem };

  const getPct = (filePath: string): number | null => {
    const p = readingProgress[filePath];
    if (!p || p.totalChapters <= 0) return null;
    return Math.min(((p.chapter + 1) / p.totalChapters) * 100, 100);
  };

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
          <Button variant="secondary" size="sm" className="rounded-md" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="rounded-md"
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
      <ScrollArea className={cn("min-h-0 flex-1", FADE_MASK)}>
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
                <BlurFade key={item.id} delay={stagger(i)} yOffset={4}>
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
                        <div className="flex w-14 shrink-0 justify-end">
                          <Badge>{item.format}</Badge>
                        </div>
                      )}
                    </div>
                  </ItemContextMenu>
                </BlurFade>
              );
            })}
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-lg hairline" />
          </div>
        </div>
      </ScrollArea>
    );
  } else if (viewMode === "detail") {
    /* ── Detail view — spotlight tiles ────────── */
    const thumb = thumbRadius(coverStyle);
    body = (
      <ScrollArea className={cn("min-h-0 flex-1", FADE_MASK)}>
        <div className={cn(PAGE_PAD, "grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4")}>
          {items.map((item, i) => {
            const isSelected = selectedIds.has(item.id);
            const pct = getPct(item.filePath);
            return (
              <BlurFade key={item.id} delay={stagger(i)}>
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
                        <div className="mt-auto flex flex-col gap-2">
                          {pct != null && <ProgressBarInline pct={pct} className="max-w-44" />}
                          {showFormatBadge && (
                            <div className="flex items-center gap-1.5">
                              <Badge>{item.format}</Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    </SpotlightCard>
                  </div>
                </ItemContextMenu>
              </BlurFade>
            );
          })}
        </div>
      </ScrollArea>
    );
  } else if (viewMode === "group") {
    /* ── Group view ───────────────────────────── */
    body = (
      <GroupView
        items={items}
        coverStyle={coverStyle}
        showFormatBadge={showFormatBadge}
        ctxProps={ctxProps}
        onViewDetails={onViewDetails}
        selectedIds={selectedIds}
        onItemClick={handleItemClick}
        onItemDoubleClick={handleItemDoubleClick}
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
      <ScrollArea className={cn("min-h-0 flex-1", FADE_MASK)}>
        <div className={PAGE_PAD}>
          {showShelf && (
            <section className="mb-10">
              <SectionHeader title="Continue Reading" />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                {inProgress.map((item, i) => {
                  const p = readingProgress[item.filePath];
                  return (
                    <BlurFade key={item.id} delay={stagger(i)} className="h-full">
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
                            chapter={p ? p.chapter + 1 : 0}
                            totalChapters={p?.totalChapters ?? 0}
                            selected={selectedIds.has(item.id)}
                            onResume={onOpenItem && !hasSelection ? () => onOpenItem(item) : undefined}
                          />
                        </div>
                      </ItemContextMenu>
                    </BlurFade>
                  );
                })}
              </div>
            </section>
          )}

          {showShelf && (
            <SectionHeader title={section === "comic" ? "All Comics" : "All Books"} count={items.length} />
          )}

          <div className={COVER_GRID}>
          {items.map((item, i) => {
            const pct = getPct(item.filePath);
            return (
              <BlurFade key={item.id} delay={stagger(i)}>
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
      </ScrollArea>
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
  items,
  coverStyle,
  showFormatBadge,
  ctxProps,
  onViewDetails,
  selectedIds,
  onItemClick,
  onItemDoubleClick,
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
}) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, MockItem[]>();
    for (const item of items) {
      const key = item.author || "Unknown";
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }, [items]);

  const renderBook = (item: MockItem, i: number) => (
    <BlurFade key={item.id} delay={stagger(i)}>
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
          />
        </div>
      </ItemContextMenu>
    </BlurFade>
  );

  if (expandedGroup) {
    const groupItems = groups.find(([author]) => author === expandedGroup)?.[1] ?? [];
    return (
      <ScrollArea className={cn("min-h-0 flex-1", FADE_MASK)}>
        <div className={cn(PAGE_PAD, "pt-1")}>
          <div className="mb-6 flex animate-blur-in items-center gap-4">
            <button
              type="button"
              onClick={() => setExpandedGroup(null)}
              className="focus-ring pressable inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-fill-tertiary pr-3 pl-2 text-xs font-medium text-label-secondary hover:bg-fill-secondary hover:text-label"
            >
              <ChevronLeft className="size-4" strokeWidth={2} />
              Authors
            </button>
            <div className="flex min-w-0 items-baseline gap-2.5">
              <h2 className="text-title truncate text-label">{expandedGroup}</h2>
              <span className="shrink-0 text-sm text-label-tertiary tabular-nums">
                {groupItems.length} {groupItems.length === 1 ? "book" : "books"}
              </span>
            </div>
          </div>
          <div className={COVER_GRID}>{groupItems.map(renderBook)}</div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className={cn("min-h-0 flex-1", FADE_MASK)}>
      <div className={cn(PAGE_PAD, COVER_GRID)}>
        {groups.map(([author, groupItems], i) =>
          groupItems.length === 1 ? (
            renderBook(groupItems[0], i)
          ) : (
            <BlurFade key={author} delay={stagger(i)}>
              <button
                type="button"
                onClick={() => setExpandedGroup(author)}
                className="focus-ring block w-full cursor-default rounded-lg text-left"
              >
                <GroupCard items={groupItems} author={author} coverStyle={coverStyle} />
              </button>
            </BlurFade>
          )
        )}
      </div>
    </ScrollArea>
  );
}
