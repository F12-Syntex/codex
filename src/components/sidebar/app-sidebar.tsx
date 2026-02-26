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
import { cn } from "@/lib/utils";

export type Section = "books" | "manga";

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
}

const bookNavItems = [
  { id: "bookshelf" as const, label: "Bookshelf", icon: Library },
  { id: "repository" as const, label: "Repository", icon: FolderOpen },
  { id: "read-later" as const, label: "Read Later", icon: Clock },
  { id: "reading" as const, label: "Reading", icon: BookOpenCheck },
  { id: "finished" as const, label: "Finished", icon: CheckCircle },
];

const mangaNavItems = [
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
}: AppSidebarProps) {
  const navItems = activeSection === "books" ? bookNavItems : mangaNavItems;

  return (
    <div className="flex h-full flex-col bg-[var(--bg-surface)]">
      {/* Section switcher */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex rounded-lg bg-[var(--bg-inset)] p-0.5">
          {(["books", "manga"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onSectionChange(s)}
              className={cn(
                "relative flex-1 rounded-md py-1.5 text-[12px] font-medium transition-all",
                activeSection === s
                  ? "text-foreground"
                  : "text-white/30 hover:text-white/50"
              )}
            >
              {activeSection === s && (
                <div className="absolute inset-0 rounded-md bg-[var(--bg-elevated)] shadow-sm" />
              )}
              <span className="relative">{s === "books" ? "Books" : "Manga"}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Section label */}
      <div className="px-4 pt-4 pb-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/15">
          Library
        </span>
      </div>

      {/* Nav items */}
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-px py-0.5">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] transition-colors",
                  isActive
                    ? "font-medium text-foreground"
                    : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
                )}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full"
                    style={{ backgroundColor: "var(--accent-brand)" }}
                  />
                )}

                {/* Active background */}
                {isActive && (
                  <div
                    className="absolute inset-0 rounded-lg"
                    style={{ backgroundColor: "var(--accent-brand-subtle)" }}
                  />
                )}

                <item.icon
                  className="relative h-4 w-4 shrink-0"
                  strokeWidth={isActive ? 2 : 1.5}
                  style={isActive ? { color: "var(--accent-brand)" } : undefined}
                />
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "var(--accent-brand)" }}
          />
          <span className="text-[11px] text-white/20">
            {activeSection === "books" ? "5 books" : "5 series"}
          </span>
        </div>
      </div>
    </div>
  );
}
