"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Keys } from "@/components/ui/kbd";
import { WindowControls } from "@/components/window-controls";
import { APP_VERSION } from "@/lib/version";
import { SHORTCUT_REGISTRY } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

interface TitleBarProps {
  /** Show the Codex identity here (when the sidebar — its usual home — is hidden). */
  showIdentity?: boolean;
  /** When given, a Spotlight-style search field sits centred in the bar. */
  onSearchOpen?: () => void;
}

/**
 * Codex mark + wordmark + version — shared with the sidebar header.
 * The ribbon mark carries its own ink tile, so it reads on light and dark glass alike.
 */
export function CodexIdentity({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        src="/codex-logo.svg"
        alt=""
        width={22}
        height={22}
        className="pointer-events-none size-5.5 shrink-0"
        draggable={false}
        priority
      />
      <span className="font-display text-base leading-none font-semibold tracking-tight text-label">Codex</span>
      <Badge variant="outline" className="h-4 px-1.5 text-label-tertiary">
        v{APP_VERSION}
      </Badge>
    </div>
  );
}

const searchKeys = SHORTCUT_REGISTRY.find((s) => s.id === "search")?.keys ?? "Ctrl+K";

/**
 * Unified toolbar-style window chrome for the content column (macOS Tahoe:
 * the sidebar runs full height, the title bar belongs to the content).
 * Transparent over the ink canvas; the bar is a drag region except controls.
 *
 * Left: identity, only while the sidebar is hidden (aligned to the 32px
 * content gutter). Centre: the one search entry point. Right: window controls.
 * No breadcrumb — the large title and the sidebar already say where you are.
 */
export function TitleBar({ showIdentity = true, onSearchOpen }: TitleBarProps) {
  const reduce = useReducedMotion();

  return (
    // z-45: above the dock's panel scrim (z-40) so window controls and the
    // drag region keep working while a dock panel is open; below the dock (z-50).
    <header className="app-drag-region relative z-45 grid h-13 shrink-0 select-none grid-cols-[1fr_auto_1fr] items-center">
      {/* Identity */}
      <div className="flex h-full min-w-0 items-center pl-8">
        <AnimatePresence initial={false}>
          {showIdentity && (
            <motion.div
              key="identity"
              className="flex items-center"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: -8, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <CodexIdentity />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Centre — Spotlight field */}
      <div className="flex justify-center">
        {onSearchOpen && (
          <button
            type="button"
            onClick={onSearchOpen}
            className="app-no-drag focus-ring group/search flex h-8 w-72 items-center gap-2 rounded-full bg-fill-tertiary pr-1.5 pl-3 text-label-tertiary shadow-[inset_0_0_0_0.5px_var(--separator)] transition-colors duration-150 hover:bg-fill-secondary hover:text-label-secondary"
          >
            <Search className="size-3.5 shrink-0" strokeWidth={2} />
            <span className="flex-1 truncate text-left text-xs">Search your library</span>
            <Keys keys={searchKeys} className="opacity-80 transition-opacity group-hover/search:opacity-100" />
          </button>
        )}
      </div>

      {/* Window controls */}
      <div className="flex h-full justify-end">
        <WindowControls />
      </div>
    </header>
  );
}
