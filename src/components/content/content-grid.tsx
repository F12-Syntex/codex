"use client";

import { useState, useRef, useEffect } from "react";
import { BookOpen, Clock, BookOpenCheck, CheckCircle, Trash2, ArrowRightLeft } from "lucide-react";
import { BookCard } from "./book-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ViewMode } from "./content-toolbar";
import type { CoverStyle } from "@/lib/theme";
import type { MockItem } from "@/lib/mock-data";
import type { Section, NavView } from "@/components/sidebar/app-sidebar";

interface ContentGridProps {
  items: MockItem[];
  viewMode: ViewMode;
  coverStyle: CoverStyle;
  showFormatBadge: boolean;
  onMoveItem: (id: number, targetView: NavView) => void;
  onDeleteItem: (id: number) => void;
  onTransferItem: (id: number, targetSection: Section) => void;
  activeView: NavView;
  section: Section;
}

const bookMoveTargets: { view: NavView; label: string; icon: typeof Clock }[] = [
  { view: "read-later", label: "Read Later", icon: Clock },
  { view: "reading", label: "Reading", icon: BookOpenCheck },
  { view: "finished", label: "Finished", icon: CheckCircle },
];

const comicMoveTargets: { view: NavView; label: string; icon: typeof Clock }[] = [
  { view: "read-later", label: "Read Later", icon: Clock },
  { view: "reading", label: "Reading", icon: BookOpenCheck },
  { view: "completed", label: "Completed", icon: CheckCircle },
];

function ContextMenu({
  x,
  y,
  itemId,
  activeView,
  section,
  onMove,
  onDelete,
  onTransfer,
  onClose,
}: {
  x: number;
  y: number;
  itemId: number;
  activeView: NavView;
  section: Section;
  onMove: (id: number, view: NavView) => void;
  onDelete: (id: number) => void;
  onTransfer: (id: number, targetSection: Section) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  const allTargets = section === "books" ? bookMoveTargets : comicMoveTargets;
  const targets = allTargets.filter((t) => t.view !== activeView);

  const transferLabel = section === "books" ? "Move to Comics" : "Move to Books";
  const transferSection: Section = section === "books" ? "comic" : "books";

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] overflow-hidden rounded-lg border border-white/[0.08] bg-[var(--bg-overlay)] py-1 shadow-xl shadow-black/40"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-1.5 text-[11px] text-white/20">Move to</div>
      {targets.map((t) => (
        <button
          key={t.view}
          onClick={() => {
            onMove(itemId, t.view);
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white/80"
        >
          <t.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
          {t.label}
        </button>
      ))}

      <div className="mx-2 my-1 h-px bg-white/[0.06]" />

      <button
        onClick={() => {
          onTransfer(itemId, transferSection);
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white/80"
      >
        <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        {transferLabel}
      </button>

      <div className="mx-2 my-1 h-px bg-white/[0.06]" />

      <button
        onClick={() => {
          onDelete(itemId);
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-red-400/80 transition-colors hover:bg-red-500/[0.08] hover:text-red-400"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        Delete
      </button>
    </div>
  );
}

export function ContentGrid({ items, viewMode, coverStyle, showFormatBadge, onMoveItem, onDeleteItem, onTransferItem, activeView, section }: ContentGridProps) {
  const radius = coverStyle === "rounded" ? "rounded-lg" : "rounded-none";
  const [ctx, setCtx] = useState<{ x: number; y: number; itemId: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, itemId: number) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, itemId });
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
          <BookOpen className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">Nothing here yet</p>
          <p className="text-[11px] text-muted-foreground/60">Import items to get started</p>
        </div>
      </div>
    );
  }

  const contextMenu = ctx && (
    <ContextMenu
      x={ctx.x}
      y={ctx.y}
      itemId={ctx.itemId}
      activeView={activeView}
      section={section}
      onMove={onMoveItem}
      onDelete={onDeleteItem}
      onTransfer={onTransferItem}
      onClose={() => setCtx(null)}
    />
  );

  /* ── List view ──────────────────────────────── */
  if (viewMode === "list") {
    return (
      <>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 p-3">
            {items.map((item) => (
              <div
                key={item.id}
                onContextMenu={(e) => handleContextMenu(e, item.id)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.author}</p>
                </div>
                {showFormatBadge && (
                  <span className="shrink-0 rounded-[4px] bg-white/[0.06] px-1.5 py-[3px] text-[10px] font-semibold uppercase tracking-wide text-white/35">
                    {item.format}
                  </span>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
        {contextMenu}
      </>
    );
  }

  /* ── Detail view ────────────────────────────── */
  if (viewMode === "detail") {
    return (
      <>
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3 p-5">
            {items.map((item) => (
              <div
                key={item.id}
                onContextMenu={(e) => handleContextMenu(e, item.id)}
                className="group flex gap-4 rounded-lg bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.05]"
              >
                <div className="relative shrink-0">
                  <div className={`relative h-32 w-[85px] overflow-hidden ${radius}`}>
                    {item.cover ? (
                      <img
                        src={item.cover}
                        alt={item.title}
                        className="absolute inset-0 h-full w-full object-contain bg-black/20"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{ background: item.gradient }}
                      />
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                  <div>
                    <p className="text-sm font-semibold leading-tight">{item.title}</p>
                    <p className="mt-1 text-xs text-white/40">{item.author}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {showFormatBadge && (
                      <span className="rounded-[4px] bg-white/[0.06] px-1.5 py-[3px] text-[10px] font-semibold uppercase tracking-wide text-white/35">
                        {item.format}
                      </span>
                    )}
                    <span className="text-[11px] text-white/15">Added recently</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        {contextMenu}
      </>
    );
  }

  /* ── Grid view ──────────────────────────────── */
  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5 p-5">
          {items.map((item) => (
            <div key={item.id} onContextMenu={(e) => handleContextMenu(e, item.id)}>
              <BookCard
                {...item}
                coverStyle={coverStyle}
                showFormatBadge={showFormatBadge}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
      {contextMenu}
    </>
  );
}
