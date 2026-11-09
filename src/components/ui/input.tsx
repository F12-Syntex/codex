import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input — a recessed `rounded-md` well (conventions §6). Sits slightly
 * *into* the surface (inner top shadow) instead of on it; on focus it lifts to a lit accent edge with a
 * soft halo that blooms in on a spring.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md bg-fill-tertiary px-3 text-sm text-label outline-none",
        "shadow-[inset_0_1px_2px_0_var(--bg-inset),inset_0_0_0_0.5px_var(--separator)]",
        "transition-[background-color,box-shadow] duration-300 ease-spring",
        "placeholder:text-label-tertiary selection:bg-brand/30 hover:bg-fill-secondary",
        "file:mr-2 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-label",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:bg-fill-quaternary focus-visible:shadow-[inset_0_0_0_1px_var(--accent-brand),0_0_0_4px_color-mix(in_srgb,var(--accent-brand)_22%,transparent),0_0_20px_-4px_color-mix(in_srgb,var(--accent-brand)_50%,transparent)]",
        "aria-invalid:shadow-[inset_0_0_0_1px_var(--system-red),0_0_0_4px_color-mix(in_srgb,var(--system-red)_20%,transparent)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
