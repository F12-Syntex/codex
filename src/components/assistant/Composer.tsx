"use client";

/**
 * Composer — pill prompt input (`rounded-full h-9 bg-fill-tertiary`) that grows into a rounded
 * field for multi-line questions, with a spring send button that turns into Stop while an answer
 * streams. Adapted from 21st.dev "Prompt Input" (tinkerers-labs, id 31882: auto-grow, Enter to
 * send / Shift+Enter newline, Send↔Stop swap) and "Assistant Composer" (konsstepnov, id 38323),
 * restyled for Codex Glass. IME-safe: Enter during composition never sends.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_HEIGHT = 132;

export interface ComposerProps {
  value: string;
  onValueChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Leading accessory inside the pill (e.g. a seed chip). */
  leading?: React.ReactNode;
  className?: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}

export function Composer({
  value, onValueChange, onSend, onStop, busy = false, disabled = false, placeholder = "Ask about the book…",
  autoFocus, leading, className, inputRef,
}: ComposerProps) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  const [multiline, setMultiline] = React.useState(false);
  const canSend = value.trim().length > 0 && !disabled && !busy;

  React.useImperativeHandle(inputRef, () => ref.current as HTMLTextAreaElement, []);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const h = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
    setMultiline(h > 24);
  }, [value]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-9 items-end gap-1.5 bg-fill-tertiary py-1 pr-1 pl-3.5 transition-[border-radius,box-shadow] duration-200 ease-apple",
        "focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_20%,transparent)]",
        multiline ? "rounded-2xl" : "rounded-full",
        disabled && "opacity-60",
        className,
      )}
    >
      {leading}
      <textarea
        ref={ref}
        value={value}
        rows={1}
        autoFocus={autoFocus}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Message"
        className="block min-w-0 flex-1 resize-none self-center bg-transparent py-1 text-sm leading-5 text-label outline-none placeholder:text-label-tertiary disabled:cursor-not-allowed"
      />
      <AnimatePresence mode="popLayout" initial={false}>
        {busy && onStop ? (
          <motion.button
            key="stop"
            type="button"
            onClick={onStop}
            aria-label="Stop answer"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            whileTap={reduce ? undefined : { scale: 0.88 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="focus-ring inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-label text-canvas"
          >
            <Square className="size-2.5 fill-current" strokeWidth={0} />
          </motion.button>
        ) : (
          <motion.button
            key="send"
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: canSend ? 1 : 0.9 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            whileTap={reduce || !canSend ? undefined : { scale: 0.88 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={cn(
              "focus-ring inline-flex size-7 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
              canSend ? "bg-brand text-brand-fg shadow-[0_0_18px_-6px_var(--accent-brand)]" : "bg-fill-secondary text-label-quaternary",
            )}
          >
            <ArrowUp className="size-4" strokeWidth={2.25} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Composer;
