"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Sparkles, Loader2, BookOpen, User, Tag, FileText, Save } from "lucide-react";
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
}

export function BookDetailsModal({ item, onClose, onSave }: BookDetailsModalProps) {
  const [fetched, setFetched] = useState<FetchedDetails | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [savedMeta, setSavedMeta] = useState<{ description?: string; genres?: string[] } | null>(null);

  // Load saved metadata
  useEffect(() => {
    window.electronAPI?.getSetting(`bookMeta:${item.filePath}`).then((raw) => {
      if (raw) {
        try { setSavedMeta(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  }, [item.filePath]);

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
            content: `You are a book information lookup assistant. Given a book title and author, search for and return accurate details about the book. Prefer information from sites like NovelUpdates, MyAnimeList, Goodreads, or official publisher pages.

Return ONLY valid JSON in this exact format:
{"title": "Official Title", "author": "Author Name", "description": "2-3 sentence synopsis", "genres": ["genre1", "genre2"], "coverUrl": "direct image URL to the book cover or empty string if unknown", "source": "website name where info was found"}

If you cannot find the book, return: {"title": "${item.title}", "author": "${item.author}", "description": "", "genres": [], "coverUrl": "", "source": "not found"}`,
          },
          {
            role: "user",
            content: `Look up this book:\nTitle: "${item.title}"\nAuthor: "${item.author}"`,
          },
        ],
        "perplexity/sonar",
        { temperature: 0.1, max_tokens: 5000 },
      );

      const raw = response.choices?.[0]?.message?.content?.trim() ?? "";

      // Parse JSON from response
      let cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse response");

      const parsed = JSON.parse(jsonMatch[0]) as FetchedDetails;
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
    if (fetched.coverUrl) fields.cover = fetched.coverUrl;

    const meta: { description?: string; genres?: string[] } = {};
    if (fetched.description) meta.description = fetched.description;
    if (fetched.genres?.length) meta.genres = fetched.genres;

    onSave(item.id, fields, meta);
    onClose();
  }, [fetched, item, onSave, onClose]);

  const description = fetched?.description ?? savedMeta?.description;
  const genres = fetched?.genres?.length ? fetched.genres : savedMeta?.genres;

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
            <div className="shrink-0 w-32 aspect-[2/3] rounded-lg overflow-hidden bg-white/[0.03]">
              {(fetched?.coverUrl || item.cover) ? (
                <img
                  src={fetched?.coverUrl || item.cover}
                  alt={item.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center" style={{ background: item.gradient }}>
                  <BookOpen className="h-8 w-8 text-white/20" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-1 flex-col gap-2 min-w-0">
              <h2 className="text-sm font-medium text-white/70 leading-snug">
                {fetched?.title ?? item.title}
              </h2>

              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3 shrink-0 text-white/20" strokeWidth={1.5} />
                <span className="text-xs text-white/40">{fetched?.author ?? item.author}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <FileText className="h-3 w-3 shrink-0 text-white/20" strokeWidth={1.5} />
                <span className="text-xs text-white/40">{item.format.toUpperCase()}</span>
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
                <p className="mt-1 text-xs text-white/30 leading-relaxed line-clamp-4">
                  {description}
                </p>
              )}

              {fetched?.source && (
                <span className="text-xs text-white/15 mt-auto">Source: {fetched.source}</span>
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
            {fetching ? "Searching..." : "Fetch Details"}
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
