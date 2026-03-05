"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Loader2, Search,
  User, Swords, MapPin, Flame, Lightbulb,
  ChevronRight, BookOpen, GitBranch,
} from "lucide-react";
import { WindowHeader } from "@/components/window-header";
import type { WikiEntry, WikiEntryType, WikiArc } from "@/lib/ai-wiki";
import { fetchWikiEntry } from "@/lib/ai-wiki";
import { WikiEntryView } from "./WikiEntryView";
import { WikiAIChat } from "./WikiAIChat";

interface WikiViewerProps {
  filePath: string;
  bookTitle: string;
  initialEntryId?: string;
}

const TYPE_META: Record<WikiEntryType, { icon: React.ReactNode; label: string; plural: string }> = {
  character: { icon: <User className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Character", plural: "Characters" },
  item: { icon: <Swords className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Item", plural: "Items" },
  location: { icon: <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Location", plural: "Locations" },
  event: { icon: <Flame className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Event", plural: "Events" },
  concept: { icon: <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Concept", plural: "Concepts" },
};

const TYPE_ORDER: WikiEntryType[] = ["character", "item", "location", "event", "concept"];

interface EntryListItem {
  id: string;
  name: string;
  type: WikiEntryType;
  short_description: string;
  first_appearance: number;
  significance: number;
  status: string;
}

interface ChapterSummary {
  chapter_index: number;
  summary: string;
  key_events: string;
  mood: string;
}

type ViewMode = "entries" | "arcs" | "chapters";

export function WikiViewer({ filePath, bookTitle, initialEntryId }: WikiViewerProps) {
  const [entries, setEntries] = useState<EntryListItem[]>([]);
  const [arcs, setArcs] = useState<WikiArc[]>([]);
  const [chapterSummaries, setChapterSummaries] = useState<ChapterSummary[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<WikiEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<WikiEntryType | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("entries");
  const [zoom, setZoom] = useState(100);
  // Load entries from DB — runs on mount and polls for updates
  const initialSelectionDone = useRef(false);

  const refreshData = useCallback(async () => {
    const api = window.electronAPI;
    if (!api || !filePath) return;

    const [entryRows, processed, arcRows, summaryRows] = await Promise.all([
      api.wikiGetEntries(filePath),
      api.wikiGetProcessed(filePath),
      api.wikiGetAllArcs(filePath),
      api.wikiGetAllChapterSummaries(filePath),
    ]);

    setEntries(entryRows.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type as WikiEntryType,
      short_description: e.short_description,
      first_appearance: e.first_appearance,
      significance: e.significance,
      status: e.status,
    })));

    setProcessedCount(processed.length);

    setArcs(arcRows.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      arcType: a.arc_type,
      status: a.status,
      startChapter: a.start_chapter,
      endChapter: a.end_chapter,
    })));

    setChapterSummaries(summaryRows.map((s) => ({
      chapter_index: s.chapter_index,
      summary: s.summary,
      key_events: s.key_events,
      mood: s.mood,
    })));

    setIsLoading(false);

    // Only set initial selection once
    if (!initialSelectionDone.current) {
      initialSelectionDone.current = true;
      if (initialEntryId && entryRows.some((e) => e.id === initialEntryId)) {
        setSelectedEntryId(initialEntryId);
      } else if (entryRows.length > 0) {
        setSelectedEntryId(entryRows[0].id);
      }
    }
  }, [filePath, initialEntryId]);

  useEffect(() => {
    if (!filePath) { setIsLoading(false); return; }
    refreshData();
    // Poll every 5s for fresh data while wiki window is open
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [filePath, refreshData]);

  // Load full entry when selected or when new chapters are processed
  useEffect(() => {
    if (!selectedEntryId || !filePath) { setSelectedEntry(null); return; }
    fetchWikiEntry(filePath, selectedEntryId).then(setSelectedEntry);
  }, [filePath, selectedEntryId, processedCount]);

  // Group entries by type
  const groupedEntries = useMemo(() => {
    const groups: Partial<Record<WikiEntryType, EntryListItem[]>> = {};
    for (const entry of entries) {
      if (!groups[entry.type]) groups[entry.type] = [];
      groups[entry.type]!.push(entry);
    }
    for (const type of Object.keys(groups) as WikiEntryType[]) {
      groups[type]!.sort((a, b) => a.first_appearance - b.first_appearance);
    }
    return groups;
  }, [entries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const result: Partial<Record<WikiEntryType, EntryListItem[]>> = {};

    for (const type of TYPE_ORDER) {
      if (filterType !== "all" && filterType !== type) continue;
      const items = groupedEntries[type] ?? [];
      const filtered = query
        ? items.filter((e) =>
            e.name.toLowerCase().includes(query) ||
            e.short_description.toLowerCase().includes(query)
          )
        : items;
      if (filtered.length > 0) result[type] = filtered;
    }
    return result;
  }, [groupedEntries, searchQuery, filterType]);

  const totalEntries = entries.length;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-inset)]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" strokeWidth={1.5} />
      </div>
    );
  }

  if (totalEntries === 0) {
    return (
      <div className="flex h-screen flex-col bg-[var(--bg-inset)]">
        <WindowHeader icon={<BookOpen className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={1.5} />} title="Wiki" subtitle={bookTitle} zoomKey="wiki" zoom={zoom} onZoomChange={setZoom} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <BookOpen className="mx-auto h-8 w-8 text-white/20" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-white/40">No wiki data yet</p>
            <p className="mt-1 text-xs text-white/25">
              Enable AI Wiki in the reader to start building
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-inset)]">
      <WindowHeader icon={<BookOpen className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={1.5} />} title="Wiki" subtitle={bookTitle} zoomKey="wiki" zoom={zoom} onZoomChange={setZoom} />

      <div className="flex flex-1 overflow-hidden" style={{ fontSize: `${zoom}%` }}>
        {/* Sidebar */}
        <div className="flex w-[260px] flex-col border-r border-white/[0.06] bg-[var(--bg-surface)]">
          {/* View mode toggle */}
          <div className="flex border-b border-white/[0.06] px-3 py-2 gap-1">
            <button
              onClick={() => setViewMode("entries")}
              className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                viewMode === "entries" ? "bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]" : "text-white/40 hover:text-white/60"
              }`}
            >
              Entries ({totalEntries})
            </button>
            <button
              onClick={() => setViewMode("arcs")}
              className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                viewMode === "arcs" ? "bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]" : "text-white/40 hover:text-white/60"
              }`}
            >
              Arcs ({arcs.length})
            </button>
            <button
              onClick={() => setViewMode("chapters")}
              className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                viewMode === "chapters" ? "bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]" : "text-white/40 hover:text-white/60"
              }`}
            >
              Chapters
            </button>
          </div>

          {viewMode === "entries" && (
            <>
              {/* Search */}
              <div className="border-b border-white/[0.06] px-3 py-2">
                <div className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "var(--bg-inset)" }}>
                  <Search className="h-3.5 w-3.5 text-white/30" strokeWidth={1.5} />
                  <input
                    type="text"
                    placeholder="Search entries..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-xs text-white/80 placeholder:text-white/25 outline-none"
                  />
                </div>
              </div>

              {/* Type filter tabs */}
              <div className="flex flex-wrap gap-1 border-b border-white/[0.06] px-3 py-2">
                <FilterChip label="All" count={totalEntries} active={filterType === "all"} onClick={() => setFilterType("all")} />
                {TYPE_ORDER.map((type) => {
                  const count = (groupedEntries[type] ?? []).length;
                  if (count === 0) return null;
                  return (
                    <FilterChip
                      key={type}
                      label={TYPE_META[type].plural}
                      count={count}
                      active={filterType === type}
                      onClick={() => setFilterType(type)}
                    />
                  );
                })}
              </div>

              {/* Entry list */}
              <div className="flex-1 overflow-y-auto">
                {TYPE_ORDER.map((type) => {
                  const items = filteredEntries[type];
                  if (!items || items.length === 0) return null;
                  const meta = TYPE_META[type];

                  return (
                    <div key={type}>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 pt-3">
                        <span className="text-white/30">{meta.icon}</span>
                        <span className="text-xs font-medium uppercase tracking-wider text-white/30">
                          {meta.plural}
                        </span>
                        <span className="text-xs text-white/20">({items.length})</span>
                      </div>
                      {items.map((entry) => (
                        <button
                          key={entry.id}
                          onClick={() => setSelectedEntryId(entry.id)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                            selectedEntryId === entry.id
                              ? "bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]"
                              : "text-white/60 hover:bg-white/[0.04] hover:text-white/80"
                          }`}
                        >
                          <ChevronRight
                            className={`h-3 w-3 shrink-0 transition-transform ${
                              selectedEntryId === entry.id ? "rotate-90" : ""
                            }`}
                            strokeWidth={1.5}
                          />
                          <span className="truncate text-xs">{entry.name}</span>
                          {entry.significance >= 3 && (
                            <span className="ml-auto text-xs text-white/20">★</span>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {viewMode === "arcs" && (
            <div className="flex-1 overflow-y-auto">
              {arcs.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-xs text-white/30">No arcs detected yet</p>
                </div>
              ) : (
                arcs.map((arc) => (
                  <div key={arc.id} className="border-b border-white/[0.04] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-3 w-3 shrink-0 text-white/30" strokeWidth={1.5} />
                      <span className="text-xs font-medium text-white/70 truncate">{arc.name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-lg px-1.5 py-0.5 text-xs capitalize" style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}>
                        {arc.status}
                      </span>
                      <span className="text-xs text-white/20">{arc.arcType}</span>
                      <span className="text-xs text-white/20 ml-auto">
                        Ch. {arc.startChapter + 1}{arc.endChapter != null ? `–${arc.endChapter + 1}` : "+"}
                      </span>
                    </div>
                    {arc.description && (
                      <p className="mt-1 text-xs leading-relaxed text-white/40 line-clamp-2">
                        {arc.description}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {viewMode === "chapters" && (
            <div className="flex-1 overflow-y-auto">
              {chapterSummaries.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-xs text-white/30">No chapter summaries yet</p>
                </div>
              ) : (
                chapterSummaries.map((ch) => (
                  <div key={ch.chapter_index} className="border-b border-white/[0.04] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-lg px-1.5 py-0.5 text-xs font-medium tabular-nums" style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}>
                        {ch.chapter_index + 1}
                      </span>
                      <MoodBadge mood={ch.mood} />
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/50">
                      {ch.summary}
                    </p>
                    {ch.key_events && (() => {
                      try {
                        const events = JSON.parse(ch.key_events) as string[];
                        if (events.length > 0) {
                          return (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {events.map((ev, i) => (
                                <span key={i} className="rounded-lg px-1.5 py-0.5 text-xs text-white/30" style={{ background: "var(--bg-inset)" }}>
                                  {ev.replace(/-/g, " ")}
                                </span>
                              ))}
                            </div>
                          );
                        }
                      } catch { /* ignore */ }
                      return null;
                    })()}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Stats footer */}
          <div className="border-t border-white/[0.06] px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/25">
                {totalEntries} {totalEntries === 1 ? "entry" : "entries"}
              </span>
              <span className="text-xs text-white/25">
                {processedCount} chapters analyzed
              </span>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="relative flex-1 overflow-hidden bg-[var(--bg-inset)]">
          <div className="h-full overflow-y-auto">
            {selectedEntry ? (
              <WikiEntryView entry={selectedEntry} filePath={filePath} onEntryClick={setSelectedEntryId} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-white/30">Select an entry to view</p>
              </div>
            )}
          </div>

          {/* AI Chat dock */}
          <WikiAIChat
            filePath={filePath}
            bookTitle={bookTitle}
            onEntryClick={setSelectedEntryId}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Mood Badge ───────────────────────────────────────── */

const MOOD_COLORS: Record<string, string> = {
  tension: "rgba(251, 113, 133, 0.15)",
  action: "rgba(251, 191, 36, 0.15)",
  calm: "rgba(52, 211, 153, 0.15)",
  mystery: "rgba(167, 139, 250, 0.15)",
  revelation: "rgba(96, 165, 250, 0.15)",
};

const MOOD_TEXT: Record<string, string> = {
  tension: "rgba(253, 164, 175, 0.9)",
  action: "rgba(252, 211, 77, 0.9)",
  calm: "rgba(110, 231, 183, 0.9)",
  mystery: "rgba(196, 181, 253, 0.9)",
  revelation: "rgba(147, 197, 253, 0.9)",
};

function MoodBadge({ mood }: { mood: string }) {
  if (!mood) return null;
  return (
    <span
      className="rounded-lg px-1.5 py-0.5 text-xs font-medium capitalize"
      style={{ background: MOOD_COLORS[mood] ?? "var(--bg-inset)", color: MOOD_TEXT[mood] ?? "var(--text-muted)" }}
    >
      {mood}
    </span>
  );
}

/* ── Filter Chip ──────────────────────────────────────── */

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2 py-0.5 text-xs transition-colors ${
        active
          ? "bg-[var(--accent-brand)]/15 font-medium text-[var(--accent-brand)]"
          : "text-white/40 hover:bg-white/[0.04] hover:text-white/60"
      }`}
    >
      {label}
      <span className="ml-1 tabular-nums opacity-60">{count}</span>
    </button>
  );
}
