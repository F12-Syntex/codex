"use client";

import { useEffect, useRef } from "react";
import { Sparkles, ExternalLink } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { MenuHighlightScope, useMenuHighlight } from "@/components/ui/menu-highlight";
import { cn } from "@/lib/utils";
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

  // Keyboard reach: take focus on open (the menu itself, so a pointer-opened
  // menu shows no highlight), ↑/↓/Home/End rove between items, and focus
  // returns to where it was when the menu closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    menuRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    // Activation keys stay in the menu (Space would also toggle read-aloud).
    if (e.key === " " || e.key === "Enter") { e.stopPropagation(); return; }
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) next = index < 0 ? 0 : (index + 1) % items.length;
    else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) next = index <= 0 ? items.length - 1 : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next === null) return;
    // Arrows also turn pages on window — keep them in the menu.
    e.preventDefault();
    e.stopPropagation();
    items[next].focus();
  };

  const dot = ENTITY_DOT[entity.color] ?? "var(--accent-brand)";

  return (
    <motion.div
      ref={menuRef}
      role="menu"
      aria-label={`${entity.name} actions`}
      tabIndex={-1}
      onKeyDown={handleMenuKeyDown}
      className="glass-thick w-[220px] rounded-xl p-1 text-label outline-none"
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
      <MenuHighlightScope>
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
      </MenuHighlightScope>
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

/**
 * macOS menu item: h-7, accent lozenge that glides between items
 * (shared `menu-highlight`, from 21st.dev "Animated Background").
 */
function MenuItem({ icon, label, hint, onSelect }: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onSelect: () => void;
}) {
  const { itemProps, indicator } = useMenuHighlight();
  const active = indicator !== null;
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      {...itemProps}
      onMouseEnter={(e) => e.currentTarget.focus()}
      // Hand focus back to the menu (not <body>) so the keyboard stays in it.
      onMouseLeave={(e) => e.currentTarget.closest<HTMLElement>('[role="menu"]')?.focus({ preventScroll: true })}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); }
      }}
      className={cn(
        "relative isolate flex h-7 w-full cursor-default items-center gap-2 rounded-lg px-2 text-left text-sm outline-none select-none",
        active ? "text-brand-fg" : "text-label",
      )}
    >
      {indicator}
      <span className={cn("inline-flex [&_svg]:size-4", active ? "text-brand-fg" : "text-label-secondary")}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {hint && (
        <span className={cn("text-xs", active ? "text-brand-fg/75" : "text-label-secondary")}>{hint}</span>
      )}
    </div>
  );
}
