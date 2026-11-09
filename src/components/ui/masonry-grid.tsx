"use client";

/**
 * MasonryGrid — CSS-columns masonry with a staggered blur/fade-up entrance.
 *
 * Adapted from 21st.dev "Masonry Grid" (ravikatiyar162, id 7844): ported to
 * `motion/react`, stagger capped at 12 items (conventions §8), the per-item
 * 3D parallax dropped in favour of the card's own SpotlightCard light, and
 * reduced-motion respected. Column count is controlled via `className`
 * (e.g. `columns-1 md:columns-2 xl:columns-3`).
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

interface MasonryGridProps<T> {
  items: T[];
  getKey: (item: T, index: number) => React.Key;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  /** Tailwind gap applied as column gap + item bottom margin. */
  gapClassName?: string;
  itemClassName?: string;
  staggerDelay?: number;
}

export function MasonryGrid<T>({
  items,
  getKey,
  renderItem,
  className,
  gapClassName = "gap-4",
  itemClassName = "mb-4",
  staggerDelay = 0.03,
}: MasonryGridProps<T>) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn("w-full", gapClassName, className)} role="list">
      {items.map((item, index) => (
        <motion.div
          key={getKey(item, index)}
          role="listitem"
          className={cn("break-inside-avoid", itemClassName)}
          initial={reduceMotion ? false : { opacity: 0, y: 12, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: 0.45,
            ease: [0.16, 1, 0.3, 1],
            delay: Math.min(index, 12) * staggerDelay,
          }}
        >
          {renderItem(item, index)}
        </motion.div>
      ))}
    </div>
  );
}

export default MasonryGrid;
