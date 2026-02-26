"use client";

import { useState, useRef, useCallback } from "react";
import type { BookFormat } from "@/lib/mock-data";
import type { CoverStyle } from "@/lib/theme";

interface BookCardProps {
  title: string;
  author: string;
  gradient: string;
  cover: string;
  format: BookFormat;
  coverStyle: CoverStyle;
  showFormatBadge: boolean;
}

/** Sample pixels from a loaded image and return a dominant-ish RGB string. */
function extractDominantColor(img: HTMLImageElement): string {
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

export function BookCard({ title, author, gradient, cover, format, coverStyle, showFormatBadge }: BookCardProps) {
  const radius = coverStyle === "rounded" ? "rounded-lg" : "rounded-none";
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

  return (
    <div className="group flex flex-col gap-2.5">
      <div className="relative">
        <div
          className={`absolute inset-x-2 -bottom-2 h-6 ${radius} opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-60`}
          style={{ background: glowColor }}
        />

        <div
          className={`relative aspect-[2/3] overflow-hidden outline-none border-0 ${radius} transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.02]`}
        >
          <img
            src={cover}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            crossOrigin="anonymous"
            loading="lazy"
            onLoad={handleImageLoad}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent" />

          {showFormatBadge && (
            <div className="absolute bottom-1.5 right-1.5 rounded-[4px] bg-black/60 px-1.5 py-[3px] text-[10px] font-semibold uppercase leading-none tracking-wide text-white/80 backdrop-blur-md">
              {format}
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-tight">{title}</p>
        <p className="mt-0.5 truncate text-xs text-white/40">{author}</p>
      </div>
    </div>
  );
}
