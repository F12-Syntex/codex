"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, BookOpen, Play, Check, Sparkles } from "lucide-react";
import type { ThemeClasses } from "../lib/types";

interface SelectionToolbarProps {
  theme: ThemeClasses;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onPlayFromParagraph?: (paraIndex: number) => void;
  onExplain?: (selectedText: string, paraIndex: number) => void;
}

interface ToolbarState {
  text: string;
  x: number;
  y: number;
  paraIndex: number;
}

export function SelectionToolbar({ theme, containerRef, onPlayFromParagraph, onExplain }: SelectionToolbarProps) {
  const [state, setState] = useState<ToolbarState | null>(null);
  const [copied, setCopied] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    setState(null);
    setCopied(false);
  }, []);

  // Use document-level mouseup for reliable selection detection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseUp = (e: MouseEvent) => {
      // Ignore clicks on the toolbar itself
      if (toolbarRef.current?.contains(e.target as Node)) return;

      // Delay slightly to let the browser finalize the selection
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          // No selection — dismiss if toolbar is visible
          setState(null);
          setCopied(false);
          return;
        }

        // Check if selection is inside our container
        const range = sel.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return;

        const rect = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Selection rects must overlap with the container
        if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) {
          return;
        }

        // Find the paragraph index from the selection start
        let paraIndex = 0;
        let node: Node | null = range.startContainer;
        while (node && node !== container) {
          if (node instanceof HTMLElement && node.hasAttribute("data-para-idx")) {
            paraIndex = parseInt(node.getAttribute("data-para-idx") ?? "0", 10);
            break;
          }
          node = node.parentElement;
        }

        // Position: centered above selection, relative to container
        const x = rect.left + rect.width / 2 - containerRect.left;
        const y = rect.top - containerRect.top - 8;

        setState({ text: sel.toString().trim(), x, y, paraIndex });
        setCopied(false);
      }, 10);
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [containerRef]);

  // Dismiss on escape or scroll
  useEffect(() => {
    if (!state) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { dismiss(); window.getSelection()?.removeAllRanges(); }
    };

    const handleWheel = () => dismiss();

    document.addEventListener("keydown", handleKeyDown);
    containerRef.current?.addEventListener("wheel", handleWheel);
    const containerEl = containerRef.current;

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      containerEl?.removeEventListener("wheel", handleWheel);
    };
  }, [state, dismiss, containerRef]);

  if (!state) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(state.text);
    setCopied(true);
    setTimeout(() => { dismiss(); window.getSelection()?.removeAllRanges(); }, 500);
  };

  const handleDefine = () => {
    // Use a dictionary site for single/few words, regular search for longer text
    const words = state.text.split(/\s+/);
    let url: string;
    if (words.length <= 2) {
      url = `https://en.wiktionary.org/wiki/${encodeURIComponent(state.text.toLowerCase())}`;
    } else {
      url = `https://www.google.com/search?q=${encodeURIComponent(`define "${state.text}"`)}`;
    }
    // Try Electron shell first, fallback to window.open
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
    dismiss();
    window.getSelection()?.removeAllRanges();
  };

  const handlePlay = () => {
    onPlayFromParagraph?.(state.paraIndex);
    dismiss();
    window.getSelection()?.removeAllRanges();
  };

  const handleExplain = () => {
    onExplain?.(state.text, state.paraIndex);
    dismiss();
    window.getSelection()?.removeAllRanges();
  };

  // Compute toolbar position, clamped to container bounds
  const toolbarWidth = 192;
  const containerWidth = containerRef.current?.clientWidth ?? 800;
  const clampedX = Math.max(toolbarWidth / 2 + 4, Math.min(state.x, containerWidth - toolbarWidth / 2 - 4));

  return (
    <div
      ref={toolbarRef}
      style={{
        position: "absolute",
        left: `${clampedX}px`,
        top: `${state.y}px`,
        transform: "translate(-50%, -100%)",
        zIndex: 50,
      }}
    >
      <div
        className={`flex items-center gap-0.5 rounded-lg border p-1 backdrop-blur-xl ${theme.border} shadow-lg shadow-black/30`}
        style={{ backgroundColor: "var(--bg-overlay)" }}
      >
        <ToolbarButton
          icon={copied ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />}
          label={copied ? "Copied" : "Copy"}
          onClick={handleCopy}
          theme={theme}
        />
        <ToolbarButton
          icon={<BookOpen className="h-3.5 w-3.5" strokeWidth={1.5} />}
          label="Define"
          onClick={handleDefine}
          theme={theme}
        />
        {onPlayFromParagraph && (
          <ToolbarButton
            icon={<Play className="h-3.5 w-3.5" strokeWidth={1.5} />}
            label="Read"
            onClick={handlePlay}
            theme={theme}
          />
        )}
        {onExplain && (
          <ToolbarButton
            icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />}
            label="Explain"
            onClick={handleExplain}
            theme={theme}
          />
        )}
      </div>
    </div>
  );
}

function ToolbarButton({ icon, label, onClick, theme }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  theme: ThemeClasses;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors ${theme.btn}`}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  );
}
