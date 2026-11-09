"use client";

/**
 * ShimmerText — a sheen that sweeps across tertiary-label text. For AI
 * "Thinking…" / loading states.
 * Adapted from 21st.dev "Text Shimmer" (ibelick, id 1641): two-layer
 * background-clip text (moving highlight band over a base colour), with our
 * label tokens and a reduced-motion fallback.
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface ShimmerTextProps {
  children: React.ReactNode;
  className?: string;
  /** Seconds per sweep. */
  duration?: number;
  /** Width of the highlight band in px per character (strings only). */
  spread?: number;
}

export function ShimmerText({ children, className, duration = 1.8, spread = 2.5 }: ShimmerTextProps) {
  const reduceMotion = useReducedMotion();
  const band = typeof children === "string" ? Math.max(24, children.length * spread) : 40;

  if (reduceMotion) {
    return <span className={cn("text-label-tertiary", className)}>{children}</span>;
  }

  return (
    <motion.span
      className={cn("relative inline-block bg-clip-text text-transparent", className)}
      initial={{ backgroundPosition: "100% center" }}
      animate={{ backgroundPosition: "0% center" }}
      transition={{ repeat: Infinity, duration, ease: "linear" }}
      style={{
        backgroundImage: `linear-gradient(90deg, transparent calc(50% - ${band}px), var(--label), transparent calc(50% + ${band}px)), linear-gradient(var(--label-tertiary), var(--label-tertiary))`,
        backgroundSize: "250% 100%, auto",
        backgroundRepeat: "no-repeat, padding-box",
        WebkitBackgroundClip: "text",
      }}
    >
      {children}
    </motion.span>
  );
}

export default ShimmerText;
