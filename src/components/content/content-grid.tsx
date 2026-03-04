"use client";

import { useState, useMemo, useCallback } from "react";
import { BookOpen, Clock, BookOpenCheck, CheckCircle, Trash2, ArrowRightLeft, X, Check } from "lucide-react";
import { BookCard } from "./book-card";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface ContentGridProps {
  items: MockItem[];
  viewMode: ViewMode;
  coverStyle: CoverStyle;
  showFormatBadge: boolean;
  onMoveItem: (id: number, targetView: NavView) => void;
  onDeleteItem: (id: number) => void;
  onTransferItem: (id: number, targetSection: Section) => void;
  onOpenItem?: (item: MockItem) => void;
  activeView: NavView;
  section: Section;
  selectedIds: Set<number>;
  onToggleSelect: (id: number, shiftKey: boolean) => void;
  onClearSelection: () => void;
  onBatchDelete: (ids: Set<number>) => void;
  onBatchMove: (ids: Set<number>, targetView: NavView) => void;
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

/* ── Item context menu wrapper ──────────────────────────── */
function ItemContextMenu({
  itemId,
  activeView,
  section,
  onMove,
  onDelete,
  onTransfer,
  children,
}: {
  itemId: number;
  activeView: NavView;
  section: Section;
  onMove: (id: number, view: NavView) => void;
  onDelete: (id: number) => void;
  onTransfer: (id: number, targetSection: Section) => void;
  children: React.ReactNode;
}) {
  const allTargets = section === "books" ? bookMoveTargets : comicMoveTargets;
  const targets = allTargets.filter((t) => t.view !== activeView);
  const transferLabel = section === "books" ? "Move to Comics" : "Move to Books";
  const transferSection: Section = section === "books" ? "comic" : "books";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-[180px] rounded-lg border-white/[0.08] bg-[var(--bg-overlay)]">
        <ContextMenuLabel className="text-xs text-white/20">Move to</ContextMenuLabel>
        {targets.map((t) => (
          <ContextMenuItem
            key={t.view}
            onClick={() => onMove(itemId, t.view)}
            className="gap-2 text-sm text-white/60"
          >
            <t.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
            {t.label}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator className="bg-white/[0.06]" />
        <ContextMenuItem
          onClick={() => onTransfer(itemId, transferSection)}
          className="gap-2 text-sm text-white/60"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          {transferLabel}
        </ContextMenuItem>
        <ContextMenuSeparator className="bg-white/[0.06]" />
        <ContextMenuItem
          variant="destructive"
          onClick={() => onDelete(itemId)}
          className="gap-2 text-sm"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
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
  const radius = coverStyle === "rounded" ? "rounded-lg" : "rounded-none";
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
    <div className="group-card flex flex-col gap-2.5">
      <div className="relative" style={{ margin: "0 12px" }}>
        {/* Glow under the stack */}
        <div
          className="absolute inset-x-2 -bottom-2 h-6 rounded-lg opacity-0 blur-xl transition-opacity duration-300"
          style={{ background: items[0].gradient }}
        />

        <div className="relative aspect-[2/3]">
          {covers.map((item, i) => {
            const l = layers[i];
            return (
              <div
                key={item.id}
                className={`group-card-cover absolute inset-0 overflow-hidden ${radius} shadow-md transition-all duration-300 ease-out`}
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
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ imageRendering: "auto" }}
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0" style={{ background: item.gradient }} />
                )}
              </div>
            );
          })}

          {/* Count badge */}
          <div
            className="absolute bottom-1.5 right-1.5 rounded-lg bg-black/60 px-1.5 py-[3px] text-xs font-semibold leading-none text-white/80 backdrop-blur-md"
            style={{ zIndex: 10 }}
          >
            {count}
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight">{author}</p>
        <p className="mt-0.5 truncate text-xs text-white/40">{count} books</p>
      </div>
    </div>
  );
}

