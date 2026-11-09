"use client";

/**
 * WikiSidebar — floating glass Finder/Notes-style source list for the wiki window.
 *
 * Adapted from 21st.dev "Animated Sidebar" (unlumen sidebar-001, id 21517):
 * a single spring hover highlight that glides between rows, a shared-layout
 * (`layoutId`) selection pill, and section headers — re-skinned to Codex glass
 * tokens and macOS sidebar metrics (rows h-8/h-9, rounded-md, text-section).
 * Selection matches the app sidebar (conventions S9.3): bg-fill-secondary pill,
 * accent icon, font-medium label.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BarChart2, BookOpen, Network, LayoutGrid } from "lucide-react";
import type { WikiEntryType } from "@shared/knowledge/types";
import { cn } from "@/lib/utils";
import { tintOf } from "@/lib/wiki-type-meta";
import { SearchField } from "@/components/ui/search-field";
import { SegmentedControl } from "@/components/ui/segmented-control";

export type WikiView = "encyclopedia" | "stats" | "graph";

export interface SidebarEntry {
  id: string;
  name: string;
  type: WikiEntryType;
  significance: number;
}

export interface SidebarTypeMeta {
  icon: React.ReactNode;
  label: string;
  plural: string;
  color: string;
  bg: string;
}

const NAV: { view: WikiView; label: string; icon: React.ReactNode }[] = [
  { view: "encyclopedia", label: "Encyclopedia", icon: <BookOpen strokeWidth={1.75} /> },
  { view: "stats", label: "Protagonist Stats", icon: <BarChart2 strokeWidth={1.75} /> },
  { view: "graph", label: "Relationship Graph", icon: <Network strokeWidth={1.75} /> },
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Type-coloured avatar circle (initials for characters, glyph otherwise). */
export function EntityAvatar({
  name,
  type,
  meta,
  size = "md",
  className,
}: {
  name: string;
  type: WikiEntryType;
  meta: SidebarTypeMeta;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "size-5 text-2xs [&_svg]:size-3.5",
    md: "size-6 text-2xs [&_svg]:size-3.5",
    lg: "size-10 text-sm [&_svg]:size-4",
    xl: "size-16 text-xl [&_svg]:size-10 [&_svg]:stroke-[1.25]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight",
        sizes[size],
        className,
      )}
      style={{ background: meta.bg, color: meta.color, boxShadow: `inset 0 0 0 0.5px ${tintOf(meta.color, 25)}` }}
    >
      {type === "character" ? initials(name) : meta.icon}
    </span>
  );
}

interface WikiSidebarProps {
  typeMeta: Record<WikiEntryType, SidebarTypeMeta>;
  typeOrder: WikiEntryType[];
  entries: SidebarEntry[];
  groupedFiltered: Partial<Record<WikiEntryType, SidebarEntry[]>>;
  filteredCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterType: WikiEntryType | "all";
  onFilterChange: (t: WikiEntryType | "all") => void;
  selectedEntryId: string | null;
  activeView: WikiView;
  onSelectView: (view: WikiView) => void;
  onSelectEntry: (id: string) => void;
  /** Kept for the caller's contract; counts are stated once, on the wiki home. */
  processedCount?: number;
}

