"use client";

/**
 * AssistantLauncher — the single entry point to the assistant in the reader chrome (AI_AUDIT §3:
 * replaces the Buddy toggle, the floating 💬 button and the detach button). A glass pill on the
 * footer's centre line that opens the AssistantPanel in the reader's right-hand inspector slot;
 * also opens on `openAssistant(seed)` from anywhere in the window (selection toolbar, entity
 * card, recap…).
 *
 * One inspector per window (conventions §13.11): the panel shares its slot with AI Tools. The
 * host passes `yieldSlot` while the other tenant holds it: the panel closes and the pill hides.
 * The pill also hides while the panel is open (the panel's ✕ and Esc dismiss it).
 *
 *   <AssistantLauncher filePath={filePath} bookTitle={title} frontierLabel="Chapter 12"
 *     onDetach={(threadId) => openBuddyWindow(threadId)} onOpenEntity={showEntityCard} />
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Sparkles } from "lucide-react";
import type { ParaRef } from "@shared/pipeline/types";
import { cn } from "@/lib/utils";
import { onOpenAssistant, type OpenAssistantRequest } from "@/lib/assistant/open";
import { AssistantPanel } from "./AssistantPanel";

export interface AssistantLauncherProps {
  filePath: string;
  bookTitle?: string;
  frontierLabel?: string;
  onDetach?: (threadId: string | null) => void;
  onOpenEntity?: (entityId: string) => void;
  onReveal?: (ref: ParaRef) => void;
  /** Hide the pill (the panel still opens via `openAssistant`). */
  hidePill?: boolean;
  /** Another tenant (AI Tools) took the inspector slot: close the panel and hide the pill.
   *  `openAssistant` still opens it; the host then closes the other tenant (`onOpenChange`). */
  yieldSlot?: boolean;
  /** The panel opened/closed (the reader insets its text column so the panel never covers it). */
  onOpenChange?: (open: boolean) => void;
  /** Panel material; the reader uses "glass-thick" over the page. */
  material?: "glass" | "glass-thick";
  /** Positioning of the pill; default bottom-right, on the reader footer's centre line. */
  className?: string;
  /** Positioning of the panel (the inspector slot); default the reader's: below the 52px header
   *  (+8), above the 60px footer row (+8), 8px from the right edge. */
  slotClassName?: string;
}

export function AssistantLauncher({
  filePath, bookTitle, frontierLabel, onDetach, onOpenEntity, onReveal, hidePill = false, yieldSlot = false,
  onOpenChange, material, className, slotClassName,
}: AssistantLauncherProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [request, setRequest] = React.useState<OpenAssistantRequest | null>(null);
  /** Return focus to the pill once it is back (it is hidden while the panel is open). */
  const refocusPill = React.useRef(false);
  const slotRef = React.useRef<HTMLDivElement>(null);
  const pillRef = React.useCallback((el: HTMLButtonElement | null) => {
    if (el && refocusPill.current) {
      refocusPill.current = false;
      el.focus({ preventScroll: true });
    }
  }, []);
  const onOpenChangeRef = React.useRef(onOpenChange);
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  React.useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);

  React.useEffect(
    () =>
      onOpenAssistant((req) => {
        if (req.filePath && req.filePath !== filePath) return;
        setRequest(req);
        setOpen(true);
      }),
    [filePath],
  );

  // The other tenant took the slot: give it up (only on the change, so an `openAssistant`
  // request made while AI Tools is open still opens the panel and the host closes AI Tools).
  React.useEffect(() => {
    if (yieldSlot) setOpen(false);
  }, [yieldSlot]);

  const close = React.useCallback(() => {
    // Only a panel that had focus hands it back to the pill.
    refocusPill.current = !!slotRef.current?.contains(document.activeElement);
    setOpen(false);
  }, []);

  const showPill = !open && !hidePill && !yieldSlot;

  return (
    <>
      <div ref={slotRef} className={cn("pointer-events-none fixed top-15 right-2 bottom-17 z-40 flex flex-col items-end justify-end", slotClassName)}>
        <AnimatePresence>
          {open && (
            <AssistantPanel
              key="panel"
              host="reader"
              filePath={filePath}
              bookTitle={bookTitle}
              frontierLabel={frontierLabel}
              request={request}
              onClose={close}
              onDetach={onDetach ? (id) => { setOpen(false); onDetach(id); } : undefined}
              onOpenEntity={onOpenEntity}
              onReveal={onReveal}
              material={material}
              className="pointer-events-auto"
            />
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence initial={false}>
        {showPill && (
          <motion.button
            key="pill"
            ref={pillRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            aria-label="Ask about this book"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            whileTap={reduce ? undefined : { scale: 0.94 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={cn(
              "glass-thin focus-ring fixed right-4 bottom-3 z-40 inline-flex h-9 origin-bottom-right items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-label transition-colors duration-150 hover:text-brand",
              className,
            )}
          >
            <motion.span
              animate={reduce ? { rotate: 0 } : { rotate: [0, -12, 10, 0] }}
              transition={{ duration: 0.9, repeat: reduce ? 0 : Infinity, repeatDelay: 6 }}
              className="inline-flex"
            >
              <Sparkles className="size-4" strokeWidth={1.75} />
            </motion.span>
            Ask
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

export default AssistantLauncher;
