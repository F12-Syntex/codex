"use client";

/**
 * SelectionBar — floating glass pill above the dock for batch actions.
 * Adapted from 21st.dev "Expandable Action Bar" (arihantcodes / beui, id 26780):
 * rounded-full glass track, spring item transitions and a shared `layoutId`
 * hover highlight that glides between actions. Springs in from below.
 */

import * as React from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowRightLeft, Trash2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 460, damping: 34, mass: 0.62 } as const;

export interface SelectionBarTarget<V extends string> {
  view: V;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

interface SelectionBarProps<V extends string> {
  count: number;
  moveTargets: SelectionBarTarget<V>[];
  onMove: (view: V) => void;
  onDelete: () => void;
  onClear: () => void;
}

export function SelectionBar<V extends string>({
  count,
  moveTargets,
  onMove,
  onDelete,
  onClear,
}: SelectionBarProps<V>) {
  const reduce = useReducedMotion();
  const layoutId = React.useId();
  const [hovered, setHovered] = React.useState<string | null>(null);

  const itemClass =
    "focus-ring relative isolate inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-[color,transform] duration-150 active:scale-[0.97] [&_svg]:size-4 [&_svg]:shrink-0";

  const highlight = (id: string, danger = false) =>
    hovered === id ? (
      <motion.span
        layoutId={`${layoutId}-hl`}
        transition={reduce ? { duration: 0 } : SPRING}
        className={cn("absolute inset-0 -z-10 rounded-full", danger ? "bg-danger/15" : "bg-fill-tertiary")}
      />
    ) : null;

  return (
    <AnimatePresence>
      {count > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-8">
          <motion.div
            role="toolbar"
            aria-label="Selection actions"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96, filter: "blur(4px)" }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 30 }}
            onPointerLeave={() => setHovered(null)}
            className="glass pointer-events-auto flex h-11 items-center gap-1 rounded-full p-1.5 pl-4"
          >
            <span className="pr-2 text-sm font-medium text-label tabular-nums">
              <NumberTicker value={count} from={Math.max(0, count - 1)} />{" "}
              <span className="text-label-secondary">selected</span>
            </span>

            <div aria-hidden className="mx-1 h-5 w-px bg-separator" />

            <LayoutGroup id={layoutId}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onPointerEnter={() => setHovered("move")}
                    className={cn(itemClass, "text-label-secondary hover:text-label data-[state=open]:text-label")}
                  >
                    {highlight("move")}
                    <ArrowRightLeft strokeWidth={1.75} />
                    Move to
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" sideOffset={10} className="min-w-44">
                  <DropdownMenuLabel>Move to</DropdownMenuLabel>
                  {moveTargets.map((t) => (
                    <DropdownMenuItem key={t.view} onClick={() => onMove(t.view)}>
                      <t.icon className="size-4" strokeWidth={1.75} />
                      {t.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                onClick={onDelete}
                onPointerEnter={() => setHovered("delete")}
                className={cn(itemClass, "text-danger")}
              >
                {highlight("delete", true)}
                <Trash2 strokeWidth={1.75} />
                Delete
              </button>

              <div aria-hidden className="mx-1 h-5 w-px bg-separator" />

              <button
                type="button"
                aria-label="Clear selection"
                title="Clear selection (Esc)"
                onClick={onClear}
                onPointerEnter={() => setHovered("clear")}
                className={cn(itemClass, "w-8 justify-center px-0 text-label-tertiary hover:text-label")}
              >
                {highlight("clear")}
                <X strokeWidth={2} />
              </button>
            </LayoutGroup>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
