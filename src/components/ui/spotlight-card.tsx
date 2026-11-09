"use client";

/**
 * SpotlightCard — a soft, accent-tinted light that follows the pointer across
 * a surface (the Codex "cursor light", conventions §12.4), plus a faint lit
 * edge nearest the pointer. Writes `--mx` / `--my` (px) on the element so
 * children can reuse the position. No re-renders: one rAF per move.
 * Adapted from 21st.dev "Spotlight" (kevingirelli, id 35180).
 */

import * as React from "react";
import { cn } from "@/lib/utils";

const RING_MASK = "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";

const lightClass =
  "pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 ease-apple motion-reduce:transition-none group-hover/spotlight:opacity-100 group-focus-within/spotlight:opacity-100";

export interface SpotlightCardProps extends React.HTMLAttributes<HTMLElement> {
  /** Element to render (default `div`). */
  as?: React.ElementType;
  /** Radius of the light in px. */
  size?: number;
  /** Also light the edge nearest the pointer. */
  ring?: boolean;
  /** Any CSS colour; defaults to the accent. */
  color?: string;
  [key: string]: unknown;
}

export function SpotlightCard({
  as: Comp = "div",
  size = 280,
  ring = true,
  color = "var(--accent-brand)",
  className,
  children,
  onPointerMove,
  ...props
}: SpotlightCardProps) {
  const frame = React.useRef(0);
  React.useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const circle = `${size}px circle at var(--mx, 50%) var(--my, 50%)`;

  return (
    <Comp
      data-slot="spotlight-card"
      className={cn("group/spotlight relative isolate", className)}
      onPointerMove={(event: React.PointerEvent<HTMLElement>) => {
        onPointerMove?.(event);
        if (event.pointerType === "touch") return;
        const target = event.currentTarget;
        const { clientX, clientY } = event;
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          const bounds = target.getBoundingClientRect();
          target.style.setProperty("--mx", `${clientX - bounds.left}px`);
          target.style.setProperty("--my", `${clientY - bounds.top}px`);
        });
      }}
      {...props}
    >
      <span
        aria-hidden
        data-slot="spotlight-light"
        className={lightClass}
        style={{
          borderRadius: "inherit",
          background: `radial-gradient(${circle}, color-mix(in srgb, ${color} 14%, transparent), transparent 70%)`,
        }}
      />
      {ring && (
        <span
          aria-hidden
          data-slot="spotlight-ring"
          className={cn(lightClass, "-inset-px p-px")}
          style={{
            borderRadius: "inherit",
            background: `radial-gradient(${circle}, color-mix(in srgb, ${color} 55%, transparent), transparent 55%)`,
            mask: RING_MASK,
            maskComposite: "exclude",
            WebkitMask: RING_MASK,
            WebkitMaskComposite: "xor",
          }}
        />
      )}
      {children as React.ReactNode}
    </Comp>
  );
}

export default SpotlightCard;
