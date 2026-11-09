import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Button — macOS proportions (h-8, rounded-md, 13px medium).
 * Primary carries a top highlight and an accent "ink" glow on hover
 * (conventions §6, §12.5). Every variant except `link` is `pressable`.
 */
const buttonVariants = cva(
  "focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "pressable bg-brand text-brand-fg shadow-[inset_0_1px_0_0_var(--glass-highlight),inset_0_0_0_0.5px_var(--glass-edge),var(--shadow-xs)] hover:shadow-[inset_0_1px_0_0_var(--glass-highlight),inset_0_0_0_0.5px_var(--glass-edge),0_0_24px_-6px_var(--accent-brand)]",
        destructive:
          "pressable bg-danger/15 text-danger hover:bg-danger/25",
        outline:
          "pressable text-label shadow-[inset_0_0_0_0.5px_var(--separator-strong)] hover:bg-fill-quaternary data-[state=open]:bg-fill-quaternary",
        secondary:
          "pressable bg-fill-tertiary text-label hover:bg-fill-secondary data-[state=open]:bg-fill-secondary",
        ghost:
          "pressable text-label-secondary hover:bg-fill-tertiary hover:text-label data-[state=open]:bg-fill-tertiary data-[state=open]:text-label",
        link: "text-brand underline-offset-4 transition-opacity duration-150 hover:underline",
      },
      size: {
        default: "h-8 px-3.5 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-sm px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 px-5 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10 rounded-lg [&_svg:not([class*='size-'])]:size-5",
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
