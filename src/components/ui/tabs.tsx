"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/**
 * Tabs — Radix Tabs API, Tahoe look.
 *  - `default`: a glass segmented capsule; the active segment is a raised lens
 *    that slides between tabs (motion layoutId spring).
 *  - `line`: quiet labels with a sliding accent underline (or side rule when
 *    vertical) that glows faintly.
 * Indicator adapted from 21st.dev "Animated Tabs" (educalvolpz, id 24930).
 */

type TabsCtx = { value: string | undefined; id: string }
const TabsValueContext = React.createContext<TabsCtx | null>(null)
const TabsVariantContext = React.createContext<"default" | "line">("default")

const LENS_SPRING = { type: "spring", bounce: 0.18, duration: 0.45 } as const
const LINE_SPRING = { type: "spring", stiffness: 420, damping: 36 } as const

function Tabs({
  className,
  orientation = "horizontal",
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const id = React.useId()
  const [inner, setInner] = React.useState(defaultValue)
  const current = value !== undefined ? value : inner

  const handleChange = React.useCallback(
    (next: string) => {
      if (value === undefined) setInner(next)
      onValueChange?.(next)
    },
    [value, onValueChange]
  )

  return (
    <TabsValueContext.Provider value={{ value: current, id }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        orientation={orientation}
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleChange}
        className={cn(
          "group/tabs flex gap-3 data-[orientation=horizontal]:flex-col",
          className
        )}
        {...props}
      />
    </TabsValueContext.Provider>
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center justify-center text-label-secondary group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:items-stretch",
  {
    variants: {
      variant: {
        default:
          "gap-0.5 rounded-full bg-fill-tertiary p-0.5 shadow-[inset_0_1px_2px_0_var(--bg-inset),inset_0_0_0_0.5px_var(--separator)] group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=vertical]/tabs:rounded-2xl",
        line: "gap-4 bg-transparent group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=vertical]/tabs:gap-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const v = variant ?? "default"
  return (
    <TabsVariantContext.Provider value={v}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={v}
        className={cn(tabsListVariants({ variant: v }), className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  )
}

function TabsTrigger({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const ctx = React.useContext(TabsValueContext)
  const variant = React.useContext(TabsVariantContext)
  const reduceMotion = useReducedMotion()
  const active = ctx?.value === value

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "focus-ring relative inline-flex cursor-pointer items-center justify-center gap-1.5 text-xs font-medium whitespace-nowrap outline-none select-none",
        "transition-[color,scale] duration-200 ease-apple active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        "text-label-secondary hover:text-label data-[state=active]:text-label",
        // default (segmented capsule)
        "group-data-[variant=default]/tabs-list:h-7 group-data-[variant=default]/tabs-list:flex-1 group-data-[variant=default]/tabs-list:rounded-full group-data-[variant=default]/tabs-list:px-3.5",
        "group-data-[orientation=vertical]/tabs:group-data-[variant=default]/tabs-list:justify-start group-data-[orientation=vertical]/tabs:group-data-[variant=default]/tabs-list:rounded-xl",
        // line
        "group-data-[variant=line]/tabs-list:h-8 group-data-[variant=line]/tabs-list:px-0.5 group-data-[variant=line]/tabs-list:text-sm",
        "group-data-[orientation=vertical]/tabs:group-data-[variant=line]/tabs-list:justify-start group-data-[orientation=vertical]/tabs:group-data-[variant=line]/tabs-list:px-3",
        className
      )}
      {...props}
    >
      {active && ctx && variant === "default" && (
        <motion.span
          aria-hidden
          layoutId={`${ctx.id}-lens`}
          transition={reduceMotion ? { duration: 0 } : LENS_SPRING}
          className="absolute inset-0 rounded-full bg-elevated shadow-[inset_0_1px_0_0_var(--glass-highlight),0_0_0_0.5px_var(--separator-strong),var(--shadow-sm)] group-data-[orientation=vertical]/tabs:rounded-xl"
        />
      )}
      {active && ctx && variant === "line" && (
        <motion.span
          aria-hidden
          layoutId={`${ctx.id}-line`}
          transition={reduceMotion ? { duration: 0 } : LINE_SPRING}
          className="absolute rounded-full bg-brand shadow-[0_0_10px_0_var(--accent-brand)] group-data-[orientation=horizontal]/tabs:inset-x-0 group-data-[orientation=horizontal]/tabs:-bottom-px group-data-[orientation=horizontal]/tabs:h-0.5 group-data-[orientation=vertical]/tabs:inset-y-1.5 group-data-[orientation=vertical]/tabs:left-0 group-data-[orientation=vertical]/tabs:w-0.5"
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "flex-1 outline-none data-[state=active]:animate-blur-in",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
