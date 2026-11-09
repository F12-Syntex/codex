"use client";

/**
 * TypingDots — three softly bouncing dots (assistant is composing).
 * Adapted from 21st.dev "Typing" (loading-ui, id 19978): same staggered
 * keyframe idea, re-implemented with motion/react springs and Codex tokens.
 */

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export function TypingDots({ className, dots = 3 }: { className?: string; dots?: number }) {
  const reduce = useReducedMotion();
  return (
    <span role="status" aria-label="Assistant is typing" className={cn("inline-flex items-center gap-1", className)}>
      {Array.from({ length: dots }, (_, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className="block size-1.5 rounded-full bg-current"
          initial={{ opacity: 0.35, y: 0 }}
          animate={reduce ? { opacity: 0.7 } : { opacity: [0.35, 1, 0.35], y: [0, -3, 0] }}
          transition={reduce ? { duration: 0 } : { duration: 1, repeat: Infinity, ease: "easeInOut", delay: i * 0.16 }}
        />
      ))}
    </span>
  );
}

export default TypingDots;
