"use client";

import {
  Library,
  Clock,
  BookOpenCheck,
  CheckCircle,
  Layers,
  Settings,
  Gift,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LibraryData } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export type Section = "books" | "comic";

export type NavView =
  | "bookshelf"
  | "read-later"
  | "reading"
  | "finished"
  | "series"
  | "completed"
  | "settings"
  | "changelog";

interface AppSidebarProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  activeView: NavView;
  onViewChange: (view: NavView) => void;
  data: LibraryData;
  onImport: () => void;
}

/* ── Section definitions (scalable — just add entries) ──── */

const sections: { id: Section; label: string }[] = [
  { id: "books", label: "Books" },
  { id: "comic", label: "Comics" },
];

const sectionNavItems: Record<Section, { id: NavView; label: string; icon: typeof Clock }[]> = {
  books: [
    { id: "bookshelf", label: "Bookshelf", icon: Library },
    { id: "read-later", label: "Read Later", icon: Clock },
    { id: "reading", label: "Reading", icon: BookOpenCheck },
    { id: "finished", label: "Finished", icon: CheckCircle },
  ],
  comic: [
    { id: "series", label: "Series", icon: Layers },
    { id: "read-later", label: "Read Later", icon: Clock },
    { id: "reading", label: "Reading", icon: BookOpenCheck },
    { id: "completed", label: "Completed", icon: CheckCircle },
  ],
};

const bottomNavItems = [
  { id: "changelog" as const, label: "What's New", icon: Gift },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

/* ── Nav button ─────────────────────────────────────────── */

function NavButton({
  active,
  icon: Icon,
  label,
  count,
  compact,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  count?: number;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 transition-colors",
        compact ? "py-[6px]" : "py-[7px]",
        active
          ? "bg-white/[0.07] text-white/80"
          : "text-white/30 hover:bg-white/[0.04] hover:text-white/50"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      <span className="flex-1 text-left text-[13px]">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "text-[11px] tabular-nums",
            active ? "text-white/25" : "text-white/[0.10]"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ── Section tab ────────────────────────────────────────── */

function SectionTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
        active
          ? "bg-white/[0.08] text-white/70"
          : "text-white/20 hover:bg-white/[0.04] hover:text-white/40"
      )}
    >
      {label}
    </button>
  );
}

/* ── Sidebar ─────────────────────────────────────────────── */

export function AppSidebar({
  activeSection,
  onSectionChange,
  activeView,
  onViewChange,
  data,
}: AppSidebarProps) {
  const navItems = sectionNavItems[activeSection];

  const totalItems = Object.values(data).reduce(
    (sum, arr) => sum + (arr?.length ?? 0),
    0
  );

  return (
    <div className="flex h-full flex-col bg-[var(--bg-surface)]">
      {/* ── Section tabs ─────────────────────────── */}
      <div className="px-2 pt-3 pb-1">
        <div className="flex gap-0.5">
          {sections.map((s) => (
            <SectionTab
              key={s.id}
              active={activeSection === s.id}
              label={s.label}
              onClick={() => onSectionChange(s.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Collection nav ───────────────────────── */}
      <ScrollArea className="min-h-0 flex-1 px-2 pt-2">
        <div className="flex flex-col gap-px">
          {navItems.map((item) => (
            <NavButton
              key={item.id}
              active={activeView === item.id}
              icon={item.icon}
              label={item.label}
              count={data[item.id]?.length ?? 0}
              onClick={() => onViewChange(item.id)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* ── Bottom pinned nav ────────────────────── */}
      <div className="flex flex-col gap-px px-2 pb-2">
        <div className="mx-2.5 mb-1.5 h-px bg-white/[0.04]" />
        {bottomNavItems.map((item) => (
          <NavButton
            key={item.id}
            active={activeView === item.id}
            icon={item.icon}
            label={item.label}
            compact
            onClick={() => onViewChange(item.id)}
          />
        ))}
        <div className="mt-1 px-2.5">
          <span className="text-[11px] text-white/[0.10]">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
