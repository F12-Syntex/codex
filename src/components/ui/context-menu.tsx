"use client"

import * as React from "react"
import { CheckIcon, ChevronRightIcon } from "lucide-react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { MenuHighlightScope, useMenuHighlight } from "@/components/ui/menu-highlight"

/**
 * Context menu — Tahoe menu: thick glass, concentric radii (rounded-xl
 * panel, p-1, rounded-lg rows), a single accent lozenge that glides between
 * rows, springy pop-in from the pointer.
 */

const menuPanel =
  "glass-thick z-50 min-w-48 overflow-x-hidden overflow-y-auto rounded-xl p-1 text-sm text-label outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150"

const menuRow =
  "group/menu-item relative isolate flex h-7 cursor-default items-center gap-2 rounded-lg px-2.5 text-sm text-label outline-none select-none transition-colors duration-100 data-[highlighted]:text-brand-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-35 data-[inset]:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-label-secondary data-[highlighted]:[&_svg:not([class*='text-'])]:text-brand-fg"

function ContextMenu({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

function ContextMenuPortal({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return (
    <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
  )
}

function ContextMenuTrigger({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      {...props}
    />
  )
}

function ContextMenuContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          menuPanel,
          "max-h-(--radix-context-menu-content-available-height) origin-(--radix-context-menu-content-transform-origin)",
          className
        )}
        {...props}
      >
        <MenuHighlightScope>{children}</MenuHighlightScope>
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
  )
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  children,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  const { itemProps, indicator } = useMenuHighlight(variant, { onFocus, onBlur })
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        menuRow,
        "data-[variant=destructive]:text-danger data-[variant=destructive]:data-[highlighted]:text-brand-fg data-[variant=destructive]:[&_svg]:!text-danger data-[variant=destructive]:data-[highlighted]:[&_svg]:!text-brand-fg",
        className
      )}
      {...props}
      {...itemProps}
    >
      {indicator}
      {children}
    </ContextMenuPrimitive.Item>
  )
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  const { itemProps, indicator } = useMenuHighlight("default", { onFocus, onBlur })
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      className={cn(menuRow, "pl-7", className)}
      checked={checked}
      {...props}
      {...itemProps}
    >
      {indicator}
      <span className="pointer-events-none absolute left-2 flex size-4 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon strokeWidth={2.5} className="size-3.5 text-brand group-data-[highlighted]/menu-item:text-brand-fg" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

function ContextMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot="context-menu-radio-group"
      {...props}
    />
  )
}

function ContextMenuRadioItem({
  className,
  children,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
  const { itemProps, indicator } = useMenuHighlight("default", { onFocus, onBlur })
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      className={cn(menuRow, "pl-7", className)}
      {...props}
      {...itemProps}
    >
      {indicator}
      <span className="pointer-events-none absolute left-2 flex size-4 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <span className="block size-1.5 rounded-full bg-brand group-data-[highlighted]/menu-item:bg-brand-fg" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  )
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn("text-section px-2.5 pt-2 pb-1 data-[inset]:pl-7", className)}
      {...props}
    />
  )
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("mx-2.5 my-1 h-px bg-separator", className)}
      {...props}
    />
  )
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "ml-auto pl-5 text-xs tracking-widest text-label-tertiary tabular-nums group-data-[highlighted]/menu-item:text-brand-fg/75",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuSub({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  const { itemProps, indicator } = useMenuHighlight("default", { onFocus, onBlur })
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        menuRow,
        "data-[state=open]:not-data-[highlighted]:bg-fill-tertiary",
        className
      )}
      {...props}
      {...itemProps}
    >
      {indicator}
      {children}
      <ChevronRightIcon className="ml-auto size-3.5 text-label-tertiary group-data-[highlighted]/menu-item:text-brand-fg" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

function ContextMenuSubContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.SubContent
      data-slot="context-menu-sub-content"
      className={cn(
        menuPanel,
        "origin-(--radix-context-menu-content-transform-origin)",
        className
      )}
      {...props}
    >
      <MenuHighlightScope>{children}</MenuHighlightScope>
    </ContextMenuPrimitive.SubContent>
  )
}

export {
  ContextMenu,
  ContextMenuPortal,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
}
