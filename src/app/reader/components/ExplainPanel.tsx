"use client";

import { useEffect, useRef } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";
import type { ThemeClasses } from "../lib/types";

interface ExplainPanelProps {
  theme: ThemeClasses;
  selectedText: string;
  explanation: string;
  loading: boolean;
  onClose: () => void;
}

export function ExplainPanel({ theme, selectedText, explanation, loading, onClose }: ExplainPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to prevent the click that opened the panel from closing it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div
        ref={panelRef}
        className={`pointer-events-auto w-full max-w-md rounded-lg border ${theme.border} shadow-lg shadow-black/40 overflow-hidden`}
        style={{ backgroundColor: "var(--bg-overlay)", backdropFilter: "blur(24px)" }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${theme.border}`}>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--accent-brand)]" strokeWidth={1.5} />
            <span className="text-sm font-medium">AI Explain</span>
          </div>
          <button
            onClick={onClose}
            className={`rounded-lg p-1 transition-colors ${theme.btn}`}
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Selected text quote */}
        <div className={`px-4 py-2.5 border-b ${theme.border}`} style={{ backgroundColor: "var(--bg-inset)" }}>
          <p className="text-xs text-white/40 mb-1">Selected text</p>
          <p className="text-xs leading-relaxed text-white/70 line-clamp-3 italic">
            &ldquo;{selectedText}&rdquo;
          </p>
        </div>

        {/* Explanation */}
        <div className="px-4 py-3 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-brand)]" strokeWidth={1.5} />
              <span className="text-xs text-white/50">Analyzing...</span>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">
              {explanation}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
