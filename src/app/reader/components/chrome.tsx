"use client";

/**
 * Shared reader-chrome primitives: round glass-pill icon buttons, panel
 * motion presets and a key guard so panel controls don't flip pages.
 */

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const PANEL_SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;
export const LAYOUT_SPRING = { type: "spring", bounce: 0.2, duration: 0.45 } as const;

/*
 * Entrance blurs end at `filter: none` (transitionEnd): a lingering
 * `blur(0px)` makes the panel a Backdrop Root and kills nested glass.
 */

/** Popover-from-top entrance (header panels). */
export const dropIn = {
  initial: { opacity: 0, y: -8, scale: 0.97, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } },
  exit: { opacity: 0, y: -6, scale: 0.98, filter: "blur(2px)", transition: { duration: 0.14 } },
};

/** Sheet-from-bottom entrance (footer panels). */
export const riseIn = {
  initial: { opacity: 0, y: 10, scale: 0.97, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } },
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

/**
 * Every reader panel is the same object: a 320px `glass-thick` sheet with 20px radius, pinned to
 * a window edge on the shared lines (top 60, bottom 68, inset 12). Panels float over the page —
 * they never push the text column — and only one is open at a time.
 */
export const READER_PANEL =
  "glass-thick grain z-30 flex w-80 flex-col overflow-hidden rounded-2xl text-label";

/** One header for every reader panel: serif title, one meta line, round close button. */
export function PanelHeader({
  title,
  subtitle,
  onClose,
  closeLabel = "Close",
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** Extra controls left of the close button. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-start gap-2 px-4 pt-4 pb-3">
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-base font-semibold text-label">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs tabular-nums text-label-secondary">{subtitle}</p>}
      </div>
      {children}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="focus-ring pressable -mr-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary transition-colors duration-150 hover:bg-fill-secondary hover:text-label"
      >
        <X className="size-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}

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
