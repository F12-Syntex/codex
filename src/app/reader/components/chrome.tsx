"use client";

/**
 * Shared reader-chrome primitives: round glass-pill icon buttons, panel
 * motion presets and a key guard so panel controls don't flip pages.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export const PANEL_SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;
export const LAYOUT_SPRING = { type: "spring", bounce: 0.2, duration: 0.45 } as const;

/** Popover-from-top entrance (header panels). */
export const dropIn = {
  initial: { opacity: 0, y: -8, scale: 0.97, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, y: -6, scale: 0.98, filter: "blur(2px)", transition: { duration: 0.14 } },
};

/** Sheet-from-bottom entrance (footer panels). */
export const riseIn = {
  initial: { opacity: 0, y: 10, scale: 0.97, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, y: 8, scale: 0.98, filter: "blur(2px)", transition: { duration: 0.14 } },
};

/**
 * The reader listens for ←/→/PageUp/PageDown on window to turn pages.
 * Panels with sliders / segmented controls stop those keys from bubbling.
 */
export function stopNavKeys(e: React.KeyboardEvent) {
  if (e.key.startsWith("Arrow") || e.key === "PageUp" || e.key === "PageDown" || e.key === "Home" || e.key === "End") {
    e.stopPropagation();
  }
}

interface ChromeButtonProps extends React.ComponentProps<"button"> {
  /** Panel open / mode on — accent tint. */
  active?: boolean;
  /** Smaller 28px variant for dense pills. */
  compact?: boolean;
}

/** Round ghost icon button that lives inside a glass pill. */
export const ChromeButton = React.forwardRef<HTMLButtonElement, ChromeButtonProps>(function ChromeButton(
  { active = false, compact = false, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={props["aria-pressed"] ?? (active || undefined)}
      className={cn(
        "focus-ring pressable relative inline-flex shrink-0 items-center justify-center rounded-full",
        "transition-colors duration-150 ease-apple disabled:pointer-events-none disabled:opacity-30",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        compact ? "size-7" : "size-8",
        active
          ? "bg-brand/15 text-brand hover:bg-brand/20"
          : "text-label-secondary hover:bg-fill-tertiary hover:text-label",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

/** Thin vertical divider for use inside pills. */
export function PillDivider({ className }: { className?: string }) {
  return <span aria-hidden className={cn("mx-1 h-4 w-px shrink-0 bg-separator-strong", className)} />;
}

/**
 * Paper swatches for the theme picker. Literal colours are allowed here:
 * they mirror the reader paper themes in ../lib/constants.ts (conventions §1).
 */
export const PAPER_SWATCHES = [
  { id: "light", label: "White", paper: "#fafafa", ink: "#1a1a1a" },
  { id: "sepia", label: "Sepia", paper: "#f4ecd8", ink: "#5b4636" },
  { id: "dark", label: "Night", paper: "#1c1c1e", ink: "rgba(255,255,255,0.85)" },
] as const;
