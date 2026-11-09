"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import {
  LayoutGrid,
  List,
  LayoutList,
  Layers,
  ArrowDown,
  ArrowUp,
  Plus,
  ListFilter,
  Check,
  Library,
  Sparkles,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { BookFormat } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { EdgeBlur } from "./edge-blur";

export type ViewMode = "list" | "grid" | "detail" | "group" | "series";
export type SortField = "title" | "author" | "format";
export type SortDir = "asc" | "desc";
export type FormatFilter = BookFormat | "all";

interface ContentToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  viewLabel: string;
  /** Kept for API stability. Counts are said once — in the sidebar (no eyebrow). */
  itemCount?: number;
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  formatFilter: FormatFilter;
  onFormatFilterChange: (f: FormatFilter) => void;
  onImport: () => void;
  /** Accepted genres present on this shelf (AI tags or fetched details). */
  genreOptions?: string[];
  genreFilter?: string | null;
  onGenreFilterChange?: (genre: string | null) => void;
  /** Library AI (F5): suggest tags for the shelf, and its progress. */
  onSuggestTags?: () => void;
  tagProgress?: { done: number; total: number } | null;
  onCancelTagging?: () => void;
  /** Why the last tagging run failed (e.g. no API key). */
  tagError?: string | null;
  onDetectSeries?: () => void;
}

/**
 * Provided by `ContentGrid` when the toolbar is passed in as its `header`
 * prop and rendered inside the scroll area: the title then scrolls away and
 * the control cluster stays pinned on an Edge Blur strip.
 */
export const ToolbarScrollContext = createContext<{ scrolled: boolean } | null>(null);

const viewModes: { id: ViewMode; icon: typeof List; tip: string }[] = [
  { id: "grid", icon: LayoutGrid, tip: "Grid" },
  { id: "list", icon: List, tip: "List" },
  { id: "detail", icon: LayoutList, tip: "Detail" },
  { id: "group", icon: Layers, tip: "Group by author" },
  { id: "series", icon: Library, tip: "Group by series" },
];

const sortOptions: { field: SortField; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "author", label: "Author" },
  { field: "format", label: "Format" },
];

const formatOptions: FormatFilter[] = ["all", "EPUB", "PDF", "CBZ", "CBR", "MOBI"];

