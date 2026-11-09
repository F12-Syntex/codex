"use client";

/**
 * BlurFade — blur + fade-up entrance. Stagger siblings with `blurFadeDelay(i)`
 * (30ms steps, capped — conventions §8) and pass `skip` for items past
 * `BLUR_FADE_LIMIT` so a 1,000-book grid doesn't run 1,000 filter animations.
 * Adapted from 21st.dev "Blur Fade" (dillionverma / Magic UI, id 1079).
 *
 * `inView` uses motion's `whileInView` (`once`), which shares one
 * IntersectionObserver per viewport config instead of one per element.
 */

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

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
  /** Render a plain, un-animated `div` (items past the stagger cap). */
  skip?: boolean;
}

/** Only the first N items of a list animate in; the rest render static. */
export const BLUR_FADE_LIMIT = 24;

/** 30ms per item, capped at 12 items (conventions §8). */
export const blurFadeDelay = (index: number, step = 0.03) => Math.min(index, 12) * step;

export function BlurFade({
  children,
  className,
  delay = 0,
  duration = 0.42,
  yOffset = 8,
  blur = "6px",
  inView = false,
  skip = false,
  ...props
}: BlurFadeProps) {
  const reduceMotion = useReducedMotion();

  if (skip) return <div className={className}>{children}</div>;

  const hidden = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, y: yOffset, filter: `blur(${blur})` };
  // End at `filter: none` — a lingering `blur(0px)` is a Backdrop Root and
  // kills the blur of any glass inside (conventions §2).
  const shown = reduceMotion
    ? { opacity: 1 }
    : { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } };
  const transition = { delay, duration, ease: [0.16, 1, 0.3, 1] as const };

  if (inView) {
    return (
      <motion.div
        className={className}
        initial={hidden}
        whileInView={shown}
        viewport={{ once: true, margin: "-40px" }}
        transition={transition}
        {...props}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div className={className} initial={hidden} animate={shown} transition={transition} {...props}>
      {children}
    </motion.div>
  );
}

export default BlurFade;
