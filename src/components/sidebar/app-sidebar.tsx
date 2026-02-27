"use client";

import {
  Library,
  Clock,
  BookOpenCheck,
  CheckCircle,
  Layers,
  Settings,
  Gift,
  BookOpen,
  BookMarked,
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

const bookNavItems = [
  { id: "bookshelf" as const, label: "Bookshelf", icon: Library },
  { id: "read-later" as const, label: "Read Later", icon: Clock },
  { id: "reading" as const, label: "Reading", icon: BookOpenCheck },
  { id: "finished" as const, label: "Finished", icon: CheckCircle },
];

const comicNavItems = [
  { id: "series" as const, label: "Series", icon: Layers },
  { id: "read-later" as const, label: "Read Later", icon: Clock },
  { id: "reading" as const, label: "Reading", icon: BookOpenCheck },
  { id: "completed" as const, label: "Completed", icon: CheckCircle },
];

const generalNavItems = [
  { id: "changelog" as const, label: "What's New", icon: Gift },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

/* ── Nav button ─────────────────────────────────────────── */

function NavButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] transition-colors",
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

/* ── Section header ─────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 text-[11px] font-medium uppercase tracking-wider text-white/[0.12]">
      {children}
    </span>
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
  const navItems = activeSection === "books" ? bookNavItems : comicNavItems;

  const totalItems = Object.values(data).reduce(
    (sum, arr) => sum + (arr?.length ?? 0),
    0
  );

  const SectionIcon = activeSection === "books" ? BookMarked : BookOpen;

  return (
    <div className="flex h-full flex-col bg-[var(--bg-surface)]">
      {/* ── Section switcher ─────────────────────── */}
      <div className="flex items-center gap-1 px-3 pt-3.5 pb-1">
        <SectionIcon className="mr-1 h-3.5 w-3.5 text-white/20" strokeWidth={1.5} />
        {(["books", "comic"] as const).map((s) => {
          const active = activeSection === s;
          return (
            <button
              key={s}
              onClick={() => onSectionChange(s)}
              className={cn(
                "text-[13px] font-medium transition-colors",
                active ? "text-white/70" : "text-white/20 hover:text-white/40"
              )}
            >
              {s === "books" ? "Books" : "Comics"}
            </button>
          );
        })}
      </div>

      {/* ── Library nav ──────────────────────────── */}
      <div className="mt-3 px-3">
        <SectionLabel>Collection</SectionLabel>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2 pt-1.5">
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

        {/* ── General nav ──────────────────────────── */}
        <div className="mt-4 mb-1.5 px-2.5">
          <div className="h-px bg-white/[0.04]" />
        </div>

        <div className="flex flex-col gap-px">
          {generalNavItems.map((item) => (
            <NavButton
              key={item.id}
              active={activeView === item.id}
              icon={item.icon}
              label={item.label}
              onClick={() => onViewChange(item.id)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* ── Footer ───────────────────────────────── */}
      <div className="px-3 pb-3 pt-1">
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <span className="text-[11px] text-white/[0.12]">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
