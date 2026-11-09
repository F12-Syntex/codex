/* ── CommentInput — Reusable inline comment input with send button ──
 * Compact composer (adapted from 21st.dev "Prompt Input", tinkerers-labs id 31882):
 * inset field + round accent send button that wakes up when there is text.
 * Lives inside a glass-thick popover, so it uses fills, not glass. */

import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommentInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function CommentInput({ value, onChange, onSubmit, onCancel }: CommentInputProps) {
  const hasText = value.trim().length > 0;

  return (
    <div className="flex h-8 w-full min-w-0 flex-1 items-center gap-1 rounded-md bg-fill-tertiary pl-2.5 pr-1 transition-shadow duration-150 focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-brand)_45%,transparent)]">
      <input
        type="text"
        placeholder="Add your thoughts…"
        value={value}
        autoFocus
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && hasText) onSubmit();
          if (e.key === "Escape") onCancel();
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-xs text-label outline-none placeholder:text-label-tertiary"
      />
      <button
        type="button"
        aria-label="Add comment"
        onClick={() => { if (hasText) onSubmit(); }}
        disabled={!hasText}
        className={cn(
          "focus-ring pressable inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
          hasText
            ? "bg-brand text-brand-fg shadow-xs"
            : "cursor-default bg-fill-tertiary text-label-quaternary",
        )}
      >
        <ArrowUp className="size-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}
