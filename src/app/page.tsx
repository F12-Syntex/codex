"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, useSyncExternalStore } from "react";
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
import { InstallerPage } from "@/components/pages/installer-page";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InkCanvas } from "@/components/ui/ink-canvas";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { SHORTCUT_REGISTRY, parseKeys, matchesShortcut, shouldIgnoreShortcut } from "@/lib/shortcuts";
import { groupByView, libraryItemToMockItem, type LibraryData, type MockItem } from "@/lib/mock-data";
import { DEFAULT_THEME, FONT_FAMILY_CSS, type ThemeConfig } from "@/lib/theme";
import { BookDetailsModal } from "@/components/content/book-details-modal";
import { SeriesReviewModal } from "@/components/content/series-review-modal";
import { hasRpc, rpc } from "@/lib/ai/rpc";
import { useLibraryOverview, useLibraryTagRun } from "@/lib/library/useLibraryAI";

const viewLabelMap: Record<NavView, string> = {
  bookshelf: "Bookshelf",
  "read-later": "Read Later",
  reading: "Reading",
  finished: "Finished",
  series: "Series",
  completed: "Finished",
  settings: "Settings",
  changelog: "What's New",
  installer: "Discover",
};

const noopSubscribe = () => () => {};

/** Full-page views that are not a library shelf (no import / filter there). */
const PAGE_VIEWS = new Set<NavView>(["settings", "changelog", "installer"]);

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
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [seriesOpen, setSeriesOpen] = useState(false);
  // Library AI (F5): accepted genres / series per book, and the library-wide tagging run.
  const { overview } = useLibraryOverview();
  const tagRun = useLibraryTagRun();
  const [bookData, setBookData] = useState<LibraryData>({});
  const [comicData, setComicData] = useState<LibraryData>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Static for the window's lifetime; `false` on the server render.
  const isDev = useSyncExternalStore(noopSubscribe, () => window.electronAPI?.isDev ?? false, () => false);
  const [readingProgress, setReadingProgress] = useState<Record<string, { chapter: number; totalChapters: number }>>({});
  const [detailsItem, setDetailsItem] = useState<MockItem | null>(null);
  // Kept separate from the item so the modal stays mounted and its exit
  // animation plays; the item is swapped (and the modal re-keyed) on open.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const lastSelectedIdRef = useRef<number | null>(null);
  const themeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // ── Load data from database on mount ──────────────

  const refreshLibrary = useCallback(() => {
    if (!window.electronAPI?.getItems) return;
    Promise.all([
      window.electronAPI.getItems("books"),
      window.electronAPI.getItems("comic"),
    ]).then(([books, comics]) => {
      setBookData(groupByView(books));
      setComicData(groupByView(comics));
    });
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  // Listen for library changes (e.g. download auto-import)
  useEffect(() => {
    window.electronAPI?.onLibraryChanged?.(() => refreshLibrary());
  }, [refreshLibrary]);

  // ── Load settings from database on mount ──────────

  // Only the theme and reading progress are needed here: never pull every setting (AI blobs
  // included) over IPC at start-up (AI_AUDIT §7 #5).
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.getSetting) return;
    api.getSetting("theme").then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw) as Partial<ThemeConfig>;
        setTheme((prev) => ({ ...prev, ...saved }));
      } catch { /* ignore invalid JSON */ }
    });
    if (hasRpc()) {
      rpc("library:progress").then(setReadingProgress).catch(() => {});
    }
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
    setGenreFilter(null);
    setSelectedIds(new Set());
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

  /** Save details from book details modal */
  const handleSaveDetails = useCallback((id: number, fields: { title?: string; author?: string; cover?: string }, meta?: { description?: string; genres?: string[] }) => {
    // Update DB
    if (fields.title || fields.author || fields.cover) {
      window.electronAPI?.updateItemMeta(id, fields);
    }
    if (meta) {
      const item = [...Object.values(bookData), ...Object.values(comicData)]
        .flat()
        .find((i) => i?.id === id);
      if (item) {
        window.electronAPI?.setSetting(`bookMeta:${item.filePath}`, JSON.stringify(meta));
      }
    }

    // Update local state
    const updateData = (prev: LibraryData): LibraryData => {
      const next = { ...prev };
      for (const [view, items] of Object.entries(next)) {
        if (!items) continue;
        const idx = items.findIndex((i) => i.id === id);
        if (idx !== -1) {
          const updated = { ...items[idx] };
          if (fields.title) updated.title = fields.title;
          if (fields.author) updated.author = fields.author;
          if (fields.cover) updated.cover = fields.cover;
          next[view as NavView] = [...items.slice(0, idx), updated, ...items.slice(idx + 1)];
          return next;
        }
      }
      return prev;
    };
    setBookData(updateData);
    setComicData(updateData);
  }, [bookData, comicData]);

  /** Open the details modal for an item */
  const handleViewDetails = useCallback((item: MockItem) => {
    setDetailsItem(item);
    setDetailsOpen(true);
  }, []);

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
    if (PAGE_VIEWS.has(activeView)) return;
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
      // Not while typing, and not behind a modal (it owns the keyboard).
      if (shouldIgnoreShortcut(e)) return;

      // Escape clears selection
      if (e.key === "Escape" && selectedIds.size > 0) {
        e.preventDefault();
        setSelectedIds(new Set());
        return;
      }

      for (const s of parsed) {
        if (matchesShortcut(e, s.parsed)) {
          e.preventDefault();
          switch (s.id) {
            case "search":
              setSearchOpen(true);
              break;
            case "import":
              void handleImport();
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
  }, [handleSectionChange, handleImport, selectedIds]);

  const viewLabel = viewLabelMap[activeView] ?? activeView;
  const data = activeSection === "books" ? bookData : comicData;
  const rawItems = useMemo(() => data[activeView] ?? [], [data, activeView]);
  // Every shelf of both sections, so Detect series can show covers of volumes on other shelves.
  const libraryItems = useMemo(
    () => [...Object.values(bookData), ...Object.values(comicData)].flatMap((list) => list ?? []),
    [bookData, comicData],
  );

  /** Accepted genres on this shelf, most common first (the Filter menu's Genre section). */
  const genreOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of rawItems) for (const g of overview[item.filePath]?.genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g).slice(0, 24);
  }, [rawItems, overview]);
  const activeGenre = genreFilter && genreOptions.includes(genreFilter) ? genreFilter : null;

  const seriesOf = useCallback((filePath: string) => overview[filePath]?.series, [overview]);

  // Apply filter + sort
  const processedItems = useMemo(() => {
    let items = [...rawItems];
    if (formatFilter !== "all") {
      items = items.filter((item) => item.format === formatFilter);
    }
    if (activeGenre) {
      const g = activeGenre.toLowerCase();
      items = items.filter((item) => overview[item.filePath]?.genres.some((x) => x.toLowerCase() === g));
    }
    items.sort((a, b) => {
      const aVal = a[sortField].toLowerCase();
      const bVal = b[sortField].toLowerCase();
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [rawItems, formatFilter, activeGenre, overview, sortField, sortDir]);

  const tagProgress = tagRun.running && tagRun.run ? { done: tagRun.run.done + tagRun.run.failed, total: tagRun.run.total } : null;
  // No hydration branch (conventions §13.12): `false` on the server and the first client render.
  const libraryAIAvailable = useSyncExternalStore(noopSubscribe, hasRpc, () => false);

  /** Toggle selection of an item (ctrl+click / shift+click) */
  const handleToggleSelect = useCallback((id: number, shiftKey: boolean) => {
    if (shiftKey && lastSelectedIdRef.current !== null) {
      const lastIdx = processedItems.findIndex((i) => i.id === lastSelectedIdRef.current);
      const currIdx = processedItems.findIndex((i) => i.id === id);
      if (lastIdx !== -1 && currIdx !== -1) {
        const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) next.add(processedItems[i].id);
          return next;
        });
        return;
      }
    }
    lastSelectedIdRef.current = id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [processedItems]);

  /** Delete multiple items at once */
  const handleBatchDelete = useCallback((ids: Set<number>) => {
    for (const id of ids) window.electronAPI?.deleteItem(id);
    const setter = activeSection === "books" ? setBookData : setComicData;
    setter((prev) => {
      const next = { ...prev };
      for (const [view, items] of Object.entries(next)) {
        if (items) next[view as NavView] = items.filter((i) => !ids.has(i.id));
      }
      return next;
    });
    setSelectedIds(new Set());
  }, [activeSection]);

  /** Move multiple items to a different view */
  const handleBatchMove = useCallback((ids: Set<number>, targetView: NavView) => {
    for (const id of ids) window.electronAPI?.moveItem(id, targetView);
    const setter = activeSection === "books" ? setBookData : setComicData;
    setter((prev) => {
      const next = { ...prev };
      const moved: MockItem[] = [];
      for (const [view, items] of Object.entries(next)) {
        if (items) {
          const keep: MockItem[] = [];
          for (const item of items) {
            if (ids.has(item.id)) moved.push(item);
            else keep.push(item);
          }
          next[view as NavView] = keep;
        }
      }
      next[targetView] = [...(next[targetView] ?? []), ...moved];
      return next;
    });
    setSelectedIds(new Set());
  }, [activeSection]);

  // ── Theme lives on <html> ───────────────────────
  // Every portal (Spotlight, modals, menus, tooltips) renders outside the app
  // tree, so the theme attributes and vars must sit on the document root.
  // Layout effect: lands before children's passive effects (InkCanvas reads
  // its tokens from <html>) and before paint, so no frame shows a stale theme.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const attrs: Record<string, string | undefined> = {
      "data-accent": theme.accent,
      "data-appearance": theme.appearance,
      "data-tint": theme.tintSurfaces ? "true" : undefined,
      "data-cursor": theme.cursorStyle !== "default" ? theme.cursorStyle : undefined,
    };
    const fontFamily = FONT_FAMILY_CSS[theme.fontFamily] ?? FONT_FAMILY_CSS.system;
    const vars: Record<string, string> = {
      "--radius": `${theme.borderRadius / 16}rem`,
      // "Surface glass" (50–100%): globals.css multiplies every material's
      // alpha by this.
      "--surface-opacity": String(Math.min(100, Math.max(50, theme.surfaceOpacity ?? 100)) / 100),
      // `font-sans` (body, and so every portal) resolves to --font-ui.
      "--font-ui": fontFamily,
    };
    if (theme.accent === "custom" && theme.customAccentColor) {
      const hex = theme.customAccentColor;
      vars["--accent-brand"] = hex;
      vars["--accent-brand-dim"] = `${hex}26`;
      vars["--accent-brand-subtle"] = `${hex}14`;
      vars["--accent-brand-fg"] = "#fafafa";
    }

    for (const [name, value] of Object.entries(attrs)) {
      if (value === undefined) root.removeAttribute(name);
      else root.setAttribute(name, value);
    }
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    root.style.fontFamily = fontFamily;
    root.style.colorScheme = theme.appearance === "light" ? "light" : "dark";

    return () => {
      for (const name of Object.keys(attrs)) root.removeAttribute(name);
      for (const name of Object.keys(vars)) root.style.removeProperty(name);
      root.style.removeProperty("font-family");
      root.style.removeProperty("color-scheme");
    };
  }, [
    theme.accent,
    theme.appearance,
    theme.tintSurfaces,
    theme.cursorStyle,
    theme.fontFamily,
    theme.borderRadius,
    theme.customAccentColor,
    theme.surfaceOpacity,
  ]);

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
      backgroundColor: `color-mix(in srgb, var(--canvas) ${theme.backgroundOpacity}%, transparent)`,
      backdropFilter: theme.backgroundBlur > 0 ? `blur(${theme.backgroundBlur}px)` : undefined,
    };
    return s;
  }, [theme.backgroundImage, theme.backgroundOpacity, theme.backgroundBlur]);

  const showInk = !theme.backgroundImage && theme.ambientBackground !== false;

  return (
    <TooltipProvider>
      <div className="app-canvas relative flex h-full overflow-hidden">
        {/* ── Backdrop: wallpaper, or the living ink canvas ── */}
        {theme.backgroundImage ? (
          <div className="pointer-events-none absolute inset-0" style={contentStyle}>
            <div className="absolute inset-0" style={overlayStyle} />
          </div>
        ) : showInk ? (
          // Theme changes reach the canvas through <html> (it observes the
          // attributes / vars mirrored above) — no remount, no re-init.
          <InkCanvas className="absolute inset-0" />
        ) : null}

        {/* No z-index here: a stacking context would cut every glass surface inside off from the
            backdrop. Later positioned siblings already paint above the absolute canvas. */}
        <ResizablePanelGroup orientation="horizontal" className="relative h-full overflow-hidden">
          {!sidebarCollapsed && (
            <>
              <ResizablePanel
                defaultSize={`${theme.sidebarWidth}%`}
                minSize="200px"
                maxSize="400px"
              >
                {/* Floating source list, inset from the window edges */}
                <div className="h-full py-2 pl-2">
                  <AppSidebar
                    activeSection={activeSection}
                    onSectionChange={handleSectionChange}
                    activeView={activeView}
                    onViewChange={(v: NavView) => { setActiveView(v); setSelectedIds(new Set()); }}
                    data={data}
                    isDev={isDev}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle className="w-2 bg-transparent" />
            </>
          )}
          <ResizablePanel defaultSize={sidebarCollapsed ? "100%" : `${100 - theme.sidebarWidth}%`}>
            <div className="flex h-full min-w-0 flex-col">
              <TitleBar
                showIdentity={sidebarCollapsed}
                onSearchOpen={() => setSearchOpen(true)}
              />
              <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex h-full min-h-0 flex-col">
                  {activeView === "settings" ? (
                    <SettingsPage onImportItems={handleImportItems} onLibraryCleared={refreshLibrary} activeSection={activeSection} theme={theme} onThemeChange={handleThemeChange} />
                  ) : activeView === "changelog" ? (
                    <ChangelogPage />
                  ) : activeView === "installer" ? (
                    <InstallerPage />
                  ) : (
                    <>
                      <ContentGrid
                        items={processedItems}
                        viewMode={viewMode}
                        coverStyle={theme.coverStyle}
                        showFormatBadge={theme.showFormatBadge}
                        onMoveItem={handleMoveItem}
                        onDeleteItem={handleDeleteItem}
                        onTransferItem={handleTransferItem}
                        onOpenItem={handleOpenItem}
                        onViewDetails={handleViewDetails}
                        activeView={activeView}
                        section={activeSection}
                        selectedIds={selectedIds}
                        onToggleSelect={handleToggleSelect}
                        onClearSelection={() => setSelectedIds(new Set())}
                        onBatchDelete={handleBatchDelete}
                        onBatchMove={handleBatchMove}
                        readingProgress={readingProgress}
                        onImport={handleImport}
                        filterLabel={[formatFilter !== "all" ? formatFilter : null, activeGenre].filter(Boolean).join(" · ") || undefined}
                        onClearFilter={() => { setFormatFilter("all"); setGenreFilter(null); }}
                        seriesOf={seriesOf}
                        onDetectSeries={libraryAIAvailable ? () => setSeriesOpen(true) : undefined}
                        header={
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
                          genreOptions={genreOptions}
                          genreFilter={activeGenre}
                          onGenreFilterChange={setGenreFilter}
                          onSuggestTags={libraryAIAvailable ? () => void tagRun.start({ filePaths: rawItems.map((i) => i.filePath) }) : undefined}
                          tagProgress={tagProgress}
                          onCancelTagging={tagRun.cancel}
                          tagError={tagRun.error ?? (tagRun.run?.state === "done" && tagRun.run.failed > 0 ? tagRun.run.error ?? null : null)}
                          onDetectSeries={libraryAIAvailable ? () => setSeriesOpen(true) : undefined}
                        />
                        }
                      />
                    </>
                  )}
                </div>
                <Dock
                  theme={theme}
                  onThemeChange={handleThemeChange}
                  hidden={selectedIds.size > 0}
                  sidebarVisible={!sidebarCollapsed}
                  onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
                />
              </main>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
        <SearchOverlay
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          bookData={bookData}
          comicData={comicData}
          onOpenItem={handleOpenItem}
        />
        <SeriesReviewModal
          open={seriesOpen}
          onClose={() => setSeriesOpen(false)}
          items={rawItems}
          library={libraryItems}
          onApplied={(n) => { if (n > 0) setViewMode("series"); }}
        />
        {detailsItem && (
          <BookDetailsModal
            key={detailsItem.id}
            item={detailsItem}
            open={detailsOpen}
            onClose={() => setDetailsOpen(false)}
            onSave={handleSaveDetails}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
