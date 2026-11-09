"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ThemeClasses } from "../lib/types";
import type { SelectionActions, SelectionPayload } from "@/lib/assistant/selection";

interface SelectionToolbarProps {
  theme: ThemeClasses;
  containerRef: React.RefObject<HTMLDivElement | null>;
  filePath: string;
  chapterId: string | null;
  chapterIndex: number;
  /** Assistant / Define / Who's this / quote / vocabulary actions (`createSelectionActions`). */
  actions: SelectionActions;
  onPlayFromParagraph?: (paraIndex: number) => void;
}

interface ToolbarState {
  text: string;
  x: number;
  y: number;
  paraIndex: number;
  /** Container width when the selection was made (for clamping). */
  containerWidth: number;
  /** Null for text that isn't a book paragraph (e.g. a "what if" continuation). */
  payload: SelectionPayload | null;
}

/** The sentence around `start..end` of `text` (never past the paragraph). */
export function sentenceAround(text: string, start: number, end: number): string {
  const before = text.slice(0, Math.max(0, start));
  const sStart = Math.max(before.search(/[^.!?…]*$/), 0);
  const afterIdx = text.slice(end).search(/[.!?…](?=\s|["”’)]|$)/);
  const sEnd = afterIdx < 0 ? text.length : end + afterIdx + 1;
  return text.slice(sStart, sEnd).replace(/\s+/g, " ").trim();
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
/** Looks like a name: 1–4 words, each capitalised (no sentence punctuation). */
const looksLikeName = (s: string) =>
  wordCount(s) <= 4 && !/[.!?,;:"“”]/.test(s) && s.trim().split(/\s+/).every((w) => /^\p{Lu}/u.test(w));

/**
 * Floating glass pill above the text selection (macOS-style). Labels over glyphs:
 * Copy · Define · Read · Ask · Quote, plus Who's this? on names — only the actions that make sense
 * for the selection are shown. Ask with a selection seeds "Explain this passage"; Save word lives
 * in the DefinePopover. Payloads carry a ParaRef, never an index.
 * Motion + mousedown-preserves-selection adapted from 21st.dev "Selection Bubble Menu"
 * (laziekiki, id 26926). `theme` is kept in the props contract; the pill is app-chrome glass.
 */
export function SelectionToolbar({ containerRef, filePath, chapterId, chapterIndex, actions, onPlayFromParagraph }: SelectionToolbarProps) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<ToolbarState | null>(null);
  const [copied, setCopied] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarWidth, setToolbarWidth] = useState(0);

  const dismiss = useCallback(() => {
    setState(null);
    setCopied(false);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseUp = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          setState(null);
          setCopied(false);
          return;
        }
        const range = sel.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return;
        const rect = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) return;

        const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
        const paraEl = startEl?.closest<HTMLElement>("[data-para-idx]") ?? null;
        const paraIndex = paraEl ? parseInt(paraEl.getAttribute("data-para-idx") ?? "0", 10) : 0;
        const paraId = paraEl?.getAttribute("data-para-id") ?? null;
        const text = sel.toString().trim();

        let payload: SelectionPayload | null = null;
        if (paraEl && paraId && chapterId) {
          // Offset of the selection inside the paragraph's visible text → its sentence.
          const pre = document.createRange();
          pre.selectNodeContents(paraEl);
          pre.setEnd(range.startContainer, range.startOffset);
          const startOff = pre.toString().length;
          const paraText = paraEl.textContent ?? "";
          payload = {
            ref: { filePath, chapterId, paraId },
            text,
            sentence: sentenceAround(paraText, startOff, startOff + sel.toString().length) || text,
            rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
            chapterIndex,
          };
        }

        setState({
          text,
          x: rect.left + rect.width / 2 - containerRect.left,
          y: rect.top - containerRect.top - 8,
          paraIndex,
          containerWidth: container.clientWidth,
          payload,
        });
        setCopied(false);
      }, 10);
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [containerRef, filePath, chapterId, chapterIndex]);

  // Dismiss on escape or scroll
  useEffect(() => {
    if (!state) return;

    // Capture phase + preventDefault: Esc dismisses the selection and nothing else.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      dismiss();
      window.getSelection()?.removeAllRanges();
    };

    const handleWheel = () => dismiss();

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    containerRef.current?.addEventListener("wheel", handleWheel);
    const containerEl = containerRef.current;

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
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

  const done = () => {
    dismiss();
    window.getSelection()?.removeAllRanges();
  };
  const run = (fn?: (p: SelectionPayload) => void) => () => {
    if (fn && state.payload) fn(state.payload);
    done();
  };

  const handlePlay = () => {
    onPlayFromParagraph?.(state.paraIndex);
    done();
  };

  const p = state.payload;
  const words = wordCount(state.text);
  const show = {
    define: !!p && !!actions.onDefine && words <= 4,
    ask: !!p && !!actions.onAsk,
    whoIs: !!p && !!actions.onWhoIs && looksLikeName(state.text),
    quote: !!p && !!actions.onSaveQuote,
  };

  // Clamp the pill to the container (estimate until the first measure lands).
  const actionCount = 1 + (onPlayFromParagraph ? 1 : 0) + Object.values(show).filter(Boolean).length;
  const width = toolbarWidth || actionCount * 60;
  const containerWidth = state.containerWidth || 800;
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
          {show.define && <ToolbarButton label="Define" hint="Define or translate" onClick={run(actions.onDefine)} />}
          {onPlayFromParagraph && (
            <ToolbarButton label="Read" hint="Read aloud from here" onClick={handlePlay} />
          )}
          {show.ask && <ToolbarButton label="Ask" hint="Ask the assistant about this" onClick={run(actions.onAsk)} />}
          {show.whoIs && <ToolbarButton label="Who’s this?" hint="What the book has said so far" onClick={run(actions.onWhoIs)} />}
          {show.quote && <ToolbarButton label="Quote" hint="Save to quotes" onClick={run(actions.onSaveQuote)} />}
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
