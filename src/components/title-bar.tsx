"use client";

import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import Image from "next/image";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.electronAPI?.onMaximized(setMaximized);
  }, []);

  return (
    <header className="flex h-10 shrink-0 select-none items-center border-b border-white/[0.04] bg-[var(--bg-surface)]">
      {/* Left — icon + app name + drag region */}
      <div className="app-drag-region flex h-full flex-1 items-center gap-2.5 pl-3.5">
        <Image
          src="/icon.png"
          alt="Codex"
          width={18}
          height={18}
          className="pointer-events-none rounded-[4px]"
          draggable={false}
        />
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold tracking-tight text-white/70">
            Codex
          </span>
          <span className="rounded bg-white/[0.06] px-1.5 py-px text-[10px] font-medium text-white/20">
            v0.5.0
          </span>
        </div>

        {/* Breadcrumb / context hint */}
        <div className="ml-3 flex items-center gap-1.5 text-white/15">
          <span className="text-[11px]">/</span>
          <span className="text-[11px]">Library</span>
        </div>
      </div>

      {/* Right — traffic lights */}
      <div className="flex h-full items-center">
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="inline-flex h-full w-12 items-center justify-center text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className="inline-flex h-full w-12 items-center justify-center text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
        >
          {maximized ? (
            <Copy className="h-3 w-3" strokeWidth={1.5} />
          ) : (
            <Square className="h-3 w-3" strokeWidth={1.5} />
          )}
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="inline-flex h-full w-12 items-center justify-center text-white/30 transition-colors hover:bg-[#e81123]/80 hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
