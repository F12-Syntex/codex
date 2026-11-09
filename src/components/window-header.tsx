"use client";

import { useEffect, useState, useCallback } from "react";
import { Minus, Plus } from "lucide-react";
import { WindowControls } from "@/components/window-controls";

interface WindowHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Key used to persist zoom level, e.g. "wiki", "buddy", "style-dictionary" */
  zoomKey: string;
  /** Current zoom (controlled). If not provided, managed internally. */
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  children?: React.ReactNode;
}

const MIN_ZOOM = 80;
const MAX_ZOOM = 150;
const ZOOM_STEP = 10;
const DEFAULT_ZOOM = 100;

const zoomButton =
  "app-no-drag pressable focus-ring inline-flex size-6 items-center justify-center rounded-full text-label-secondary hover:bg-fill-secondary hover:text-label disabled:pointer-events-none disabled:opacity-35";

/** Chrome for secondary windows (wiki, buddy, style dictionary…). */
export function WindowHeader({ icon, title, subtitle, zoomKey, zoom: controlledZoom, onZoomChange, children }: WindowHeaderProps) {
  const [internalZoom, setInternalZoom] = useState(DEFAULT_ZOOM);

  const zoom = controlledZoom ?? internalZoom;
  const setZoom = useCallback((v: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v));
    if (onZoomChange) onZoomChange(clamped);
    else setInternalZoom(clamped);
    window.electronAPI?.setSetting(`zoom:${zoomKey}`, String(clamped));
  }, [zoomKey, onZoomChange]);

  useEffect(() => {
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
    <header className="glass-chrome app-drag-region relative z-20 flex h-11 shrink-0 select-none items-center border-b border-separator">
      {/* Title */}
      <div className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-4">
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm bg-brand/15 text-brand [&_svg]:size-3.5">
          {icon}
        </span>
        <span className="truncate text-sm font-semibold text-label">{title}</span>
        {subtitle && (
          <>
            <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-separator-strong" />
            <span className="truncate text-xs text-label-tertiary">{subtitle}</span>
          </>
        )}
        {children}
      </div>

      {/* Zoom */}
      <div className="app-no-drag mr-2 flex h-7 shrink-0 items-center gap-0.5 rounded-full bg-fill-tertiary px-0.5">
        <button
          type="button"
          onClick={() => setZoom(zoom - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          className={zoomButton}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus className="size-3" strokeWidth={2} />
        </button>
        <span className="w-10 text-center text-2xs font-medium tabular-nums text-label-secondary">
          {zoom}%
        </span>
        <button
          type="button"
          onClick={() => setZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          className={zoomButton}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus className="size-3" strokeWidth={2} />
        </button>
      </div>

      <WindowControls />
    </header>
  );
}
