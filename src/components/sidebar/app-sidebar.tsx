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
import { Button } from "@/components/ui/button";
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
      {/* Segmented control */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex gap-0.5 rounded-lg bg-[var(--bg-inset)] p-1">
          <button
            onClick={() => onSectionChange("books")}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              activeSection === "books"
                ? "bg-[var(--bg-elevated)] text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Books
          </button>
          <button
            onClick={() => onSectionChange("manga")}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              activeSection === "manga"
                ? "bg-[var(--bg-elevated)] text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Manga
          </button>
        </div>
      </div>

      {/* Nav list */}
      <ScrollArea className="flex-1 px-2">
        <div className="flex flex-col gap-0.5 py-1">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <Button
                key={item.id}
                variant="ghost"
                className={cn(
                  "h-8 w-full justify-start gap-2 rounded-lg pl-3 pr-3 text-sm",
                  isActive && "font-medium text-foreground"
                )}
                style={
                  isActive
                    ? { backgroundColor: "var(--accent-brand-dim)" }
                    : undefined
                }
                onClick={() => onViewChange(item.id)}
              >
                <item.icon
                  className="h-3.5 w-3.5 shrink-0"
                  style={
                    isActive
                      ? { color: "var(--accent-brand)" }
                      : undefined
                  }
                />
                {item.label}
              </Button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer — library info */}
      <div className="border-t border-white/[0.04] px-3 py-2">
        <p className="text-[11px] text-white/20">
          {activeSection === "books" ? "Books" : "Manga"} Library
        </p>
      </div>
    </div>
  );
}
