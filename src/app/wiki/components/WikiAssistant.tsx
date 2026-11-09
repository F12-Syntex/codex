"use client";

/**
 * WikiAssistant — the wiki window's one assistant: the same glass "Ask" pill as the reader
 * (Sparkles · "Ask", bottom-right) that opens the shared `<AssistantPanel host="wiki">`. Answers are clamped to the
 * reader's frontier in main, whatever the wiki's "Show everything" switch says. Also opens on
 * `openAssistant(seed)` from anywhere in this window.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Sparkles } from "lucide-react";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { onOpenAssistant, type OpenAssistantRequest } from "@/lib/assistant/open";

interface WikiAssistantProps {
  filePath: string;
  bookTitle: string;
  /** "Chapter 12": shown in the assistant's empty state. */
  frontierLabel?: string;
  /** Entity mentions in answers open the wiki article. */
  onOpenEntity: (entityId: string) => void;
  /** Lets the wiki pad its article column while the panel is open. */
  onOpenChange?: (open: boolean) => void;
}

export function WikiAssistant({ filePath, bookTitle, frontierLabel, onOpenEntity, onOpenChange }: WikiAssistantProps) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<OpenAssistantRequest | null>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(
    () =>
      onOpenAssistant((req) => {
        if (req.filePath && req.filePath !== filePath) return;
        setRequest(req);
        setOpen(true);
      }),
    [filePath],
  );

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => pillRef.current?.focus());
  }, []);

  if (!filePath) return null;

  return (
    <>
      {/* Closed: the reader's floating "Ask" pill, bottom-right (one launcher across windows) */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="pill"
            ref={pillRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            aria-label="Ask about this book"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="glass focus-ring absolute right-4 bottom-4 z-20 inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-label transition-colors duration-150 hover:text-brand"
          >
            <Sparkles className="size-4" strokeWidth={1.75} />
            Ask
          </motion.button>
        )}
      </AnimatePresence>

      {/* Open: the shared assistant panel, floating bottom-right */}
      <div className="pointer-events-none absolute right-3 bottom-3 z-20 flex flex-col items-end [&>*]:pointer-events-auto">
        <AnimatePresence>
          {open && (
            <AssistantPanel
              key="panel"
              host="wiki"
              filePath={filePath}
              bookTitle={bookTitle}
              frontierLabel={frontierLabel}
              request={request}
              onClose={close}
              onOpenEntity={onOpenEntity}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
