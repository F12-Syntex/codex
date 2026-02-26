"use client";

import Image from "next/image";
import {
  Library,
  Clock,
  BookOpenCheck,
  CheckCircle,
  Layers,
  Plus,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LibraryData } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

export type Section = "books" | "comic";

export type NavView =
  | "bookshelf"
  | "read-later"
  | "reading"
  | "finished"
  | "series"
  | "completed";

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

export function AppSidebar({
  activeSection,
  onSectionChange,
  activeView,
  onViewChange,
  data,
  onImport,
}: AppSidebarProps) {
  const navItems = activeSection === "books" ? bookNavItems : comicNavItems;

  const totalItems = Object.values(data).reduce(
    (sum, arr) => sum + (arr?.length ?? 0),
    0
  );

  return (
    <div className="flex h-full flex-col bg-[var(--bg-surface)]">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <Image
          src="/icon.png"
          alt="Codex"
          width={22}
          height={22}
          className="rounded-[5px]"
          draggable={false}
        />
        <span className="text-[14px] font-semibold tracking-tight text-white/80">
          Codex
        </span>
        <span className="rounded-full bg-white/[0.06] px-1.5 py-px text-[9px] font-medium text-white/20">
          {APP_VERSION}
        </span>
      </div>

      {/* Import action */}
      <div className="px-3 pb-3">
        <button
          onClick={onImport}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[12px] font-medium transition-all"
          style={{
            backgroundColor: "var(--accent-brand)",
            color: "var(--accent-brand-fg)",
          }}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Import
        </button>
      </div>

      {/* Section switcher */}
      <div className="px-3 pb-2">
        <div className="flex rounded-lg bg-white/[0.03] p-[3px]">
          {(["books", "comic"] as const).map((s) => {
            const active = activeSection === s;
            return (
              <button
                key={s}
                onClick={() => onSectionChange(s)}
                className={cn(
                  "flex-1 rounded-md py-[5px] text-[11px] font-medium transition-all",
                  active
                    ? "bg-white/[0.07] text-white/75 shadow-sm shadow-black/10"
                    : "text-white/20 hover:text-white/35"
                )}
              >
                {s === "books" ? "Books" : "Comics"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section label */}
      <div className="px-5 pt-3 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/[0.10]">
          Library
        </span>
      </div>

      {/* Nav items */}
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-px">
          {navItems.map((item) => {
            const active = activeView === item.id;
            const count = data[item.id]?.length ?? 0;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 transition-all",
                  active
                    ? "bg-white/[0.06]"
                    : "hover:bg-white/[0.03]"
                )}
              >
                <item.icon
                  className={cn(
                    "h-[16px] w-[16px] shrink-0 transition-colors",
                    active ? "" : "text-white/25 group-hover:text-white/40"
                  )}
                  strokeWidth={1.5}
                  style={active ? { color: "var(--accent-brand)" } : undefined}
                />

                <span
                  className={cn(
                    "flex-1 text-left text-[13px] transition-colors",
                    active
                      ? "font-medium"
                      : "text-white/35 group-hover:text-white/50"
                  )}
                  style={active ? { color: "var(--accent-brand)" } : undefined}
                >
                  {item.label}
                </span>

                {count > 0 && (
                  <span
                    className={cn(
                      "min-w-[18px] rounded-full px-1.5 py-px text-center text-[10px] font-medium tabular-nums",
                      active
                        ? "bg-[var(--accent-brand-dim)] text-[var(--accent-brand)]"
                        : "text-white/15"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-4 pb-4 pt-2">
        <div className="h-px bg-white/[0.04]" />
        <div className="flex items-center justify-between px-1 pt-2.5">
          <span className="text-[10px] text-white/[0.08]">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
