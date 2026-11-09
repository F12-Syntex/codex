"use client";

import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Trash2, MessageSquare, BookOpen, Eye, Feather, Quote as QuoteIcon, Loader2, ChevronDown, Sparkles, Layers } from "lucide-react";
import { WindowChrome, WindowShell } from "@/components/ui/window-chrome";
import { SearchField } from "@/components/ui/search-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { MasonryGrid } from "@/components/ui/masonry-grid";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberTicker } from "@/components/ui/number-ticker";
import { VocabularyDeck } from "@/components/assistant";
import { vocab } from "@/lib/assistant/bridge";
import { hasRpc } from "@/lib/ai/rpc";
import { classifySavedQuote } from "@/lib/quotes/classify";

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

/** Kind chips are neutral (bg-fill-tertiary); only the icon carries the tint. */
const KIND_LABELS: Record<string, { label: string; short: string; icon: React.ReactNode; tint: string }> = {
  dialogue: { label: "Dialogue", short: "Dialogue", icon: <MessageSquare className="size-3.5" strokeWidth={1.75} />, tint: "text-info" },
  inner_thought: { label: "Thought", short: "Thought", icon: <Eye className="size-3.5" strokeWidth={1.75} />, tint: "text-brand" },
  narration: { label: "Narration", short: "Narration", icon: <BookOpen className="size-3.5" strokeWidth={1.75} />, tint: "text-warning" },
  description: { label: "Description", short: "Description", icon: <Feather className="size-3.5" strokeWidth={1.75} />, tint: "text-success" },
  quote: { label: "Quote", short: "Quote", icon: <QuoteIcon className="size-3.5" strokeWidth={1.75} />, tint: "text-label-secondary" },
};

const noopSubscribe = () => () => {};
const noRpcOnServer = () => false;

