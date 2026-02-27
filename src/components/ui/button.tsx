import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand)]/40 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent-brand)] text-[var(--accent-brand-fg)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_1px_2px_0_rgba(0,0,0,0.3)] hover:brightness-[1.15] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_2px_8px_0_var(--accent-brand-dim)]",
        destructive:
          "bg-red-500/80 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_1px_2px_0_rgba(0,0,0,0.3)] hover:bg-red-500/90 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_2px_8px_0_rgba(239,68,68,0.25)]",
        outline:
          "border border-white/[0.08] bg-white/[0.03] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] hover:bg-white/[0.07] hover:border-white/[0.12]",
        secondary:
          "bg-white/[0.07] text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:bg-white/[0.12] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]",
        ghost:
          "text-white/60 hover:text-white hover:bg-white/[0.07]",
        link: "text-[var(--accent-brand)] underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-lg px-2 text-[11px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-lg px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
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
