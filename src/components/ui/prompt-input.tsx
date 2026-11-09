"use client";

/**
 * PromptInput — glass chat composer with an auto-growing textarea, a toolbar
 * row for secondary actions, a ⏎ hint and a round accent send button.
 * Adapted from 21st.dev "Prompt Input" (tinkerers-labs, id 31882): same
 * grow-to-maxRows measurement and toolbar layout; restyled for Codex Glass
 * (glass rounded-2xl, accent focus glow, spring send button via motion/react).
 *
 * Key handling is left to the caller via `onKeyDown` so existing
 * Enter / Shift+Enter behaviour is preserved exactly.
 */

import * as React from "react";
import { ArrowUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";

const LINE_HEIGHT_FALLBACK = 20;

export interface PromptInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  placeholder?: string;
  disabled?: boolean;
  canSend?: boolean;
  maxRows?: number;
  /** Left side of the toolbar row (history, new chat…). */
  actions?: React.ReactNode;
  /** Right side meta, before the send hint (counts…). */
  meta?: React.ReactNode;
  className?: string;
}

export function PromptInput({
  value,
  onValueChange,
  onSend,
  onKeyDown,
  textareaRef,
  placeholder = "Ask anything…",
  disabled = false,
  canSend = value.trim().length > 0 && !disabled,
  maxRows = 6,
  actions,
  meta,
  className,
}: PromptInputProps) {
  const reduce = useReducedMotion();
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof textareaRef === "function") textareaRef(node);
      else if (textareaRef) (textareaRef as React.RefObject<HTMLTextAreaElement | null>).current = node;
    },
    [textareaRef],
  );

  // Grow with content up to maxRows, then scroll inside the field.
  React.useLayoutEffect(() => {
    const field = innerRef.current;
    if (!field) return;
    field.style.height = "auto";
    const styles = window.getComputedStyle(field);
    const lineHeight = Number.parseFloat(styles.lineHeight) || LINE_HEIGHT_FALLBACK;
    const padding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
    const max = lineHeight * maxRows + padding;
    field.style.height = `${Math.min(field.scrollHeight, max)}px`;
    field.style.overflowY = field.scrollHeight > max ? "auto" : "hidden";
  }, [value, maxRows]);

  return (
    <div
      data-slot="prompt-input"
      className={cn(
        "glass rounded-2xl transition-shadow duration-200 ease-apple",
        "focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_22%,transparent),0_8px_32px_-12px_var(--accent-brand)]",
        disabled && "opacity-80",
        className,
      )}
    >
      <textarea
        ref={setRefs}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        aria-label="Message"
        className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm leading-relaxed text-label outline-none placeholder:text-label-tertiary disabled:cursor-not-allowed"
      />
      <div className="flex h-11 items-center gap-1 pr-1.5 pl-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5">{actions}</div>
        {meta}
        <span className="mr-1.5 hidden items-center gap-1 text-2xs text-label-tertiary sm:inline-flex">
          <Kbd>⏎</Kbd>
          <span>send</span>
          <span className="text-label-quaternary">·</span>
          <Kbd>⇧⏎</Kbd>
          <span>newline</span>
        </span>
        <motion.button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          whileTap={reduce || !canSend ? undefined : { scale: 0.9 }}
          animate={{ scale: canSend ? 1 : 0.92 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn(
            "focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
            canSend
              ? "bg-brand text-brand-fg shadow-[0_0_20px_-6px_var(--accent-brand)]"
              : "bg-fill-tertiary text-label-quaternary",
          )}
        >
          <ArrowUp className="size-4" strokeWidth={2.25} />
        </motion.button>
      </div>
    </div>
  );
}

export default PromptInput;
