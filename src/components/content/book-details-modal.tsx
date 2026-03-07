"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Sparkles, Loader2, BookOpen, User, Tag, FileText, Save, Globe } from "lucide-react";
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

  const handleApply = useCallback(() => {
    if (!fetched) return;
    const fields: { title?: string; author?: string; cover?: string } = {};
    if (fetched.title && fetched.title !== item.title) fields.title = fetched.title;
    if (fetched.author && fetched.author !== item.author) fields.author = fetched.author;
    // Use proxied data URL if available, otherwise the raw URL
    if (proxiedCover) fields.cover = proxiedCover;
    else if (fetched.coverUrl) fields.cover = fetched.coverUrl;

    const meta: { description?: string; genres?: string[] } = {};
    if (fetched.description) meta.description = fetched.description;
    if (fetched.genres?.length) meta.genres = fetched.genres;

    onSave(item.id, fields, meta);
    onClose();
  }, [fetched, proxiedCover, item, onSave, onClose]);

  const description = fetched?.description ?? savedMeta?.description;
  const genres = fetched?.genres?.length ? fetched.genres : savedMeta?.genres;
  const displayCover = proxiedCover || fetched?.coverUrl || item.cover;
  const status = fetched?.status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-white/[0.08] shadow-lg shadow-black/40 overflow-hidden"
        style={{ backgroundColor: "var(--bg-overlay)", backdropFilter: "blur(24px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <span className="text-sm font-medium text-white/70">Book Details</span>
          <button onClick={onClose} className="rounded-lg p-1 text-white/30 hover:bg-white/[0.06] hover:text-white/50 transition-colors">
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex gap-4">
            {/* Cover */}
            <div className="shrink-0 w-32 aspect-[2/3] rounded-lg overflow-hidden bg-white/[0.03] relative">
              {displayCover ? (
                <img
                  src={displayCover}
                  alt={item.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center" style={{ background: item.gradient }}>
                  <BookOpen className="h-8 w-8 text-white/20" />
                </div>
              )}
              {/* Loading overlay while proxying cover */}
              {fetched?.coverUrl && !proxiedCover && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-1 flex-col gap-2 min-w-0">
              <h2 className="text-sm font-medium text-white/70 leading-snug">
                {fetched?.title ?? item.title}
              </h2>

              {fetched?.alternativeNames && fetched.alternativeNames.length > 0 && (
                <p className="text-xs text-white/20 leading-snug line-clamp-1">
                  {fetched.alternativeNames.join(" · ")}
                </p>
              )}

              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3 shrink-0 text-white/20" strokeWidth={1.5} />
                <span className="text-xs text-white/40">{fetched?.author ?? item.author}</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3 shrink-0 text-white/20" strokeWidth={1.5} />
                  <span className="text-xs text-white/40">{item.format.toUpperCase()}</span>
                </div>
                {status && (
                  <span className={`rounded-lg px-1.5 py-0.5 text-xs ${
                    status === "Completed" ? "bg-green-500/10 text-green-400/60" :
                    status === "Ongoing" ? "bg-blue-500/10 text-blue-400/60" :
                    "bg-white/[0.06] text-white/30"
                  }`}>
                    {status}
                  </span>
                )}
              </div>

              {genres && genres.length > 0 && (
                <div className="flex items-start gap-1.5 mt-1">
                  <Tag className="h-3 w-3 shrink-0 text-white/20 mt-0.5" strokeWidth={1.5} />
                  <div className="flex flex-wrap gap-1">
                    {genres.map((g) => (
                      <span key={g} className="rounded-lg bg-white/[0.06] px-1.5 py-0.5 text-xs text-white/30">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {description && (
                <p className="mt-1 text-xs text-white/30 leading-relaxed line-clamp-5">
                  {description}
                </p>
              )}

              {fetched?.source && (
                <div className="flex items-center gap-1 mt-auto">
                  <Globe className="h-3 w-3 text-white/10" strokeWidth={1.5} />
                  <span className="text-xs text-white/15">{fetched.source}</span>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {fetchError && (
            <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {fetchError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
          <button
            onClick={handleFetch}
            disabled={fetching}
            className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs text-white/50 hover:bg-white/[0.09] hover:text-white/70 transition-colors disabled:opacity-40"
          >
            {fetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
            {fetching ? "Searching online..." : fetched ? "Search Again" : "Fetch Details"}
          </button>

          {fetched && (
            <button
              onClick={handleApply}
              className="flex items-center gap-2 rounded-lg bg-[var(--accent-brand)] px-3 py-1.5 text-xs text-white font-medium hover:opacity-90 transition-opacity"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
              Apply Changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
