"use client";

import {
  LayoutGrid,
  List,
  ArrowUpDown,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "list";

interface ContentToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  viewLabel: string;
  itemCount: number;
}

export function ContentToolbar({
  viewMode,
  onViewModeChange,
  viewLabel,
  itemCount,
}: ContentToolbarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2">
      {/* Title + count */}
      <h1 className="text-sm font-semibold">{viewLabel}</h1>
      <span className="text-xs text-white/30">{itemCount}</span>

      <div className="flex-1" />

      {/* Sort */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-lg px-2 text-xs text-muted-foreground"
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
        Sort
      </Button>

      {/* Filter */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-lg px-2 text-xs text-muted-foreground"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filter
      </Button>

      {/* View toggle */}
      <div className="flex gap-0.5 rounded-lg bg-[var(--bg-inset)] p-0.5">
        <button
          onClick={() => onViewModeChange("grid")}
          className={cn(
            "rounded-lg p-1.5 transition-all",
            viewMode === "grid"
              ? "bg-[var(--bg-elevated)] text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onViewModeChange("list")}
          className={cn(
            "rounded-lg p-1.5 transition-all",
            viewMode === "list"
              ? "bg-[var(--bg-elevated)] text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <List className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Import */}
      <Button
        size="sm"
        className="h-7 gap-1.5 rounded-lg bg-white/[0.08] px-3 text-xs font-medium text-foreground hover:bg-white/[0.12]"
      >
        <Plus className="h-3.5 w-3.5" />
        Import
      </Button>
    </div>
  );
}
