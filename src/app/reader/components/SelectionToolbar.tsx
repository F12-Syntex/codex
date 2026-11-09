"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, BookOpen, Play, Check, Sparkles, Quote } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ThemeClasses } from "../lib/types";

interface SelectionToolbarProps {
  theme: ThemeClasses;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onPlayFromParagraph?: (paraIndex: number) => void;
  onExplain?: (selectedText: string, paraIndex: number) => void;
  onSaveQuote?: (text: string, paraIndex: number) => void;
}

interface ToolbarState {
  text: string;
  x: number;
  y: number;
  paraIndex: number;
}

/**
 * Floating glass pill above the text selection (macOS-style).
 * Motion + mousedown-preserves-selection adapted from 21st.dev
 * "Selection Bubble Menu" (laziekiki, id 26926).
 * `theme` is kept in the props contract; the pill is app-chrome glass, not paper.
 */
export function SelectionToolbar({ containerRef, onPlayFromParagraph, onExplain, onSaveQuote }: SelectionToolbarProps) {
  const reduce = useReducedMotion();
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

  const handleSaveQuote = () => {
    onSaveQuote?.(state.text, state.paraIndex);
    dismiss();
    window.getSelection()?.removeAllRanges();
  };

  // Compute toolbar position, clamped to container bounds
  const primaryCount = 2 + (onPlayFromParagraph ? 1 : 0);
  const aiCount = (onExplain ? 1 : 0) + (onSaveQuote ? 1 : 0);
  // 32px buttons · 2px gaps · 4px padding each side · 9px divider
  const btnCount = primaryCount + aiCount;
  const toolbarWidth = btnCount * 32 + (btnCount - 1) * 2 + 8 + (aiCount > 0 ? 9 : 0);
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
      <TooltipProvider delayDuration={350} skipDelayDuration={0}>
        <motion.div
          role="toolbar"
          aria-label="Selection actions"
          className="glass flex items-center gap-0.5 rounded-full p-1 text-label"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.92, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 520, damping: 30, mass: 0.6 }}
          style={{ transformOrigin: "50% 100%" }}
          // Keep the text selection alive while pressing a button (21st "Selection Bubble Menu" pattern)
          onMouseDown={(e) => e.preventDefault()}
        >
          <ToolbarButton
            label={copied ? "Copied" : "Copy"}
            onClick={handleCopy}
            active={copied}
            icon={
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={copied ? "check" : "copy"}
                  className="inline-flex"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                >
                  {copied
                    ? <Check className="size-4 text-success" strokeWidth={2.25} />
                    : <Copy className="size-4" strokeWidth={1.75} />}
                </motion.span>
              </AnimatePresence>
            }
          />
          <ToolbarButton
            icon={<BookOpen className="size-4" strokeWidth={1.75} />}
            label="Define"
            onClick={handleDefine}
          />
          {onPlayFromParagraph && (
            <ToolbarButton
              icon={<Play className="size-4" strokeWidth={1.75} />}
              label="Read aloud from here"
              onClick={handlePlay}
            />
          )}
          {aiCount > 0 && <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-separator-strong" />}
          {onExplain && (
            <ToolbarButton
              icon={<Sparkles className="size-4 text-brand" strokeWidth={1.75} />}
              label="Explain with AI"
              onClick={handleExplain}
            />
          )}
          {onSaveQuote && (
            <ToolbarButton
              icon={<Quote className="size-4" strokeWidth={1.75} />}
              label="Save quote"
              onClick={handleSaveQuote}
            />
          )}
        </motion.div>
      </TooltipProvider>
    </div>
  );
}

function ToolbarButton({ icon, label, onClick, active }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "focus-ring pressable inline-flex size-8 shrink-0 items-center justify-center rounded-full text-label-secondary transition-colors duration-150 hover:bg-fill-tertiary hover:text-label",
            active && "bg-fill-tertiary text-label",
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  );
}
