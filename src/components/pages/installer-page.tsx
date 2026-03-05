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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type InstallerState = "search" | "detail" | "downloading";

export function InstallerPage() {
  const [state, setState] = useState<InstallerState>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstallerSearchResult[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searching, setSearching] = useState(false);
  const [novelInfo, setNovelInfo] = useState<InstallerNovelInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [progress, setProgress] = useState<InstallerDownloadProgress | null>(null);
  const [downloadDone, setDownloadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const progressListenerSet = useRef(false);

  // Set up progress listener once
  useEffect(() => {
    if (progressListenerSet.current) return;
    progressListenerSet.current = true;
    window.electronAPI?.onInstallerProgress((p) => {
      setProgress(p);
    });
  }, []);

  const handleSearch = useCallback(async (searchPage: number = 1) => {
    if (!query.trim() || !window.electronAPI?.installerSearch) return;
    setSearching(true);
    setError(null);
    try {
      const data = await window.electronAPI.installerSearch(query.trim(), searchPage);
      setResults(data.results);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleSelectNovel = useCallback(async (result: InstallerSearchResult) => {
    if (!window.electronAPI?.installerNovelInfo) return;
    setLoadingInfo(true);
    setError(null);
    setState("detail");
    try {
      const info = await window.electronAPI.installerNovelInfo(result.url);
      setNovelInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load novel info");
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (!novelInfo || !window.electronAPI?.installerDownload) return;
    setState("downloading");
    setProgress(null);
    setDownloadDone(false);
    setError(null);
    try {
      await window.electronAPI.installerDownload(novelInfo);
      setDownloadDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      if (!msg.includes("cancelled")) setError(msg);
      else setState("detail");
    }
  }, [novelInfo]);

  const handleCancel = useCallback(() => {
    window.electronAPI?.installerCancelDownload();
    setState("detail");
  }, []);

  const handleBack = useCallback(() => {
    setState("search");
    setNovelInfo(null);
    setError(null);
  }, []);

  // ── Search State ──────────────────────────────────────

  if (state === "search") {
    return (
      <div className="flex h-full flex-col">
        {/* Search bar */}
        <div className="flex items-center gap-3 border-b border-white/[0.04] px-6 py-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search novels..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(1); }}
              className="w-full rounded-lg bg-white/[0.05] py-2.5 pl-10 pr-4 text-sm text-white/80 placeholder:text-white/20 outline-none focus:bg-white/[0.07] transition-colors"
            />
          </div>
          <button
            onClick={() => handleSearch(1)}
            disabled={searching || !query.trim()}
            className="rounded-lg bg-white/[0.07] px-4 py-2.5 text-sm text-white/60 hover:bg-white/[0.10] hover:text-white/80 transition-colors disabled:opacity-30"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Results grid */}
        <ScrollArea className="flex-1 px-6 py-4">
          {results.length === 0 && !searching && (
            <div className="flex h-full items-center justify-center text-white/20 text-sm">
              {query ? "No results found" : "Search for a novel to get started"}
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {results.map((r, i) => (
              <button
                key={`${r.slug}-${i}`}
                onClick={() => handleSelectNovel(r)}
                className="group flex flex-col overflow-hidden rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-white/[0.02]">
                  {r.thumbnail ? (
                    <img
                      src={r.thumbnail}
                      alt={r.title}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <BookOpen className="h-8 w-8 text-white/10" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <span className="text-sm text-white/70 line-clamp-2 leading-tight group-hover:text-white/90">
                    {r.title}
                  </span>
                  <span className="text-xs text-white/30 line-clamp-1">
                    {r.author || "Unknown"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Pagination */}
        {totalPages > 1 && results.length > 0 && (
          <div className="flex items-center justify-center gap-3 border-t border-white/[0.04] px-6 py-3">
            <button
              onClick={() => handleSearch(page - 1)}
              disabled={page <= 1 || searching}
              className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/60 disabled:opacity-20"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-white/30 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => handleSearch(page + 1)}
              disabled={page >= totalPages || searching}
              className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/60 disabled:opacity-20"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Detail State ──────────────────────────────────────

  if (state === "detail") {
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/[0.04] px-6 py-3">
          <button
            onClick={handleBack}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/60"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-white/50">Back to search</span>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {loadingInfo ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          </div>
        ) : novelInfo ? (
          <ScrollArea className="flex-1 px-6 py-6">
            <div className="flex gap-6">
              {/* Cover */}
              <div className="shrink-0">
                <div className="w-48 overflow-hidden rounded-lg bg-white/[0.03]">
                  {novelInfo.thumbnail ? (
                    <img
                      src={novelInfo.thumbnail}
                      alt={novelInfo.title}
                      className="w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center">
                      <BookOpen className="h-10 w-10 text-white/10" />
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="flex flex-1 flex-col gap-4">
                <h2 className="text-sm font-medium text-white/80">
                  {novelInfo.title}
                </h2>

                <div className="flex flex-col gap-2">
                  <MetaRow icon={User} label="Author" value={novelInfo.author || "Unknown"} />
                  <MetaRow icon={Star} label="Rating" value={novelInfo.rating} />
                  <MetaRow icon={BookOpen} label="Chapters" value={String(novelInfo.totalChapters)} />
                  <MetaRow icon={Tag} label="Status" value={novelInfo.status || "Unknown"} />
                  {novelInfo.genres.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/25" />
                      <div className="flex flex-wrap gap-1.5">
                        {novelInfo.genres.map((g) => (
                          <span key={g} className="rounded-lg bg-white/[0.05] px-2 py-0.5 text-xs text-white/40">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {novelInfo.description && (
                  <p className="text-xs text-white/30 leading-relaxed line-clamp-6">
                    {novelInfo.description}
                  </p>
                )}

                <button
                  onClick={handleDownload}
                  className="mt-2 flex w-fit items-center gap-2 rounded-lg bg-white/[0.07] px-5 py-2.5 text-sm text-white/60 hover:bg-white/[0.12] hover:text-white/80 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Download ({novelInfo.totalChapters} chapters)
                </button>
              </div>
            </div>
          </ScrollArea>
        ) : null}
      </div>
    );
  }

  // ── Downloading State ─────────────────────────────────

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      {downloadDone ? (
        <>
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10">
              <BookOpen className="h-6 w-6 text-green-400/80" />
            </div>
            <h3 className="text-sm font-medium text-white/70">Download Complete</h3>
            <p className="text-xs text-white/30">
              {novelInfo?.title} has been added to your library.
            </p>
          </div>
          <button
            onClick={handleBack}
            className="rounded-lg bg-white/[0.07] px-5 py-2.5 text-sm text-white/60 hover:bg-white/[0.10] hover:text-white/80 transition-colors"
          >
            Back to Search
          </button>
        </>
      ) : (
        <>
          <div className="flex w-full max-w-md flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/50">
                Downloading {novelInfo?.title}
              </span>
              <button
                onClick={handleCancel}
                className="rounded-lg p-1.5 text-white/30 hover:bg-white/[0.06] hover:text-white/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-white/20 transition-all duration-300"
                style={{
                  width: progress ? `${(progress.current / progress.total) * 100}%` : "0%",
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-white/30 line-clamp-1 max-w-[70%]">
                {progress?.chapterTitle || "Starting..."}
              </span>
              <span className="text-xs text-white/20 tabular-nums">
                {progress ? `${progress.current} / ${progress.total}` : "0 / 0"}
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Helper Components ──────────────────────────────────

function MetaRow({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-white/25" />
      <span className="text-xs text-white/25 w-16">{label}</span>
      <span className="text-xs text-white/50">{value}</span>
    </div>
  );
}
