"use client";

/**
 * SearchField — macOS pill search field with a traveling accent "ink beam"
 * along its bottom edge while focused.
 *
 * Adapted from 21st.dev "Beam Search Bar" (Spectrum UI, id 29955): the beam is
 * re-implemented with `motion/react` (no border-beam dependency), colors and
 * radii mapped to Codex tokens; Escape clears, clear button replaces trailing slot.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Right-hand slot shown while empty (e.g. a <Kbd> hint or result count). */
  trailing?: React.ReactNode;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}

export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, placeholder = "Search", trailing, autoFocus, className, inputClassName },
  forwardedRef,
) {
  const [focused, setFocused] = React.useState(false);
  const innerRef = React.useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

  return (
    <label
      className={cn(
        "relative flex h-8 w-full cursor-text items-center gap-2 overflow-hidden rounded-full bg-fill-tertiary px-3 transition-[background-color,box-shadow] duration-150",
        focused
          ? "bg-fill-secondary shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_18%,transparent)]"
          : "hover:bg-fill-secondary",
        className,
      )}
    >
      <Search className="size-3.5 shrink-0 text-label-tertiary" strokeWidth={2} aria-hidden />
      <input
        ref={innerRef}
        type="text"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm text-label outline-none placeholder:text-label-tertiary select-text",
          inputClassName,
        )}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("");
            innerRef.current?.focus();
          }}
          className="focus-ring pressable flex size-4 shrink-0 items-center justify-center rounded-full bg-label-tertiary text-canvas hover:bg-label-secondary"
        >
          <X className="size-3" strokeWidth={2.75} />
        </button>
      ) : (
        trailing
      )}

      {/* Ink beam */}
      <AnimatePresence>
        {focused && !reduceMotion && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-4 bottom-0 h-px overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.span
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-brand to-transparent"
              initial={{ left: "-33%" }}
              animate={{ left: "100%" }}
              transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.4 }}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </label>
  );
});

export default SearchField;
