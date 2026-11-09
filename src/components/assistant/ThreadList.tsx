"use client";

/**
 * ThreadList — conversation switcher popover (`glass-menu rounded-xl`). One selection style
 * (`bg-fill-secondary` pill, conventions §13.3), delete on hover, "New conversation" on top.
 */

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { motion, useReducedMotion } from "motion/react";
import { BookOpenText, ChevronDown, MessageCircle, Search, SquarePen, Sparkles, Trash2 } from "lucide-react";
import type { AssistantMode, AssistantThread } from "@shared/assistant/types";
import { cn } from "@/lib/utils";

const MODE_ICON: Record<AssistantMode, React.ReactNode> = {
  chat: <MessageCircle />,
  explain: <Sparkles />,
  recap: <BookOpenText />,
  lookup: <Search />,
};

function relTime(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface ThreadListProps {
  threads: AssistantThread[];
  activeId: string | null;
  title: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ThreadList({ threads, activeId, title, onSelect, onNew, onDelete }: ThreadListProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [now, setNow] = React.useState(0);

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setNow(Date.now());
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="focus-ring pressable -ml-1.5 flex h-8 min-w-0 items-center gap-1 rounded-md px-1.5 text-left transition-colors duration-150 hover:bg-fill-tertiary data-[state=open]:bg-fill-tertiary"
          aria-label="Conversations"
        >
          <span className="truncate font-display text-base font-semibold text-label">{title}</span>
          <ChevronDown className={cn("size-3.5 shrink-0 text-label-tertiary transition-transform duration-200 ease-apple", open && "rotate-180")} strokeWidth={2.25} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="glass-menu z-[120] w-72 origin-(--radix-popover-content-transform-origin) animate-pop-in rounded-xl p-1 text-label outline-hidden"
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
            className="focus-ring flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-label transition-colors duration-150 hover:bg-fill-tertiary [&_svg]:size-4 [&_svg]:text-brand"
          >
            <SquarePen />
            New conversation
          </button>
          {threads.length > 0 && <div className="mx-2 my-1 h-px bg-separator" />}
          <div className="max-h-72 overflow-y-auto">
            {threads.map((t, i) => {
              const active = t.id === activeId;
              return (
                <motion.div
                  key={t.id}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.02, duration: 0.18 }}
                  className={cn(
                    "group flex h-9 items-center gap-2 rounded-md pr-1 pl-2 transition-colors duration-150",
                    active ? "bg-fill-secondary" : "hover:bg-fill-tertiary",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSelect(t.id);
                    }}
                    className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left [&_svg]:size-3.5"
                  >
                    <span className={cn("shrink-0", active ? "text-brand" : "text-label-tertiary")}>{MODE_ICON[t.mode]}</span>
                    <span className={cn("min-w-0 flex-1 truncate text-sm", active ? "font-medium text-label" : "text-label-secondary")}>{t.title}</span>
                    <span className="shrink-0 text-2xs tabular-nums text-label-tertiary group-hover:hidden">{now ? relTime(t.updatedAt, now) : ""}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${t.title}`}
                    onClick={() => onDelete(t.id)}
                    className="focus-ring hidden size-6 shrink-0 items-center justify-center rounded-sm text-label-tertiary transition-colors duration-150 group-hover:inline-flex hover:bg-danger/15 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </div>
          {threads.length === 0 && <p className="px-2 py-2 text-xs text-label-tertiary">No earlier conversations for this book.</p>}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export default ThreadList;