/** Strip the source's own outer quotation marks; the card draws its own hanging marks. */
function bareQuote(text: string): string {
  return text.trim().replace(/^[“"]\s*/, "").replace(/\s*[”"]$/, "");
}

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
  const [classifyingId, setClassifyingId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);
  const [wordsOpen, setWordsOpen] = useState(false);
  const [wordsDue, setWordsDue] = useState<{ total: number; due: number } | null>(null);
  // No hydration branch on hasRpc() (conventions §13.12): false on the server and while hydrating.
  const rpcReady = useSyncExternalStore(noopSubscribe, hasRpc, noRpcOnServer);

  // Saved words (vocabulary deck) live beside the quotes; the pill shows how many are due.
  const loadWordStats = useCallback(() => {
    if (!hasRpc()) return;
    vocab.stats(filePath).then((st) => setWordsDue({ total: st.total, due: st.due })).catch(() => {});
  }, [filePath]);
  useEffect(() => { loadWordStats(); }, [loadWordStats]);

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

  /** Speaker + kind through the `quote.classify` task (cached, spoiler-gated speaker list). */
  const handleClassify = async (q: SavedQuote) => {
    setClassifyingId(q.id);
    try {
      const fields = await classifySavedQuote(q.id, {
        filePath: q.filePath,
        text: q.text,
        bookTitle: q.bookTitle,
        chapterTitle: q.chapterTitle,
      });
      if (fields) setQuotes((prev) => prev.map((x) => (x.id === q.id ? { ...x, ...fields } : x)));
    } catch { /* job failed: the card stays as it was */ } finally {
      setClassifyingId(null);
    }
  };

  const title = bookTitle || (filePath ? "Book Quotes" : "All Quotes");

  const wordsButton = wordsDue && wordsDue.total > 0 && (
    <button
      type="button"
      onClick={() => setWordsOpen(true)}
      title="Review saved words"
      className="focus-ring pressable inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-fill-tertiary pr-2 pl-3 text-xs font-medium text-label-secondary transition-colors duration-150 hover:bg-fill-secondary hover:text-label"
    >
      <Layers className="size-3.5" strokeWidth={1.75} />
      Words
      <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs tabular-nums ${wordsDue.due > 0 ? "bg-brand text-brand-fg" : "bg-fill-secondary text-label-secondary"}`}>
        {wordsDue.due > 0 ? wordsDue.due : wordsDue.total}
      </span>
    </button>
  );

  const deck = (
    <VocabularyDeck
      open={wordsOpen}
      onClose={() => { setWordsOpen(false); loadWordStats(); }}
      filePath={filePath}
      scopeLabel={bookTitle}
    />
  );

  // Labels over glyphs (conventions §13.7): every kind segment carries its word.
  const kindOptions = useMemo(() => [
    { value: "all", label: "All" },
    ...ALL_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k].short, title: KIND_LABELS[k].label })),
  ], []);

  return (
    <WindowShell>
      <WindowChrome
        icon={<QuoteIcon strokeWidth={1.75} />}
        title="Quotes"
        subtitle={bookTitle}
        zoomKey="quotes"
        zoom={zoom}
        onZoomChange={setZoom}
      />

      <div className="min-h-0 flex-1 overflow-y-auto" style={{ zoom: zoom / 100 }}>
        {!loading && quotes.length === 0 ? (
          <EmptyQuotes title={title} action={wordsButton || undefined} />
        ) : (
          <>
            {/* Hero */}
            <header className="mx-auto w-full max-w-6xl px-8 pt-10 pb-6 text-center">
              <h1 className="mx-auto max-w-2xl truncate text-large-title font-display text-label">{title}</h1>
              <p className="mt-2 text-sm text-label-secondary">
                {loading ? "Gathering your quotes…" : (
                  <>
                    <NumberTicker value={quotes.length} className="tabular-nums text-label" /> saved {quotes.length === 1 ? "passage" : "passages"}
                    {filtered.length !== quotes.length && (
                      <span> · {filtered.length} shown</span>
                    )}
                  </>
                )}
              </p>
            </header>

            {/* Floating toolbar */}
            <div className="sticky top-3 z-20 flex justify-center px-8 pb-6">
              <div className="glass flex items-center gap-1.5 rounded-full p-1 animate-pop-in">
                <SearchField
                  value={search}
                  onChange={setSearch}
                  placeholder="Search quotes"
                  className="w-64"
                />
                <SegmentedControl
                  value={filterKind}
                  onValueChange={setFilterKind}
                  options={kindOptions}
                  aria-label="Filter by kind"
                />
                {!filePath && uniqueBooks.length > 1 && (
                  <div className="relative">
                    <select
                      value={filterBook}
                      onChange={(e) => setFilterBook(e.target.value)}
                      className="focus-ring h-8 max-w-44 cursor-pointer appearance-none truncate rounded-full bg-fill-tertiary pl-3.5 pr-8 text-xs font-medium text-label-secondary transition-colors hover:bg-fill-secondary hover:text-label"
                    >
                      <option value="all">All books</option>
                      {uniqueBooks.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-label-tertiary" strokeWidth={2} />
                  </div>
                )}
                {wordsButton}
              </div>
            </div>

            {/* Gallery */}
            <div className="mx-auto w-full max-w-6xl px-8 pb-12">
              {loading ? (
                <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="mb-4 break-inside-avoid space-y-2.5 rounded-lg bg-fill-quaternary p-5 hairline" style={{ opacity: 1 - i * 0.12 }}>
                      <span className="block h-5 w-20 animate-pulse rounded-full bg-fill-tertiary" />
                      {Array.from({ length: 2 + (i % 3) }).map((_, j) => (
                        <span key={j} className="block h-3 animate-pulse rounded-full bg-fill-tertiary" style={{ width: `${92 - j * 14}%` }} />
                      ))}
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<QuoteIcon />}
                  title="Nothing matches"
                  description="Try a different search or filter."
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
                      onClassify={rpcReady ? handleClassify : undefined}
                      classifying={classifyingId === quote.id}
                    />
                  )}
                />
              )}
            </div>
          </>
        )}
      </div>
      {deck}
    </WindowShell>
  );
}

/** Empty state — a fanned stack of blank glass quote cards. */
function EmptyQuotes({ title, action }: { title: string; action?: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const cards = [
    { rot: -8, x: -120, y: 18, lines: [88, 72, 54] },
    { rot: 7, x: 120, y: 24, lines: [80, 90, 40] },
    { rot: -1, x: 0, y: 0, lines: [94, 86, 78, 50] },
  ];
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 py-12 text-center">
      <div className="relative mb-10 h-56 w-[30rem] max-w-full" aria-hidden>
        {cards.map((c, i) => (
          <motion.div
            key={i}
            className="glass-thin grain absolute left-1/2 top-0 w-64 rounded-2xl p-5 text-left"
            style={{ marginLeft: -128 }}
            initial={reduceMotion ? false : { opacity: 0, y: 40, x: 0, rotate: 0 }}
            animate={{ opacity: i === 2 ? 1 : 0.7, y: c.y, x: c.x, rotate: c.rot }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.9, delay: 0.08 * i }}
          >
            <span className="block font-display text-2xl leading-none text-brand">&ldquo;</span>
            <div className="mt-2 space-y-2">
              {c.lines.map((w, j) => (
                <span key={j} className="block h-2 rounded-full bg-fill-secondary" style={{ width: `${w}%` }} />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="h-px w-5 bg-separator-strong" />
              <span className="h-1.5 w-16 rounded-full bg-fill-tertiary" />
            </div>
          </motion.div>
        ))}
      </div>
      <h1 className="text-large-title font-display text-label text-balance">{title}</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-label-secondary">
        Lines worth keeping live here. Select a passage in the reader and choose{" "}
        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-fill-tertiary px-2 align-middle text-xs text-label">
          <QuoteIcon className="size-3.5" strokeWidth={1.75} /> Quote
        </span>{" "}
        to start your collection.
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

const QUOTE_MARK = "color-mix(in srgb, var(--label) 40%, transparent)";

/**
 * Quote card — serif pull-quote with hanging quotation marks and a hairline
 * attribution rule. Adapted from 21st.dev "Testimonial 2" (ncdai, id 18912).
 */
function QuoteCard({
  quote,
  showBook,
  onDelete,
  deleting,
  onClassify,
  classifying,
}: {
  quote: SavedQuote;
  showBook: boolean;
  onDelete: (id: number) => void;
  deleting: boolean;
  /** Identify speaker and kind with AI (offered until the quote has been classified). */
  onClassify?: (q: SavedQuote) => void;
  classifying?: boolean;
}) {
  const kindMeta = KIND_LABELS[quote.kind] ?? KIND_LABELS.quote;
  const hasSpeaker = quote.speaker && quote.speaker !== "unknown" && quote.speaker !== "narrator";
  const isNarrative = quote.kind === "narration" || quote.kind === "description";
  const long = quote.text.length > 320;

  return (
    <SpotlightCard className="group relative rounded-lg bg-fill-quaternary p-5 hairline transition-colors duration-200 hover:bg-fill-tertiary">
      <figure className="relative flex flex-col gap-4">
        {/* Meta */}
        <div className="flex h-6 items-center gap-2 pr-8">
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-fill-tertiary px-2 text-2xs font-medium text-label-secondary">
            <span className={kindMeta.tint}>{kindMeta.icon}</span>
            {kindMeta.label}
          </span>
          {quote.aiEnhanced ? (
            <span className="inline-flex text-brand" title="AI enriched" aria-label="AI enriched">
              <Sparkles className="size-3.5" strokeWidth={1.75} />
            </span>
          ) : onClassify && (
            <button
              type="button"
              onClick={() => onClassify(quote)}
              disabled={classifying}
              title="Identify the speaker and kind with AI"
              className="focus-ring pressable inline-flex h-5 items-center gap-1 rounded-full px-2 text-2xs font-medium text-label-tertiary opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-fill-tertiary hover:text-label focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-100"
            >
              {classifying ? <Loader2 className="size-3 animate-spin" strokeWidth={2} /> : <Sparkles className="size-3" strokeWidth={2} />}
              {classifying ? "Identifying…" : "Identify"}
            </button>
          )}
        </div>

        {/* Pull-quote */}
        {/* Hanging punctuation: the opening mark sits in the margin, same size as the text */}
        <blockquote
          className={`relative font-display italic text-label text-pretty select-text ${long ? "text-base leading-relaxed" : "text-lg leading-relaxed"}`}
          style={{ textIndent: "-0.45em" }}
        >
          <span aria-hidden className="select-none" style={{ color: QUOTE_MARK }}>&ldquo;</span>
          <span>{bareQuote(quote.text)}</span>
          <span aria-hidden className="select-none" style={{ color: QUOTE_MARK }}>&rdquo;</span>
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
            <span className="truncate text-xs text-label-secondary">
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
        aria-label="Delete quote"
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