export function ContentGrid({ items, viewMode, coverStyle, showFormatBadge, onMoveItem, onDeleteItem, onTransferItem, onOpenItem, activeView, section, selectedIds, onToggleSelect, onClearSelection, onBatchDelete, onBatchMove }: ContentGridProps) {
  const radius = coverStyle === "rounded" ? "rounded-lg" : "rounded-none";
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
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
          <BookOpen className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">Nothing here yet</p>
          <p className="text-xs text-muted-foreground/60">Import items to get started</p>
        </div>
      </div>
    );
  }

  const ctxProps = { activeView, section, onMove: onMoveItem, onDelete: onDeleteItem, onTransfer: onTransferItem };

  /* ── List view ──────────────────────────────── */
  if (viewMode === "list") {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-3">
          {items.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <ItemContextMenu key={item.id} itemId={item.id} {...ctxProps}>
                <div
                  onClick={(e) => handleItemClick(e, item)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  className={`flex cursor-default items-center gap-3 rounded-lg px-3 py-2 transition-colors ${isSelected ? "bg-[var(--accent-brand-subtle)]" : "hover:bg-white/5"}`}
                >
                  {hasSelection && (
                    <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${isSelected ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]" : "border-white/20"}`}>
                      {isSelected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.author}</p>
                  </div>
                  {showFormatBadge && (
                    <span className="shrink-0 rounded-lg bg-white/[0.06] px-1.5 py-[3px] text-xs font-semibold uppercase tracking-wide text-white/35">
                      {item.format}
                    </span>
                  )}
                </div>
              </ItemContextMenu>
            );
          })}
        </div>
      </ScrollArea>
    );
  }

  /* ── Detail view ────────────────────────────── */
  if (viewMode === "detail") {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3 p-5">
          {items.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <ItemContextMenu key={item.id} itemId={item.id} {...ctxProps}>
                <div
                  onClick={(e) => handleItemClick(e, item)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  className={`group flex cursor-default gap-4 rounded-lg p-3 transition-colors ${isSelected ? "bg-[var(--accent-brand-subtle)]" : "bg-white/[0.02] hover:bg-white/[0.05]"}`}
                >
                  {hasSelection && (
                    <div className="flex shrink-0 items-center">
                      <div className={`flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${isSelected ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]" : "border-white/20"}`}>
                        {isSelected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                      </div>
                    </div>
                  )}
                  <div className="relative shrink-0">
                    <div className={`relative h-32 w-[85px] overflow-hidden ${radius}`}>
                      {item.cover ? (
                        <img
                          src={item.cover}
                          alt={item.title}
                          className="absolute inset-0 h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="absolute inset-0"
                          style={{ background: item.gradient }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                    <div>
                      <p className="text-sm font-semibold leading-tight">{item.title}</p>
                      <p className="mt-1 text-xs text-white/40">{item.author}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {showFormatBadge && (
                        <span className="rounded-lg bg-white/[0.06] px-1.5 py-[3px] text-xs font-semibold uppercase tracking-wide text-white/35">
                          {item.format}
                        </span>
                      )}
                      <span className="text-xs text-white/15">Added recently</span>
                    </div>
                  </div>
                </div>
              </ItemContextMenu>
            );
          })}
        </div>
      </ScrollArea>
    );
  }

  /* ── Group view ─────────────────────────────── */
  if (viewMode === "group") {
    return (
      <GroupView
        items={items}
        radius={radius}
        coverStyle={coverStyle}
        showFormatBadge={showFormatBadge}
        ctxProps={ctxProps}
        onOpenItem={onOpenItem}
        selectedIds={selectedIds}
        onItemClick={handleItemClick}
        onItemDoubleClick={handleItemDoubleClick}
      />
    );
  }

  /* ── Grid view ──────────────────────────────── */
  const gridContent = (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5 p-5">
        {items.map((item) => (
          <ItemContextMenu key={item.id} itemId={item.id} {...ctxProps}>
            <div
              onClick={(e) => handleItemClick(e, item)}
              onDoubleClick={() => handleItemDoubleClick(item)}
              className="cursor-default"
            >
              <BookCard
                {...item}
                coverStyle={coverStyle}
                showFormatBadge={showFormatBadge}
                selected={selectedIds.has(item.id)}
              />
            </div>
          </ItemContextMenu>
        ))}
      </div>
    </ScrollArea>
  );

  const allTargets = section === "books" ? bookMoveTargets : comicMoveTargets;
  const moveTargets = allTargets.filter((t) => t.view !== activeView);

  return (
    <>
      {gridContent}

      {/* Floating selection action bar */}
      {hasSelection && (
        <div className="absolute bottom-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/[0.08] bg-[var(--bg-overlay)] px-3 py-2 shadow-xl backdrop-blur-xl">
          <span className="text-xs font-medium text-white/60">
            {selectedIds.size} selected
          </span>
          <div className="mx-1 h-4 w-px bg-white/[0.08]" />

          {/* Move to dropdown */}
          <div className="group relative">
            <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/70">
              <ArrowRightLeft className="h-3 w-3" />
              Move to
            </button>
            <div className="invisible absolute bottom-full left-0 mb-1 flex min-w-[140px] flex-col rounded-lg border border-white/[0.08] bg-[var(--bg-overlay)] py-1 shadow-xl group-hover:visible">
              {moveTargets.map((t) => (
                <button
                  key={t.view}
                  onClick={() => onBatchMove(selectedIds, t.view)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/80"
                >
                  <t.icon className="h-3 w-3" strokeWidth={1.5} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
          <div className="mx-1 h-4 w-px bg-white/[0.08]" />
          <button
            onClick={onClearSelection}
            className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex w-80 flex-col gap-4 rounded-lg border border-white/[0.08] bg-[var(--bg-overlay)] p-5 shadow-2xl">
            <div>
              <h3 className="text-sm font-semibold text-white/80">Delete {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""}?</h3>
              <p className="mt-1 text-xs text-white/40">Files on disk are not affected.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/70"
              >
                Cancel
              </button>
              <button
                onClick={() => { onBatchDelete(selectedIds); setConfirmDelete(false); }}
                className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/30"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Group view component ────────────────────────────── */
function GroupView({
  items,
  radius,
  coverStyle,
  showFormatBadge,
  ctxProps,
  onOpenItem,
  selectedIds,
  onItemClick,
  onItemDoubleClick,
}: {
  items: MockItem[];
  radius: string;
  coverStyle: CoverStyle;
  showFormatBadge: boolean;
  ctxProps: {
    activeView: NavView;
    section: Section;
    onMove: (id: number, view: NavView) => void;
    onDelete: (id: number) => void;
    onTransfer: (id: number, targetSection: Section) => void;
  };
  onOpenItem?: (item: MockItem) => void;
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

  if (expandedGroup) {
    const groupItems = groups.find(([author]) => author === expandedGroup)?.[1] ?? [];
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-5">
          <div className="rounded-lg bg-white/[0.02] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">{expandedGroup}</h2>
                <span className="text-xs text-white/30">
                  {groupItems.length} {groupItems.length === 1 ? "book" : "books"}
                </span>
              </div>
              <button
                onClick={() => setExpandedGroup(null)}
                className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
              {groupItems.map((item) => (
                <ItemContextMenu key={item.id} itemId={item.id} {...ctxProps}>
                  <div
                    onClick={(e) => onItemClick(e, item)}
                    onDoubleClick={() => onItemDoubleClick(item)}
                    className="cursor-default"
                  >
                    <BookCard
                      {...item}
                      coverStyle={coverStyle}
                      showFormatBadge={showFormatBadge}
                      selected={selectedIds.has(item.id)}
                    />
                  </div>
                </ItemContextMenu>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5 p-5">
        {groups.map(([author, groupItems]) =>
          groupItems.length === 1 ? (
            <ItemContextMenu key={author} itemId={groupItems[0].id} {...ctxProps}>
              <div
                onClick={(e) => onItemClick(e, groupItems[0])}
                onDoubleClick={() => onItemDoubleClick(groupItems[0])}
                className="cursor-default"
              >
                <BookCard
                  {...groupItems[0]}
                  coverStyle={coverStyle}
                  showFormatBadge={showFormatBadge}
                  selected={selectedIds.has(groupItems[0].id)}
                />
              </div>
            </ItemContextMenu>
          ) : (
            <button
              key={author}
              onClick={() => setExpandedGroup(author)}
              className="cursor-pointer text-left"
            >
              <GroupCard items={groupItems} author={author} coverStyle={coverStyle} />
            </button>
          )
        )}
      </div>
    </ScrollArea>
  );
}
