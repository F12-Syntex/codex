"use client";

import {
  Library,
  Clock,
  BookOpenCheck,
  CheckCircle,
  Layers,
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
  | "completed";

interface AppSidebarProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  activeView: NavView;
  onViewChange: (view: NavView) => void;
  data: LibraryData;
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
}: AppSidebarProps) {
  const navItems = activeSection === "books" ? bookNavItems : comicNavItems;

  const totalItems = Object.values(data).reduce(
    (sum, arr) => sum + (arr?.length ?? 0),
    0
  );

  return (
    <div className="flex h-full flex-col bg-[var(--bg-surface)]">
      {/* Header — pill section switcher */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex rounded-lg bg-white/[0.04] p-0.5">
          {(["books", "comic"] as const).map((s) => {
            const active = activeSection === s;
            return (
              <button
                key={s}
                onClick={() => onSectionChange(s)}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-[12px] font-medium transition-all",
                  active
                    ? "bg-white/[0.08] text-white/80 shadow-sm shadow-black/10"
                    : "text-white/25 hover:text-white/40"
                )}
              >
                {s === "books" ? "Books" : "Comics"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section label */}
      <div className="px-5 pt-2 pb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/[0.10]">
          Library
        </span>
      </div>

      {/* Nav items */}
      <ScrollArea className="min-h-0 flex-1 px-3">
        <div className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const active = activeView === item.id;
            const count = data[item.id]?.length ?? 0;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-[9px] transition-colors",
                  active
                    ? "font-medium"
                    : "text-white/30 hover:text-white/50"
                )}
              >
                <div
                  className={cn(
                    "h-[5px] w-[5px] shrink-0 rounded-full transition-opacity",
                    active ? "opacity-100" : "opacity-0"
                  )}
                  style={{ backgroundColor: "var(--accent-brand)" }}
                />

                <item.icon
                  className="h-[15px] w-[15px] shrink-0"
                  strokeWidth={1.5}
                  style={active ? { color: "var(--accent-brand)" } : undefined}
                />

                <span
                  className="flex-1 text-left text-[13px]"
                  style={active ? { color: "var(--accent-brand)" } : undefined}
                >
                  {item.label}
                </span>

                {count > 0 && (
                  <span className="text-[11px] tabular-nums text-white/[0.12]">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="flex flex-col gap-2 px-4 pb-4 pt-2">
        <div className="h-px bg-white/[0.04]" />

        <div className="flex items-center justify-between px-1.5">
          <span className="text-[10px] text-white/[0.08]">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-white/[0.08]">v0.4.0</span>
        </div>
      </div>
    </div>
  );
}
