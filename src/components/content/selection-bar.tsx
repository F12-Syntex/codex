"use client";

/**
 * SelectionBar — batch actions that take the dock's place.
 *
 * Contract with the shell (page.tsx / dock.tsx): the bar renders in the dock's
 * exact slot (`absolute inset-x-0 bottom-5`, `h-13`, `glass rounded-full`)
 * whenever `count > 0`, and the dock hides itself while
 * `selectedIds.size > 0` (`<Dock hidden={selectedIds.size > 0} />`). The two
 * cross-fade on the same y-spring, so the dock appears to morph into a
 * selection toolbar instead of stacking a second pill above it.
 *
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
    "focus-ring relative isolate inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-[color,transform] duration-150 active:scale-[0.97] [&_svg]:size-4 [&_svg]:shrink-0";

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
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-50 flex justify-center px-8">
          <motion.div
            role="toolbar"
            aria-label="Selection actions"
            // Same entrance as the dock's exit (y 24 → 0). No filter: a filter
            // on this element would make it a Backdrop Root and kill its glass.
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
            onPointerLeave={() => setHovered(null)}
            className="glass pointer-events-auto flex h-13 items-center gap-1 rounded-full pr-1.5 pl-5"
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
                <DropdownMenuContent side="top" align="start" sideOffset={14} className="min-w-44">
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
                className={cn(itemClass, "w-10 justify-center px-0 text-label-tertiary hover:text-label")}
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
