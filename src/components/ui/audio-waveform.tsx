"use client";

/**
 * AudioWaveform — a row of bars that breathe while something plays.
 * Adapted from 21st.dev "Klyv Waveform" (klyv-ui, MIT) — tokens, no theme CSS.
 *
 * Movement is one `scaleY` keyframe per bar (compositor only); a paused
 * waveform costs nothing. `progress` dims the bars ahead of the playhead.
 *
 *   <AudioWaveform label="Narration" playing progress={0.4} bars={40} />
 */

import { useMemo, type CSSProperties } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface AudioWaveformProps {
  /** Accessible description of what the bars represent. */
  label: string;
  /** Bar count (ignored when `values` is given). */
  bars?: number;
  /** Fixed heights 0–1 for a real signal. */
  values?: number[];
  /** Animate the bars. */
  playing?: boolean;
  /** Fraction already played, 0–1. Bars behind it stay lit. */
  progress?: number;
  /** Overall height in px. */
  height?: number;
  /** Width of a bar in px. */
  barWidth?: number;
  /** Gap between bars in px. */
  gap?: number;
  /** Mirror around the centre line. */
  mirrored?: boolean;
  /** Bar colour class. Defaults to the accent. */
  barClassName?: string;
  className?: string;
}

export function AudioWaveform({
  label,
  bars = 32,
  values,
  playing = false,
  progress,
  height = 32,
  barWidth = 3,
  gap = 3,
  mirrored = true,
  barClassName = "bg-brand",
  className,
}: AudioWaveformProps) {
  const reduceMotion = useReducedMotion();

  const heights = useMemo(() => {
    if (values && values.length > 0) return values.map((v) => Math.min(1, Math.max(0.08, v)));
    // Deterministic envelope — two sines at co-prime rates read as random.
    return Array.from({ length: bars }, (_, i) => {
      const wave = Math.sin(i * 1.37) * 0.5 + Math.sin(i * 0.53) * 0.35;
      return 0.22 + Math.abs(wave) * 0.74;
    });
  }, [bars, values]);

  const played = typeof progress === "number" ? Math.round(heights.length * progress) : null;
  const animate = playing && !reduceMotion;

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("flex", mirrored ? "items-center" : "items-end", className)}
      style={{ gap, height }}
    >
      {heights.map((value, index) => {
        const ahead = played !== null && index >= played;
        return (
          <span
            key={index}
            className={cn(
              "block shrink-0 rounded-full transition-opacity duration-500 ease-apple",
              barClassName,
              mirrored ? "origin-center" : "origin-bottom",
              ahead ? "opacity-25" : "opacity-100",
            )}
            style={
              {
                width: barWidth,
                height: `${value * 100}%`,
                "--bar-low": Math.max(0.2, value * 0.42),
                animation: animate
                  ? `codex-waveform-pulse ${0.7 + (index % 5) * 0.13}s ease-in-out ${(index % 7) * 0.08}s infinite alternate`
                  : undefined,
                transform: animate ? undefined : playing ? "scaleY(1)" : "scaleY(0.55)",
                transition: "transform 420ms var(--ease-spring), opacity 500ms var(--ease-apple)",
              } as CSSProperties
            }
          />
        );
      })}
      <style>{`@keyframes codex-waveform-pulse{from{transform:scaleY(var(--bar-low))}to{transform:scaleY(1)}}`}</style>
    </div>
  );
}

export default AudioWaveform;
