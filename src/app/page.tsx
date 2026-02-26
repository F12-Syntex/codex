"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import type { Section, NavView } from "@/components/sidebar/app-sidebar";
import { ContentToolbar } from "@/components/content/content-toolbar";
import type { ViewMode, SortField, SortDir, FormatFilter } from "@/components/content/content-toolbar";
import { ContentGrid } from "@/components/content/content-grid";
import { Dock } from "@/components/dock";
import { SearchOverlay } from "@/components/search-overlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { SHORTCUT_REGISTRY, parseKeys, matchesShortcut } from "@/lib/shortcuts";
import { initialBookData, initialComicData, fileToMockItem, type LibraryData } from "@/lib/mock-data";
import { DEFAULT_THEME, type ThemeConfig } from "@/lib/theme";

const viewLabelMap: Record<NavView, string> = {
  bookshelf: "Bookshelf",
  "read-later": "Read Later",
  reading: "Reading",
  finished: "Finished",
  series: "Series",
  completed: "Completed",
};

const fontFamilyMap: Record<string, string> = {
  geist: "var(--font-geist-sans)",
  inter: "'Inter', sans-serif",
  mono: "var(--font-geist-mono)",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export default function Home() {
  const [activeSection, setActiveSection] = useState<Section>("books");
  const [activeView, setActiveView] = useState<NavView>("bookshelf");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [bookData, setBookData] = useState<LibraryData>(initialBookData);
  const [comicData, setComicData] = useState<LibraryData>(initialComicData);

  const handleThemeChange = useCallback((patch: Partial<ThemeConfig>) => {
    setTheme((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSectionChange = useCallback((section: Section) => {
    setActiveSection(section);
    setActiveView(section === "books" ? "bookshelf" : "series");
    setFormatFilter("all");
  }, []);

  const handleSortChange = useCallback((field: SortField, dir: SortDir) => {
    setSortField(field);
    setSortDir(dir);
  }, []);

  /** Move an item from its current view to a target view */
  const moveItem = useCallback((title: string, targetView: NavView) => {
    const setter = activeSection === "books" ? setBookData : setComicData;
    setter((prev) => {
      const next = { ...prev };
      // Find and remove the item from its current view
      let item = null;
      for (const [view, items] of Object.entries(next)) {
        const idx = items?.findIndex((i) => i.title === title) ?? -1;
        if (idx !== -1 && items) {
          item = items[idx];
          next[view as NavView] = items.filter((_, i) => i !== idx);
          break;
        }
      }
      if (!item) return prev;
      // Add to target view
      next[targetView] = [...(next[targetView] ?? []), item];
      return next;
    });
  }, [activeSection]);

  /** Import files via Electron file dialog */
  const handleImport = useCallback(async () => {
    const files = await window.electronAPI?.importFiles();
    if (!files || files.length === 0) return;
    const items = files.map(fileToMockItem);
    const setter = activeSection === "books" ? setBookData : setComicData;
    setter((prev) => ({
      ...prev,
      [activeView]: [...(prev[activeView] ?? []), ...items],
    }));
  }, [activeSection, activeView]);

  /** Import items from folder scan (called from Settings) */
  const handleImportItems = useCallback((files: ImportedFile[]) => {
    if (files.length === 0) return;
    const items = files.map(fileToMockItem);
    const setter = activeSection === "books" ? setBookData : setComicData;
    const defaultView = activeSection === "books" ? "bookshelf" : "series";
    setter((prev) => ({
      ...prev,
      [defaultView]: [...(prev[defaultView] ?? []), ...items],
    }));
  }, [activeSection]);

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
            case "switch-comic":
              handleSectionChange("comic");
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
  const data = activeSection === "books" ? bookData : comicData;
  const rawItems = data[activeView] ?? [];

  // Apply filter + sort
  const processedItems = useMemo(() => {
    let items = [...rawItems];
    if (formatFilter !== "all") {
      items = items.filter((item) => item.format === formatFilter);
    }
    items.sort((a, b) => {
      const aVal = a[sortField].toLowerCase();
      const bVal = b[sortField].toLowerCase();
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [rawItems, formatFilter, sortField, sortDir]);

  // Compute dynamic styles from theme
  const rootStyle = useMemo(() => {
    const s: Record<string, string> = {
      fontFamily: fontFamilyMap[theme.fontFamily] ?? fontFamilyMap.geist,
      "--radius": `${theme.borderRadius / 16}rem`,
    };
    if (theme.accent === "custom" && theme.customAccentColor) {
      const hex = theme.customAccentColor;
      s["--accent-brand"] = hex;
      s["--accent-brand-dim"] = `${hex}26`;
      s["--accent-brand-subtle"] = `${hex}14`;
      s["--accent-brand-fg"] = "#fafafa";
    }
    return s as React.CSSProperties;
  }, [theme.fontFamily, theme.accent, theme.customAccentColor, theme.borderRadius]);

  const contentStyle = useMemo(() => {
    const s: React.CSSProperties = {};
    if (theme.backgroundImage) {
      s.backgroundImage = `url(${theme.backgroundImage})`;
      s.backgroundSize = "cover";
      s.backgroundPosition = "center";
    }
    return s;
  }, [theme.backgroundImage]);

  const overlayStyle = useMemo(() => {
    if (!theme.backgroundImage) return undefined;
    const s: React.CSSProperties = {
      backgroundColor: `oklch(0.145 0 0 / ${theme.backgroundOpacity}%)`,
      backdropFilter: theme.backgroundBlur > 0 ? `blur(${theme.backgroundBlur}px)` : undefined,
    };
    return s;
  }, [theme.backgroundImage, theme.backgroundOpacity, theme.backgroundBlur]);

  return (
    <TooltipProvider>
      <div
        className="flex h-full"
        data-accent={theme.accent}
        data-appearance={theme.appearance}
        data-tint={theme.tintSurfaces ? "true" : undefined}
        data-cursor={theme.cursorStyle !== "default" ? theme.cursorStyle : undefined}
        style={rootStyle}
      >
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          {!sidebarCollapsed && (
            <>
              <ResizablePanel
                defaultSize={`${theme.sidebarWidth}%`}
                minSize="180px"
                maxSize="400px"
              >
                <AppSidebar
                  activeSection={activeSection}
                  onSectionChange={handleSectionChange}
                  activeView={activeView}
                  onViewChange={setActiveView}
                  data={data}
                />
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}
          <ResizablePanel defaultSize={sidebarCollapsed ? "100%" : `${100 - theme.sidebarWidth}%`}>
            <div
              className="relative flex h-full flex-col overflow-hidden"
              style={contentStyle}
            >
              {theme.backgroundImage && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={overlayStyle}
                />
              )}
              <div className="relative flex h-full flex-col">
                <ContentToolbar
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  viewLabel={viewLabel}
                  itemCount={processedItems.length}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSortChange={handleSortChange}
                  formatFilter={formatFilter}
                  onFormatFilterChange={setFormatFilter}
                  onImport={handleImport}
                />
                <ContentGrid
                  items={processedItems}
                  viewMode={viewMode}
                  coverStyle={theme.coverStyle}
                  showFormatBadge={theme.showFormatBadge}
                  onMoveItem={moveItem}
                  activeView={activeView}
                  section={activeSection}
                />
                <Dock
                  theme={theme}
                  onThemeChange={handleThemeChange}
                  onSearchOpen={() => setSearchOpen(true)}
                  onImportItems={handleImportItems}
                />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} bookData={bookData} comicData={comicData} />
      </div>
    </TooltipProvider>
  );
}