export function ContentToolbar({
  viewMode,
  onViewModeChange,
  viewLabel,
  sortField,
  sortDir,
  onSortChange,
  formatFilter,
  onFormatFilterChange,
  onImport,
  genreOptions = [],
  genreFilter = null,
  onGenreFilterChange,
  onSuggestTags,
  tagProgress,
  onCancelTagging,
  tagError,
  onDetectSeries,
}: ContentToolbarProps) {
  const scroll = useContext(ToolbarScrollContext);
  const clusterRef = useRef<HTMLDivElement>(null);
  const [clusterWidth, setClusterWidth] = useState(0);

  // Embedded: reserve the pinned cluster's width so a long title truncates
  // before it slides under the controls.
  useLayoutEffect(() => {
    if (!scroll || !clusterRef.current) return;
    const el = clusterRef.current;
    const ro = new ResizeObserver(() => setClusterWidth(el.offsetWidth));
    ro.observe(el);
    setClusterWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, [scroll]);

  const activeSort = sortOptions.find((o) => o.field === sortField);
  const SortDirIcon = sortDir === "asc" ? ArrowUp : ArrowDown;
  const filtered = formatFilter !== "all" || !!genreFilter;
  const filterLabel = [formatFilter !== "all" ? formatFilter : null, genreFilter].filter(Boolean).join(" · ");
  const tagging = !!tagProgress && tagProgress.total > 0;
  const hasOrganize = !!(onSuggestTags || onDetectSeries);

  const title = (
    <h1 key={viewLabel} className="text-large-title min-w-0 animate-blur-in truncate text-label">
      {viewLabel}
    </h1>
  );

  const cluster = (
    <div ref={clusterRef} className="pointer-events-auto flex h-10 shrink-0 items-center gap-2">
      {/* Format filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Toolbar pill — 32px capsule (conventions §6) */}
          <Button
            variant="ghost"
            size="sm"
            shape="pill"
            aria-label="Filter by format"
            className={cn(
              "h-8",
              filtered &&
                "bg-brand/15 text-brand hover:bg-brand/20 hover:text-brand data-[state=open]:bg-brand/20 data-[state=open]:text-brand",
            )}
          >
            {tagging ? <Sparkles className="animate-pulse" strokeWidth={2} /> : <ListFilter strokeWidth={2} />}
            <span className="max-w-40 truncate">{filtered ? filterLabel : "Filter"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[70vh] min-w-52 overflow-y-auto">
          <DropdownMenuLabel>Format</DropdownMenuLabel>
          {formatOptions.map((f) => {
            const active = formatFilter === f;
            return (
              <DropdownMenuItem key={f} onClick={() => onFormatFilterChange(f)}>
                <Check className={cn("size-4", active ? "opacity-100" : "opacity-0")} strokeWidth={2} />
                {f === "all" ? "All formats" : f}
              </DropdownMenuItem>
            );
          })}
          {onGenreFilterChange && genreOptions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Genre</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onGenreFilterChange(null)}>
                <Check className={cn("size-4", !genreFilter ? "opacity-100" : "opacity-0")} strokeWidth={2} />
                All genres
              </DropdownMenuItem>
              {genreOptions.map((g) => (
                <DropdownMenuItem key={g} onClick={() => onGenreFilterChange(g)}>
                  <Check className={cn("size-4", genreFilter === g ? "opacity-100" : "opacity-0")} strokeWidth={2} />
                  {g}
                </DropdownMenuItem>
              ))}
            </>
          )}
          {hasOrganize && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Organize</DropdownMenuLabel>
              {onSuggestTags && (tagging ? (
                <DropdownMenuItem onClick={() => onCancelTagging?.()}>
                  <X className="size-4" strokeWidth={2} />
                  <span className="flex-1">Stop tagging</span>
                  <span className="text-2xs tabular-nums opacity-70">{tagProgress!.done}/{tagProgress!.total}</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onSuggestTags}>
                  <Sparkles className="size-4" strokeWidth={1.75} />
                  Suggest genres &amp; tags
                </DropdownMenuItem>
              ))}
              {tagError && !tagging && (
                <p role="status" className="max-w-56 px-2 pb-1 text-2xs leading-snug text-danger">{tagError}</p>
              )}
              {onDetectSeries && (
                <DropdownMenuItem onClick={onDetectSeries}>
                  <Library className="size-4" strokeWidth={1.75} />
                  Detect series…
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sort — the pill shows the field and its direction */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            shape="pill"
            aria-label={`Sort by ${activeSort?.label ?? "title"}, ${sortDir === "asc" ? "ascending" : "descending"}`}
            className="h-8"
          >
            <SortDirIcon strokeWidth={2} />
            {activeSort?.label ?? "Sort"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          {sortOptions.map((opt) => {
            const active = sortField === opt.field;
            return (
              <DropdownMenuItem
                key={opt.field}
                onClick={() => {
                  if (active) {
                    onSortChange(opt.field, sortDir === "asc" ? "desc" : "asc");
                  } else {
                    onSortChange(opt.field, "asc");
                  }
                }}
              >
                <Check className={cn("size-4", active ? "opacity-100" : "opacity-0")} strokeWidth={2} />
                <span className="flex-1">{opt.label}</span>
                {active && <SortDirIcon className="size-4 opacity-60" strokeWidth={2} />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onSortChange(sortField, sortDir === "asc" ? "desc" : "asc")}
          >
            <SortDirIcon className="size-4" strokeWidth={2} />
            {sortDir === "asc" ? "Ascending (A→Z)" : "Descending (Z→A)"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div aria-hidden className="mx-1 h-5 w-px bg-separator" />

      {/* View mode */}
      <SegmentedControl
        aria-label="View mode"
        value={viewMode}
        onValueChange={onViewModeChange}
        options={viewModes.map((v) => ({
          value: v.id,
          title: v.tip,
          icon: <v.icon strokeWidth={2} />,
        }))}
      />

      {/* Primary action */}
      <Button size="sm" onClick={onImport} className="ml-1">
        <Plus strokeWidth={2.25} />
        Import
      </Button>
    </div>
  );

  /* Standalone — one row: serif title, centred on the control cluster. */
  if (!scroll) {
    return (
      <header className="flex shrink-0 items-center gap-6 px-8 pt-6 pb-4">
        <div className="flex h-10 min-w-0 flex-1 items-center">{title}</div>
        {cluster}
      </header>
    );
  }

  /* Embedded in the scroll area — the title scrolls away, the cluster stays
     pinned at the same spot on an Edge Blur strip that appears on scroll. */
  return (
    <>
      <div className="sticky top-0 z-20 h-0">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24">
          <EdgeBlur visible={scroll.scrolled} className="h-full" />
          <div className="relative flex justify-end px-8 pt-6">{cluster}</div>
        </div>
      </div>
      <header
        className="flex h-20 items-start px-8 pt-6"
        style={{ paddingRight: clusterWidth ? clusterWidth + 56 : undefined }}
      >
        <div className="flex h-10 min-w-0 flex-1 items-center">{title}</div>
      </header>
    </>
  );
}
