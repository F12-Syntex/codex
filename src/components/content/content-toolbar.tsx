"use client";

import { useState, useRef, useEffect } from "react";
import {
  LayoutGrid,
  List,
  LayoutList,
  ArrowUpDown,
  Plus,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BookFormat } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export type ViewMode = "list" | "grid" | "detail";
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
}

const viewModes: { id: ViewMode; icon: typeof List; tip: string }[] = [
  { id: "list", icon: List, tip: "List" },
  { id: "grid", icon: LayoutGrid, tip: "Grid" },
  { id: "detail", icon: LayoutList, tip: "Detail" },
];

const sortOptions: { field: SortField; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "author", label: "Author" },
  { field: "format", label: "Format" },
];

const formatOptions: FormatFilter[] = ["all", "EPUB", "PDF", "CBZ", "CBR", "MOBI"];

/* ── Dropdown menu ───────────────────────────── */
function Dropdown({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-white/[0.08] bg-[var(--bg-overlay)] py-1 shadow-xl shadow-black/40"
    >
      {children}
    </div>
  );
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
}: ContentToolbarProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2">
      <h1 className="text-sm font-semibold">{viewLabel}</h1>
      <span className="text-xs text-white/30">{itemCount}</span>

      <div className="flex-1" />

      {/* Sort */}
      <div className="relative">
        <button
          onClick={() => { setSortOpen((v) => !v); setFilterOpen(false); }}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:text-foreground",
            sortOpen && "bg-white/[0.06] text-foreground"
          )}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Sort
        </button>
        <Dropdown open={sortOpen} onClose={() => setSortOpen(false)}>
          {sortOptions.map((opt) => {
            const active = sortField === opt.field;
            return (
              <button
                key={opt.field}
                onClick={() => {
                  if (active) {
                    onSortChange(opt.field, sortDir === "asc" ? "desc" : "asc");
                  } else {
                    onSortChange(opt.field, "asc");
                  }
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white/80"
              >
                <Check className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-0")} />
                {opt.label}
                {active && (
                  <span className="ml-auto text-[11px] text-white/25">
                    {sortDir === "asc" ? "A→Z" : "Z→A"}
                  </span>
                )}
              </button>
            );
          })}
        </Dropdown>
      </div>

      {/* Filter */}
      <div className="relative">
        <button
          onClick={() => { setFilterOpen((v) => !v); setSortOpen(false); }}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs transition-colors",
            filterOpen
              ? "bg-white/[0.06] text-foreground"
              : formatFilter !== "all"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {formatFilter === "all" ? "Filter" : formatFilter}
        </button>
        <Dropdown open={filterOpen} onClose={() => setFilterOpen(false)}>
          {formatOptions.map((f) => {
            const active = formatFilter === f;
            return (
              <button
                key={f}
                onClick={() => {
                  onFormatFilterChange(f);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white/80"
              >
                <Check className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-0")} />
                {f === "all" ? "All formats" : f}
              </button>
            );
          })}
        </Dropdown>
      </div>

      {/* View toggle */}
      <div className="flex gap-0.5 rounded-lg bg-[var(--bg-inset)] p-0.5">
        {viewModes.map((v) => (
          <Tooltip key={v.id} delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onViewModeChange(v.id)}
                className={cn(
                  "rounded-lg p-1.5 transition-all",
                  viewMode === v.id
                    ? "bg-[var(--bg-elevated)] text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <v.icon className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{v.tip}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <button className="flex h-7 items-center gap-1.5 rounded-lg bg-white/[0.08] px-3 text-xs font-medium text-foreground transition-colors hover:bg-white/[0.12]">
        <Plus className="h-3.5 w-3.5" />
        Import
      </button>
    </div>
  );
}
