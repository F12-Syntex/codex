import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-white/[0.06] bg-[var(--bg-inset)] px-3 py-1 text-[13px] text-foreground shadow-[inset_0_1px_3px_0_rgba(0,0,0,0.2)] transition-all duration-150 outline-none placeholder:text-white/30 selection:bg-[var(--accent-brand)]/30 selection:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:border-[var(--accent-brand)]/50 focus-visible:shadow-[inset_0_1px_3px_0_rgba(0,0,0,0.2),0_0_0_3px_var(--accent-brand-subtle)]",
        "aria-invalid:border-red-500/50 aria-invalid:shadow-[inset_0_1px_3px_0_rgba(0,0,0,0.2),0_0_0_3px_rgba(239,68,68,0.15)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
