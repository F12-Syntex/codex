"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { Check } from "lucide-react";
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
 * Floating glass pill above the text selection (macOS-style). Labels over
 * glyphs: Copy · Define · Read · Ask · Quote — nothing pre-highlighted.
 * Motion + mousedown-preserves-selection adapted from 21st.dev
 * "Selection Bubble Menu" (laziekiki, id 26926).
 * `theme` is kept in the props contract; the pill is app-chrome glass, not paper.
 */
export function SelectionToolbar({ containerRef, onPlayFromParagraph, onExplain, onSaveQuote }: SelectionToolbarProps) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<ToolbarState | null>(null);
  const [copied, setCopied] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarWidth, setToolbarWidth] = useState(0);

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

  // Measure the real pill so clamping matches the labeled buttons.
  useLayoutEffect(() => {
    if (state && toolbarRef.current) setToolbarWidth(toolbarRef.current.offsetWidth);
  }, [state, copied]);

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

  // Clamp the pill to the container (estimate until the first measure lands).
  const actionCount = 2 + (onPlayFromParagraph ? 1 : 0) + (onExplain ? 1 : 0) + (onSaveQuote ? 1 : 0);
  const width = toolbarWidth || actionCount * 56;
  const containerWidth = containerRef.current?.clientWidth ?? 800;
  const clampedX = Math.max(width / 2 + 4, Math.min(state.x, containerWidth - width / 2 - 4));

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
          className="glass-thick flex h-10 items-center gap-0.5 rounded-full p-1 text-label"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.92, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
          transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 520, damping: 30, mass: 0.6 }}
          style={{ transformOrigin: "50% 100%" }}
          // Keep the text selection alive while pressing a button (21st "Selection Bubble Menu" pattern)
          onMouseDown={(e) => e.preventDefault()}
        >
          <ToolbarButton label="Copy" hint="Copy selection" onClick={handleCopy} active={copied}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={copied ? "copied" : "copy"}
                className="inline-flex items-center gap-1"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
              >
                {copied && <Check className="size-3.5 text-success" strokeWidth={2.25} />}
                {copied ? "Copied" : "Copy"}
              </motion.span>
            </AnimatePresence>
          </ToolbarButton>
          <ToolbarButton label="Define" hint="Look up in the dictionary" onClick={handleDefine} />
          {onPlayFromParagraph && (
            <ToolbarButton label="Read" hint="Read aloud from here" onClick={handlePlay} />
          )}
          {onExplain && (
            <ToolbarButton label="Ask" hint="Ask AI to explain" onClick={handleExplain} />
          )}
          {onSaveQuote && (
            <ToolbarButton label="Quote" hint="Save to quotes" onClick={handleSaveQuote} />
          )}
        </motion.div>
      </TooltipProvider>
    </div>
  );
}

function ToolbarButton({ label, hint, onClick, active, children }: {
  label: string;
  hint: string;
  onClick: () => void;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={hint}
          onClick={onClick}
          className={cn(
            "focus-ring pressable inline-flex h-8 shrink-0 items-center justify-center rounded-full px-2.5 text-xs font-medium text-label-secondary transition-colors duration-150 hover:bg-fill-tertiary hover:text-label",
            active && "text-label",
          )}
        >
          {children ?? label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>{hint}</TooltipContent>
    </Tooltip>
  );
}
