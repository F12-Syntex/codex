"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WindowControls } from "@/components/window-controls";
import { APP_VERSION } from "@/lib/version";

interface TitleBarProps {
  breadcrumb?: string[];
}

/**
 * Main window chrome. Transparent over the ink canvas so the window reads as
 * one continuous surface; the whole bar is a drag region except the controls.
 * Breadcrumb adapted from 21st.dev "Breadcrumb" (originui, id 439 — chevron
 * separator variant) with a blur-fade crossfade between locations.
 */
export function TitleBar({ breadcrumb }: TitleBarProps) {
  const reduce = useReducedMotion();
  const segments = breadcrumb && breadcrumb.length > 0 ? breadcrumb : ["Library"];

  return (
    <header className="app-drag-region relative z-20 flex h-11 shrink-0 select-none items-center">
      {/* Identity */}
      <div className="flex h-full items-center gap-2 pl-4">
        <Image
          src="/codex-logo.svg"
          alt=""
          width={18}
          height={18}
          className="pointer-events-none rounded-xs"
          draggable={false}
          priority
        />
        <span className="font-display text-sm font-semibold tracking-tight text-label">Codex</span>
        <Badge variant="outline" className="h-4 px-1.5 text-label-tertiary">
          v{APP_VERSION}
        </Badge>
      </div>

      <span aria-hidden="true" className="mx-3.5 h-3.5 w-px bg-separator-strong" />

      {/* Location */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center">
        <ol className="flex min-w-0 items-center gap-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {segments.flatMap((segment, i) => {
              const last = i === segments.length - 1;
              const item = (
                <motion.li
                  key={`seg-${i}-${segment}`}
                  layout={!reduce}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(4px)" }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  aria-current={last ? "page" : undefined}
                  className={
                    last
                      ? "truncate text-xs font-medium text-label-secondary"
                      : "truncate text-xs text-label-tertiary"
                  }
                >
                  {segment}
                </motion.li>
              );
              if (i === 0) return [item];
              return [
                <motion.li
                  key={`sep-${i}-${segment}`}
                  role="presentation"
                  aria-hidden="true"
                  layout={!reduce}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center text-label-quaternary"
                >
                  <ChevronRight className="size-3" strokeWidth={2} />
                </motion.li>,
                item,
              ];
            })}
          </AnimatePresence>
        </ol>
      </nav>

      <WindowControls />
    </header>
  );
}
