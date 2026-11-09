"use client";

/**
 * ChatBubble — iMessage-style bubble with a rise-in spring.
 * Adapted from 21st.dev "Message Bubble" (framecn, id 34988): incoming /
 * outgoing variants, bottom-anchored scale + translate entrance, tail corner.
 * Restyled with Codex tokens: outgoing = accent fill, incoming = quaternary
 * fill + hairline. Animation runs on mount only (motion/react).
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type ChatBubbleVariant = "incoming" | "outgoing";

export interface ChatBubbleProps {
  variant?: ChatBubbleVariant;
  children?: React.ReactNode;
  /** Bubble max width; default 80%. */
  maxWidth?: string;
  /** Render without a filled bubble (assistant prose). */
  bare?: boolean;
  className?: string;
  bubbleClassName?: string;
}

export function ChatBubble({
  variant = "incoming",
  children,
  maxWidth = "80%",
  bare = false,
  className,
  bubbleClassName,
}: ChatBubbleProps) {
  const reduce = useReducedMotion();
  const outgoing = variant === "outgoing";

  return (
    <motion.div
      className={cn("flex w-full", outgoing ? "justify-end" : "justify-start", className)}
      style={{ transformOrigin: outgoing ? "bottom right" : "bottom left" }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 420, damping: 32 }}
    >
      <div
        className={cn(
          "min-w-0 break-words",
          !bare && "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          !bare && (outgoing
            ? "rounded-br-md bg-brand text-brand-fg shadow-sm"
            : "rounded-bl-md bg-fill-quaternary text-label hairline"),
          bubbleClassName,
        )}
        style={{ maxWidth }}
      >
        {children}
      </div>
    </motion.div>
  );
}

export default ChatBubble;
