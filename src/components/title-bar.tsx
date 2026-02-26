"use client";

import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.electronAPI?.onMaximized(setMaximized);
  }, []);

  return (
    <header className="flex h-9 shrink-0 select-none items-center justify-between border-b border-border bg-card">
      <div className="flex-1 app-drag-region pl-3 h-full flex items-center">
        <span className="text-xs font-medium text-muted-foreground">
          Codex
        </span>
      </div>

      <div className="flex h-full">
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="inline-flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className="inline-flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {maximized ? (
            <Copy className="size-3" />
          ) : (
            <Square className="size-3" />
          )}
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="inline-flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </header>
  );
}
