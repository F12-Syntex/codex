/**
 * Badge — small pill for counts, statuses and tags.
 * Adapted from the shadcn/21st.dev Badge (cva variants), re-tokenised:
 * tinted fills (`bg-*\/15`) with matching label colour, macOS-style.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-2xs font-medium whitespace-nowrap tabular-nums transition-colors duration-150 [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-fill-tertiary text-label-secondary",
        accent: "bg-brand/15 text-brand",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-danger/15 text-danger",
        outline: "text-label-secondary shadow-[inset_0_0_0_0.5px_var(--separator-strong)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}

export default Badge;
