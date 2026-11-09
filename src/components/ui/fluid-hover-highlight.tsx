"use client";

/**
 * FluidHoverHighlight — one highlight that glides between list rows as the
 * pointer moves, instead of blinking on each row's :hover.
 * Adapted from 21st.dev "Fluid Hover Highlight" (educalvolpz) — the
 * measuring hook is rewritten to read offsets lazily (cheap for long lists:
 * rows stay plain elements, only one motion node exists).
 *
 *   const hover = useFluidHover<HTMLDivElement>();
 *   <div ref={hover.ref} {...hover.handlers} className="relative">
 *     <FluidHoverHighlight hover={hover} className="rounded-md bg-fill-quaternary" />
 *     {rows.map(r => <div data-fluid-item className="relative">…</div>)}
 *   </div>
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface FluidRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FluidHover<T extends HTMLElement> {
  ref: React.RefObject<T | null>;
  rect: FluidRect | null;
  session: number;
  handlers: {
    onPointerOver: (e: React.PointerEvent) => void;
    onPointerLeave: () => void;
  };
}

export function useFluidHover<T extends HTMLElement = HTMLDivElement>(): FluidHover<T> {
  const ref = React.useRef<T>(null);
  const [rect, setRect] = React.useState<FluidRect | null>(null);
  const [session, setSession] = React.useState(0);
  const rectRef = React.useRef<FluidRect | null>(null);

  const onPointerOver = React.useCallback((e: React.PointerEvent) => {
    const item = (e.target as Element).closest<HTMLElement>("[data-fluid-item]");
    if (!item || !ref.current?.contains(item)) return;
    const next = { x: item.offsetLeft, y: item.offsetTop, width: item.offsetWidth, height: item.offsetHeight };
    const prev = rectRef.current;
    if (prev && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height) return;
    if (!prev) setSession((s) => s + 1);
    rectRef.current = next;
    setRect(next);
  }, []);

  const onPointerLeave = React.useCallback(() => {
    rectRef.current = null;
    setRect(null);
  }, []);

  return { ref, rect, session, handlers: { onPointerOver, onPointerLeave } };
}

export function FluidHoverHighlight<T extends HTMLElement>({
  hover,
  className,
}: {
  hover: Pick<FluidHover<T>, "rect" | "session">;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const { rect, session } = hover;
  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.8, opacity: { duration: 0.1 } };

  return (
    <AnimatePresence>
      {rect && (
        <motion.div
          key={session}
          aria-hidden
          initial={{ opacity: 0, ...rect }}
          animate={{ opacity: 1, ...rect }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={transition}
          className={cn("pointer-events-none absolute left-0 top-0 bg-fill-quaternary", className)}
        />
      )}
    </AnimatePresence>
  );
}

export default FluidHoverHighlight;
