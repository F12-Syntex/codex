"use client";

/**
 * ProgressRing — compact circular progress with a spring-smoothed arc.
 * Adapted from 21st.dev "Progress" (edwinvakayil/r-progress, circular variant):
 * same spring-smoothed fill + rotating indeterminate arc, re-tokenised for Codex
 * (fill-tertiary track, accent/system colors, no hardcoded palette).
 *
 *   <ProgressRing value={0.42} size={28} />
 *   <ProgressRing indeterminate color="var(--system-purple)" />
 *   <ProgressRing value={1} color="var(--system-green)"><Check /></ProgressRing>
 */

import * as React from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

const FILL_SPRING = { stiffness: 90, damping: 18, mass: 1, restDelta: 0.0005 };

export interface ProgressRingProps {
  /** Progress from 0 to 1. Ignored when `indeterminate`. */
  value?: number;
  indeterminate?: boolean;
  /** Diameter in px. */
  size?: number;
  /** Stroke width in px. */
  stroke?: number;
  /** Arc color (CSS color / var). Defaults to the accent. */
  color?: string;
  /** Track color. Defaults to the tertiary fill. */
  trackColor?: string;
  className?: string;
  /** Centered content (icon, count…). */
  children?: React.ReactNode;
  "aria-label"?: string;
}

export function ProgressRing({
  value = 0,
  indeterminate = false,
  size = 28,
  stroke = 3,
  color = "var(--accent-brand)",
  trackColor = "var(--fill-tertiary)",
  className,
  children,
  "aria-label": ariaLabel = "Progress",
}: ProgressRingProps) {
  const reduce = useReducedMotion();
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const spring = useSpring(clamped, FILL_SPRING);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dashOffset = useTransform(spring, (v) => c * (1 - v));

  React.useEffect(() => {
    if (reduce) spring.jump(clamped);
    else spring.set(clamped);
  }, [clamped, reduce, spring]);

  return (
    <span
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped * 100)}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <motion.svg
        aria-hidden
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
        animate={indeterminate && !reduce ? { rotate: [0, 360] } : undefined}
        transition={indeterminate && !reduce ? { duration: 1.1, ease: "linear", repeat: Infinity } : undefined}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        {indeterminate ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        ) : (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            style={{ strokeDashoffset: dashOffset }}
          />
        )}
      </motion.svg>
      {children && <span className="relative inline-flex items-center justify-center">{children}</span>}
    </span>
  );
}

export default ProgressRing;
