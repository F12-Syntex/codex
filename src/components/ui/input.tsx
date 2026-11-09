import * as React from "react"

import { cn } from "@/lib/utils"

/** Input — h-8 rounded-md fill field with an accent focus ring (conventions §6). */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md bg-fill-tertiary px-3 text-sm text-label shadow-[inset_0_0_0_0.5px_var(--separator)] outline-none transition-[background-color,box-shadow] duration-150 ease-apple",
        "placeholder:text-label-tertiary selection:bg-brand/30 hover:bg-fill-secondary",
        "file:mr-2 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-label",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:bg-fill-tertiary focus-visible:shadow-[inset_0_0_0_0.5px_var(--accent-brand),0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_35%,transparent)]",
        "aria-invalid:shadow-[inset_0_0_0_0.5px_var(--system-red),0_0_0_3px_color-mix(in_srgb,var(--system-red)_25%,transparent)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
