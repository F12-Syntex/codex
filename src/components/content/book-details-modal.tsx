"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, BookOpen, Globe, Check, AlertCircle, Pencil, X, Library } from "lucide-react";
import { GlassModal } from "@/components/ui/glass-modal";
import { Tilt } from "@/components/ui/tilt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { cn } from "@/lib/utils";
import type { MockItem } from "@/lib/mock-data";
import type { BookLookupResult, LibraryTag } from "@shared/library/types";
import { normalizeGenre } from "@shared/library/types";
import { hasRpc } from "@/lib/ai/rpc";
import { libraryAI, lookupBook } from "@/lib/library/bridge";
import { useLibraryItem, useLibraryTagRun } from "@/lib/library/useLibraryAI";

interface BookDetailsModalProps {
  item: MockItem;
  /**
   * Keep the modal mounted and toggle this so the exit animation plays
   * (remount with a `key` per item to reset its state). Default true.
   */
  open?: boolean;
  onClose: () => void;
  onSave: (id: number, fields: { title?: string; author?: string; cover?: string }, meta?: { description?: string; genres?: string[] }) => void;
}

type FetchedDetails = BookLookupResult;

const KIND_LABEL: Record<LibraryTag["kind"], string> = { genre: "Genre", trope: "Trope", warning: "Content warning" };

