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
 * ResizableHandle — invisible until needed: a hairline that warms to the
 * accent (with a soft ink glow) on hover/drag, plus a small capsule grabber.
 * The hit area is 9px wide even though the visible line is 1px.
 */
function ResizableHandle({
  className,
  ...props
}: ResizablePrimitive.SeparatorProps) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "group/handle relative z-10 flex w-px items-center justify-center bg-separator outline-none transition-[background-color,box-shadow] duration-200 ease-apple",
        // wide invisible hit area
        "after:absolute after:inset-y-0 after:left-1/2 after:w-2.25 after:-translate-x-1/2",
        "data-[separator=hover]:bg-brand/60 data-[separator=active]:bg-brand data-[separator=active]:shadow-[0_0_10px_0_var(--accent-brand)] focus-visible:bg-brand",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:inset-y-auto aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-2.25 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
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
