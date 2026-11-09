"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, BookOpen, Globe, Check, AlertCircle, Pencil } from "lucide-react";
import { GlassModal } from "@/components/ui/glass-modal";
import { Tilt } from "@/components/ui/tilt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { cn } from "@/lib/utils";
import { createOpenRouterClient } from "@/lib/openrouter";
import type { MockItem } from "@/lib/mock-data";

interface BookDetailsModalProps {
  item: MockItem;
  onClose: () => void;
  onSave: (id: number, fields: { title?: string; author?: string; cover?: string }, meta?: { description?: string; genres?: string[] }) => void;
}

interface FetchedDetails {
  title?: string;
  author?: string;
  description?: string;
  genres?: string[];
  coverUrl?: string;
  source?: string;
  status?: string;
  alternativeNames?: string[];
}

export function BookDetailsModal({ item, onClose, onSave }: BookDetailsModalProps) {
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

  const handleFetch = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;

    const apiKey = await api.getSetting("openrouterApiKey");
    if (!apiKey) {
      setFetchError("No API key configured. Set your OpenRouter API key in settings.");
      return;
    }

    setFetching(true);
    setFetchError(null);

    try {
      const client = createOpenRouterClient(apiKey);

      const response = await client.chat(
        [
          {
            role: "system",
            content: `You are a book/novel lookup tool. Search the web for the given book title and return detailed information about it.

Search strategy:
1. Search for the exact title on NovelUpdates, MyAnimeList, Goodreads, Amazon, or Wikipedia
2. If the title seems like a web novel or light novel, prioritize NovelUpdates and MyAnimeList
3. For the cover image, find the ACTUAL cover image URL from the book's page (the src attribute of the cover <img> tag). It must be a real, working URL ending in .jpg, .png, .webp, or from a CDN like novelupdates.com, myanimelist.net, images-na.ssl-images-amazon.com, etc.
4. Do NOT make up or guess image URLs. If you cannot find a real cover image URL, leave coverUrl as an empty string.

Return ONLY valid JSON:
{"title": "Official English Title", "author": "Author Name", "description": "Full synopsis (3-5 sentences)", "genres": ["genre1", "genre2", "genre3"], "coverUrl": "https://real-direct-image-url.jpg", "source": "website where found", "status": "Ongoing/Completed/Hiatus/Unknown", "alternativeNames": ["Alt Title 1", "Alt Title 2"]}`,
          },
          {
            role: "user",
            content: `Search online for this book and return its details:\n\nTitle: "${item.title}"\nAuthor: "${item.author || "Unknown"}"`,
          },
        ],
        "perplexity/sonar",
        { temperature: 0.1, max_tokens: 1000 },
      );

      const raw = response.choices?.[0]?.message?.content?.trim() ?? "";

      // Parse JSON from response
      const cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse response from search");

      const parsed = JSON.parse(jsonMatch[0]) as FetchedDetails;

      // Validate cover URL looks real
      if (parsed.coverUrl && !parsed.coverUrl.match(/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i) && !parsed.coverUrl.match(/^https?:\/\/(.*\.)?(novelupdates|myanimelist|amazon|goodreads|media\.kitsu|cdn)/i)) {
        parsed.coverUrl = "";
      }

      setFetched(parsed);
    } catch (err) {
      console.error("[fetch-details] Error:", err);
      setFetchError(err instanceof Error ? err.message : "Failed to fetch details");
    } finally {
      setFetching(false);
    }
  }, [item.title, item.author]);

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
    onClose();
  }, [dirty, titleChanged, authorChanged, trimmedTitle, trimmedAuthor, fetched, proxiedCover, item.id, onSave, onClose]);

  const description = fetched?.description ?? savedMeta?.description;
  const genres = fetched?.genres?.length ? fetched.genres : savedMeta?.genres;
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
        className="pointer-events-none absolute right-2 size-3 text-label-tertiary opacity-40 transition-opacity duration-150 group-hover/edit:opacity-100 group-focus-within/edit:opacity-100"
        strokeWidth={2}
      />
    </label>
  );

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Title", value: editable(title, setTitle, "Title", "Title") },
    { label: "Author", value: editable(author, setAuthor, "Author", "Unknown") },
    { label: "Format", value: <span className="text-label-secondary">{item.format.toUpperCase()}</span> },
  ];
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
      open
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
                <Check className="size-3 text-success" strokeWidth={2.5} />
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

            {genres && genres.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <Badge key={g} variant="outline">{g}</Badge>
                ))}
              </div>
            )}

            <div className="mt-4 min-h-0">
              {fetching ? (
                <ShimmerText className="text-sm">Searching the web for this book…</ShimmerText>
              ) : description ? (
                <p className="max-h-40 overflow-y-auto pr-1 text-sm leading-relaxed text-label-secondary">
                  {description}
                </p>
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
        <Button variant="secondary" size="sm" className="rounded-md" onClick={handleFetch} disabled={fetching}>
          {fetching ? (
            <Loader2 className="animate-spin" strokeWidth={1.75} />
          ) : (
            <Sparkles strokeWidth={1.75} />
          )}
          {fetching ? "Searching…" : fetched ? "Search Again" : "Fetch Details"}
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" className="rounded-md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-md"
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
