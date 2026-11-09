"use client";

/**
 * AssistantLauncher — the single entry point to the assistant in the reader chrome (AI_AUDIT §3:
 * replaces the Buddy toggle, the floating 💬 button and the detach button). A glass pill that
 * morphs into the AssistantPanel above it; also opens on `openAssistant(seed)` from anywhere in
 * the window (selection toolbar, entity card, recap…).
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
  /** The panel opened/closed (the reader insets its text column so the panel never covers it). */
  onOpenChange?: (open: boolean) => void;
  /** Panel material; the reader uses "glass-thick" over the page. */
  material?: "glass" | "glass-thick";
  /** Positioning of the launcher corner; default bottom-right above the reader footer. */
  className?: string;
}

export function AssistantLauncher({
  filePath, bookTitle, frontierLabel, onDetach, onOpenEntity, onReveal, hidePill = false, onOpenChange, material, className,
}: AssistantLauncherProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [request, setRequest] = React.useState<OpenAssistantRequest | null>(null);
  const pillRef = React.useRef<HTMLButtonElement>(null);
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

  const close = React.useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => pillRef.current?.focus());
  }, []);

  return (
    <div className={cn("fixed right-5 bottom-20 z-40 flex flex-col items-end gap-3", className)}>
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
          />
        )}
      </AnimatePresence>
      {!hidePill && (
        <motion.button
          ref={pillRef}
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-expanded={open}
          aria-label={open ? "Close assistant" : "Ask about this book"}
          whileTap={reduce ? undefined : { scale: 0.94 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn(
            "glass focus-ring inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors duration-150",
            open ? "text-brand" : "text-label hover:text-brand",
          )}
        >
          <motion.span
            animate={open || reduce ? { rotate: 0 } : { rotate: [0, -12, 10, 0] }}
            transition={{ duration: 0.9, repeat: open || reduce ? 0 : Infinity, repeatDelay: 6 }}
            className="inline-flex"
          >
            <Sparkles className="size-4" strokeWidth={1.75} />
          </motion.span>
          Ask
        </motion.button>
      )}
    </div>
  );
}

export default AssistantLauncher;
