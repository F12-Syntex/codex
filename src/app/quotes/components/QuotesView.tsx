"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Trash2, MessageSquare, BookOpen, Eye, Feather, Quote as QuoteIcon, Loader2, ChevronDown, Sparkles, LayoutGrid } from "lucide-react";
import { WindowChrome, WindowShell } from "@/components/ui/window-chrome";
import { SearchField } from "@/components/ui/search-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { MasonryGrid } from "@/components/ui/masonry-grid";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberTicker } from "@/components/ui/number-ticker";

interface SavedQuote {
  id: number;
  filePath: string;
  chapterIndex: number;
  paragraphIndex: number;
  text: string;
  chapterTitle: string;
  bookTitle: string;
  speaker: string;
  kind: string;
  note: string;
  aiEnhanced: boolean;
  createdAt: string;
}

type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger" | "outline";

const KIND_LABELS: Record<string, { label: string; icon: React.ReactNode; variant: BadgeVariant }> = {
  dialogue: { label: "Dialogue", icon: <MessageSquare className="size-3" strokeWidth={2} />, variant: "accent" },
  inner_thought: { label: "Inner Thought", icon: <Eye className="size-3" strokeWidth={2} />, variant: "default" },
  narration: { label: "Narration", icon: <BookOpen className="size-3" strokeWidth={2} />, variant: "warning" },
  description: { label: "Description", icon: <Feather className="size-3" strokeWidth={2} />, variant: "success" },
  quote: { label: "Quote", icon: <QuoteIcon className="size-3" strokeWidth={2} />, variant: "outline" },
};

const ALL_KINDS = ["dialogue", "inner_thought", "narration", "description", "quote"];

interface QuotesViewProps {
  filePath?: string;
  bookTitle?: string;
}

export function QuotesView({ filePath, bookTitle }: QuotesViewProps) {
  const [quotes, setQuotes] = useState<SavedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [filterBook, setFilterBook] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;
    setLoading(true);
    try {
      const data = filePath
        ? await api.quotesGet(filePath)
        : await api.quotesGetAll();
      setQuotes(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => { load(); }, [load]);

  const uniqueBooks = useMemo(() => {
    const books = new Set(quotes.map((q) => q.bookTitle).filter(Boolean));
    return Array.from(books).sort();
  }, [quotes]);

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      if (filterKind !== "all" && q.kind !== filterKind) return false;
      if (filterBook !== "all" && q.bookTitle !== filterBook) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        const matchText = q.text.toLowerCase().includes(s);
        const matchSpeaker = q.speaker.toLowerCase().includes(s);
        const matchChapter = q.chapterTitle.toLowerCase().includes(s);
        const matchBook = q.bookTitle.toLowerCase().includes(s);
        if (!matchText && !matchSpeaker && !matchChapter && !matchBook) return false;
      }
      return true;
    });
  }, [quotes, filterKind, filterBook, search]);

  const handleDelete = async (id: number) => {
    const api = window.electronAPI;
    if (!api) return;
    setDeletingId(id);
    await api.quotesDelete(id);
    setQuotes((prev) => prev.filter((q) => q.id !== id));
    setDeletingId(null);
  };

  const title = bookTitle || (filePath ? "Book Quotes" : "All Quotes");

  const kindOptions = useMemo(() => [
    { value: "all", label: "All", icon: <LayoutGrid strokeWidth={1.75} /> },
    ...ALL_KINDS.map((k) => ({ value: k, icon: KIND_LABELS[k].icon, title: KIND_LABELS[k].label })),
  ], []);

  return (
    <WindowShell>
      <WindowChrome
        icon={<QuoteIcon strokeWidth={1.75} />}
        title="Quotes"
        subtitle={bookTitle}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Header */}
        <header className="mx-auto w-full max-w-6xl px-8 pt-6 pb-4">
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="truncate text-large-title text-label">{title}</h1>
              <p className="mt-1 text-sm text-label-secondary">
                {loading ? "Loading…" : (
                  <>
                    <NumberTicker value={quotes.length} className="tabular-nums" /> saved {quotes.length === 1 ? "quote" : "quotes"}
                    {filtered.length !== quotes.length && (
                      <span className="text-label-tertiary"> · {filtered.length} shown</span>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search quotes, speakers, chapters…"
              className="w-72"
            />
            <SegmentedControl
              value={filterKind}
              onValueChange={setFilterKind}
              options={kindOptions}
              aria-label="Filter by kind"
            />
            {filterKind !== "all" && (
              <span className="animate-fade-in text-xs text-label-tertiary">{KIND_LABELS[filterKind]?.label}</span>
            )}
            {!filePath && uniqueBooks.length > 1 && (
              <div className="relative ml-auto">
                <select
                  value={filterBook}
                  onChange={(e) => setFilterBook(e.target.value)}
                  className="focus-ring h-8 max-w-48 cursor-pointer appearance-none truncate rounded-full bg-fill-tertiary pl-3.5 pr-8 text-xs font-medium text-label-secondary transition-colors hover:bg-fill-secondary hover:text-label"
                >
                  <option value="all">All books</option>
                  {uniqueBooks.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-label-tertiary" strokeWidth={2} />
              </div>
            )}
          </div>
        </header>

        {/* Gallery */}
        <div className="mx-auto w-full max-w-6xl px-8 pb-10">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="size-5 animate-spin text-label-tertiary" strokeWidth={1.75} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<QuoteIcon className="size-10" strokeWidth={1.25} />}
              title={quotes.length === 0 ? "No quotes yet" : "Nothing matches"}
              description={quotes.length === 0
                ? "Highlight text in the reader and tap Quote to keep it here."
                : "Try a different search or filter."}
            />
          ) : (
            <MasonryGrid
              items={filtered}
              getKey={(q) => q.id}
              className="columns-1 md:columns-2 xl:columns-3"
              renderItem={(quote) => (
                <QuoteCard
                  quote={quote}
                  showBook={!filePath}
                  onDelete={handleDelete}
                  deleting={deletingId === quote.id}
                />
              )}
            />
          )}
        </div>
      </div>
    </WindowShell>
  );
}

