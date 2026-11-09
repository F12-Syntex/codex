"use client";

/**
 * Secondary-window chrome — the shell + 52px transparent title bar used by the
 * Wiki, Quotes, AI Buddy and Style Dictionary Electron windows. It matches the
 * main window exactly (conventions S9.5: one window chrome).
 *
 * - `WindowShell`: boots the window through the one theme hook (`useAppTheme`, conventions
 *   §13.13: accent, tint, Light/Dim) and paints an `app-canvas` body with a quiet, still frame of
 *   the `<InkCanvas>` behind everything, so glass surfaces have something to refract.
 * - `WindowChrome`: drag region, window glyph + serif title + `· subtitle`,
 *   optional zoom pill, and the shared `<WindowControls />` caption buttons.
 *
 * Zoom pill adapted from 21st.dev "Canvas Zoom Toolbar" (cnippet-dev, id 18775):
 * − / live percentage / + grouped in a single rounded toolbar pill.
 */

import { useCallback, useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { InkCanvas } from "@/components/ui/ink-canvas";
import { WindowControls } from "@/components/window-controls";
import { useAppTheme } from "@/lib/use-app-theme";

/* ── Shell ─────────────────────────────────────────────────────────── */

export function WindowShell({ children, className }: { children: React.ReactNode; className?: string }) {
  useAppTheme({ appearance: true });
  return (
    <div className={cn("app-canvas relative isolate flex h-screen flex-col overflow-hidden text-label", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <InkCanvas still intensity={0.24} />
      </div>
      {children}
    </div>
  );
}

/* ── Title bar ─────────────────────────────────────────────────────── */

const MIN_ZOOM = 80;
const MAX_ZOOM = 150;
const ZOOM_STEP = 10;
const DEFAULT_ZOOM = 100;

interface WindowChromeProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Key used to persist zoom level, e.g. "wiki". Omit to hide the zoom pill. */
  zoomKey?: string;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  /** Extra content after the title (counts, badges). */
  children?: React.ReactNode;
}

export function WindowChrome({ icon, title, subtitle, zoomKey, zoom: controlledZoom, onZoomChange, children }: WindowChromeProps) {
  const [internalZoom, setInternalZoom] = useState(DEFAULT_ZOOM);

  const zoom = controlledZoom ?? internalZoom;
  const setZoom = useCallback((v: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v));
    if (onZoomChange) onZoomChange(clamped);
    else setInternalZoom(clamped);
    if (zoomKey) window.electronAPI?.setSetting(`zoom:${zoomKey}`, String(clamped));
  }, [zoomKey, onZoomChange]);

  useEffect(() => {
    if (!zoomKey) return;
    window.electronAPI?.getSetting(`zoom:${zoomKey}`).then((raw) => {
      if (raw) {
        const n = parseInt(raw, 10);
        if (!isNaN(n)) {
          if (onZoomChange) onZoomChange(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, n)));
          else setInternalZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, n)));
        }
      }
    });
  }, [zoomKey, onZoomChange]);

  return (
    <header className="app-drag-region relative z-30 flex h-13 shrink-0 select-none items-center gap-3 pl-4">
      {/* Glyph · title · subtitle */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {icon && (
          <span aria-hidden className="flex shrink-0 items-center text-brand [&_svg]:size-4">
            {icon}
          </span>
        )}
        <span className="shrink-0 font-display text-base leading-none font-semibold tracking-tight text-label">{title}</span>
        {subtitle && (
          <span className="min-w-0 truncate text-sm leading-none text-label-tertiary">
            <span aria-hidden className="mr-2">·</span>
            {subtitle}
          </span>
        )}
        {children}
      </div>

      {/* Zoom pill */}
      {zoomKey && (
        <div className="app-no-drag flex h-7 shrink-0 items-center rounded-full bg-fill-quaternary p-0.5">
          <button
            onClick={() => setZoom(zoom - ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out"
            className="focus-ring pressable flex size-6 items-center justify-center rounded-full text-label-tertiary hover:bg-fill-tertiary hover:text-label disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Minus className="size-3.5" strokeWidth={2} />
          </button>
          <button
            onClick={() => setZoom(DEFAULT_ZOOM)}
            title="Reset zoom"
            className="focus-ring h-6 w-10 rounded-full text-center text-2xs font-medium tabular-nums text-label-secondary transition-colors hover:text-label"
          >
            {zoom}%
          </button>
          <button
            onClick={() => setZoom(zoom + ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in"
            className="focus-ring pressable flex size-6 items-center justify-center rounded-full text-label-tertiary hover:bg-fill-tertiary hover:text-label disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Plus className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Window controls — same 46px caption buttons as the main window */}
      <div className="flex h-full shrink-0 justify-end">
        <WindowControls />
      </div>
    </header>
  );
}

export default WindowChrome;
