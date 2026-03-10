"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Trash2, User, MessageSquare, BookOpen, Eye, Feather, Quote as QuoteIcon, Loader2, Filter } from "lucide-react";

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

const KIND_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  dialogue: { label: "Dialogue", icon: <MessageSquare className="h-3 w-3" />, color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  inner_thought: { label: "Inner Thought", icon: <Eye className="h-3 w-3" />, color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  narration: { label: "Narration", icon: <BookOpen className="h-3 w-3" />, color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  description: { label: "Description", icon: <Feather className="h-3 w-3" />, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  quote: { label: "Quote", icon: <QuoteIcon className="h-3 w-3" />, color: "text-white/60 bg-white/5 border-white/10" },
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

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-inset)] text-white">
      {/* Header */}
      <div
        className="shrink-0 border-b border-white/[0.06]"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        <div className="flex items-center gap-3 px-5 py-4">
          <QuoteIcon className="h-5 w-5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-white/90 truncate">{title}</h1>
            <p className="text-xs text-white/40 mt-0.5">
              {loading ? "Loading…" : `${quotes.length} quote${quotes.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2 px-5 pb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Search quotes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/[0.06] bg-[var(--bg-inset)] py-2 pl-8 pr-3 text-xs text-white/80 placeholder-white/30 outline-none focus:border-[var(--accent-brand)]/40"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/30 pointer-events-none" strokeWidth={1.5} />
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
              className="rounded-lg border border-white/[0.06] bg-[var(--bg-inset)] py-2 pl-8 pr-3 text-xs text-white/70 outline-none appearance-none cursor-pointer focus:border-[var(--accent-brand)]/40"
            >
              <option value="all">All types</option>
              {ALL_KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]?.label ?? k}</option>
              ))}
            </select>
          </div>
          {!filePath && uniqueBooks.length > 1 && (
            <select
              value={filterBook}
              onChange={(e) => setFilterBook(e.target.value)}
              className="rounded-lg border border-white/[0.06] bg-[var(--bg-inset)] py-2 px-3 text-xs text-white/70 outline-none appearance-none cursor-pointer focus:border-[var(--accent-brand)]/40 max-w-[160px] truncate"
            >
              <option value="all">All books</option>
              {uniqueBooks.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-white/30" strokeWidth={1.5} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <QuoteIcon className="h-10 w-10 text-white/10" strokeWidth={1} />
            <p className="text-sm text-white/30">
              {quotes.length === 0
                ? "No quotes saved yet. Highlight text in the reader and tap Quote."
                : "No quotes match your filters."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-white/[0.04]">
            {filtered.map((quote) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                showBook={!filePath}
                onDelete={handleDelete}
                deleting={deletingId === quote.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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

  return (
    <div className="group px-5 py-4 transition-colors hover:bg-white/[0.02]">
      {/* Meta row */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${kindMeta.color}`}>
          {kindMeta.icon}
          {kindMeta.label}
        </span>
        {hasSpeaker && !isNarrative && (
          <span className="inline-flex items-center gap-1 text-[10px] text-white/40">
            <User className="h-3 w-3" strokeWidth={1.5} />
            {quote.speaker}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <span className="text-[10px] text-white/25">
            {quote.chapterTitle || `Chapter ${quote.chapterIndex + 1}`}
          </span>
          {showBook && quote.bookTitle && (
            <span className="text-[10px] text-white/25 truncate max-w-[120px]">{quote.bookTitle}</span>
          )}
          <button
            onClick={() => onDelete(quote.id)}
            disabled={deleting}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        </span>
      </div>

      {/* Quote text */}
      <blockquote className="relative pl-3 text-sm leading-relaxed text-white/80">
        <span
          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full"
          style={{ backgroundColor: "var(--accent-brand)", opacity: 0.5 }}
        />
        {quote.text}
      </blockquote>

      {/* Note */}
      {quote.note && (
        <p className="mt-2 text-xs text-white/40 italic pl-3">{quote.note}</p>
      )}

      {/* AI enhanced badge */}
      {quote.aiEnhanced && (
        <div className="mt-1.5 pl-3">
          <span className="text-[9px] text-[var(--accent-brand)]/50">AI enriched</span>
        </div>
      )}
    </div>
  );
}
