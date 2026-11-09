"use client";

import { useEffect, useRef } from "react";
import { Sparkles, ExternalLink } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import type { WikiEntryType } from "@/lib/ai-wiki";

const TYPE_LABELS: Record<WikiEntryType, string> = {
  character: "Character",
  item: "Item",
  location: "Location",
  event: "Event",
  concept: "Concept",
};

interface EntityContextMenuProps {
  entity: { id: string; name: string; type: WikiEntryType; color: string };
  x: number;
  y: number;
  onSimulate: () => void;
  onOpenWiki: () => void;
  onClose: () => void;
}

export function EntityContextMenu({
  entity,
  x,
  y,
  onSimulate,
  onOpenWiki,
  onClose,
}: EntityContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Position adjustment to keep menu in viewport
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw - 8) {
      menu.style.left = `${vw - rect.width - 8}px`;
    }
    if (rect.bottom > vh - 8) {
      menu.style.top = `${vh - rect.height - 8}px`;
    }
  }, []);

  // Dismiss on click outside, Escape, scroll
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        e.stopPropagation();
      }
    };
    const handleScroll = () => onClose();

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKey, true);
      window.addEventListener("scroll", handleScroll, true);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  const dot = ENTITY_DOT[entity.color] ?? "var(--accent-brand)";

  return (
    <motion.div
      ref={menuRef}
      role="menu"
      aria-label={`${entity.name} actions`}
      className="glass-thick w-[220px] rounded-xl p-1 text-label"
      style={{ position: "fixed", zIndex: 60, left: `${x}px`, top: `${y}px`, transformOrigin: "0 0" }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={reduce ? { duration: 0.1 } : { type: "spring", stiffness: 600, damping: 34, mass: 0.6 }}
    >
      {/* Entity header */}
      <div className="flex items-center gap-2.5 px-2 pt-1.5 pb-2">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: dot, boxShadow: `0 0 10px 0 ${dot}` }}
        />
        <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-label">
          {entity.name}
        </span>
        <Badge variant="outline">{TYPE_LABELS[entity.type] ?? "Entity"}</Badge>
      </div>

      <div aria-hidden className="mx-2 mb-1 h-px bg-separator" />

      {/* Menu items */}
      <MenuItem
        icon={<Sparkles strokeWidth={1.75} />}
        label="Simulate"
        hint="What if…"
        onSelect={() => { onSimulate(); onClose(); }}
      />
      <MenuItem
        icon={<ExternalLink strokeWidth={1.75} />}
        label="Open in Wiki"
        onSelect={() => { onOpenWiki(); onClose(); }}
      />
    </motion.div>
  );
}

/** Wiki entity color key → system color (dot). */
const ENTITY_DOT: Record<string, string> = {
  blue: "var(--system-blue)",
  amber: "var(--system-orange)",
  emerald: "var(--system-green)",
  rose: "var(--system-pink)",
  violet: "var(--system-purple)",
};

/** macOS menu item: h-7 rounded-md, accent highlight with inverted text. */
function MenuItem({ icon, label, hint, onSelect }: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="group/item flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-label outline-none transition-colors duration-75 hover:bg-brand hover:text-brand-fg focus-visible:bg-brand focus-visible:text-brand-fg"
    >
      <span className="inline-flex text-label-secondary group-hover/item:text-brand-fg group-focus-visible/item:text-brand-fg [&_svg]:size-4">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {hint && (
        <span className="text-xs text-label-tertiary group-hover/item:text-brand-fg/70 group-focus-visible/item:text-brand-fg/70">
          {hint}
        </span>
      )}
    </button>
  );
}
