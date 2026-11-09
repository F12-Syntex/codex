"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Switch — Tahoe-style: a capsule knob (wider than tall) riding in a capsule
 * track. Pressing stretches the knob like a lens toward its destination; the
 * release springs it across. Adapted from 21st.dev "Spring switch"
 * (halaska-studio, id 34783) onto the Radix Switch primitive (API unchanged).
 *
 * default: track 40×22, knob 26×18 (→32 pressed) · sm: track 28×16, knob 18×12 (→22)
 */
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch focus-ring relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5",
        "transition-[background-color,box-shadow] duration-300 ease-apple",
        "data-[state=unchecked]:bg-fill data-[state=unchecked]:shadow-[inset_0_1px_2px_0_var(--bg-inset),inset_0_0_0_0.5px_var(--separator)]",
        "data-[state=checked]:bg-brand data-[state=checked]:shadow-[inset_0_1px_2px_0_var(--bg-inset),inset_0_0_0_0.5px_var(--glass-edge),0_0_16px_-6px_var(--accent-brand)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "data-[size=default]:h-5.5 data-[size=default]:w-10 data-[size=sm]:h-4 data-[size=sm]:w-7",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // A physical white knob in every appearance (Apple switches).
          "pointer-events-none block rounded-full bg-white",
          "shadow-[0_2px_5px_-1px_var(--scrim),0_0_0_0.5px_var(--separator-strong)]",
          "transition-[translate,width] duration-[460ms,240ms] ease-spring",
          "data-[state=unchecked]:translate-x-0",
          // default: knob 26×18, travel 10px; pressed knob 32, travel 4px
          "group-data-[size=default]/switch:h-4.5 group-data-[size=default]/switch:w-6.5",
          "group-data-[size=default]/switch:group-active/switch:w-8",
          "group-data-[size=default]/switch:data-[state=checked]:translate-x-2.5",
          "group-data-[size=default]/switch:group-active/switch:data-[state=checked]:translate-x-1",
          // sm: knob 18×12, travel 6px; pressed knob 22, travel 2px
          "group-data-[size=sm]/switch:h-3 group-data-[size=sm]/switch:w-4.5",
          "group-data-[size=sm]/switch:group-active/switch:w-5.5",
          "group-data-[size=sm]/switch:data-[state=checked]:translate-x-1.5",
          "group-data-[size=sm]/switch:group-active/switch:data-[state=checked]:translate-x-0.5"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
