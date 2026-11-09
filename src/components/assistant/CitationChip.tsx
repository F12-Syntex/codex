"use client";

/**
 * CitationChip — inline "Ch 12 ¶4" pill that jumps the reader to the cited paragraph.
 * Adapted from 21st.dev "AI Citations" (kokonutd, id 39090): inline source chips with a hover
 * preview card of the cited passage; restyled with Codex tokens (`rounded-full bg-fill-tertiary
 * text-2xs h-5`, glass-menu preview) and Radix Tooltip for positioning/escape handling.
 */

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { BookOpen } from "lucide-react";
import type { Citation } from "@shared/assistant/types";
import { cn } from "@/lib/utils";
import { useAssistantUI } from "./context";

export interface CitationChipProps {
  citation: Citation;
  /** 1-based number shown when `compact`. */
  n?: number;
  compact?: boolean;
  className?: string;
}

export function CitationChip({ citation, n, compact = false, className }: CitationChipProps) {
  const { reveal } = useAssistantUI();
  return (
    <TooltipPrimitive.Provider delayDuration={180} skipDelayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            onClick={() => reveal(citation.ref)}
            aria-label={`Go to ${citation.label}`}
            className={cn(
              "focus-ring pressable mx-0.5 inline-flex h-5 -translate-y-px items-center gap-1 rounded-full bg-fill-tertiary px-2 align-middle text-2xs font-medium whitespace-nowrap text-label-secondary tabular-nums transition-colors duration-150 hover:bg-brand/15 hover:text-brand",
              className,
            )}
          >
            {compact && n !== undefined ? n : citation.label}
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="top"
            sideOffset={6}
            collisionPadding={12}
            className="glass-menu z-[120] w-64 origin-(--radix-tooltip-content-transform-origin) animate-pop-in rounded-xl p-3 text-label"
          >
            <div className="flex items-center gap-1.5 text-2xs font-medium text-label-tertiary">
              <BookOpen className="size-3" strokeWidth={2} />
              <span className="tabular-nums">{citation.label}</span>
              <span className="ml-auto text-label-quaternary">Click to open</span>
            </div>
            {citation.snippet ? (
              <p className="mt-1.5 line-clamp-5 font-display text-xs leading-relaxed text-label-secondary">“{citation.snippet}”</p>
            ) : (
              <p className="mt-1.5 text-xs text-label-tertiary">Jump to this paragraph in the reader.</p>
            )}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export default CitationChip;
