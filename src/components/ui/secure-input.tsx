"use client";

/**
 * SecureInput — macOS-style secure text field with a reveal toggle.
 * Adapted from 21st.dev "Password Input" (uilayout.contact, id 2814):
 * same reveal pattern, rebuilt on Codex tokens (fill-tertiary field,
 * rounded-md, accent focus ring, monospace when revealed).
 */

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SecureInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  /** Controlled visibility (optional). */
  revealed?: boolean;
  onRevealedChange?: (revealed: boolean) => void;
  containerClassName?: string;
}

export function SecureInput({
  revealed: revealedProp,
  onRevealedChange,
  className,
  containerClassName,
  ...props
}: SecureInputProps) {
  const [local, setLocal] = React.useState(false);
  const revealed = revealedProp ?? local;
  const toggle = () => {
    const next = !revealed;
    if (revealedProp === undefined) setLocal(next);
    onRevealedChange?.(next);
  };

  return (
    <div className={cn("relative", containerClassName)}>
      <input
        type={revealed ? "text" : "password"}
        spellCheck={false}
        autoComplete="off"
        className={cn(
          "h-8 w-full rounded-md bg-fill-tertiary pr-8 pl-3 text-sm text-label outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-label-quaternary hover:bg-fill-secondary",
          "focus:bg-fill-secondary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_35%,transparent)]",
          revealed ? "font-mono text-xs" : "tracking-wider",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={revealed ? "Hide value" : "Show value"}
        title={revealed ? "Hide" : "Show"}
        className="focus-ring pressable absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-label-tertiary hover:bg-fill-tertiary hover:text-label"
      >
        {revealed ? <EyeOff className="size-3.5" strokeWidth={2} /> : <Eye className="size-3.5" strokeWidth={2} />}
      </button>
    </div>
  );
}

export default SecureInput;
