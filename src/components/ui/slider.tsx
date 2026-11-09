"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Slider — Tahoe-style: a slim recessed 4px capsule track, an accent range
 * with an ink bloom at its leading edge, and a horizontal capsule knob that
 * swells on hover and grows into a lens while dragged (spring).
 * Knob behaviour adapted from 21st.dev "Spring slider" (halaska-studio,
 * id 34778) onto the Radix Slider (API unchanged).
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "group/slider relative flex w-full cursor-pointer touch-none items-center select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40",
        "data-[orientation=horizontal]:h-5 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-5 data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow rounded-full bg-fill-secondary shadow-[inset_0_1px_1px_0_var(--bg-inset),inset_0_0_0_0.5px_var(--separator)] data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute rounded-full bg-brand shadow-[0_0_10px_-2px_var(--accent-brand)] data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className={cn(
            // Physical white knob in every appearance (Apple sliders).
            "block h-4.5 w-7 shrink-0 cursor-grab rounded-full bg-white outline-none",
            "group-data-[orientation=vertical]/slider:h-7 group-data-[orientation=vertical]/slider:w-4.5",
            "shadow-[0_2px_6px_-1px_var(--scrim),0_0_0_0.5px_var(--separator-strong)]",
            "transition-[scale,box-shadow] duration-[420ms] ease-spring",
            "group-hover/slider:scale-105 active:scale-125 active:cursor-grabbing active:duration-200",
            "active:shadow-[0_6px_16px_-4px_var(--scrim),0_0_0_0.5px_var(--separator-strong),0_0_0_6px_color-mix(in_srgb,var(--accent-brand)_18%,transparent)]",
            "focus-visible:shadow-[0_2px_6px_-1px_var(--scrim),0_0_0_4px_color-mix(in_srgb,var(--accent-brand)_40%,transparent)]",
            "data-[disabled]:pointer-events-none"
          )}
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
