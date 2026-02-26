"use client";

import { useState, useEffect, useCallback } from "react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import type { Section, NavView } from "@/components/sidebar/app-sidebar";
import { ContentToolbar } from "@/components/content/content-toolbar";
import type { ViewMode } from "@/components/content/content-toolbar";
import { ContentGrid } from "@/components/content/content-grid";
import { Dock } from "@/components/dock";
import { SearchOverlay } from "@/components/search-overlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { DEFAULT_ACCENT, type AccentId } from "@/lib/accent";
import { SHORTCUT_REGISTRY, parseKeys, matchesShortcut } from "@/lib/shortcuts";
import { bookData, mangaData } from "@/lib/mock-data";

const viewLabelMap: Record<NavView, string> = {
  bookshelf: "Bookshelf",
  repository: "Repository",
  "read-later": "Read Later",
  reading: "Reading",
  finished: "Finished",
  series: "Series",
  chapters: "Chapters",
  completed: "Completed",
};

export default function Home() {
  const [activeSection, setActiveSection] = useState<Section>("books");
  const [activeView, setActiveView] = useState<NavView>("bookshelf");
  const [accent, setAccent] = useState<AccentId>(DEFAULT_ACCENT);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

  const handleSectionChange = useCallback((section: Section) => {
    setActiveSection(section);
    setActiveView(section === "books" ? "bookshelf" : "series");
  }, []);

  useEffect(() => {
    const parsed = SHORTCUT_REGISTRY.map((s) => ({
      ...s,
      parsed: parseKeys(s.keys),
    }));

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      for (const s of parsed) {
        if (matchesShortcut(e, s.parsed)) {
          e.preventDefault();
          switch (s.id) {
            case "search":
              setSearchOpen(true);
              break;
            case "toggle-sidebar":
              setSidebarCollapsed((v) => !v);
              break;
            case "switch-books":
              handleSectionChange("books");
              break;
            case "switch-manga":
              handleSectionChange("manga");
              break;
            case "grid-view":
              setViewMode("grid");
              break;
            case "list-view":
              setViewMode("list");
              break;
          }
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSectionChange]);

  const viewLabel = viewLabelMap[activeView] ?? activeView;
  const data = activeSection === "books" ? bookData : mangaData;
  const currentItems = data[activeView] ?? [];
  const itemCount = currentItems.length;

  return (
    <TooltipProvider>
      <div
        className="flex h-full"
        data-accent={accent}
        style={backgroundImage ? { "--bg-image": `url(${backgroundImage})` } as React.CSSProperties : undefined}
      >
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          {!sidebarCollapsed && (
            <>
              <ResizablePanel
                defaultSize="20%"
                minSize="180px"
                maxSize="350px"
              >
                <AppSidebar
                  activeSection={activeSection}
                  onSectionChange={handleSectionChange}
                  activeView={activeView}
                  onViewChange={setActiveView}
                />
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}
          <ResizablePanel defaultSize={sidebarCollapsed ? "100%" : "80%"}>
            <div
              className="relative flex h-full flex-col overflow-hidden"
              style={backgroundImage ? {
                backgroundImage: `url(${backgroundImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              } : undefined}
            >
              {backgroundImage && (
                <div className="pointer-events-none absolute inset-0 bg-background/70" />
              )}
              <div className="relative flex h-full flex-col">
                <ContentToolbar
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  viewLabel={viewLabel}
                  itemCount={itemCount}
                />
                <ContentGrid
                  activeView={activeView}
                  section={activeSection}
                  viewMode={viewMode}
                />
                <Dock
                  accent={accent}
                  onAccentChange={setAccent}
                  onSearchOpen={() => setSearchOpen(true)}
                  backgroundImage={backgroundImage}
                  onBackgroundImageChange={setBackgroundImage}
                />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </TooltipProvider>
  );
}
