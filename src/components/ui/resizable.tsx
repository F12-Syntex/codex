"use client"

import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

/**
 * ResizableHandle — invisible at rest (floating panels are their own edge).
 * On hover/drag a centred 1px line warms to the accent with a soft ink glow,
 * plus a small capsule grabber. The handle's own width is just hit area, so
 * a wide handle (`w-2`) never paints a stripe.
 */
function ResizableHandle({
  className,
  ...props
}: ResizablePrimitive.SeparatorProps) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "group/handle relative z-10 flex w-px items-center justify-center bg-transparent outline-none",
        // visible 1px line, centred in the handle
        "before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent before:transition-[background-color,box-shadow] before:duration-200 before:ease-apple",
        "data-[separator=hover]:before:bg-brand/60 data-[separator=active]:before:bg-brand data-[separator=active]:before:shadow-[0_0_10px_0_var(--accent-brand)] focus-visible:before:bg-brand",
        // wide invisible hit area
        "after:absolute after:inset-y-0 after:left-1/2 after:w-2.25 after:-translate-x-1/2",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:before:inset-x-0 aria-[orientation=horizontal]:before:inset-y-auto aria-[orientation=horizontal]:before:top-1/2 aria-[orientation=horizontal]:before:left-0 aria-[orientation=horizontal]:before:h-px aria-[orientation=horizontal]:before:w-full aria-[orientation=horizontal]:before:translate-x-0 aria-[orientation=horizontal]:before:-translate-y-1/2 aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:inset-y-auto aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-2.25 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
        className
      )}
      {...props}
    >
      {/* Capsule grabber — appears on hover, fills with accent while dragging */}
      <div
        className={cn(
          "pointer-events-none z-10 h-8 w-1 scale-y-50 rounded-full bg-fill opacity-0 shadow-[0_0_0_0.5px_var(--separator-strong)] transition-[opacity,scale,background-color] duration-300 ease-spring",
          "group-data-[separator=hover]/handle:scale-y-100 group-data-[separator=hover]/handle:opacity-100",
          "group-data-[separator=active]/handle:scale-y-100 group-data-[separator=active]/handle:bg-brand group-data-[separator=active]/handle:opacity-100",
          "group-aria-[orientation=horizontal]/handle:h-1 group-aria-[orientation=horizontal]/handle:w-8"
        )}
      />
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
