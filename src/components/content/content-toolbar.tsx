"use client";

import {
  LayoutGrid,
  List,
  LayoutList,
  Layers,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Plus,
  Search,
  ListFilter,
  Check,
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
import { Kbd } from "@/components/ui/kbd";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { BookFormat } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export type ViewMode = "list" | "grid" | "detail" | "group";
export type SortField = "title" | "author" | "format";
export type SortDir = "asc" | "desc";
export type FormatFilter = BookFormat | "all";

interface ContentToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  viewLabel: string;
  itemCount: number;
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  formatFilter: FormatFilter;
  onFormatFilterChange: (f: FormatFilter) => void;
  onImport: () => void;
  /** Opens global search. Falls back to the registered Ctrl+K shortcut. */
  onSearch?: () => void;
}

const viewModes: { id: ViewMode; icon: typeof List; tip: string }[] = [
  { id: "grid", icon: LayoutGrid, tip: "Grid" },
  { id: "list", icon: List, tip: "List" },
  { id: "detail", icon: LayoutList, tip: "Detail" },
  { id: "group", icon: Layers, tip: "Group by author" },
];

const sortOptions: { field: SortField; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "author", label: "Author" },
  { field: "format", label: "Format" },
];

const formatOptions: FormatFilter[] = ["all", "EPUB", "PDF", "CBZ", "CBR", "MOBI"];

/** Compact toolbar pill — 32px tall, rounded-full (conventions §6). */
const pillClass =
  "focus-ring pressable inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors duration-150 [&_svg]:size-3.5 [&_svg]:shrink-0";

function openSearch() {
  // The search overlay listens for the registered Ctrl+K shortcut on window.
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
}

export function ContentToolbar({
  viewMode,
  onViewModeChange,
  viewLabel,
  itemCount,
  sortField,
  sortDir,
  onSortChange,
  formatFilter,
  onFormatFilterChange,
  onImport,
  onSearch,
}: ContentToolbarProps) {
  const activeSort = sortOptions.find((o) => o.field === sortField);
  const filtered = formatFilter !== "all";

  return (
    <header className="flex shrink-0 items-center gap-6 px-8 pt-6 pb-4">
      {/* Title + count */}
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <h1 className="text-large-title truncate text-label">{viewLabel}</h1>
        <span className="shrink-0 text-sm text-label-tertiary tabular-nums">
          <NumberTicker value={itemCount} /> {itemCount === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Control cluster */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Search pill */}
        <button
          type="button"
          onClick={onSearch ?? openSearch}
          className={cn(
            pillClass,
            "w-44 bg-fill-tertiary pr-1.5 pl-3 text-label-tertiary hover:bg-fill-secondary hover:text-label-secondary",
          )}
        >
          <Search strokeWidth={2} />
          <span className="flex-1 text-left font-normal">Search</span>
          <Kbd>Ctrl K</Kbd>
        </button>

        {/* Format filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Filter by format"
              className={cn(
                pillClass,
                filtered
                  ? "bg-brand/15 text-brand hover:bg-brand/20"
                  : "text-label-secondary hover:bg-fill-tertiary hover:text-label data-[state=open]:bg-fill-tertiary data-[state=open]:text-label",
              )}
            >
              <ListFilter strokeWidth={2} />
              {filtered ? formatFilter : "Filter"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
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
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Sort"
              className={cn(
                pillClass,
                "text-label-secondary hover:bg-fill-tertiary hover:text-label data-[state=open]:bg-fill-tertiary data-[state=open]:text-label",
              )}
            >
              <ArrowUpDown strokeWidth={2} />
              {activeSort?.label ?? "Sort"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            {sortOptions.map((opt) => {
              const active = sortField === opt.field;
              const DirIcon = sortDir === "asc" ? ArrowUp : ArrowDown;
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
                  {active && <DirIcon className="size-4 opacity-60" strokeWidth={2} />}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onSortChange(sortField, sortDir === "asc" ? "desc" : "asc")}
            >
              <ArrowUpDown className="size-4" strokeWidth={2} />
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
        <Button size="sm" onClick={onImport} className="ml-1 rounded-md">
          <Plus strokeWidth={2.25} />
          Import
        </Button>
      </div>
    </header>
  );
}