/**
 * Quote card — serif pull-quote with hanging quotation marks and a hairline
 * attribution rule. Adapted from 21st.dev "Testimonial 2" (ncdai, id 18912).
 */
function QuoteCard({
  quote,
  showBook,
  onDelete,
  deleting,
}: {
  quote: SavedQuote;
  showBook: boolean;
  onDelete: (id: number) => void;
  deleting: boolean;
}) {
  const kindMeta = KIND_LABELS[quote.kind] ?? KIND_LABELS.quote;
  const hasSpeaker = quote.speaker && quote.speaker !== "unknown" && quote.speaker !== "narrator";
  const isNarrative = quote.kind === "narration" || quote.kind === "description";
  const long = quote.text.length > 320;

  return (
    <SpotlightCard className="glass-thin group relative rounded-2xl p-5 transition-shadow duration-200 hover:shadow-md">
      <figure className="relative flex flex-col gap-4">
        {/* Meta */}
        <div className="flex h-6 items-center gap-2 pr-8">
          <Badge variant={kindMeta.variant} className="gap-1">
            {kindMeta.icon}
            {kindMeta.label}
          </Badge>
          {quote.aiEnhanced && (
            <span className="inline-flex items-center gap-1 text-2xs text-brand" title="AI enriched">
              <Sparkles className="size-3" strokeWidth={2} />
              Enriched
            </span>
          )}
        </div>

        {/* Pull-quote */}
        <blockquote
          className={`relative pl-3 font-display italic text-label text-pretty select-text ${long ? "text-base leading-relaxed" : "text-lg leading-relaxed"}`}
        >
          <span aria-hidden className="absolute -left-0.5 top-0 select-none text-label-quaternary">&ldquo;</span>
          <span>{quote.text}</span>
          <span aria-hidden className="select-none text-label-quaternary">&rdquo;</span>
        </blockquote>

        {/* Note */}
        {quote.note && (
          <p className="rounded-md bg-fill-quaternary px-3 py-2 text-xs leading-relaxed text-label-secondary select-text">{quote.note}</p>
        )}

        {/* Attribution */}
        <figcaption className="flex items-center gap-3">
          <span aria-hidden className="h-px w-6 shrink-0 bg-separator-strong" />
          <span className="flex min-w-0 flex-col">
            {hasSpeaker && !isNarrative && (
              <span className="truncate text-xs font-medium text-label-secondary">{quote.speaker}</span>
            )}
            <span className="truncate text-xs text-label-tertiary">
              {quote.chapterTitle || `Chapter ${quote.chapterIndex + 1}`}
              {showBook && quote.bookTitle && <> · <span className="italic">{quote.bookTitle}</span></>}
            </span>
          </span>
        </figcaption>
      </figure>

      {/* Delete */}
      <button
        onClick={() => onDelete(quote.id)}
        disabled={deleting}
        title="Delete quote"
        className="focus-ring pressable absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-label-tertiary opacity-0 hover:bg-danger/15 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-100"
      >
        {deleting ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} />
        ) : (
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        )}
      </button>
    </SpotlightCard>
  );
}
