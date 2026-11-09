/**
 * Kbd — a quiet macOS keycap for shortcut hints (⌘K, ⇧⌘P…).
 * Adapted from 21st.dev "Keyboard Shortcuts" (tom_ui, id 12235): same keycap
 * proportions and inset bottom edge, re-tokenised to our fills and hairlines.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export function Kbd({ children, className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 select-none items-center justify-center gap-0.5 rounded-xs bg-fill-tertiary px-1.5 font-sans text-2xs font-medium leading-none whitespace-nowrap text-label-secondary",
        "shadow-[inset_0_0_0_0.5px_var(--separator-strong),inset_0_-1px_0_0_var(--separator)]",
        "[&_svg]:size-3 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

/** A shortcut string ("Ctrl+Shift+K") as a row of keycaps. */
export function Keys({ keys, className }: { keys: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.split("+").map((k, i) => (
        <Kbd key={`${k}-${i}`}>{k}</Kbd>
      ))}
    </span>
  );
}

export default Kbd;
