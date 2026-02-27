"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import type { Section, NavView } from "@/components/sidebar/app-sidebar";
import { ContentToolbar } from "@/components/content/content-toolbar";
import type { ViewMode, SortField, SortDir, FormatFilter } from "@/components/content/content-toolbar";
import { ContentGrid } from "@/components/content/content-grid";
import { TitleBar } from "@/components/title-bar";
import { Dock } from "@/components/dock";
import { SearchOverlay } from "@/components/search-overlay";
import { SettingsPage } from "@/components/pages/settings-page";
import { ChangelogPage } from "@/components/pages/changelog-page";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { SHORTCUT_REGISTRY, parseKeys, matchesShortcut } from "@/lib/shortcuts";
import { groupByView, libraryItemToMockItem, type LibraryData, type MockItem } from "@/lib/mock-data";
import { DEFAULT_THEME, type ThemeConfig } from "@/lib/theme";

const viewLabelMap: Record<NavView, string> = {
  bookshelf: "Bookshelf",
  "read-later": "Read Later",
  reading: "Reading",
  finished: "Finished",
  series: "Series",
  completed: "Completed",
  settings: "Settings",
  changelog: "What's New",
};

const sectionLabelMap: Record<string, string> = {
  books: "Books",
  comic: "Comics",
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
  const [bookData, setBookData] = useState<LibraryData>({});
  const [comicData, setComicData] = useState<LibraryData>({});
  const themeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load data from database on mount ──────────────

  useEffect(() => {
    if (!window.electronAPI?.getItems) return;
    Promise.all([
      window.electronAPI.getItems("books"),
      window.electronAPI.getItems("comic"),
    ]).then(([books, comics]) => {
      setBookData(groupByView(books));
      setComicData(groupByView(comics));
    });
  }, []);

  // ── Load settings from database on mount ──────────

  useEffect(() => {
    if (!window.electronAPI?.getAllSettings) return;
    window.electronAPI.getAllSettings().then((settings) => {
      if (settings.theme) {
        try {
          const saved = JSON.parse(settings.theme) as Partial<ThemeConfig>;
          setTheme((prev) => ({ ...prev, ...saved }));
        } catch { /* ignore invalid JSON */ }
      }
    });
  }, []);

  // ── Auto-scan on launch ───────────────────────────

  useEffect(() => {
    if (!window.electronAPI?.getSetting || !window.electronAPI?.scanFolder) return;
    Promise.all([
      window.electronAPI.getSetting("autoScan"),
      window.electronAPI.getSetting("libraryPath"),
    ]).then(([autoScan, libraryPath]) => {
      if (autoScan === "true" && libraryPath) {
        // Scan both sections
        Promise.all([
          window.electronAPI.scanFolder(libraryPath, "books", "bookshelf"),
          window.electronAPI.scanFolder(libraryPath, "comic", "series"),
        ]).then(([newBooks, newComics]) => {
          if (newBooks?.length) {
            setBookData((prev) => {
              const items = newBooks.map(libraryItemToMockItem);
              return { ...prev, bookshelf: [...(prev.bookshelf ?? []), ...items] };
            });
          }
          if (newComics?.length) {
            setComicData((prev) => {
              const items = newComics.map(libraryItemToMockItem);
              return { ...prev, series: [...(prev.series ?? []), ...items] };
            });
          }
        });
      }
    });
  }, []);

  // ── Save theme to database (debounced) ────────────

  const handleThemeChange = useCallback((patch: Partial<ThemeConfig>) => {
    setTheme((prev) => {
      const next = { ...prev, ...patch };
      // Debounce save to DB
      if (themeDebounceRef.current) clearTimeout(themeDebounceRef.current);
      themeDebounceRef.current = setTimeout(() => {
        window.electronAPI?.setSetting("theme", JSON.stringify(next));
      }, 500);
      return next;
    });
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

  /** Move an item to a different view within the same section */
  const handleMoveItem = useCallback((id: number, targetView: NavView) => {
    window.electronAPI?.moveItem(id, targetView);
    const setter = activeSection === "books" ? setBookData : setComicData;
    setter((prev) => {
      const next = { ...prev };
      let item: MockItem | null = null;
      for (const [view, items] of Object.entries(next)) {
        const idx = items?.findIndex((i) => i.id === id) ?? -1;
        if (idx !== -1 && items) {
          item = items[idx];
          next[view as NavView] = items.filter((_, i) => i !== idx);
          break;
        }
      }
      if (!item) return prev;
      next[targetView] = [...(next[targetView] ?? []), item];
      return next;
    });
  }, [activeSection]);

  /** Delete an item */
  const handleDeleteItem = useCallback((id: number) => {
    window.electronAPI?.deleteItem(id);
    const setter = activeSection === "books" ? setBookData : setComicData;
    setter((prev) => {
      const next = { ...prev };
      for (const [view, items] of Object.entries(next)) {
        const idx = items?.findIndex((i) => i.id === id) ?? -1;
        if (idx !== -1 && items) {
          next[view as NavView] = items.filter((_, i) => i !== idx);
          return next;
        }
      }
      return prev;
    });
  }, [activeSection]);

  /** Transfer an item between books and comics */
  const handleTransferItem = useCallback((id: number, targetSection: Section) => {
    const defaultView = targetSection === "books" ? "bookshelf" : "series";
    window.electronAPI?.transferItem(id, targetSection, defaultView);

    const sourceSetter = activeSection === "books" ? setBookData : setComicData;
    const targetSetter = targetSection === "books" ? setBookData : setComicData;

    // Find and remove from source
    let transferredItem: MockItem | null = null;
    sourceSetter((prev) => {
      const next = { ...prev };
      for (const [view, items] of Object.entries(next)) {
        const idx = items?.findIndex((i) => i.id === id) ?? -1;
        if (idx !== -1 && items) {
          transferredItem = items[idx];
          next[view as NavView] = items.filter((_, i) => i !== idx);
          return next;
        }
      }
      return prev;
    });

    // Add to target (use setTimeout to ensure source state update completes first)
    setTimeout(() => {
      if (!transferredItem) return;
      targetSetter((prev) => ({
        ...prev,
        [defaultView]: [...(prev[defaultView] ?? []), transferredItem!],
      }));
    }, 0);
  }, [activeSection]);

  /** Open a book in the reader window */
  const handleOpenItem = useCallback((item: MockItem) => {
    window.electronAPI?.openReader({
      id: item.id,
      title: item.title,
      author: item.author,
      filePath: item.filePath,
      cover: item.cover,
      format: item.format,
    });
  }, []);

  /** Import files via Electron file dialog */
  const handleImport = useCallback(async () => {
    if (!window.electronAPI?.importFiles) return;
    const defaultView = activeView;
    const items = await window.electronAPI.importFiles(activeSection, defaultView);
    if (!items || items.length === 0) return;
    const mockItems = items.map(libraryItemToMockItem);
    const setter = activeSection === "books" ? setBookData : setComicData;
    setter((prev) => ({
      ...prev,
      [activeView]: [...(prev[activeView] ?? []), ...mockItems],
    }));
  }, [activeSection, activeView]);

  /** Import items from folder scan (called from Settings) */
  const handleImportItems = useCallback((items: LibraryItem[]) => {
    if (items.length === 0) return;
    const mockItems = items.map(libraryItemToMockItem);
    const setter = activeSection === "books" ? setBookData : setComicData;
    const defaultView = activeSection === "books" ? "bookshelf" : "series";
    setter((prev) => ({
      ...prev,
      [defaultView]: [...(prev[defaultView] ?? []), ...mockItems],
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

  const breadcrumb = useMemo(() => {
    if (activeView === "settings") return ["Settings"];
    if (activeView === "changelog") return ["What's New"];
    const sectionLabel = sectionLabelMap[activeSection] ?? activeSection;
    const vLabel = viewLabelMap[activeView] ?? activeView;
    return [sectionLabel, vLabel];
  }, [activeSection, activeView]);

  return (
    <TooltipProvider>
      <div
        className="flex h-full flex-col"
        data-accent={theme.accent}
        data-appearance={theme.appearance}
        data-tint={theme.tintSurfaces ? "true" : undefined}
        data-cursor={theme.cursorStyle !== "default" ? theme.cursorStyle : undefined}
        style={rootStyle}
      >
        <TitleBar breadcrumb={breadcrumb} />
        <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
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
                  onImport={handleImport}
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
                {activeView === "settings" ? (
                  <SettingsPage onImportItems={handleImportItems} activeSection={activeSection} />
                ) : activeView === "changelog" ? (
                  <ChangelogPage />
                ) : (
                  <>
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
                      onMoveItem={handleMoveItem}
                      onDeleteItem={handleDeleteItem}
                      onTransferItem={handleTransferItem}
                      onOpenItem={handleOpenItem}
                      activeView={activeView}
                      section={activeSection}
                    />
                  </>
                )}
                <Dock
                  theme={theme}
                  onThemeChange={handleThemeChange}
                  onSearchOpen={() => setSearchOpen(true)}
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
