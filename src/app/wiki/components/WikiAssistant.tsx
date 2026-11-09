"use client";

/**
 * WikiAssistant — the wiki window's one assistant: a glass "Ask about this book" pill that opens
 * the shared `<AssistantPanel host="wiki">` (replaces WikiAIChat). Answers are clamped to the
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
}

export function WikiAssistant({ filePath, bookTitle, frontierLabel, onOpenEntity }: WikiAssistantProps) {
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

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => pillRef.current?.focus());
  }, []);

  if (!filePath) return null;

  return (
    <>
      {/* Closed: floating glass pill */}
      <AnimatePresence>
        {!open && (
          <motion.div
            key="pill"
            className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
          >
            <button
              ref={pillRef}
              onClick={() => setOpen(true)}
              aria-expanded={false}
              className="glass focus-ring pressable pointer-events-auto group flex h-10 items-center gap-2.5 rounded-full pl-1.5 pr-4 text-sm font-medium text-label-secondary hover:text-label"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-brand text-brand-fg shadow-[0_0_24px_-6px_var(--accent-brand)]">
                <Sparkles className="size-3.5" strokeWidth={2} />
              </span>
              Ask about this book
            </button>
          </motion.div>
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
