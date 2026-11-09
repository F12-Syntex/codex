"use client";

/**
 * WindowControls — refined Windows/Linux caption buttons for the frameless
 * Electron window. 46px wide, full chrome height, quiet fill on hover,
 * danger fill on close. The one implementation: used by the main TitleBar, the secondary-window
 * WindowChrome and the reader header.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function MinimizeGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0.5 5h9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function MaximizeGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function RestoreGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="0.5" y="2.5" width="7" height="7" rx="1.75" stroke="currentColor" strokeWidth="1" />
      <path d="M2.5 2.5V2a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 9.5 2v4A1.5 1.5 0 0 1 8 7.5h-.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

const base =
  "app-no-drag inline-flex h-full w-[46px] items-center justify-center text-label-secondary outline-none transition-colors duration-150 focus-visible:bg-fill-tertiary focus-visible:text-label";

export function WindowControls({ className }: { className?: string }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => window.electronAPI?.onMaximized(setMaximized), []);

  return (
    <div className={cn("app-no-drag flex h-full shrink-0 items-stretch", className)}>
      <button
        type="button"
        aria-label="Minimize"
        onClick={() => window.electronAPI?.minimize()}
        className={cn(base, "hover:bg-fill-tertiary hover:text-label active:bg-fill-secondary")}
      >
        <MinimizeGlyph />
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={() => window.electronAPI?.maximize()}
        className={cn(base, "hover:bg-fill-tertiary hover:text-label active:bg-fill-secondary")}
      >
        {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={() => window.electronAPI?.close()}
        className={cn(base, "hover:bg-danger hover:text-white active:bg-danger/80")}
      >
        <CloseGlyph />
      </button>
    </div>
  );
}

export default WindowControls;
