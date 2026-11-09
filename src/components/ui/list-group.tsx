"use client";

/**
 * ListGroup / ListRow — macOS System Settings style inset grouped lists.
 *
 *   <ListGroup title="Library" footer="Scans run in the background.">
 *     <ListRow icon={<Folder />} iconColor="blue" label="Library folder" description="~/Books">
 *       <Button size="sm" variant="secondary">Change…</Button>
 *     </ListRow>
 *   </ListGroup>
 */

import * as React from "react";
import { cn } from "@/lib/utils";

const ICON_TINTS = {
  blue: "bg-[var(--system-blue)]",
  indigo: "bg-[var(--system-indigo)]",
  purple: "bg-[var(--system-purple)]",
  pink: "bg-[var(--system-pink)]",
  red: "bg-[var(--system-red)]",
  orange: "bg-[var(--system-orange)]",
  yellow: "bg-[var(--system-yellow)]",
  green: "bg-[var(--system-green)]",
  teal: "bg-[var(--system-teal)]",
  gray: "bg-[#8e8e93]",
  accent: "bg-brand",
} as const;

export type ListIconTint = keyof typeof ICON_TINTS;

export function ListIcon({ tint = "accent", children, className }: { tint?: ListIconTint; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-white shadow-xs [&_svg]:size-3.5 [&_svg]:stroke-[2.25]",
        ICON_TINTS[tint],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ListGroup({
  title,
  footer,
  className,
  children,
}: {
  title?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-1.5", className)}>
      {title && <h3 className="px-3 text-headline text-label-secondary">{title}</h3>}
      <div className="overflow-hidden rounded-lg bg-fill-quaternary hairline [&>*+*]:border-t [&>*+*]:border-separator">
        {children}
      </div>
      {footer && <p className="px-3 text-xs text-label-tertiary">{footer}</p>}
    </section>
  );
}

export function ListRow({
  icon,
  iconTint,
  label,
  description,
  children,
  onClick,
  className,
  destructive,
}: {
  icon?: React.ReactNode;
  iconTint?: ListIconTint;
  label: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  destructive?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left",
        onClick && "focus-ring cursor-pointer transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary",
        className,
      )}
    >
      {icon && (iconTint ? <ListIcon tint={iconTint}>{icon}</ListIcon> : <span className="text-label-secondary [&_svg]:size-4">{icon}</span>)}
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm", destructive ? "text-danger" : "text-label")}>{label}</div>
        {description && <div className="mt-0.5 text-xs text-label-tertiary">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </Comp>
  );
}
