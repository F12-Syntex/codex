"use client";

import { useEffect, useRef } from "react";
import { Sparkles, ExternalLink } from "lucide-react";
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

  return (
    <div
      ref={menuRef}
      className="entity-context-menu-enter rounded-lg shadow-lg shadow-black/40"
      style={{
        position: "fixed",
        zIndex: 60,
        left: `${x}px`,
        top: `${y}px`,
        width: "180px",
        background: "var(--bg-overlay)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Entity label */}
      <div
        className="flex items-center gap-2 px-2.5 py-2 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <span className="text-xs font-medium text-white/40 uppercase tracking-wide">
          {TYPE_LABELS[entity.type] ?? "Entity"}
        </span>
        <span className="text-xs font-semibold text-white/70 truncate">
          {entity.name}
        </span>
      </div>

      {/* Menu items */}
      <div className="py-1">
        <button
          onClick={() => { onSimulate(); onClose(); }}
          className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
        >
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          Simulate
        </button>
        <button
          onClick={() => { onOpenWiki(); onClose(); }}
          className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/[0.08]"
        >
          <ExternalLink className="h-3.5 w-3.5 text-white/40" strokeWidth={1.5} />
          Open Wiki
        </button>
      </div>

      <style>{`
        .entity-context-menu-enter {
          animation: entityCtxIn 0.12s ease-out;
        }
        @keyframes entityCtxIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
