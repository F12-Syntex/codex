"use client";

import { useState, useRef, useCallback, memo } from "react";
import { Check } from "lucide-react";
import { Tilt } from "@/components/ui/tilt";
import type { BookFormat } from "@/lib/mock-data";
import type { CoverStyle } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface BookCardProps {
  title: string;
  author: string;
  gradient: string;
  cover: string;
  format: BookFormat;
  coverStyle: CoverStyle;
  showFormatBadge: boolean;
  selected?: boolean;
  progress?: number; // 0-1
}

/** Cover radius per theme: rounded → cards radius, sharp → tiny chip radius. */
export function coverRadius(coverStyle: CoverStyle) {
  return coverStyle === "rounded" ? "rounded-lg" : "rounded-xs";
}

/**
 * Spine shading on the left edge of a cover — the binding crease of a real
 * book. Adapted from 21st.dev "Book" (designali-in, id 1758) `book-bind-bg`.
 * Literal colours are allowed: it's an overlay drawn on top of cover art.
 */
export const SPINE_STYLE: React.CSSProperties = {
  background:
    "linear-gradient(90deg, rgb(0 0 0 / 0.22) 0%, rgb(255 255 255 / 0.10) 2.5%, rgb(0 0 0 / 0.10) 5%, rgb(255 255 255 / 0.04) 8%, transparent 14%)",
};

/** Soft elliptical shadow where a floating cover meets the canvas. */
export const CONTACT_SHADOW: React.CSSProperties = {
  background: "radial-gradient(closest-side, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.18) 60%, transparent)",
  filter: "blur(4px)",
};

/** Sample pixels from a loaded image and return a dominant-ish RGB string. */
export function extractDominantColor(img: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  const size = 32; // downsample for speed
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "rgb(80,80,80)";

  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  let r = 0, g = 0, b = 0, count = 0;
  // Sample from the middle and lower portions (more representative of cover art)
  for (let y = Math.floor(size * 0.2); y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const pr = data[i], pg = data[i + 1], pb = data[i + 2];
      // Skip very dark and very light pixels (shadows & highlights)
      const lum = pr * 0.299 + pg * 0.587 + pb * 0.114;
      if (lum < 30 || lum > 230) continue;
      // Boost saturated pixels
      const max = Math.max(pr, pg, pb);
      const min = Math.min(pr, pg, pb);
      const sat = max === 0 ? 0 : (max - min) / max;
      const weight = 1 + sat * 2;
      r += pr * weight;
      g += pg * weight;
      b += pb * weight;
      count += weight;
    }
  }

  if (count === 0) return "rgb(80,80,80)";
  return `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;
}

export const BookCard = memo(function BookCard({ title, author, gradient, cover, format, coverStyle, showFormatBadge, selected, progress }: BookCardProps) {
  const radius = coverRadius(coverStyle);
  const [glowColor, setGlowColor] = useState<string>(gradient);
  const extracted = useRef(false);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (extracted.current) return;
    extracted.current = true;
    try {
      const color = extractDominantColor(e.currentTarget);
      setGlowColor(color);
    } catch {
      // cross-origin or other error — keep gradient fallback
    }
  }, []);

  const hasProgress = progress != null && progress > 0;
  const pct = hasProgress ? Math.min(Math.round(progress * 100), 100) : 0;

  return (
    <div className="group/card flex flex-col">
      {/* Cover — sits directly on the canvas, lifts and tilts toward the pointer */}
      <div className="relative">
        {/* Contact shadow on the canvas — tightens and fades as the cover lifts */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-2 -bottom-2.5 h-5 transition-[transform,opacity] duration-500 ease-spring group-hover/card:scale-x-90 group-hover/card:opacity-60"
          style={CONTACT_SHADOW}
        />
        {/* Ambient glow in the cover's own colour */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 -bottom-1 h-10 rounded-full opacity-0 blur-2xl transition-opacity duration-300 ease-apple group-hover/card:opacity-50"
          style={{ background: glowColor }}
        />
        <div className="relative transition-transform duration-500 ease-spring group-hover/card:-translate-y-1.5">
          <div
            className={cn(
              "relative transition-shadow duration-200",
              radius,
              selected && "ring-2 ring-brand ring-offset-2 ring-offset-canvas",
            )}
          >
            <Tilt maxTilt={5} glare className={radius}>
              <div className={cn("relative aspect-[2/3] overflow-hidden bg-fill-tertiary shadow-cover", radius)}>
                {cover ? (
                  <img
                    src={cover}
                    alt={title}
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ imageRendering: "auto" }}
                    loading="lazy"
                    onLoad={handleImageLoad}
                  />
                ) : (
                  <div className="absolute inset-0" style={{ background: gradient }} />
                )}

                {/* Spine crease + hairline edge */}
                <div aria-hidden className="pointer-events-none absolute inset-0" style={SPINE_STYLE} />
                <div aria-hidden className={cn("pointer-events-none absolute inset-0 hairline", radius)} />

                {/* Format — a glass chip that only surfaces on hover */}
                {showFormatBadge && (
                  <span className="glass pointer-events-none absolute top-2 left-2 inline-flex h-5 items-center rounded-xs px-1.5 text-2xs font-semibold text-label opacity-0 transition-opacity duration-200 ease-apple group-hover/card:opacity-100">
                    {format}
                  </span>
                )}

                {/* Reading progress — a hairline of ink along the bottom edge.
                    Literal track colour is allowed: it sits on cover art. */}
                {hasProgress && (
                  <div
                    role="progressbar"
                    aria-label={`${pct}% read`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-0.75 bg-black/30"
                  >
                    <div className="h-full bg-brand transition-[width] duration-500 ease-apple" style={{ width: `${pct}%` }} />
                  </div>
                )}

                {/* Selection tint */}
                {selected && <div aria-hidden className="absolute inset-0 bg-brand/15" />}
              </div>
            </Tilt>

            {/* Selection check */}
            {selected && (
              <div className="absolute -top-1.5 -right-1.5 z-20 flex size-5 animate-pop-in items-center justify-center rounded-full bg-brand text-brand-fg shadow-sm ring-2 ring-canvas">
                <Check className="size-3" strokeWidth={3} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Caption — two fixed rows, aligned to the cover's left edge */}
      <div className="mt-3 flex h-9 min-w-0 flex-col justify-center">
        <p className="text-headline line-clamp-1 text-label" title={title}>{title}</p>
        <p className="truncate text-xs text-label-secondary" title={author}>{author}</p>
      </div>
    </div>
  );
});
