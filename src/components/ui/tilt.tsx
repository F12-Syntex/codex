"use client";

/**
 * Tilt — spring-driven 3D pointer tilt with an optional glare highlight.
 * Adapted from 21st.dev "Tilt" (ibelick, id 1448) and "Optimized Tilt Card"
 * (sh20raj, id 27139): motion springs for the rotation, a pointer-following
 * light sheen for the glare. Keep it within ±6° (conventions §12.4).
 */

import * as React from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from "motion/react";
import { cn } from "@/lib/utils";

const SPRING = { stiffness: 260, damping: 26, mass: 0.6 };

export interface TiltProps extends Omit<HTMLMotionProps<"div">, "children"> {
  /** Maximum rotation in degrees on each axis. */
  maxTilt?: number;
  /** Render a soft pointer-following glare on top of the content. */
  glare?: boolean;
  /** Slight scale while hovered (1 = none). */
  hoverScale?: number;
  children?: React.ReactNode;
}

export function Tilt({
  maxTilt = 6,
  glare = false,
  hoverScale = 1,
  className,
  style,
  children,
  onPointerMove,
  onPointerLeave,
  onPointerEnter,
  ...props
}: TiltProps) {
  const reduceMotion = useReducedMotion();

  // Pointer position, normalised to [-0.5, 0.5]
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const hover = useMotionValue(0);

  const sx = useSpring(px, SPRING);
  const sy = useSpring(py, SPRING);
  const sHover = useSpring(hover, { stiffness: 300, damping: 30 });

  const rotateX = useTransform(sy, [-0.5, 0.5], [maxTilt, -maxTilt]);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-maxTilt, maxTilt]);
  const scale = useTransform(sHover, [0, 1], [1, hoverScale]);
  const glareX = useTransform(sx, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(sy, [-0.5, 0.5], [0, 100]);
  const glareOpacity = useTransform(sHover, [0, 1], [0, 1]);

  const transform = useMotionTemplate`perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`;
  // The glare is light falling on a physical object (often a book cover), so it
  // is a literal white highlight, like other cover overlays (conventions §1).
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgb(255 255 255 / 0.28), rgb(255 255 255 / 0.06) 35%, transparent 65%)`;

  if (reduceMotion) {
    return (
      <motion.div
        className={cn("relative", className)}
        style={style}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerEnter={onPointerEnter}
        {...props}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={cn("relative will-change-transform", className)}
      style={{ transformStyle: "preserve-3d", ...style, transform }}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (event.pointerType !== "touch") hover.set(1);
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (event.pointerType === "touch") return;
        const rect = event.currentTarget.getBoundingClientRect();
        px.set((event.clientX - rect.left) / rect.width - 0.5);
        py.set((event.clientY - rect.top) / rect.height - 0.5);
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        px.set(0);
        py.set(0);
        hover.set(0);
      }}
      {...props}
    >
      {children}
      {glare && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 mix-blend-overlay"
          style={{ borderRadius: "inherit", background: glareBackground, opacity: glareOpacity }}
        />
      )}
    </motion.div>
  );
}

export default Tilt;
