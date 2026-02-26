"use client";

import {
  Library,
  FolderOpen,
  Clock,
  BookOpenCheck,
  CheckCircle,
  Layers,
  BookOpen,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LibraryData } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export type Section = "books" | "comic";

export type NavView =
  | "bookshelf"
  | "repository"
  | "read-later"
  | "reading"
  | "finished"
  | "series"
  | "chapters"
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
  { id: "repository" as const, label: "Repository", icon: FolderOpen },
  { id: "read-later" as const, label: "Read Later", icon: Clock },
  { id: "reading" as const, label: "Reading", icon: BookOpenCheck },
  { id: "finished" as const, label: "Finished", icon: CheckCircle },
];

const comicNavItems = [
  { id: "series" as const, label: "Series", icon: Layers },
  { id: "chapters" as const, label: "Chapters", icon: BookOpen },
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

  return (
    <div className="flex h-full flex-col bg-[var(--bg-surface)]">
      {/* Section tabs */}
      <div className="flex gap-6 px-5 pt-5">
        {(["books", "comic"] as const).map((s) => {
          const active = activeSection === s;
          return (
            <button
              key={s}
              onClick={() => onSectionChange(s)}
              className={cn(
                "relative pb-2 text-[13px] font-medium transition-colors",
                active ? "text-foreground" : "text-white/25 hover:text-white/45"
              )}
            >
              {s === "books" ? "Books" : "Comics"}
              {active && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                  style={{ backgroundColor: "var(--accent-brand)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mx-4 mt-1 h-px bg-white/[0.04]" />

      {/* Section label */}
      <div className="px-5 pt-5 pb-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/[0.12]">
          Library
        </span>
      </div>

      {/* Nav items */}
      <ScrollArea className="min-h-0 flex-1 px-3">
        <div className="flex flex-col">
          {navItems.map((item) => {
            const active = activeView === item.id;
            const count = data[item.id]?.length ?? 0;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "flex items-center gap-2.5 px-2 py-[9px] transition-colors",
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
    </div>
  );
}
