"use client"

/**
 * Menu highlight — the accent lozenge behind the focused item of a custom
 * (non-Radix) menu. It appears on the item instantly, like a macOS menu: a
 * gliding lozenge lagged behind the text colour and covered neighbouring rows
 * mid-flight. Radix menus highlight with `data-[highlighted]:bg-brand` instead.
 */

import * as React from "react"
import { cn } from "@/lib/utils"

type Ctx = {
  active: string | null
  layoutId: string
  focus: (id: string) => void
  blur: (id: string) => void
}

const MenuHighlightContext = React.createContext<Ctx | null>(null)

export function MenuHighlightScope({ children }: { children: React.ReactNode }) {
  const layoutId = React.useId()
  const [active, setActive] = React.useState<string | null>(null)
  const pendingClear = React.useRef<number | null>(null)

  React.useEffect(
    () => () => {
      if (pendingClear.current !== null) cancelAnimationFrame(pendingClear.current)
    },
    []
  )

  const value = React.useMemo<Ctx>(
    () => ({
      active,
      layoutId,
      focus: (id) => {
        if (pendingClear.current !== null) cancelAnimationFrame(pendingClear.current)
        pendingClear.current = null
        setActive(id)
      },
      // Defer clearing so focus moving item→item keeps one continuous indicator.
      blur: (id) => {
        if (pendingClear.current !== null) cancelAnimationFrame(pendingClear.current)
        pendingClear.current = requestAnimationFrame(() => {
          pendingClear.current = null
          setActive((current) => (current === id ? null : current))
        })
      },
    }),
    [active, layoutId]
  )

  return <MenuHighlightContext.Provider value={value}>{children}</MenuHighlightContext.Provider>
}

/** Returns focus handlers to spread on an item, and the indicator to render inside it. */
export function useMenuHighlight(
  variant: "default" | "destructive" = "default",
  handlers?: { onFocus?: React.FocusEventHandler<HTMLDivElement>; onBlur?: React.FocusEventHandler<HTMLDivElement> }
) {
  const ctx = React.useContext(MenuHighlightContext)
  const id = React.useId()
  const isActive = ctx?.active === id

  const itemProps = {
    onFocus: (event: React.FocusEvent<HTMLDivElement>) => {
      handlers?.onFocus?.(event)
      ctx?.focus(id)
    },
    onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
      handlers?.onBlur?.(event)
      ctx?.blur(id)
    },
  }

  const indicator =
    ctx && isActive ? (
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 rounded-lg",
          variant === "destructive"
            ? "bg-danger"
            : "bg-brand shadow-[inset_0_1px_0_0_var(--glass-highlight)]"
        )}
      />
    ) : null

  return { itemProps, indicator }
}
