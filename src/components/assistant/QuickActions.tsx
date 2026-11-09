"use client";

/** Quick-action chips (`rounded-full bg-fill-tertiary h-7`) with a staggered spring entrance. */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { GitBranch, History, Network, Users } from "lucide-react";
import type { AssistantQuickAction } from "@shared/assistant/types";
import { QUICK_ACTIONS, type QuickActionDef } from "@shared/assistant/quick-actions";
import { cn } from "@/lib/utils";

const ICONS: Record<AssistantQuickAction, React.ReactNode> = {
  recap: <History />,
  characters: <Users />,
  arcs: <GitBranch />,
  relationships: <Network />,
};

export interface QuickActionsProps {
  onPick: (action: QuickActionDef) => void;
  disabled?: boolean;
  className?: string;
}

export function QuickActions({ onPick, disabled, className }: QuickActionsProps) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("flex flex-wrap justify-center gap-1.5", className)}>
      {QUICK_ACTIONS.map((qa, i) => (
        <motion.button
          key={qa.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(qa)}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 400, damping: 30, delay: 0.08 + i * 0.04 }}
          className="focus-ring pressable inline-flex h-7 items-center gap-1.5 rounded-full bg-fill-tertiary px-3 text-xs font-medium text-label-secondary transition-colors duration-150 hover:bg-fill-secondary hover:text-label disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:text-label-tertiary"
        >
          {ICONS[qa.id]}
          {qa.label}
        </motion.button>
      ))}
    </div>
  );
}

export default QuickActions;
