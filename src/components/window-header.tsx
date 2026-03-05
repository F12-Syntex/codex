"use client";

import { useEffect, useState, useCallback } from "react";
import { Minus, Square, X, Copy, ZoomIn, ZoomOut } from "lucide-react";

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

export function WindowHeader({ icon, title, subtitle, zoomKey, zoom: controlledZoom, onZoomChange, children }: WindowHeaderProps) {
  const [maximized, setMaximized] = useState(false);
  const [internalZoom, setInternalZoom] = useState(DEFAULT_ZOOM);

  const zoom = controlledZoom ?? internalZoom;
  const setZoom = useCallback((v: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v));
    if (onZoomChange) onZoomChange(clamped);
    else setInternalZoom(clamped);
    window.electronAPI?.setSetting(`zoom:${zoomKey}`, String(clamped));
  }, [zoomKey, onZoomChange]);

  useEffect(() => {
    window.electronAPI?.onMaximized(setMaximized);
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
    <header className="flex h-10 shrink-0 items-center border-b border-white/[0.06] bg-[var(--bg-surface)]">
      {/* Drag region + title */}
      <div className="app-drag-region flex h-full flex-1 items-center gap-2 pl-3">
        <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-[var(--accent-brand)]/15">
          {icon}
        </div>
        <span className="text-xs text-white/40">{title}</span>
        {subtitle && <span className="text-xs text-white/25">{subtitle}</span>}
        {children}
      </div>

      {/* Zoom controls */}
      <div className="no-drag flex items-center gap-0.5 pr-1">
        <button
          onClick={() => setZoom(zoom - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/50 disabled:opacity-30 disabled:hover:bg-transparent"
          title="Zoom out"
        >
          <ZoomOut className="h-3 w-3" strokeWidth={1.5} />
        </button>
        <span className="w-8 text-center text-xs tabular-nums text-white/25">{zoom}%</span>
        <button
          onClick={() => setZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/50 disabled:opacity-30 disabled:hover:bg-transparent"
          title="Zoom in"
        >
          <ZoomIn className="h-3 w-3" strokeWidth={1.5} />
        </button>
      </div>

      {/* Window controls */}
      <div className="no-drag flex items-center">
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="flex h-10 w-10 items-center justify-center text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className="flex h-10 w-10 items-center justify-center text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
        >
          {maximized
            ? <Copy className="h-3 w-3" strokeWidth={1.5} />
            : <Square className="h-3 w-3" strokeWidth={1.5} />
          }
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="flex h-10 w-10 items-center justify-center text-white/30 transition-colors hover:bg-[#e81123]/80 hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