export function WikiSidebar({
  typeMeta, typeOrder, entries, groupedFiltered, filteredCount,
  searchQuery, onSearchChange, filterType, onFilterChange,
  selectedEntryId, activeView, onSelectView, onSelectEntry,
}: WikiSidebarProps) {
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ top: number; height: number } | null>(null);

  const onRowEnter = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    setHover({ top: el.offsetTop, height: el.offsetHeight });
  }, []);

  const filterOptions = useMemo(() => [
    { value: "all" as const, label: "All", icon: <LayoutGrid strokeWidth={1.75} /> },
    ...typeOrder
      .filter((t) => entries.some((e) => e.type === t))
      .map((t) => ({ value: t, icon: typeMeta[t].icon, title: typeMeta[t].plural })),
  ], [typeOrder, typeMeta, entries]);

  const sortedGroups = useMemo(() => typeOrder
    .map((t) => ({ type: t, items: [...(groupedFiltered[t] ?? [])].sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length > 0), [typeOrder, groupedFiltered]);

  const selection = (
    <motion.span
      layoutId="wiki-sidebar-selection"
      transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.45 }}
      className="absolute inset-0 rounded-md bg-fill-secondary"
    />
  );

  return (
    <aside className="glass-thin grain relative flex w-64 shrink-0 flex-col overflow-hidden rounded-2xl animate-slide-in-left">
      {/* Search + type filter */}
      <div className="flex shrink-0 flex-col gap-2 p-2 pb-1">
        <SearchField
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search wiki"
        />
        {filterOptions.length > 2 && (
          <SegmentedControl
            size="sm"
            fill
            value={filterType}
            onValueChange={onFilterChange}
            options={filterOptions}
            aria-label="Filter by type"
          />
        )}
      </div>

      {/* Scroll list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 scrollbar-none">
        <div ref={listRef} className="relative" onMouseLeave={() => setHover(null)}>
          {/* Gliding hover highlight */}
          <AnimatePresence>
            {hover && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 rounded-md bg-fill-quaternary"
                initial={{ opacity: 0, top: hover.top, height: hover.height }}
                animate={{ opacity: 1, top: hover.top, height: hover.height }}
                exit={{ opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
          </AnimatePresence>

          {/* Library nav */}
          <div className="px-2.5 pt-3 pb-1.5 text-section">Wiki</div>
          {NAV.map((item) => {
            const active = !selectedEntryId && activeView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => onSelectView(item.view)}
                onMouseEnter={onRowEnter}
                className={cn(
                  "focus-ring relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors",
                  active ? "text-label" : "text-label-secondary hover:text-label",
                )}
              >
                {active && selection}
                <span className={cn("relative [&_svg]:size-4", active ? "text-brand" : "text-label-tertiary")}>{item.icon}</span>
                <span className={cn("relative truncate", active && "font-medium")}>{item.label}</span>
              </button>
            );
          })}

          {/* Entities */}
          {sortedGroups.map(({ type, items }) => {
            const meta = typeMeta[type];
            return (
              <div key={type}>
                <div className="flex items-center justify-between px-2.5 pt-4 pb-1.5">
                  <span className="text-section">{meta.plural}</span>
                  <span className="text-2xs tabular-nums text-label-secondary">{items.length}</span>
                </div>
                {items.map((e) => {
                  const active = selectedEntryId === e.id;
                  return (
                    <button
                      key={e.id}
                      onClick={() => onSelectEntry(e.id)}
                      onMouseEnter={onRowEnter}
                      className={cn(
                        "focus-ring relative flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors",
                        active ? "text-label" : "text-label-secondary hover:text-label",
                      )}
                    >
                      {active && selection}
                      <EntityAvatar name={e.name} type={e.type} meta={meta} className="relative" />
                      <span className={cn("relative min-w-0 flex-1 truncate", active && "font-medium")}>{e.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {filteredCount === 0 && entries.length > 0 && (
            <p className="px-2.5 py-8 text-center text-xs text-label-secondary">No matches</p>
          )}
        </div>
      </div>
    </aside>
  );
}

/** Skeleton used while the wiki loads. */
export function WikiSidebarSkeleton() {
  return (
    <aside className="glass-thin grain relative flex w-64 shrink-0 flex-col gap-2 overflow-hidden rounded-2xl p-2">
      <div className="h-8 rounded-full bg-fill-tertiary" />
      <div className="h-7 rounded-full bg-fill-quaternary" />
      <div className="px-2.5 pt-3 pb-1.5 text-section">Wiki</div>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="flex h-9 items-center gap-2.5 px-2" style={{ opacity: 1 - i * 0.1 }}>
          <span className="size-6 shrink-0 animate-pulse rounded-full bg-fill-tertiary" />
          <span className="h-2.5 animate-pulse rounded-full bg-fill-tertiary" style={{ width: `${70 - (i % 3) * 15}%` }} />
        </div>
      ))}
    </aside>
  );
}
