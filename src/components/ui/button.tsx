import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Button — Tahoe "liquid glass" capsule.
 *
 * Shape: every button is a capsule (rounded-full); icon buttons are circles.
 * Material: primary is an accent lozenge with an inner specular glow and an
 * accent "ink" bloom on hover; secondary is a frosted fill with a lit top
 * edge; ghost is chrome-less until hovered.
 * Motion: spring squish on press (`pressable`), 150ms fills.
 */
const buttonVariants = cva(
  "focus-ring relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-medium tracking-[-0.006em] select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "pressable bg-brand text-brand-fg shadow-[inset_0_1px_0_0_var(--glass-highlight),inset_0_10px_14px_-10px_var(--glass-highlight),inset_0_0_0_0.5px_var(--glass-edge),var(--shadow-sm)] hover:shadow-[inset_0_1px_0_0_var(--glass-highlight),inset_0_10px_14px_-10px_var(--glass-highlight),inset_0_0_0_0.5px_var(--glass-edge),0_0_24px_-6px_var(--accent-brand)]",
        destructive:
          "pressable bg-danger/15 text-danger shadow-[inset_0_0_0_0.5px_color-mix(in_srgb,var(--system-red)_30%,transparent)] hover:bg-danger/25",
        outline:
          "pressable text-label shadow-[inset_0_0_0_0.5px_var(--separator-strong)] hover:bg-fill-quaternary data-[state=open]:bg-fill-quaternary",
        secondary:
          "pressable bg-fill-tertiary text-label shadow-[inset_0_1px_0_0_var(--glass-highlight),inset_0_0_0_0.5px_var(--glass-edge)] hover:bg-fill-secondary data-[state=open]:bg-fill-secondary",
        ghost:
          "pressable text-label-secondary hover:bg-fill-tertiary hover:text-label data-[state=open]:bg-fill-tertiary data-[state=open]:text-label",
        link: "rounded-sm text-brand underline-offset-4 transition-opacity duration-150 hover:underline",
      },
      size: {
        default: "h-8 px-4 has-[>svg]:pl-3 has-[>svg]:pr-3.5",
        xs: "h-6 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-3 text-xs has-[>svg]:pl-2.5 has-[>svg]:pr-3 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-6 text-base has-[>svg]:pl-4.5 has-[>svg]:pr-5",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
