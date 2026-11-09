"use client";

/**
 * BlurFade — blur + fade-up entrance. Stagger siblings with `delay`
 * (20–30ms steps, cap ~12 items — conventions §8).
 * Adapted from 21st.dev "Blur Fade" (dillionverma / Magic UI, id 1079).
 */

import * as React from "react";
import { motion, useInView, useReducedMotion, type HTMLMotionProps } from "motion/react";

export interface BlurFadeProps extends Omit<HTMLMotionProps<"div">, "children" | "initial" | "animate"> {
  children?: React.ReactNode;
  /** Delay in seconds. */
  delay?: number;
  /** Duration in seconds. */
  duration?: number;
  /** Vertical travel in px. */
  yOffset?: number;
  /** Blur radius at start, e.g. "6px". */
  blur?: string;
  /** Wait until the element scrolls into view. */
  inView?: boolean;
}

export function BlurFade({
  children,
  className,
  delay = 0,
  duration = 0.42,
  yOffset = 8,
  blur = "6px",
  inView = false,
  ...props
}: BlurFadeProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const seen = useInView(ref, { once: true, margin: "-40px" });
  const visible = !inView || seen;

  const hidden = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, y: yOffset, filter: `blur(${blur})` };
  const shown = reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" };

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={hidden}
      animate={visible ? shown : hidden}
      transition={{ delay, duration, ease: [0.16, 1, 0.3, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export default BlurFade;
