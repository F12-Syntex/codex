"use client";

import {
  Library,
  Clock,
  BookOpenCheck,
  CheckCircle,
  Layers,
  Settings,
  Gift,
  Download,
  Plus,
} from "lucide-react";
import { useState, useEffect, useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Badge } from "@/components/ui/badge";
import { CodexIdentity } from "@/components/title-bar";
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
  | "completed"
  | "settings"
  | "changelog"
  | "installer";

interface AppSidebarProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  activeView: NavView;
  onViewChange: (view: NavView) => void;
  data: LibraryData;
  onImport: () => void;
  isDev?: boolean;
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

/* ── Nav row ────────────────────────────────────────────
   macOS source-list row. The selection is a single shared-layout pill that
   slides between rows (layoutId), adapted from 21st.dev "Animated Sidebar"
   (unlumen, id 21517) — its spring active indicator, re-cut as a filled
   macOS selection with an accent-tinted icon.                              */

const SELECTION_SPRING = { type: "spring", bounce: 0.18, duration: 0.42 } as const;

function NavRow({
  active,
  icon: Icon,
  label,
  count,
  selectionId,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  count?: number;
  selectionId: string;
  onClick: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/row focus-ring relative flex h-8 w-full shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left transition-colors duration-150",
        active ? "text-label" : "text-label-secondary hover:bg-fill-quaternary hover:text-label",
      )}
    >
      {active && (
        <motion.span
          layoutId={selectionId}
          transition={reduce ? { duration: 0 } : SELECTION_SPRING}
          className="absolute inset-0 rounded-md bg-fill-secondary"
        />
      )}
      <Icon
        className={cn(
          "relative size-4 shrink-0 transition-colors duration-150",
          active ? "text-brand" : "text-label-tertiary group-hover/row:text-label-secondary",
        )}
        strokeWidth={1.75}
      />
      <span className={cn("relative flex-1 truncate text-sm", active && "font-medium")}>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="relative text-2xs tabular-nums text-label-tertiary">{count}</span>
      )}
    </button>
  );
}

/* ── Sidebar ─────────────────────────────────────────────── */

function useUpdateAvailable() {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/F12-Syntex/codex/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => r.json())
      .then((data) => {
        const tag: string = data?.tag_name ?? "";
        const version = tag.replace(/^v/, "");
        if (version) setLatestVersion(version);
      })
      .catch(() => {});
  }, []);

  if (!latestVersion) return false;
  const pa = APP_VERSION.split(".").map(Number);
  const pb = latestVersion.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return latestVersion;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
  }
  return false;
}

export function AppSidebar({
  activeSection,
  onSectionChange,
  activeView,
  onViewChange,
  data,
  onImport,
  isDev,
}: AppSidebarProps) {
  const navItems = sectionNavItems[activeSection];
  const updateVersion = useUpdateAvailable();
  const selectionId = useId();

  const totalItems = Object.values(data).reduce(
    (sum, arr) => sum + (arr?.length ?? 0),
    0
  );

  return (
    <aside className="glass-thin grain relative flex h-full flex-col overflow-hidden rounded-2xl">
      {/* ── Identity (also a window drag handle) ──── */}
      <div className="app-drag-region flex h-9 shrink-0 items-center pl-[17px]">
        <CodexIdentity />
      </div>

      {/* ── Section switcher ─────────────────────── */}
      <div className="shrink-0 px-2 pt-1">
        <SegmentedControl
          fill
          value={activeSection}
          onValueChange={onSectionChange}
          options={sections.map((s) => ({ value: s.id, label: s.label }))}
          aria-label="Library section"
        />
      </div>

      {/* ── Collection nav ───────────────────────── */}
      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Collections" className="flex flex-col gap-0.5 px-2 pb-2">
          <div className="flex items-center justify-between px-2.5 pt-4 pb-1.5">
            <h2 className="text-section">Library</h2>
            <span className="text-2xs tabular-nums text-label-tertiary">
              {totalItems} item{totalItems !== 1 ? "s" : ""}
            </span>
          </div>
          {navItems.map((item) => (
            <NavRow
              key={item.id}
              active={activeView === item.id}
              icon={item.icon}
              label={item.label}
              count={data[item.id]?.length ?? 0}
              selectionId={selectionId}
              onClick={() => onViewChange(item.id)}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* ── Footer ───────────────────────────────── */}
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-separator p-2">
        <button
          type="button"
          onClick={onImport}
          className="focus-ring pressable mb-1.5 flex h-8 w-full items-center gap-2.5 rounded-md bg-brand px-2.5 text-sm font-medium text-brand-fg shadow-[0_0_24px_-6px_var(--accent-brand)] hover:brightness-110"
        >
          <Plus className="size-4 shrink-0" strokeWidth={2} />
          <span className="flex-1 text-left">Import</span>
        </button>

        {updateVersion && (
          <button
            type="button"
            onClick={() => onViewChange("changelog")}
            className="focus-ring flex h-8 w-full items-center gap-2.5 rounded-md bg-brand/10 px-2.5 text-brand transition-colors duration-150 hover:bg-brand/15"
          >
            <Download className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="flex-1 truncate text-left text-sm font-medium">Update available</span>
            <Badge variant="accent">v{updateVersion}</Badge>
          </button>
        )}
        {isDev && (
          <NavRow
            active={activeView === "installer"}
            icon={Download}
            label="Installer"
            selectionId={selectionId}
            onClick={() => onViewChange("installer")}
          />
        )}
        {bottomNavItems.map((item) => (
          <NavRow
            key={item.id}
            active={activeView === item.id}
            icon={item.icon}
            label={item.label}
            selectionId={selectionId}
            onClick={() => onViewChange(item.id)}
          />
        ))}
      </div>
    </aside>
  );
}
