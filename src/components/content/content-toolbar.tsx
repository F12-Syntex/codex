"use client";

import {
  LayoutGrid,
  List,
  LayoutList,
  ArrowUpDown,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ViewMode = "list" | "grid" | "detail";

interface ContentToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  viewLabel: string;
  itemCount: number;
}

const viewModes: { id: ViewMode; icon: typeof List; tip: string }[] = [
  { id: "list", icon: List, tip: "List" },
  { id: "grid", icon: LayoutGrid, tip: "Grid" },
  { id: "detail", icon: LayoutList, tip: "Detail" },
];

export function ContentToolbar({
  viewMode,
  onViewModeChange,
  viewLabel,
  itemCount,
}: ContentToolbarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2">
      <h1 className="text-sm font-semibold">{viewLabel}</h1>
      <span className="text-xs text-white/30">{itemCount}</span>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-lg px-2 text-xs text-muted-foreground"
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
        Sort
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-lg px-2 text-xs text-muted-foreground"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filter
      </Button>

      {/* View toggle — 3 modes */}
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
