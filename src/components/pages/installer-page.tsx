"use client";

/**
 * Installer — discover & download novels.
 *
 * Re-composed around three moments:
 *  1. Discover: a centred serif hero with one large glass search field.
 *  2. Results: the field docks to the top (shared layout animation) above a
 *     cover wall with 3D tilt.
 *  3. Detail: a blurred-cover backdrop, a lifted cover and a download card.
 * Downloads live in a right-hand column of glass cards.
 *
 * Download cards adapted from 21st.dev "Progress Card" (kavikatiyar, id 7790):
 * icon tile + title + progress track + stats row + trailing action, rebuilt
 * on Codex tokens with a spring progress fill (motion/react).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from "motion/react";
import {
  Search,
  ArrowLeft,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Star,
  Tag,
  Loader2,
  Globe,
  Check,
  RotateCcw,
  Trash2,
  PanelRightClose,
  PanelRightOpen,
  ChevronsUpDown,
  Clock,
  AlertTriangle,
  Library,
  CircleSlash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tilt } from "@/components/ui/tilt";
import { BlurFade } from "@/components/ui/blur-fade";
import { EmptyState } from "@/components/ui/empty-state";

type InstallerView = "search" | "detail";
type SourceOption = { id: string; name: string; url: string };

const SPRING = { type: "spring", stiffness: 400, damping: 32 } as const;
const LAYOUT_SPRING = { type: "spring", bounce: 0.2, duration: 0.45 } as const;

// ── Custom source dropdown ──────────────────────────────

function SourceDropdown({
  sources,
  value,
  onChange,
}: {
  sources: SourceOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = sources.find((s) => s.id === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="focus-ring pressable flex h-8 items-center gap-1.5 rounded-full bg-fill-tertiary pr-2 pl-2.5 text-xs font-medium text-label-secondary hover:bg-fill-secondary hover:text-label"
      >
        <Globe className="size-3.5 text-label-tertiary" strokeWidth={2} />
        <span>{selected?.name ?? "Source"}</span>
        <ChevronsUpDown className="size-3 text-label-tertiary" strokeWidth={2} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.98 }}
            transition={SPRING}
            style={{ transformOrigin: "top left" }}
            className="glass-thick absolute top-full left-0 z-50 mt-2 min-w-44 rounded-xl p-1"
          >
            {sources.map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === value}
                onClick={() => { onChange(s.id); setOpen(false); }}
                className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-label hover:bg-brand hover:text-brand-fg"
              >
                <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
                  {s.id === value && <Check className="size-3.5" strokeWidth={2.5} />}
                </span>
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Proxied image component ─────────────────────────────

function ProxiedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setDataUrl(null);
    setFailed(false);
    if (!src) { setFailed(true); return; }
    let cancelled = false;
    window.electronAPI?.installerProxyImage(src).then((url) => {
      if (cancelled) return;
      if (url) setDataUrl(url);
      else setFailed(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [src]);

  if (failed || !dataUrl) {
    return (
      <div className={cn("absolute inset-0 flex items-center justify-center bg-fill-quaternary", className)}>
        {failed ? (
          <BookOpen className="size-8 text-label-quaternary" strokeWidth={1.5} />
        ) : (
          <div className="absolute inset-0 animate-pulse bg-fill-quaternary" />
        )}
      </div>
    );
  }

  return (
    <motion.img
      src={dataUrl}
      alt={alt}
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
      loading="lazy"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    />
  );
}

// ── Format ETA ──────────────────────────────────────────

function formatEta(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "";
  if (seconds < 60) return `~${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `~${m} min`;
  const h = Math.floor(m / 60);
  return `~${h}h ${m % 60}m`;
}

// ── Progress track (spring fill) ────────────────────────

function ProgressTrack({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-xs bg-fill-tertiary", className)}>
      <motion.div
        className="h-full rounded-xs bg-brand shadow-[0_0_8px_var(--accent-brand)]"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 24 }}
      />
    </div>
  );
}

// ── Download card ───────────────────────────────────────

const STATUS_META = {
  downloading: { label: "Downloading", badge: "accent", tile: "bg-brand/15 text-brand", icon: Loader2 },
  queued: { label: "Queued", badge: "default", tile: "bg-fill-tertiary text-label-secondary", icon: Clock },
  completed: { label: "On bookshelf", badge: "success", tile: "bg-success/15 text-success", icon: Check },
  failed: { label: "Failed", badge: "danger", tile: "bg-danger/15 text-danger", icon: AlertTriangle },
  cancelled: { label: "Cancelled", badge: "default", tile: "bg-fill-tertiary text-label-tertiary", icon: CircleSlash },
} as const;

function DownloadCard({
  dl,
  progress,
  onCancel,
  onRetry,
  onRemove,
}: {
  dl: InstallerDownloadRow;
  progress: InstallerDownloadProgress | undefined;
  onCancel: (id: number) => void;
  onRetry: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const isActive = dl.status === "downloading";
  const isQueued = dl.status === "queued";
  const isCompleted = dl.status === "completed";
  const isFailed = dl.status === "failed";
  const isCancelled = dl.status === "cancelled";
  const meta = STATUS_META[dl.status as keyof typeof STATUS_META] ?? STATUS_META.queued;
  const Icon = meta.icon;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={LAYOUT_SPRING}
      className="glass-thin rounded-xl p-3"
    >
      <div className="flex items-start gap-3">
        <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", meta.tile)}>
          <Icon className={cn("size-4", isActive && "animate-spin")} strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-headline leading-snug text-label">{dl.novel_title}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge variant={meta.badge}>{meta.label}</Badge>
            {isFailed && (
              <span className="truncate text-2xs text-danger" title={dl.error || undefined}>
                {dl.error || "Failed"}
              </span>
            )}
          </div>
        </div>

        <div className="-mt-0.5 -mr-1 flex shrink-0 items-center">
          {(isActive || isQueued) && (
            <Button variant="ghost" size="icon-xs" onClick={() => onCancel(dl.id)} title="Cancel" aria-label="Cancel download">
              <X className="size-3.5" />
            </Button>
          )}
          {isFailed && (
            <Button variant="ghost" size="icon-xs" onClick={() => onRetry(dl.id)} title="Retry" aria-label="Retry download">
              <RotateCcw className="size-3.5" />
            </Button>
          )}
          {(isCompleted || isFailed || isCancelled) && (
            <Button variant="ghost" size="icon-xs" onClick={() => onRemove(dl.id)} title="Remove" aria-label="Remove download">
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {isActive && progress && (
        <div className="mt-3 pl-12">
          <ProgressTrack value={(progress.current / progress.total) * 100} />
          <div className="mt-1.5 flex items-center justify-between text-2xs text-label-tertiary tabular-nums">
            <span>
              {progress.current}/{progress.total} chapters
            </span>
            {progress.eta ? <span>{formatEta(progress.eta)}</span> : null}
          </div>
        </div>
      )}
    </motion.li>
  );
}

// ── Download Queue column ───────────────────────────────

function DownloadQueueSidebar({
  downloads,
  liveProgress,
  onCancel,
  onRetry,
  onRemove,
  onClearCompleted,
  onClose,
}: {
  downloads: InstallerDownloadRow[];
  liveProgress: Map<number, InstallerDownloadProgress>;
  onCancel: (id: number) => void;
  onRetry: (id: number) => void;
  onRemove: (id: number) => void;
  onClearCompleted: () => void;
  onClose: () => void;
}) {
  const completedCount = downloads.filter((d) => d.status === "completed").length;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={SPRING}
      className="flex h-full w-80 shrink-0 flex-col pt-6 pr-6"
      aria-label="Downloads"
    >
      {/* Header */}
      <div className="flex h-8 items-center gap-2 pl-1">
        <h2 className="text-headline text-label">Downloads</h2>
        <Badge>{downloads.length}</Badge>
        <div className="flex-1" />
        {completedCount > 0 && (
          <Button variant="ghost" size="xs" onClick={onClearCompleted} className="text-label-secondary">
            Clear completed
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Hide downloads" aria-label="Hide downloads">
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      {/* Download list */}
      <div className="scrollbar-none -mx-2 mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-28">
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {downloads.map((dl) => (
              <DownloadCard
                key={dl.id}
                dl={dl}
                progress={liveProgress.get(dl.id)}
                onCancel={onCancel}
                onRetry={onRetry}
                onRemove={onRemove}
              />
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </motion.aside>
  );
}

// ── Main component ──────────────────────────────────────

export function InstallerPage() {
  const [view, setView] = useState<InstallerView>("search");
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [sourceId, setSourceId] = useState("novelfull");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstallerSearchResult[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searching, setSearching] = useState(false);
  const [novelInfo, setNovelInfo] = useState<InstallerNovelInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  // Chapter range state
  const [rangeFrom, setRangeFrom] = useState<string>("");
  const [rangeTo, setRangeTo] = useState<string>("");

  // Download queue state
  const [downloads, setDownloads] = useState<InstallerDownloadRow[]>([]);
  const [liveProgress, setLiveProgress] = useState<Map<number, InstallerDownloadProgress>>(new Map());
  const [queueOpen, setQueueOpen] = useState(false);
  const progressListenerSet = useRef(false);

  // Auto-open sidebar when a new download is queued
  const prevDownloadCount = useRef(0);

  // Load available sources
  useEffect(() => {
    window.electronAPI?.installerGetSources?.().then((s) => {
      if (s?.length) {
        setSources(s);
        setSourceId(s[0].id);
      }
    });
  }, []);

  // Load existing downloads on mount
  useEffect(() => {
    window.electronAPI?.installerGetDownloads?.().then((rows) => {
      if (rows) {
        setDownloads(rows);
        prevDownloadCount.current = rows.length;
        // Auto-open if there are active downloads
        if (rows.some((d) => d.status === "downloading" || d.status === "queued")) {
          setQueueOpen(true);
        }
      }
    });
  }, []);

  // Listen for progress events
  useEffect(() => {
    if (progressListenerSet.current) return;
    progressListenerSet.current = true;
    window.electronAPI?.onInstallerProgress((p) => {
      setLiveProgress((prev) => {
        const next = new Map(prev);
        next.set(p.id, p);
        return next;
      });

      // Update download row status in local state
      if (p.status === "completed" || p.status === "failed" || p.status === "cancelled") {
        // Refresh from DB to get final state
        window.electronAPI?.installerGetDownloads?.().then((rows) => {
          if (rows) setDownloads(rows);
        });

        // Auto-import completed downloads
        if (p.status === "completed") {
          window.electronAPI?.installerImportCompleted?.(p.id);
        }
      } else {
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === p.id ? { ...d, status: p.status, current_chapter: p.current } : d
          )
        );
      }
    });
  }, []);

  const refreshDownloads = useCallback(async () => {
    const rows = await window.electronAPI?.installerGetDownloads?.();
    if (rows) setDownloads(rows);
  }, []);

  const handleSearch = useCallback(async (searchPage: number = 1) => {
    if (!query.trim() || !window.electronAPI?.installerSearch) return;
    setSearching(true);
    setError(null);
    try {
      const data = await window.electronAPI.installerSearch(sourceId, query.trim(), searchPage);
      setResults(data.results);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [query, sourceId]);

  const handleSelectNovel = useCallback(async (result: InstallerSearchResult) => {
    if (!window.electronAPI?.installerNovelInfo) return;
    setLoadingInfo(true);
    setError(null);
    setView("detail");
    setRangeFrom("");
    setRangeTo("");
    try {
      const info = await window.electronAPI.installerNovelInfo(sourceId, result.url);
      setNovelInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load novel info");
    } finally {
      setLoadingInfo(false);
    }
  }, [sourceId]);

  const handleQueueDownload = useCallback(async () => {
    if (!novelInfo || !window.electronAPI?.installerQueueDownload) return;
    try {
      const from = rangeFrom ? Math.max(1, parseInt(rangeFrom, 10)) : 1;
      const to = rangeTo ? Math.min(novelInfo.chapters.length, parseInt(rangeTo, 10)) : novelInfo.chapters.length;

      if (isNaN(from) || isNaN(to) || from > to) {
        setError("Invalid chapter range");
        return;
      }

      const slicedChapters = novelInfo.chapters.slice(from - 1, to);
      const downloadInfo: InstallerNovelInfo = {
        ...novelInfo,
        chapters: slicedChapters,
        totalChapters: slicedChapters.length,
      };

      await window.electronAPI.installerQueueDownload(sourceId, downloadInfo);
      await refreshDownloads();
      setQueueOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue download");
    }
  }, [novelInfo, sourceId, refreshDownloads, rangeFrom, rangeTo]);

  const handleCancel = useCallback(async (id: number) => {
    await window.electronAPI?.installerCancelDownload(id);
    await refreshDownloads();
  }, [refreshDownloads]);

  const handleRetry = useCallback(async (id: number) => {
    await window.electronAPI?.installerRetryDownload(id);
    await refreshDownloads();
  }, [refreshDownloads]);

  const handleRemove = useCallback(async (id: number) => {
    await window.electronAPI?.installerRemoveDownload(id);
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleClearCompleted = useCallback(async () => {
    await window.electronAPI?.installerClearCompleted();
    await refreshDownloads();
  }, [refreshDownloads]);

  const handleBack = useCallback(() => {
    setView("search");
    setNovelInfo(null);
    setError(null);
  }, []);

  // Check if current novel is already queued/downloading
  const isNovelQueued = novelInfo && downloads.some(
    (d) => d.novel_title === novelInfo.title && (d.status === "queued" || d.status === "downloading")
  );

  const hasDownloads = downloads.length > 0;
  const activeDownload = downloads.find((d) => d.status === "downloading");
  const activeProgress = activeDownload ? liveProgress.get(activeDownload.id) : null;
  const sourceName = sources.find((s) => s.id === sourceId)?.name;
  const hasResults = results.length > 0;

  const chapterCount = (() => {
    if (!novelInfo) return 0;
    const from = rangeFrom ? Math.max(1, parseInt(rangeFrom, 10)) : 1;
    const to = rangeTo ? Math.min(novelInfo.totalChapters, parseInt(rangeTo, 10)) : novelInfo.totalChapters;
    return (!isNaN(from) && !isNaN(to) && to >= from) ? to - from + 1 : novelInfo.totalChapters;
  })();

  // ── Search field (shared between hero and docked positions) ──

  const searchField = (size: "hero" | "docked") => (
    <motion.div
      layoutId="installer-search"
      transition={reduceMotion ? { duration: 0 } : LAYOUT_SPRING}
      className={cn(
        "glass flex w-full items-center gap-2 rounded-full transition-shadow duration-200 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_25%,transparent)]",
        size === "hero" ? "h-14 max-w-2xl pr-2 pl-3" : "h-11 max-w-xl pr-1.5 pl-1.5",
      )}
    >
      {sources.length > 0 && (
        <SourceDropdown
          sources={sources}
          value={sourceId}
          onChange={(id) => { setSourceId(id); setResults([]); }}
        />
      )}
      <Search className={cn("shrink-0 text-label-tertiary", size === "hero" ? "size-5" : "size-4", sources.length > 0 && "ml-1")} strokeWidth={1.75} />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search novels..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSearch(1); }}
        aria-label="Search novels"
        className={cn(
          "min-w-0 flex-1 bg-transparent text-label outline-none placeholder:text-label-tertiary",
          size === "hero" ? "text-base" : "text-sm",
        )}
      />
      <Button
        onClick={() => handleSearch(1)}
        disabled={searching || !query.trim()}
        size={size === "hero" ? "default" : "sm"}
        className="rounded-full px-4"
      >
        {searching ? <Loader2 className="size-4 animate-spin" /> : "Search"}
      </Button>
    </motion.div>
  );

  // ── Downloads toggle pill (with live progress when the column is hidden) ──

  const downloadsPill = hasDownloads && !queueOpen ? (
    <motion.button
      type="button"
      onClick={() => setQueueOpen(true)}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      title="Downloads"
      className="glass focus-ring pressable flex h-9 shrink-0 items-center gap-2.5 rounded-full pr-3.5 pl-2.5 text-xs text-label-secondary hover:text-label"
    >
      {activeDownload ? (
        <Loader2 className="size-4 animate-spin text-brand" strokeWidth={2} />
      ) : (
        <PanelRightOpen className="size-4" strokeWidth={1.75} />
      )}
      {activeDownload && activeProgress ? (
        <>
          <ProgressTrack value={(activeProgress.current / activeProgress.total) * 100} className="w-24" />
          <span className="tabular-nums">
            {activeProgress.current}/{activeProgress.total}
            {activeProgress.eta ? ` · ${formatEta(activeProgress.eta)}` : ""}
          </span>
        </>
      ) : (
        <>
          <span className="font-medium">Downloads</span>
          <Badge>{downloads.length}</Badge>
        </>
      )}
    </motion.button>
  ) : null;

  const errorBanner = error ? (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 rounded-md bg-danger/15 px-3 py-2 text-xs text-danger"
      role="alert"
    >
      <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2} />
      <span className="min-w-0 flex-1">{error}</span>
      <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="focus-ring rounded-xs opacity-70 hover:opacity-100">
        <X className="size-3.5" />
      </button>
    </motion.div>
  ) : null;

  // ── Views ───────────────────────────────────────────

  const searchView = (
    <LayoutGroup>
      {!hasResults ? (
        /* 1 — Discover hero */
        <div className="relative flex h-full flex-col items-center overflow-y-auto px-8 pt-[16vh] pb-32">
          <div aria-hidden className="pointer-events-none absolute top-[8vh] left-1/2 size-96 -translate-x-1/2 rounded-full bg-brand/15 blur-3xl" />
          <BlurFade className="relative flex flex-col items-center text-center">
            <span className="mb-5 inline-flex size-14 items-center justify-center rounded-2xl bg-brand text-brand-fg shadow-[0_0_32px_-6px_var(--accent-brand)]">
              <Library className="size-7" strokeWidth={1.5} />
            </span>
            <h1 className="text-large-title font-display text-label">Find your next story</h1>
            <p className="mt-2 max-w-md text-sm text-label-secondary">
              Search {sourceName ?? "online sources"} and download novels straight to your bookshelf.
            </p>
          </BlurFade>
          <div className="relative mt-8 flex w-full justify-center">{searchField("hero")}</div>
          <div className="relative mt-4 flex w-full max-w-2xl flex-col items-center gap-3">
            {errorBanner}
            <p className="flex items-center gap-1.5 text-xs text-label-tertiary">
              {query && !searching ? (
                "No results found"
              ) : (
                <>
                  Press <Kbd>⏎</Kbd> to search
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        /* 2 — Results wall */
        <div className="flex h-full flex-col overflow-y-auto">
          <div className="sticky top-0 z-20 flex items-center gap-3 px-8 pt-6 pb-4">
            {searchField("docked")}
            <span className="ml-auto text-xs text-label-tertiary tabular-nums">
              {results.length} results{totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
            </span>
          </div>
          {errorBanner && <div className="px-8 pb-3">{errorBanner}</div>}
          <div
            className={cn(
              "grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-x-6 gap-y-8 px-8 pt-2 transition-opacity duration-200",
              searching && "opacity-50",
            )}
          >
            {results.map((r, i) => (
              <BlurFade key={`${r.slug}-${i}`} delay={Math.min(i, 12) * 0.025}>
                <button
                  type="button"
                  onClick={() => handleSelectNovel(r)}
                  className="group focus-ring flex w-full flex-col gap-2.5 rounded-lg text-left"
                >
                  <Tilt maxTilt={6} glare className="relative aspect-[2/3] w-full overflow-hidden rounded-lg shadow-cover hairline">
                    <ProxiedImage src={r.thumbnail} alt={r.title} />
                  </Tilt>
                  <div className="flex flex-col gap-0.5 px-0.5">
                    <span className="line-clamp-2 text-headline leading-snug text-label">{r.title}</span>
                    <span className="line-clamp-1 text-xs text-label-tertiary">{r.author || "Unknown"}</span>
                  </div>
                </button>
              </BlurFade>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center px-8 pt-10 pb-32">
              <div className="glass flex h-9 items-center gap-1 rounded-full px-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleSearch(page - 1)}
                  disabled={page <= 1 || searching}
                  aria-label="Previous page"
                  className="rounded-full"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="min-w-16 text-center text-xs text-label-secondary tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleSearch(page + 1)}
                  disabled={page >= totalPages || searching}
                  aria-label="Next page"
                  className="rounded-full"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
          {totalPages <= 1 && <div className="h-32 shrink-0" />}
        </div>
      )}
    </LayoutGroup>
  );

  const detailView = (
    <div className="relative flex h-full flex-col overflow-y-auto">
      {/* Blurred cover backdrop */}
      {novelInfo && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-80 overflow-hidden opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]"
        >
          <ProxiedImage src={novelInfo.thumbnail} alt="" className="scale-125 blur-3xl saturate-150" />
        </div>
      )}

      <div className="relative flex items-center gap-3 px-8 pt-6 pb-4">
        <Button variant="ghost" size="icon-sm" onClick={handleBack} aria-label="Back to results" className="glass rounded-full">
          <ArrowLeft className="size-4" />
        </Button>
        <span className="truncate text-xs text-label-tertiary">
          {sourceName ? `${sourceName} · ` : ""}
          {novelInfo?.title ?? "Loading..."}
        </span>
      </div>

      {errorBanner && <div className="relative max-w-3xl px-8 pb-3">{errorBanner}</div>}

      {loadingInfo ? (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="size-5 animate-spin text-label-tertiary" />
          <span className="text-xs text-label-tertiary">Fetching details…</span>
        </div>
      ) : novelInfo ? (
        <BlurFade className="relative flex max-w-4xl gap-8 px-8 pt-2 pb-32">
          <Tilt maxTilt={6} glare className="relative aspect-[2/3] w-48 shrink-0 self-start overflow-hidden rounded-lg shadow-cover hairline">
            <ProxiedImage src={novelInfo.thumbnail} alt={novelInfo.title} />
          </Tilt>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div>
              <h1 className="text-large-title font-display text-label text-balance">{novelInfo.title}</h1>
              <p className="mt-1.5 text-sm text-label-secondary">by {novelInfo.author || "Unknown"}</p>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <MetaRow icon={Star} label="Rating" value={novelInfo.rating} />
              <MetaRow icon={BookOpen} label="Chapters" value={String(novelInfo.totalChapters)} />
              <MetaRow icon={Tag} label="Status" value={novelInfo.status || "Unknown"} />
            </div>

            {novelInfo.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {novelInfo.genres.map((g) => (
                  <Badge key={g} variant="outline">{g}</Badge>
                ))}
              </div>
            )}

            {novelInfo.description && (
              <p className="line-clamp-5 max-w-prose text-sm leading-relaxed text-label-secondary">
                {novelInfo.description}
              </p>
            )}

            {/* Download card */}
            <div className="glass-thin mt-2 flex max-w-xl items-center gap-4 rounded-xl p-4">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
                <Download className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-headline text-label">Chapters</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={novelInfo.totalChapters}
                    placeholder="1"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    aria-label="From chapter"
                    className={RANGE_FIELD}
                  />
                  <span className="text-xs text-label-tertiary">to</span>
                  <input
                    type="number"
                    min={1}
                    max={novelInfo.totalChapters}
                    placeholder={String(novelInfo.totalChapters)}
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    aria-label="To chapter"
                    className={RANGE_FIELD}
                  />
                  <span className="text-xs text-label-tertiary tabular-nums">of {novelInfo.totalChapters}</span>
                </div>
              </div>
              <Button
                onClick={handleQueueDownload}
                disabled={!!isNovelQueued}
                className="shrink-0 shadow-[0_0_24px_-6px_var(--accent-brand)]"
              >
                {isNovelQueued ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Queued
                  </>
                ) : (
                  <>
                    <Download className="size-4" />
                    Download ({chapterCount} ch)
                  </>
                )}
              </Button>
            </div>
          </div>
        </BlurFade>
      ) : (
        !error && (
          <EmptyState icon={<BookOpen />} title="Nothing to show" description="Go back and pick a novel." />
        )
      )}
    </div>
  );

  // ── Layout: main content + optional downloads column ──

  return (
    <div className="relative flex h-full">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute top-6 right-8 z-30 flex">
          <div className="pointer-events-auto">{downloadsPill}</div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            className="min-h-0 flex-1"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
          >
            {view === "search" ? searchView : detailView}
          </motion.div>
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {queueOpen && hasDownloads && (
          <DownloadQueueSidebar
            downloads={downloads}
            liveProgress={liveProgress}
            onCancel={handleCancel}
            onRetry={handleRetry}
            onRemove={handleRemove}
            onClearCompleted={handleClearCompleted}
            onClose={() => setQueueOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Helper ──────────────────────────────────────────────

const RANGE_FIELD =
  "h-8 w-20 rounded-md bg-fill-tertiary px-2.5 text-sm text-label tabular-nums outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-label-quaternary hover:bg-fill-secondary focus:bg-fill-secondary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_35%,transparent)]";

function MetaRow({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon className="size-3.5 shrink-0 text-label-tertiary" strokeWidth={1.75} />
      <span className="text-label-tertiary">{label}</span>
      <span className="font-medium text-label">{value}</span>
    </div>
  );
}
