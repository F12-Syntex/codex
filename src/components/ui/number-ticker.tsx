"use client";

/**
 * NumberTicker — a number that springs to its value (counts up on mount,
 * glides between later values). Tabular figures so width never jitters.
 * Adapted from 21st.dev "Number Ticker" (dillionverma / Magic UI, id 1282).
 */

import * as React from "react";
import { useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { cn } from "@/lib/utils";

export interface NumberTickerProps extends Omit<React.ComponentProps<"span">, "children"> {
  value: number;
  /** Start value for the first count (default 0). */
  from?: number;
  decimalPlaces?: number;
  /** Delay before the first count, in seconds. */
  delay?: number;
}

function formatNumber(n: number, decimalPlaces: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(Number(n.toFixed(decimalPlaces)));
}

export function NumberTicker({
  value,
  from = 0,
  decimalPlaces = 0,
  delay = 0,
  className,
  ...props
}: NumberTickerProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(reduceMotion ? value : from);
  const spring = useSpring(motionValue, { stiffness: 90, damping: 22, mass: 0.8 });
  // Rendered once; afterwards the DOM text is driven by the spring.
  const [initialText] = React.useState(() => formatNumber(reduceMotion ? value : from, decimalPlaces));

  React.useEffect(() => {
    if (reduceMotion) {
      motionValue.jump(value);
      spring.jump(value);
      if (ref.current) ref.current.textContent = formatNumber(value, decimalPlaces);
      return;
    }
    const id = window.setTimeout(() => motionValue.set(value), delay * 1000);
    return () => window.clearTimeout(id);
  }, [value, delay, decimalPlaces, reduceMotion, motionValue, spring]);

  React.useEffect(
    () =>
      spring.on("change", (latest) => {
        if (ref.current) ref.current.textContent = formatNumber(latest, decimalPlaces);
      }),
    [spring, decimalPlaces],
  );

  return (
    <span ref={ref} className={cn("inline-block tabular-nums", className)} {...props}>
      {initialText}
    </span>
  );
}

export default NumberTicker;
