"use client";

/**
 * EdgeBlur — progressive blur along the top (or bottom) edge of a scroll
 * region: stacked backdrop-blur layers, each masked to fade out, so content
 * softens as it slides under floating chrome instead of hard-clipping.
 * Adapted from 21st.dev "Edge Blur" (cult-ui, id 18015): positioned inside
 * its parent (not `fixed`) and with a `visible` switch.
 *
 * Opacity is set on each layer, never on a wrapper: an ancestor with
 * opacity < 1 becomes a Backdrop Root and would leave nothing to blur.
 */

import { cn } from "@/lib/utils";

const LAYERS = [1, 2, 4, 8, 12];

export function EdgeBlur({
  position = "top",
  visible = true,
  className,
}: {
  position?: "top" | "bottom";
  visible?: boolean;
  className?: string;
}) {
  const mask = `linear-gradient(to ${position === "top" ? "bottom" : "top"}, black 35%, transparent)`;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0",
        position === "top" ? "top-0" : "bottom-0",
        className,
      )}
    >
      {LAYERS.map((blur, i) => (
        <div
          key={blur}
          className="absolute inset-0 transition-opacity duration-300 ease-apple"
          style={{
            opacity: visible ? 1 : 0,
            backdropFilter: `blur(${blur}px)`,
            maskImage: mask,
            // Each heavier layer covers a shorter band, so the blur ramps.
            bottom: position === "top" ? `${i * 12}%` : undefined,
            top: position === "bottom" ? `${i * 12}%` : undefined,
          }}
        />
      ))}
    </div>
  );
}

export default EdgeBlur;
