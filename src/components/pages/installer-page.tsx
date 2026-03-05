"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Search,
  ArrowLeft,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Star,
  User,
  Tag,
  Loader2,
  Globe,
  Check,
  RotateCcw,
  Trash2,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

type InstallerView = "search" | "detail";
type SourceOption = { id: string; name: string; url: string };

// ── Proxied image component ─────────────────────────────

function ProxiedImage({ src, alt }: { src: string; alt: string }) {
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
      <div className="absolute inset-0 flex items-center justify-center bg-white/[0.02]">
        <BookOpen className="h-8 w-8 text-white/10" />
      </div>
    );
  }

  return <img src={dataUrl} alt={alt} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />;
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

// ── Download Queue Sidebar ──────────────────────────────

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
    <div className="flex h-full w-64 shrink-0 flex-col border-l border-white/[0.06] bg-[var(--bg-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Download className="h-3.5 w-3.5 text-white/25" />
          <span className="text-xs font-medium text-white/40">Downloads</span>
          <span className="rounded-lg bg-white/[0.06] px-1.5 py-0.5 text-xs text-white/25 tabular-nums">
            {downloads.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-white/20 hover:bg-white/[0.06] hover:text-white/40"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Download list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {downloads.map((dl) => {
            const progress = liveProgress.get(dl.id);
            const isActive = dl.status === "downloading";
            const isQueued = dl.status === "queued";
            const isCompleted = dl.status === "completed";
            const isFailed = dl.status === "failed";
            const isCancelled = dl.status === "cancelled";

            return (
              <div
                key={dl.id}
                className="rounded-lg px-2.5 py-2 hover:bg-white/[0.03] group"
              >
                <div className="flex items-start gap-2">
                  {/* Status icon */}
                  <div className="shrink-0 mt-0.5">
                    {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/30" />}
                    {isQueued && <div className="h-3.5 w-3.5 rounded-full border border-white/10" />}
                    {isCompleted && <Check className="h-3.5 w-3.5 text-green-400/60" />}
                    {isFailed && <X className="h-3.5 w-3.5 text-red-400/60" />}
                    {isCancelled && <X className="h-3.5 w-3.5 text-white/15" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-white/50 line-clamp-2 leading-snug">{dl.novel_title}</span>

                    {isQueued && (
                      <span className="mt-1 inline-block rounded-lg bg-white/[0.05] px-1.5 py-0.5 text-xs text-white/20">
                        Queued
                      </span>
                    )}

                    {isCompleted && (
                      <span className="mt-0.5 block text-xs text-white/15">Added to bookshelf</span>
                    )}

                    {isFailed && (
                      <span className="mt-0.5 block text-xs text-red-400/50 line-clamp-1">
                        {dl.error || "Failed"}
                      </span>
                    )}

                    {/* Progress bar */}
                    {isActive && progress && (
                      <div className="mt-1.5">
                        <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full bg-white/20 transition-all duration-300"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-xs text-white/15 tabular-nums">
                            {progress.current}/{progress.total}
                          </span>
                          {progress.eta ? (
                            <span className="text-xs text-white/15">{formatEta(progress.eta)}</span>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(isActive || isQueued) && (
                      <button
                        onClick={() => onCancel(dl.id)}
                        className="rounded-lg p-1 text-white/20 hover:bg-white/[0.06] hover:text-white/40"
                        title="Cancel"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    {isFailed && (
                      <button
                        onClick={() => onRetry(dl.id)}
                        className="rounded-lg p-1 text-white/20 hover:bg-white/[0.06] hover:text-white/40"
                        title="Retry"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                    {(isCompleted || isFailed || isCancelled) && (
                      <button
                        onClick={() => onRemove(dl.id)}
                        className="rounded-lg p-1 text-white/20 hover:bg-white/[0.06] hover:text-white/40"
                        title="Remove"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Clear completed footer */}
      {completedCount > 0 && (
        <div className="border-t border-white/[0.04] px-3 py-2">
          <button
            onClick={onClearCompleted}
            className="w-full text-center text-xs text-white/15 hover:text-white/30 transition-colors"
          >
            Clear completed
          </button>
        </div>
      )}
    </div>
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
      await window.electronAPI.installerQueueDownload(sourceId, novelInfo);
      await refreshDownloads();
      setQueueOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue download");
    }
  }, [novelInfo, sourceId, refreshDownloads]);

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

  // ── Toolbar ────────────────────────────────────────

  const toolbar = (
    <div className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2">
      {view !== "search" && (
        <button
          onClick={handleBack}
          className="rounded-lg p-1.5 text-white/30 hover:bg-white/[0.06] hover:text-white/50"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}
      {view === "search" ? (
        <>
          {sources.length > 0 && (
            <div className="relative shrink-0">
              <Globe className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/15 pointer-events-none" />
              <select
                value={sourceId}
                onChange={(e) => { setSourceId(e.target.value); setResults([]); }}
                className="appearance-none rounded-lg bg-white/[0.05] py-1.5 pl-7 pr-6 text-xs text-white/40 outline-none hover:bg-white/[0.07] transition-colors cursor-pointer"
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search novels..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(1); }}
              className="w-full rounded-lg bg-white/[0.05] py-1.5 pl-9 pr-3 text-sm text-white/70 placeholder:text-white/15 outline-none focus:bg-white/[0.07] transition-colors"
            />
          </div>
          <button
            onClick={() => handleSearch(1)}
            disabled={searching || !query.trim()}
            className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm text-white/40 hover:bg-white/[0.09] hover:text-white/60 transition-colors disabled:opacity-30"
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
          </button>
        </>
      ) : (
        <span className="flex-1 text-sm text-white/40 truncate">
          {novelInfo?.title ?? "Loading..."}
        </span>
      )}

      {/* Download queue toggle */}
      {hasDownloads && (
        <button
          onClick={() => setQueueOpen(!queueOpen)}
          className="relative rounded-lg p-1.5 text-white/25 hover:bg-white/[0.06] hover:text-white/40 transition-colors"
          title="Downloads"
        >
          {queueOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
          {/* Active indicator dot */}
          {activeDownload && (
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-white/40" />
          )}
        </button>
      )}
    </div>
  );

  // ── Compact progress indicator in toolbar area when sidebar closed ──

  const compactProgress = !queueOpen && activeDownload && activeProgress ? (
    <button
      onClick={() => setQueueOpen(true)}
      className="flex items-center gap-2.5 border-b border-white/[0.04] px-4 py-1.5 hover:bg-white/[0.02] transition-colors"
    >
      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-white/25" />
      <div className="flex-1 min-w-0">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-white/20 transition-all duration-300"
            style={{ width: `${(activeProgress.current / activeProgress.total) * 100}%` }}
          />
        </div>
      </div>
      <span className="shrink-0 text-xs text-white/20 tabular-nums">
        {activeProgress.current}/{activeProgress.total}
        {activeProgress.eta ? ` · ${formatEta(activeProgress.eta)}` : ""}
      </span>
    </button>
  ) : null;

  // ── Layout: main content + optional sidebar ────────

  const mainContent = (
    <div className="flex min-w-0 flex-1 flex-col">
      {toolbar}
      {compactProgress}

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {view === "search" ? (
        <>
          <ScrollArea className="flex-1 p-4">
            {results.length === 0 && !searching && (
              <div className="flex h-full items-center justify-center text-white/15 text-sm">
                {query ? "No results found" : "Search for a novel to get started"}
              </div>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
              {results.map((r, i) => (
                <button
                  key={`${r.slug}-${i}`}
                  onClick={() => handleSelectNovel(r)}
                  className="group flex flex-col overflow-hidden rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-white/[0.02]">
                    <ProxiedImage src={r.thumbnail} alt={r.title} />
                  </div>
                  <div className="flex flex-col gap-0.5 p-2 pb-2.5">
                    <span className="text-xs text-white/60 line-clamp-2 leading-snug group-hover:text-white/80">
                      {r.title}
                    </span>
                    <span className="text-xs text-white/20 line-clamp-1">
                      {r.author || "Unknown"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>

          {totalPages > 1 && results.length > 0 && (
            <div className="flex items-center justify-center gap-3 border-t border-white/[0.04] px-4 py-2">
              <button
                onClick={() => handleSearch(page - 1)}
                disabled={page <= 1 || searching}
                className="rounded-lg p-1 text-white/30 hover:bg-white/[0.06] hover:text-white/50 disabled:opacity-20"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-white/20 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => handleSearch(page + 1)}
                disabled={page >= totalPages || searching}
                className="rounded-lg p-1 text-white/30 hover:bg-white/[0.06] hover:text-white/50 disabled:opacity-20"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {loadingInfo ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-white/20" />
            </div>
          ) : novelInfo ? (
            <ScrollArea className="flex-1 p-4">
              <div className="flex gap-5">
                <div className="relative shrink-0 w-44 aspect-[3/4] overflow-hidden rounded-lg bg-white/[0.03]">
                  <ProxiedImage src={novelInfo.thumbnail} alt={novelInfo.title} />
                </div>

                <div className="flex flex-1 flex-col gap-3">
                  <h2 className="text-sm font-medium text-white/70">
                    {novelInfo.title}
                  </h2>

                  <div className="flex flex-col gap-1.5">
                    <MetaRow icon={User} label="Author" value={novelInfo.author || "Unknown"} />
                    <MetaRow icon={Star} label="Rating" value={novelInfo.rating} />
                    <MetaRow icon={BookOpen} label="Chapters" value={String(novelInfo.totalChapters)} />
                    <MetaRow icon={Tag} label="Status" value={novelInfo.status || "Unknown"} />
                    {novelInfo.genres.length > 0 && (
                      <div className="flex items-start gap-2 mt-1">
                        <div className="flex flex-wrap gap-1">
                          {novelInfo.genres.map((g) => (
                            <span key={g} className="rounded-lg bg-white/[0.05] px-2 py-0.5 text-xs text-white/30">
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {novelInfo.description && (
                    <p className="text-xs text-white/25 leading-relaxed line-clamp-5">
                      {novelInfo.description}
                    </p>
                  )}

                  <button
                    onClick={handleQueueDownload}
                    disabled={!!isNovelQueued}
                    className="mt-1 flex w-fit items-center gap-2 rounded-lg bg-white/[0.07] px-4 py-2 text-sm text-white/50 hover:bg-white/[0.10] hover:text-white/70 transition-colors disabled:opacity-30"
                  >
                    {isNovelQueued ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Queued
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        Download ({novelInfo.totalChapters} ch)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </ScrollArea>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <div className="flex h-full">
      {mainContent}
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
    </div>
  );
}

// ── Helper ──────────────────────────────────────────────

function MetaRow({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-white/20" />
      <span className="text-xs text-white/20 w-14">{label}</span>
      <span className="text-xs text-white/45">{value}</span>
    </div>
  );
}
