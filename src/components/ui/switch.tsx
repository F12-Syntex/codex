"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Switch — iOS-style toggle. Spring-eased thumb that stretches while pressed.
 * Adapted from 21st.dev "Spring switch" (halaska-studio, id 34783) onto the
 * Radix Switch primitive (API unchanged).
 *
 * default: track 38×22, thumb 18 · sm: track 26×16, thumb 12
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
        "data-[state=unchecked]:bg-fill data-[state=unchecked]:shadow-[inset_0_0_0_0.5px_var(--separator)]",
        "data-[state=checked]:bg-brand data-[state=checked]:shadow-[inset_0_0_0_0.5px_var(--glass-edge)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "data-[size=default]:h-5.5 data-[size=default]:w-9.5 data-[size=sm]:h-4 data-[size=sm]:w-6.5",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // The thumb is a physical white knob in every appearance (iOS / macOS).
          "pointer-events-none block rounded-full bg-white shadow-[0_2px_4px_-1px_var(--scrim),0_0_0_0.5px_var(--separator-strong)]",
          "transition-[translate,width] duration-[420ms,200ms] ease-spring",
          // default size: 18px thumb, travels 16px; stretches to 22px while pressed
          "group-data-[size=default]/switch:h-4.5 group-data-[size=default]/switch:w-4.5",
          "group-data-[size=default]/switch:group-active/switch:w-5.5",
          "group-data-[size=default]/switch:data-[state=checked]:translate-x-4",
          "group-data-[size=default]/switch:group-active/switch:data-[state=checked]:translate-x-3",
          // sm: 12px thumb, travels 10px; stretches to 15px
          "group-data-[size=sm]/switch:size-3",
          "group-data-[size=sm]/switch:group-active/switch:w-3.75",
          "group-data-[size=sm]/switch:data-[state=checked]:translate-x-2.5",
          "group-data-[size=sm]/switch:group-active/switch:data-[state=checked]:translate-x-1.75",
          "data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
