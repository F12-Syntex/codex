"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Minus, Square, X, Search,
  User, Swords, MapPin, Flame, Lightbulb,
  ChevronRight, BookOpen, GitBranch,
} from "lucide-react";
import type { WikiEntry, WikiEntryType, WikiArc } from "@/lib/ai-wiki";
import { fetchWikiEntry } from "@/lib/ai-wiki";
import { WikiEntryView } from "./WikiEntryView";

interface WikiViewerProps {
  filePath: string;
  bookTitle: string;
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

type ViewMode = "entries" | "arcs";

export function WikiViewer({ filePath, bookTitle }: WikiViewerProps) {
  const [entries, setEntries] = useState<EntryListItem[]>([]);
  const [arcs, setArcs] = useState<WikiArc[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<WikiEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<WikiEntryType | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("entries");

  // Load entries from DB
  useEffect(() => {
    if (!filePath) { setIsLoading(false); return; }
    const load = async () => {
      const api = window.electronAPI;
      if (!api) return;

      const [entryRows, processed, arcRows] = await Promise.all([
        api.wikiGetEntries(filePath),
        api.wikiGetProcessed(filePath),
        api.wikiGetAllArcs(filePath),
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

      setIsLoading(false);

      if (entryRows.length > 0) {
        setSelectedEntryId(entryRows[0].id);
      }
    };
    load();
  }, [filePath]);

  // Load full entry when selected
  useEffect(() => {
    if (!selectedEntryId || !filePath) { setSelectedEntry(null); return; }
    fetchWikiEntry(filePath, selectedEntryId).then(setSelectedEntry);
  }, [filePath, selectedEntryId]);

  useEffect(() => { window.electronAPI?.onMaximized(setMaximized); }, []);

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
        <TitleBar title={bookTitle} maximized={maximized} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <BookOpen className="mx-auto h-8 w-8 text-white/20" strokeWidth={1.5} />
            <p className="mt-3 text-[13px] text-white/40">No wiki data yet</p>
            <p className="mt-1 text-[11px] text-white/25">
              Enable AI Wiki in the reader to start building
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-inset)]">
      <TitleBar title={`${bookTitle} — Wiki`} maximized={maximized} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="flex w-[260px] flex-col border-r border-white/[0.06] bg-[var(--bg-surface)]">
          {/* View mode toggle */}
          <div className="flex border-b border-white/[0.06] px-3 py-2 gap-1">
            <button
              onClick={() => setViewMode("entries")}
              className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                viewMode === "entries" ? "bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]" : "text-white/40 hover:text-white/60"
              }`}
            >
              Entries ({totalEntries})
            </button>
            <button
              onClick={() => setViewMode("arcs")}
              className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                viewMode === "arcs" ? "bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]" : "text-white/40 hover:text-white/60"
              }`}
            >
              Arcs ({arcs.length})
            </button>
          </div>

          {viewMode === "entries" ? (
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
                    className="flex-1 bg-transparent text-[12px] text-white/80 placeholder:text-white/25 outline-none"
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
                        <span className="text-[11px] font-medium uppercase tracking-wider text-white/30">
                          {meta.plural}
                        </span>
                        <span className="text-[11px] text-white/20">({items.length})</span>
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
                          <span className="truncate text-[12px]">{entry.name}</span>
                          {entry.significance >= 3 && (
                            <span className="ml-auto text-[10px] text-white/20">★</span>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Arc list */
            <div className="flex-1 overflow-y-auto">
              {arcs.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-[11px] text-white/30">No arcs detected yet</p>
                </div>
              ) : (
                arcs.map((arc) => (
                  <div key={arc.id} className="border-b border-white/[0.04] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-3 w-3 shrink-0 text-white/30" strokeWidth={1.5} />
                      <span className="text-[12px] font-medium text-white/70 truncate">{arc.name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-lg px-1.5 py-0.5 text-[10px] capitalize" style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}>
                        {arc.status}
                      </span>
                      <span className="text-[10px] text-white/20">{arc.arcType}</span>
                      <span className="text-[10px] text-white/20 ml-auto">
                        Ch. {arc.startChapter + 1}{arc.endChapter != null ? `–${arc.endChapter + 1}` : "+"}
                      </span>
                    </div>
                    {arc.description && (
                      <p className="mt-1 text-[11px] leading-relaxed text-white/40 line-clamp-2">
                        {arc.description}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Stats footer */}
          <div className="border-t border-white/[0.06] px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/25">
                {totalEntries} {totalEntries === 1 ? "entry" : "entries"}
              </span>
              <span className="text-[11px] text-white/25">
                {processedCount} chapters analyzed
              </span>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto bg-[var(--bg-inset)]">
          {selectedEntry ? (
            <WikiEntryView entry={selectedEntry} filePath={filePath} onEntryClick={setSelectedEntryId} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-[13px] text-white/30">Select an entry to view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Title Bar ────────────────────────────────────────── */

function TitleBar({ title, maximized }: { title: string; maximized: boolean }) {
  return (
    <div
      className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-3"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <span className="text-[12px] font-medium text-white/50">{title}</span>
      <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="flex h-6 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/60"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className="flex h-6 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/60"
        >
          <Square className="h-3 w-3" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="flex h-6 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-red-500/20 hover:text-red-400"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

/* ── Filter Chip ──────────────────────────────────────── */

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2 py-0.5 text-[11px] transition-colors ${
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
