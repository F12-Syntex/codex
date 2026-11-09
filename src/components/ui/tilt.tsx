"use client";

/**
 * Tilt — spring-driven 3D pointer tilt with an optional glare highlight.
 * Adapted from 21st.dev "Tilt" (ibelick, id 1448) and "Optimized Tilt Card"
 * (sh20raj, id 27139): motion springs for the rotation, a pointer-following
 * light sheen for the glare. Keep it within ±6° (conventions §12.4).
 *
 * Built to sit on every cover of a 1,000-book grid:
 * - At rest it is a plain `div` — no motion values, no springs, no layer.
 * - The springs mount lazily on the first `pointerenter` (`TiltDriver`, which
 *   renders nothing and writes styles straight to the node).
 * - `will-change: transform` is set only while hovered and dropped once the
 *   tilt has sprung back, so idle covers never hold a compositor layer.
 */

import * as React from "react";
import {
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";

const SPRING = { stiffness: 260, damping: 26, mass: 0.6 };
const HOVER_SPRING = { stiffness: 300, damping: 30 };

export interface TiltProps extends React.ComponentProps<"div"> {
  /** Maximum rotation in degrees on each axis. */
  maxTilt?: number;
  /** Render a soft pointer-following glare on top of the content. */
  glare?: boolean;
  /** Slight scale while hovered (1 = none). */
  hoverScale?: number;
}

interface TiltApi {
  enter: () => void;
  move: (x: number, y: number) => void;
  leave: () => void;
}

export function Tilt({
  maxTilt = 6,
  glare = false,
  hoverScale = 1,
  className,
  children,
  onPointerMove,
  onPointerLeave,
  onPointerEnter,
  ...props
}: TiltProps) {
  const reduceMotion = useReducedMotion();
  const nodeRef = React.useRef<HTMLDivElement>(null);
  const glareRef = React.useRef<HTMLSpanElement>(null);
  const apiRef = React.useRef<TiltApi | null>(null);
  const hoveredRef = React.useRef(false);
  const lastPointRef = React.useRef({ x: 0, y: 0 });
  const [armed, setArmed] = React.useState(false);

  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5,
    };
  };

  return (
    <div
      ref={nodeRef}
      className={cn("relative", className)}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (reduceMotion || event.pointerType === "touch") return;
        hoveredRef.current = true;
        lastPointRef.current = point(event);
        if (apiRef.current) apiRef.current.enter();
        else if (!armed) setArmed(true);
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (event.pointerType === "touch") return;
        const p = point(event);
        lastPointRef.current = p;
        apiRef.current?.move(p.x, p.y);
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        hoveredRef.current = false;
        apiRef.current?.leave();
      }}
      {...props}
    >
      {children}
      {glare && !reduceMotion && (
        <span
          ref={glareRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 opacity-0 mix-blend-overlay"
          style={{ borderRadius: "inherit" }}
        />
      )}
      {armed && !reduceMotion && (
        <TiltDriver
          nodeRef={nodeRef}
          glareRef={glareRef}
          apiRef={apiRef}
          hoveredRef={hoveredRef}
          lastPointRef={lastPointRef}
          maxTilt={maxTilt}
          hoverScale={hoverScale}
        />
      )}
    </div>
  );
}

/** Owns the springs; mounted on first hover, renders nothing. */
function TiltDriver({
  nodeRef,
  glareRef,
  apiRef,
  hoveredRef,
  lastPointRef,
  maxTilt,
  hoverScale,
}: {
  nodeRef: React.RefObject<HTMLDivElement | null>;
  glareRef: React.RefObject<HTMLSpanElement | null>;
  apiRef: React.RefObject<TiltApi | null>;
  hoveredRef: React.RefObject<boolean>;
  lastPointRef: React.RefObject<{ x: number; y: number }>;
  maxTilt: number;
  hoverScale: number;
}) {
  // Pointer position, normalised to [-0.5, 0.5]
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const hover = useMotionValue(0);

  const sx = useSpring(px, SPRING);
  const sy = useSpring(py, SPRING);
  const sHover = useSpring(hover, HOVER_SPRING);

  const rotateX = useTransform(sy, [-0.5, 0.5], [maxTilt, -maxTilt]);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-maxTilt, maxTilt]);
  const scale = useTransform(sHover, [0, 1], [1, hoverScale]);
  const glareX = useTransform(sx, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(sy, [-0.5, 0.5], [0, 100]);

  const transform = useMotionTemplate`perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`;
  // The glare is light falling on a physical object (often a book cover), so it
  // is a literal white highlight, like other cover overlays (conventions §1).
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgb(255 255 255 / 0.28), rgb(255 255 255 / 0.06) 35%, transparent 65%)`;

  useMotionValueEvent(transform, "change", (v) => {
    const node = nodeRef.current;
    if (node) node.style.transform = v;
  });
  useMotionValueEvent(glareBackground, "change", (v) => {
    const g = glareRef.current;
    if (g) g.style.background = v;
  });
  useMotionValueEvent(sHover, "change", (v) => {
    const g = glareRef.current;
    if (g) g.style.opacity = String(v);
  });
  // Back at rest: drop the layer and the transform entirely.
  useMotionValueEvent(sHover, "animationComplete", () => {
    const node = nodeRef.current;
    if (!node || hoveredRef.current) return;
    node.style.willChange = "";
    node.style.transform = "";
  });

  React.useEffect(() => {
    const node = nodeRef.current;
    const api: TiltApi = {
      enter: () => {
        if (node) {
          node.style.willChange = "transform";
          node.style.transformStyle = "preserve-3d";
        }
        hover.set(1);
      },
      move: (x, y) => {
        px.set(x);
        py.set(y);
      },
      leave: () => {
        px.set(0);
        py.set(0);
        hover.set(0);
      },
    };
    apiRef.current = api;
    // Mounted by the first pointerenter — catch up with where the pointer is.
    if (hoveredRef.current) {
      api.enter();
      api.move(lastPointRef.current.x, lastPointRef.current.y);
    }
    return () => {
      apiRef.current = null;
      if (node) {
        node.style.willChange = "";
        node.style.transform = "";
        node.style.transformStyle = "";
      }
    };
  }, [nodeRef, apiRef, hoveredRef, lastPointRef, px, py, hover]);

  return null;
}

export default Tilt;