export function BookDetailsModal({ item, open = true, onClose, onSave }: BookDetailsModalProps) {
  const [fetched, setFetched] = useState<FetchedDetails | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [savedMeta, setSavedMeta] = useState<{ description?: string; genres?: string[] } | null>(null);
  const [proxiedCover, setProxiedCover] = useState<string | null>(null);
  // Title and author are editable in place; a fetch pre-fills them.
  const [title, setTitle] = useState(item.title);
  const [author, setAuthor] = useState(item.author ?? "");

  useEffect(() => {
    if (fetched?.title) setTitle(fetched.title);
    if (fetched?.author) setAuthor(fetched.author);
  }, [fetched]);

  // Load saved metadata
  useEffect(() => {
    window.electronAPI?.getSetting(`bookMeta:${item.filePath}`).then((raw) => {
      if (raw) {
        try { setSavedMeta(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  }, [item.filePath]);

  // Proxy cover URL when fetched
  useEffect(() => {
    if (!fetched?.coverUrl) { setProxiedCover(null); return; }
    let cancelled = false;
    setProxiedCover(null);
    window.electronAPI?.installerProxyImage(fetched.coverUrl).then((dataUrl) => {
      if (!cancelled && dataUrl) setProxiedCover(dataUrl);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [fetched?.coverUrl]);

  // Smart tags (F5): suggestions from `library.tag`, decided here.
  const lib = useLibraryItem(item.filePath);
  const tagRun = useLibraryTagRun();
  const [suggesting, setSuggesting] = useState(false);
  const aiAvailable = hasRpc();

  /** "Fetch details": the `book.lookup` task (web model) through the scheduler. */
  const handleFetch = useCallback(async () => {
    if (!aiAvailable) {
      setFetchError("Fetching details needs the Codex app.");
      return;
    }
    setFetching(true);
    setFetchError(null);
    try {
      const r = await lookupBook({ title: item.title, author: item.author || undefined }, item.filePath);
      if (r.state === "done" && r.output) {
        if (!r.output.description && !r.output.genres?.length && !r.output.coverUrl) throw new Error("Nothing found for this title.");
        setFetched(r.output);
      } else if (r.state === "error") {
        throw new Error(r.error?.message ?? "Failed to fetch details");
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch details");
    } finally {
      setFetching(false);
    }
  }, [aiAvailable, item.title, item.author, item.filePath]);

  const suggestTags = useCallback(async () => {
    setSuggesting(true);
    try {
      const run = await tagRun.start({ filePaths: [item.filePath], force: !!lib.info?.taggedAt, interactive: true });
      if (run?.error) setFetchError(run.error);
    } finally {
      setSuggesting(false);
    }
  }, [tagRun, item.filePath, lib.info?.taggedAt]);

  const decide = useCallback((tags: LibraryTag[], decision: "accept" | "dismiss") => {
    void libraryAI.decide(item.filePath, tags.map((t) => ({ tag: t.tag, kind: t.kind })), decision).catch(() => {});
  }, [item.filePath]);

  const decideSeries = useCallback((accept: boolean) => {
    const sr = lib.info?.series;
    if (!sr) return;
    void libraryAI
      .applySeries([accept ? { filePath: item.filePath, name: sr.name, number: sr.number } : { filePath: item.filePath, name: sr.name, status: "dismissed" }])
      .catch(() => {});
  }, [item.filePath, lib.info?.series]);

  const trimmedTitle = title.trim();
  const trimmedAuthor = author.trim();
  const titleChanged = !!trimmedTitle && trimmedTitle !== item.title;
  const authorChanged = trimmedAuthor !== (item.author ?? "");
  const dirty = !!fetched || titleChanged || authorChanged;

  const handleApply = useCallback(() => {
    if (!dirty) return;
    const fields: { title?: string; author?: string; cover?: string } = {};
    if (titleChanged) fields.title = trimmedTitle;
    if (authorChanged) fields.author = trimmedAuthor;
    // Use proxied data URL if available, otherwise the raw URL
    if (proxiedCover) fields.cover = proxiedCover;
    else if (fetched?.coverUrl) fields.cover = fetched.coverUrl;

    const meta: { description?: string; genres?: string[] } = {};
    if (fetched?.description) meta.description = fetched.description;
    if (fetched?.genres?.length) meta.genres = fetched.genres;

    onSave(item.id, fields, fetched ? meta : undefined);
    // Fetched genres that map onto the library taxonomy become accepted tags (filters, grouping).
    const genresToTag = [...new Set((fetched?.genres ?? []).map(normalizeGenre).filter((g): g is NonNullable<typeof g> => !!g))];
    if (genresToTag.length && aiAvailable) void libraryAI.addTags(item.filePath, "genre", genresToTag, "web").catch(() => {});
    onClose();
  }, [dirty, titleChanged, authorChanged, trimmedTitle, trimmedAuthor, fetched, proxiedCover, item.id, item.filePath, aiAvailable, onSave, onClose]);

  const description = fetched?.description ?? savedMeta?.description;
  const acceptedGenres = (lib.info?.tags ?? []).filter((t) => t.kind === "genre" && t.status === "accepted").map((t) => t.tag);
  const shownGenres = fetched?.genres?.length ? fetched.genres : [...(savedMeta?.genres ?? []), ...acceptedGenres];
  const genres = [...new Map(shownGenres.map((g) => [g.toLowerCase(), g] as const)).values()];
  const acceptedOther = (lib.info?.tags ?? []).filter((t) => t.kind !== "genre" && t.status === "accepted");
  const suggestions = (lib.info?.tags ?? []).filter((t) => t.status === "suggested");
  const series = lib.info?.series ?? null;
  const oneLine = lib.info?.oneLine;
  const displayCover = proxiedCover || fetched?.coverUrl || item.cover;
  const status = fetched?.status;
  const statusVariant = status === "Completed" ? "success" : status === "Ongoing" ? "accent" : "default";

  const editable = (value: string, onChange: (v: string) => void, label: string, placeholder: string) => (
    <label className="group/edit relative flex min-w-0 flex-1 items-center">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleApply();
          }
        }}
        aria-label={label}
        placeholder={placeholder}
        spellCheck={false}
        className="h-7 w-full min-w-0 rounded-md bg-transparent pr-7 pl-2 text-right text-sm text-label outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-label-tertiary hover:bg-fill-tertiary focus-visible:bg-fill-tertiary focus-visible:shadow-[inset_0_0_0_1px_var(--accent-brand)]"
      />
      <Pencil
        aria-hidden
        className="pointer-events-none absolute right-2 size-3.5 text-label-tertiary opacity-40 transition-opacity duration-150 group-hover/edit:opacity-100 group-focus-within/edit:opacity-100"
        strokeWidth={2}
      />
    </label>
  );

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Title", value: editable(title, setTitle, "Title", "Title") },
    { label: "Author", value: editable(author, setAuthor, "Author", "Unknown") },
    { label: "Format", value: <span className="text-label-secondary">{item.format.toUpperCase()}</span> },
  ];
  if (series) {
    rows.push({
      label: "Series",
      value: (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {series.status === "suggested" && <Sparkles className="size-3.5 shrink-0 text-brand" strokeWidth={1.75} aria-label="Suggested" />}
          <span className={cn("truncate", series.status === "suggested" && "text-label-secondary")}>{series.name}</span>
          {series.number != null && <span className="shrink-0 text-label-secondary tabular-nums">· Vol. {series.number}</span>}
          {series.status === "suggested" && (
            <span className="ml-1 inline-flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={() => decideSeries(true)} title="Add to this series" aria-label={`Add to ${series.name}`} className="focus-ring pressable inline-flex size-6 items-center justify-center rounded-full text-label-secondary hover:bg-fill-tertiary hover:text-success">
                <Check className="size-3.5" strokeWidth={2.25} />
              </button>
              <button type="button" onClick={() => decideSeries(false)} title="Not part of this series" aria-label="Dismiss series" className="focus-ring pressable inline-flex size-6 items-center justify-center rounded-full text-label-secondary hover:bg-fill-tertiary hover:text-label">
                <X className="size-3.5" strokeWidth={2.25} />
              </button>
            </span>
          )}
        </span>
      ),
    });
  }
  if (status) rows.push({ label: "Status", value: <Badge variant={statusVariant}>{status}</Badge> });
  if (fetched?.source) {
    rows.push({
      label: "Source",
      value: (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Globe className="size-3.5 shrink-0 text-label-tertiary" strokeWidth={1.75} />
          <span className="truncate">{fetched.source}</span>
        </span>
      ),
    });
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      width={640}
      title={trimmedTitle || item.title}
      subtitle={
        fetched?.alternativeNames && fetched.alternativeNames.length > 0
          ? <span className="line-clamp-1">{fetched.alternativeNames.join(" · ")}</span>
          : undefined
      }
      className="grain isolate"
    >
      {/* Ambient cover bloom — the book's own colour washes the top of the sheet */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 overflow-hidden" style={{ maskImage: "linear-gradient(to bottom, black, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent)" }}>
        {displayCover ? (
          <img src={displayCover} alt="" className="h-full w-full scale-125 object-cover opacity-30 blur-3xl" />
        ) : (
          <div className="h-full w-full opacity-30 blur-3xl" style={{ background: item.gradient }} />
        )}
      </div>

      <GlassModal.Body className="relative px-5 pt-2 pb-5">
        <div className="flex gap-6">
          {/* Cover */}
          <div className="w-44 shrink-0">
            <Tilt maxTilt={6} glare className="rounded-lg">
              <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-fill-tertiary shadow-cover">
                {displayCover ? (
                  <img src={displayCover} alt={item.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center" style={{ background: item.gradient }}>
                    <BookOpen className="size-10 text-label-quaternary" strokeWidth={1.25} />
                  </div>
                )}
                <div aria-hidden className="pointer-events-none absolute inset-0 rounded-lg hairline" />
                {/* Loading overlay while proxying cover */}
                {fetched?.coverUrl && !proxiedCover && (
                  <div className="absolute inset-0 flex items-center justify-center bg-canvas/40 backdrop-blur-sm">
                    <Loader2 className="size-5 animate-spin text-label-secondary" strokeWidth={1.75} />
                  </div>
                )}
              </div>
            </Tilt>
            {fetched && (
              <p className="mt-3 flex animate-fade-up items-center justify-center gap-1.5 text-2xs text-label-tertiary">
                <Check className="size-3.5 text-success" strokeWidth={2.25} />
                Preview — not saved yet
              </p>
            )}
          </div>

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Properties — inset grouped rows; Title and Author edit in place */}
            <dl className="overflow-hidden rounded-lg bg-fill-quaternary hairline">
              {rows.map((row, i) => (
                <div
                  key={row.label}
                  className={cn("flex h-10 items-center gap-3 pr-1.5 pl-3 text-sm", i > 0 && "border-t border-separator")}
                >
                  <dt className="w-16 shrink-0 text-xs text-label-tertiary">{row.label}</dt>
                  <dd className="flex min-w-0 flex-1 justify-end truncate pr-1.5 text-label has-[input]:pr-0">{row.value}</dd>
                </div>
              ))}
            </dl>

            {(genres.length > 0 || acceptedOther.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <Badge key={g} variant="outline">{g}</Badge>
                ))}
                {acceptedOther.map((t) => (
                  <Badge key={`${t.kind}:${t.tag}`} variant={t.kind === "warning" ? "default" : "outline"} title={KIND_LABEL[t.kind]}>{t.tag}</Badge>
                ))}
              </div>
            )}

            {/* Suggested tags — accept (click) or dismiss (×); decisions stick across runs */}
            {suggestions.length > 0 && (
              <div className="mt-3 animate-fade-up rounded-lg bg-fill-quaternary p-2.5 hairline">
                <div className="mb-2 flex h-5 items-center gap-1.5 px-0.5 text-xs text-label-secondary">
                  <Sparkles className="size-3.5 text-brand" strokeWidth={1.75} />
                  <span className="flex-1">Suggested tags</span>
                  <button type="button" onClick={() => decide(suggestions, "accept")} className="focus-ring rounded-xs px-1 font-medium text-brand hover:underline">
                    Accept all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((t) => (
                    <span key={`${t.kind}:${t.tag}`} className="group/chip inline-flex h-6 items-center rounded-full bg-fill-tertiary text-xs text-label-secondary transition-colors duration-150 hover:bg-fill-secondary hover:text-label">
                      <button
                        type="button"
                        onClick={() => decide([t], "accept")}
                        title={`Add ${KIND_LABEL[t.kind].toLowerCase()} “${t.tag}”`}
                        className="focus-ring inline-flex h-full items-center gap-1 rounded-full pr-1 pl-2.5"
                      >
                        <Check className="size-3 opacity-50 group-hover/chip:text-success group-hover/chip:opacity-100" strokeWidth={2.5} />
                        {t.tag}
                      </button>
                      <button
                        type="button"
                        onClick={() => decide([t], "dismiss")}
                        aria-label={`Dismiss ${t.tag}`}
                        title="Dismiss"
                        className="focus-ring mr-0.5 inline-flex size-5 items-center justify-center rounded-full text-label-tertiary hover:bg-fill-tertiary hover:text-label"
                      >
                        <X className="size-3" strokeWidth={2.25} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 min-h-0">
              {fetching ? (
                <ShimmerText className="text-sm">Searching the web for this book…</ShimmerText>
              ) : description ? (
                <p className="max-h-40 overflow-y-auto pr-1 text-sm leading-relaxed text-label-secondary">
                  {description}
                </p>
              ) : oneLine ? (
                <p className="text-sm leading-relaxed text-label-secondary">{oneLine}</p>
              ) : (
                <p className="text-sm text-label-tertiary">
                  No description yet. Fetch details to look this book up online.
                </p>
              )}
            </div>

            {/* Error */}
            {fetchError && (
              <div className="mt-4 flex animate-fade-up items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
                <AlertCircle className="mt-px size-3.5 shrink-0" strokeWidth={2} />
                {fetchError}
              </div>
            )}
          </div>
        </div>
      </GlassModal.Body>

      <GlassModal.Footer className="relative justify-between px-5 py-3.5">
        <Button variant="secondary" size="sm" onClick={handleFetch} disabled={fetching}>
          {fetching ? (
            <Loader2 className="animate-spin" strokeWidth={1.75} />
          ) : (
            <Sparkles strokeWidth={1.75} />
          )}
          {fetching ? "Searching…" : fetched ? "Search Again" : "Fetch Details"}
        </Button>
        {aiAvailable && suggestions.length === 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={suggestTags}
            disabled={suggesting || tagRun.running}
            title="Suggest genres, tropes and series with AI"
            className="mr-auto ml-2"
          >
            {suggesting || tagRun.running ? <Loader2 className="animate-spin" strokeWidth={1.75} /> : <Library strokeWidth={1.75} />}
            {tagRun.running ? "Tagging…" : lib.info?.taggedAt ? "Re-suggest Tags" : "Suggest Tags"}
          </Button>
        )}

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={!dirty}
            title={dirty ? undefined : "Edit the title or author, or fetch details"}
          >
            Save
          </Button>
        </div>
      </GlassModal.Footer>
    </GlassModal>
  );
}
