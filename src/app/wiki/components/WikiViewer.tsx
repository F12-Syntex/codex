"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Loader2, Search, ArrowLeft,
  User, Swords, MapPin, Flame, Lightbulb,
  BookOpen, GitBranch, Clock, ChevronRight, Hash,
  Merge, Undo2, X, BarChart2, Package, Coins, Zap, Shield, Activity,
} from "lucide-react";
import { WindowHeader } from "@/components/window-header";
import type { WikiEntry, WikiEntryType, WikiArc, WikiAliasDetailed } from "@/lib/ai-wiki";
import { fmtCh, type ChapterLabels } from "@/lib/chapter-labels";
import { fetchWikiEntry } from "@/lib/ai-wiki";
import { WikiAIChat } from "./WikiAIChat";

interface WikiViewerProps {
  filePath: string;
  bookTitle: string;
  initialEntryId?: string;
}

const TYPE_META: Record<WikiEntryType, { icon: React.ReactNode; label: string; plural: string; color: string; bg: string }> = {
  character: { icon: <User className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Character", plural: "Characters", color: "rgb(147, 197, 253)", bg: "rgba(96, 165, 250, 0.12)" },
  item: { icon: <Swords className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Item", plural: "Items", color: "rgb(252, 211, 77)", bg: "rgba(251, 191, 36, 0.12)" },
  location: { icon: <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Location", plural: "Locations", color: "rgb(110, 231, 183)", bg: "rgba(52, 211, 153, 0.12)" },
  event: { icon: <Flame className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Event", plural: "Events", color: "rgb(253, 164, 175)", bg: "rgba(251, 113, 133, 0.12)" },
  concept: { icon: <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Concept", plural: "Concepts", color: "rgb(196, 181, 253)", bg: "rgba(167, 139, 250, 0.12)" },
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

/* ── Relation grouping ── */

const RELATION_GROUPS: { label: string; match: RegExp }[] = [
  { label: "Allies & Friends", match: /ally|friend|companion|comrade|partner|trusted/i },
  { label: "Family", match: /family|father|mother|brother|sister|parent|child|son|daughter|spouse|husband|wife|sibling|relative|kin/i },
  { label: "Rivals & Enemies", match: /enemy|rival|antagonist|opponent|adversary|nemesis|hostile/i },
  { label: "Mentors & Students", match: /mentor|student|teacher|master|apprentice|disciple|pupil|guide/i },
  { label: "Other", match: /.*/ },
];

/* ── Main Viewer ── */

interface MergeLogItem {
  id: number;
  source_name: string;
  target_name: string;
  merged_at: string;
}

interface MCStat {
  id: number;
  stat_key: string;
  category: string;
  display_name: string;
  value: string | null;
  is_active: boolean;
  last_chapter: number;
}

export function WikiViewer({ filePath, bookTitle, initialEntryId }: WikiViewerProps) {
  const [entries, setEntries] = useState<EntryListItem[]>([]);
  const [arcs, setArcs] = useState<WikiArc[]>([]);
  const [chapterSummaries, setChapterSummaries] = useState<ChapterSummary[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(initialEntryId ?? null);
  const [selectedEntry, setSelectedEntry] = useState<WikiEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<WikiEntryType | "all">("all");
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState<string[]>([]);
  const [mergeLog, setMergeLog] = useState<MergeLogItem[]>([]);
  const [activeView, setActiveView] = useState<"encyclopedia" | "stats">("encyclopedia");
  const [mcStats, setMcStats] = useState<MCStat[]>([]);
  const [mcEntityId, setMcEntityId] = useState<string | null>(null);
  const [mcEntry, setMcEntry] = useState<WikiEntry | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chapterLabels, setChapterLabels] = useState<ChapterLabels>({});

  // Load AI-assigned chapter labels (skips cover/TOC pages)
  useEffect(() => {
    if (!filePath) return;
    window.electronAPI?.getSetting(`chapter-labels-v2:${filePath}`).then((raw) => {
      if (!raw) return;
      try { setChapterLabels(JSON.parse(raw)); } catch { /* ignore */ }
    });
  }, [filePath]);

  const refreshData = useCallback(async () => {
    const api = window.electronAPI;
    if (!api || !filePath) return;

    const [entryRows, processed, arcRows, summaryRows, mergeLogRows, statRows, mcId] = await Promise.all([
      api.wikiGetEntries(filePath),
      api.wikiGetProcessed(filePath),
      api.wikiGetAllArcs(filePath),
      api.wikiGetAllChapterSummaries(filePath),
      api.wikiGetMergeLog(filePath),
      api.wikiGetMCStats(filePath),
      api.wikiGetMCEntityId(filePath),
    ]);

    setEntries(entryRows.map((e) => ({
      id: e.id, name: e.name, type: e.type as WikiEntryType,
      short_description: e.short_description, first_appearance: e.first_appearance,
      significance: e.significance, status: e.status,
    })));
    setProcessedCount(processed.length);
    setArcs(arcRows.map((a) => ({
      id: a.id, name: a.name, description: a.description, arcType: a.arc_type,
      status: a.status, startChapter: a.start_chapter, endChapter: a.end_chapter,
    })));
    setChapterSummaries(summaryRows.map((s) => ({
      chapter_index: s.chapter_index, summary: s.summary,
      key_events: s.key_events, mood: s.mood,
    })));
    setMergeLog(mergeLogRows.map((m) => ({
      id: m.id, source_name: m.source_name, target_name: m.target_name, merged_at: m.merged_at,
    })));
    setMcStats(statRows.map((s) => ({
      id: s.id, stat_key: s.stat_key, category: s.category,
      display_name: s.display_name, value: s.value,
      is_active: s.is_active === 1, last_chapter: s.last_chapter,
    })));
    setMcEntityId(mcId);
    setIsLoading(false);
  }, [filePath]);

  useEffect(() => {
    if (!filePath) { setIsLoading(false); return; }
    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [filePath, refreshData]);

  useEffect(() => {
    if (!selectedEntryId || !filePath) { setSelectedEntry(null); return; }
    fetchWikiEntry(filePath, selectedEntryId).then(setSelectedEntry);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [filePath, selectedEntryId, processedCount]);

  useEffect(() => {
    if (!mcEntityId || !filePath) { setMcEntry(null); return; }
    fetchWikiEntry(filePath, mcEntityId).then(setMcEntry);
  }, [filePath, mcEntityId, processedCount]);

  const navigateTo = useCallback((id: string) => {
    if (selectedEntryId) setHistory((h) => [...h, selectedEntryId!]);
    setSelectedEntryId(id);
  }, [selectedEntryId]);

  const goBack = useCallback(() => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory((h) => h.slice(0, -1));
      setSelectedEntryId(prev);
    } else {
      setSelectedEntryId(null);
      setSelectedEntry(null);
    }
  }, [history]);

  const handleMerge = useCallback(async (sourceId: string, targetId: string) => {
    const api = window.electronAPI;
    if (!api || !filePath) return;
    await api.wikiMergeEntries(filePath, sourceId, targetId);
    await refreshData();
    // Navigate to the target entry after merge
    setSelectedEntryId(targetId);
  }, [filePath, refreshData]);

  const handleUnmerge = useCallback(async (mergeLogId: number) => {
    const api = window.electronAPI;
    if (!api || !filePath) return;
    await api.wikiUnmergeEntries(filePath, mergeLogId);
    await refreshData();
  }, [filePath, refreshData]);

  const resolvedNames = useMemo(() => {
    const map = new Map<string, { name: string; type: WikiEntryType }>();
    for (const e of entries) map.set(e.id, { name: e.name, type: e.type });
    return map;
  }, [entries]);

  // Filtered entries for homepage
  const filteredEntries = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return entries.filter((e) => {
      if (filterType !== "all" && e.type !== filterType) return false;
      if (query && !e.name.toLowerCase().includes(query) && !e.short_description.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [entries, searchQuery, filterType]);

  const groupedFiltered = useMemo(() => {
    const groups: Partial<Record<WikiEntryType, EntryListItem[]>> = {};
    for (const e of filteredEntries) {
      if (!groups[e.type]) groups[e.type] = [];
      groups[e.type]!.push(e);
    }
    return groups;
  }, [filteredEntries]);

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
            <p className="mt-1 text-xs text-white/25">Enable AI Wiki in the reader to start building</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-inset)]">
      <WindowHeader icon={<BookOpen className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={1.5} />} title="Wiki" subtitle={bookTitle} zoomKey="wiki" zoom={zoom} onZoomChange={setZoom} />

      {/* Tab bar */}
      {!selectedEntry && (
        <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.04] px-4" style={{ zoom: zoom / 100 }}>
          <TabButton active={activeView === "encyclopedia"} onClick={() => setActiveView("encyclopedia")}>
            <BookOpen className="h-3 w-3" strokeWidth={1.5} />
            Encyclopedia
          </TabButton>
          <TabButton active={activeView === "stats"} onClick={() => setActiveView("stats")}>
            <BarChart2 className="h-3 w-3" strokeWidth={1.5} />
            Stats
          </TabButton>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden" style={{ zoom: zoom / 100 }}>
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto"
          style={{
            paddingBottom: chatOpen && !chatExpanded
              ? "clamp(280px, 45%, 420px)"
              : undefined,
          }}
        >
          {selectedEntry ? (
            <EntryPage
              entry={selectedEntry}
              allEntries={entries}
              resolvedNames={resolvedNames}
              onNavigate={navigateTo}
              onBack={goBack}
              onMerge={handleMerge}
              canGoBack
              chapterLabels={chapterLabels}
            />
          ) : activeView === "stats" ? (
            <StatsPage
              mcEntry={mcEntry}
              mcStats={mcStats}
              onNavigateToMC={mcEntityId ? () => navigateTo(mcEntityId) : undefined}
              chapterLabels={chapterLabels}
            />
          ) : (
            <HomePage
              bookTitle={bookTitle}
              entries={entries}
              filteredEntries={filteredEntries}
              groupedFiltered={groupedFiltered}
              arcs={arcs}
              chapterSummaries={chapterSummaries}
              processedCount={processedCount}
              mergeLog={mergeLog}
              searchQuery={searchQuery}
              filterType={filterType}
              onSearchChange={setSearchQuery}
              onFilterChange={setFilterType}
              onEntryClick={navigateTo}
              onUnmerge={handleUnmerge}
              chapterLabels={chapterLabels}
            />
          )}
        </div>

        <WikiAIChat
          filePath={filePath}
          bookTitle={bookTitle}
          onEntryClick={navigateTo}
          chapterLabels={chapterLabels}
          onOpenChange={(open, expanded) => { setChatOpen(open); setChatExpanded(expanded); }}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB BUTTON
   ══════════════════════════════════════════════════════════ */

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs transition-colors ${
        active
          ? "border-[var(--accent-brand)] font-medium text-[var(--accent-brand)]"
          : "border-transparent text-white/35 hover:text-white/55"
      }`}
    >
      {children}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   STATS PAGE — MC profile + stats reference
   ══════════════════════════════════════════════════════════ */

const STAT_CATEGORY_META: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  attributes: { icon: <Shield className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Attributes", color: "rgb(147, 197, 253)", bg: "rgba(96, 165, 250, 0.12)" },
  skills: { icon: <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Skills", color: "rgb(196, 181, 253)", bg: "rgba(167, 139, 250, 0.12)" },
  inventory: { icon: <Package className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Inventory", color: "rgb(110, 231, 183)", bg: "rgba(52, 211, 153, 0.12)" },
  currency: { icon: <Coins className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Currency", color: "rgb(252, 211, 77)", bg: "rgba(251, 191, 36, 0.12)" },
  status: { icon: <Activity className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Status Effects", color: "rgb(253, 164, 175)", bg: "rgba(251, 113, 133, 0.12)" },
  other: { icon: <BarChart2 className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Other", color: "rgb(255,255,255)", bg: "rgba(255,255,255,0.06)" },
};

const STAT_CATEGORY_ORDER = ["attributes", "skills", "inventory", "currency", "status", "other"];

function StatsPage({ mcEntry, mcStats, onNavigateToMC, chapterLabels }: {
  mcEntry: WikiEntry | null;
  mcStats: MCStat[];
  onNavigateToMC?: () => void;
  chapterLabels: ChapterLabels;
}) {
  const activeStats = mcStats.filter((s) => s.is_active);
  const inactiveStats = mcStats.filter((s) => !s.is_active);

  const groupedActive = useMemo(() => {
    const groups: Partial<Record<string, MCStat[]>> = {};
    for (const stat of activeStats) {
      const cat = stat.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat]!.push(stat);
    }
    return groups;
  }, [activeStats]);

  if (mcStats.length === 0 && !mcEntry) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <BarChart2 className="mx-auto h-8 w-8 text-white/20" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-white/40">No stats tracked yet</p>
          <p className="mt-1 text-xs text-white/25">Stats appear as the AI processes chapters</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6">
      {/* MC Profile Card */}
      {mcEntry && (
        <section className="mb-8">
          <SectionHeader icon={<User className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Protagonist" color="rgb(147, 197, 253)" />
          <button
            onClick={onNavigateToMC}
            className="mt-3 group w-full rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] p-4 text-left transition-all hover:border-white/[0.12] hover:bg-white/[0.04]"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg" style={{ background: TYPE_META.character.bg }}>
                <User className="h-5 w-5" strokeWidth={1.5} style={{ color: TYPE_META.character.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/85 group-hover:text-white/95">{mcEntry.name}</span>
                  {mcEntry.significance >= 3 && <span className="text-xs text-amber-400/60">{"★".repeat(mcEntry.significance)}</span>}
                  <span className="ml-auto rounded-lg px-1.5 py-0.5 text-xs capitalize" style={{ background: "var(--bg-inset)", color: "rgba(255,255,255,0.35)" }}>
                    {mcEntry.status}
                  </span>
                </div>
                {mcEntry.aliases.filter((a) => a.relevance >= 4).length > 0 && (
                  <p className="mt-0.5 text-xs text-white/25">aka {mcEntry.aliases.filter((a) => a.relevance >= 4).slice(0, 5).map((a) => a.alias).join(", ")}</p>
                )}
                <p className="mt-1.5 text-xs leading-relaxed text-white/50">{mcEntry.shortDescription}</p>
                {mcEntry.description && (
                  <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-white/35">{mcEntry.description}</p>
                )}
              </div>
              <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-white/15 transition-colors group-hover:text-white/40" strokeWidth={1.5} />
            </div>
          </button>
        </section>
      )}

      {/* Stat categories */}
      {STAT_CATEGORY_ORDER.map((cat) => {
        const items = groupedActive[cat];
        if (!items || items.length === 0) return null;
        const meta = STAT_CATEGORY_META[cat] ?? STAT_CATEGORY_META.other;
        return (
          <section key={cat} className="mb-6">
            <SectionHeader icon={meta.icon} label={meta.label} color={meta.color} />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map((stat) => (
                <div key={stat.stat_key} className="rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: meta.bg }}>
                      <span style={{ color: meta.color }}>{meta.icon}</span>
                    </div>
                    <span className="truncate text-xs font-medium text-white/70">{stat.display_name}</span>
                  </div>
                  {stat.value && (
                    <p className="mt-1.5 text-sm font-semibold" style={{ color: meta.color }}>{stat.value}</p>
                  )}
                  <p className="mt-0.5 text-xs text-white/20">Ch. {fmtCh(stat.last_chapter, chapterLabels) ?? stat.last_chapter + 1}</p>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {/* Also check any categories not in the default order */}
      {Object.entries(groupedActive)
        .filter(([cat]) => !STAT_CATEGORY_ORDER.includes(cat))
        .map(([cat, items]) => {
          if (!items || items.length === 0) return null;
          const meta = STAT_CATEGORY_META.other;
          return (
            <section key={cat} className="mb-6">
              <SectionHeader icon={meta.icon} label={cat.charAt(0).toUpperCase() + cat.slice(1)} color={meta.color} />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((stat) => (
                  <div key={stat.stat_key} className="rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] p-3">
                    <span className="truncate text-xs font-medium text-white/70">{stat.display_name}</span>
                    {stat.value && (
                      <p className="mt-1.5 text-sm font-semibold text-white/60">{stat.value}</p>
                    )}
                    <p className="mt-0.5 text-xs text-white/20">Ch. {fmtCh(stat.last_chapter, chapterLabels) ?? stat.last_chapter + 1}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

      {/* Lost/consumed items */}
      {inactiveStats.length > 0 && (
        <section className="mb-8">
          <SectionHeader icon={<X className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Lost / Consumed" color="rgba(255,255,255,0.2)" />
          <div className="mt-3 flex flex-wrap gap-2">
            {inactiveStats.map((stat) => (
              <div key={stat.stat_key} className="flex items-center gap-1.5 rounded-lg border border-white/[0.04] bg-[var(--bg-surface)] px-2.5 py-1.5">
                <span className="text-xs text-white/25 line-through">{stat.display_name}</span>
                {stat.value && <span className="text-xs text-white/15">{stat.value}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="h-16" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   HOME PAGE — Fandom-style landing with cards
   ══════════════════════════════════════════════════════════ */

function HomePage({
  bookTitle, entries, filteredEntries, groupedFiltered, arcs, chapterSummaries,
  processedCount, mergeLog, searchQuery, filterType, onSearchChange, onFilterChange, onEntryClick, onUnmerge, chapterLabels,
}: {
  bookTitle: string;
  entries: EntryListItem[];
  filteredEntries: EntryListItem[];
  groupedFiltered: Partial<Record<WikiEntryType, EntryListItem[]>>;
  arcs: WikiArc[];
  chapterSummaries: ChapterSummary[];
  processedCount: number;
  mergeLog: MergeLogItem[];
  searchQuery: string;
  filterType: WikiEntryType | "all";
  onSearchChange: (q: string) => void;
  onFilterChange: (t: WikiEntryType | "all") => void;
  onEntryClick: (id: string) => void;
  onUnmerge: (mergeLogId: number) => void;
  chapterLabels: ChapterLabels;
}) {
  const mainCharacters = entries.filter((e) => e.type === "character" && e.significance >= 3).slice(0, 6);
  const recentEntries = [...entries].sort((a, b) => b.first_appearance - a.first_appearance).slice(0, 8);

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-sm font-bold tracking-tight text-white/90">{bookTitle}</h1>
        <p className="mt-1 text-xs text-white/30">
          {entries.length} entries &middot; {processedCount} chapters analyzed &middot; {arcs.length} story arcs
        </p>
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-white/25" strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Search entries..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none"
          />
          {searchQuery && (
            <span className="text-xs text-white/25">{filteredEntries.length} results</span>
          )}
        </div>
        {/* Filter chips */}
        <div className="mt-2 flex flex-wrap gap-1">
          <FilterChip label="All" count={entries.length} active={filterType === "all"} onClick={() => onFilterChange("all")} />
          {TYPE_ORDER.map((type) => {
            const count = entries.filter((e) => e.type === type).length;
            if (count === 0) return null;
            return <FilterChip key={type} label={TYPE_META[type].plural} count={count} active={filterType === type} onClick={() => onFilterChange(type)} icon={TYPE_META[type].icon} color={TYPE_META[type].color} />;
          })}
        </div>
      </div>

      {/* If searching/filtering, show flat results */}
      {(searchQuery || filterType !== "all") ? (
        <div className="space-y-6">
          {TYPE_ORDER.map((type) => {
            const items = groupedFiltered[type];
            if (!items || items.length === 0) return null;
            const meta = TYPE_META[type];
            return (
              <div key={type}>
                <div className="mb-2 flex items-center gap-1.5">
                  <span style={{ color: meta.color }}>{meta.icon}</span>
                  <span className="text-xs font-medium uppercase tracking-wider text-white/30">{meta.plural}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map((e) => (
                    <EntryCard key={e.id} entry={e} onClick={() => onEntryClick(e.id)} />
                  ))}
                </div>
              </div>
            );
          })}
          {filteredEntries.length === 0 && (
            <p className="py-12 text-center text-xs text-white/30">No entries match your search</p>
          )}
        </div>
      ) : (
        <>
          {/* Main Characters spotlight */}
          {mainCharacters.length > 0 && (
            <section className="mb-8">
              <SectionHeader icon={<User className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Main Characters" color="rgb(147, 197, 253)" />
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {mainCharacters.map((e) => (
                  <button key={e.id} onClick={() => onEntryClick(e.id)} className="group rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] p-3 text-left transition-all hover:border-white/[0.12] hover:bg-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: TYPE_META.character.bg }}>
                        <User className="h-4 w-4" strokeWidth={1.5} style={{ color: TYPE_META.character.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white/80 group-hover:text-white/95">{e.name}</p>
                        <p className="truncate text-xs text-white/30">{e.status}</p>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/40">{e.short_description}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Recently introduced */}
          {recentEntries.length > 0 && (
            <section className="mb-8">
              <SectionHeader icon={<Clock className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Recently Introduced" color="rgb(196, 181, 253)" />
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {recentEntries.map((e) => (
                  <EntryCard key={e.id} entry={e} onClick={() => onEntryClick(e.id)} showChapter />
                ))}
              </div>
            </section>
          )}

          {/* Story Arcs */}
          {arcs.length > 0 && (
            <section className="mb-8">
              <SectionHeader icon={<GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Story Arcs" color="rgb(252, 211, 77)" />
              <div className="mt-3 space-y-2">
                {arcs.map((arc) => (
                  <div key={arc.id} className="rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white/70">{arc.name}</span>
                      <span className="rounded-lg px-1.5 py-0.5 text-xs capitalize" style={{ background: arc.status === "active" ? "rgba(52, 211, 153, 0.12)" : "var(--bg-inset)", color: arc.status === "active" ? "rgb(110, 231, 183)" : "var(--text-muted, rgba(255,255,255,0.3))" }}>
                        {arc.status}
                      </span>
                      <span className="ml-auto text-xs tabular-nums text-white/20">
                        Ch. {arc.startChapter + 1}{arc.endChapter != null ? `–${arc.endChapter + 1}` : "+"}
                      </span>
                    </div>
                    {arc.description && (
                      <p className="mt-1.5 text-xs leading-relaxed text-white/40">{arc.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Chapter Timeline */}
          {chapterSummaries.length > 0 && (
            <section className="mb-8">
              <SectionHeader icon={<Hash className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Chapter Timeline" color="rgb(253, 164, 175)" />
              <div className="mt-3 space-y-2">
                {chapterSummaries
                  .filter((ch) => Object.keys(chapterLabels).length === 0 || ch.chapter_index in chapterLabels)
                  .map((ch) => (
                    <ChapterRow key={ch.chapter_index} chapter={ch} chapterLabels={chapterLabels} />
                  ))}
              </div>
            </section>
          )}

          {/* All entries by type */}
          {TYPE_ORDER.map((type) => {
            const items = entries.filter((e) => e.type === type);
            if (items.length === 0) return null;
            const meta = TYPE_META[type];
            // Skip characters if already shown in spotlight
            if (type === "character" && mainCharacters.length > 0) {
              const others = items.filter((e) => e.significance < 3);
              if (others.length === 0) return null;
              return (
                <section key={type} className="mb-8">
                  <SectionHeader icon={meta.icon} label={`Other ${meta.plural}`} color={meta.color} />
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {others.map((e) => <EntryCard key={e.id} entry={e} onClick={() => onEntryClick(e.id)} />)}
                  </div>
                </section>
              );
            }
            return (
              <section key={type} className="mb-8">
                <SectionHeader icon={meta.icon} label={meta.plural} color={meta.color} />
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map((e) => <EntryCard key={e.id} entry={e} onClick={() => onEntryClick(e.id)} />)}
                </div>
              </section>
            );
          })}
        </>
      )}

      {/* Merge log */}
      {mergeLog.length > 0 && !searchQuery && filterType === "all" && (
        <section className="mb-8">
          <SectionHeader icon={<Merge className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Merged Entries" color="rgb(196, 181, 253)" />
          <div className="mt-3 space-y-1.5">
            {mergeLog.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white/50">
                    <span className="text-white/70">{m.source_name}</span>
                    {" merged into "}
                    <span className="text-white/70">{m.target_name}</span>
                  </p>
                </div>
                <button
                  onClick={() => onUnmerge(m.id)}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
                  title="Undo merge"
                >
                  <Undo2 className="h-3 w-3" strokeWidth={1.5} />
                  Undo
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="h-16" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ENTRY PAGE — Fandom-style article for a single entity
   ══════════════════════════════════════════════════════════ */

function EntryPage({
  entry, allEntries, resolvedNames, onNavigate, onBack, onMerge, canGoBack, chapterLabels,
}: {
  entry: WikiEntry;
  allEntries: EntryListItem[];
  resolvedNames: Map<string, { name: string; type: WikiEntryType }>;
  onNavigate: (id: string) => void;
  onBack: () => void;
  onMerge: (sourceId: string, targetId: string) => void;
  canGoBack: boolean;
  chapterLabels: ChapterLabels;
}) {
  const [showMergePicker, setShowMergePicker] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const mergeRef = useRef<HTMLDivElement>(null);

  // Close merge picker on click outside
  useEffect(() => {
    if (!showMergePicker) return;
    const handler = (e: MouseEvent) => {
      if (mergeRef.current && !mergeRef.current.contains(e.target as Node)) setShowMergePicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMergePicker]);

  const mergeTargets = useMemo(() => {
    const q = mergeSearch.toLowerCase().trim();
    return allEntries
      .filter((e) => e.id !== entry.id && e.type === entry.type)
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [allEntries, entry.id, entry.type, mergeSearch]);
  const meta = TYPE_META[entry.type];

  // Split details: active (relevance >= 2, not superseded) vs archived
  const activeDetails = entry.details.filter((d) => !d.isSuperseded && d.relevance >= 2);
  const archivedDetails = entry.details.filter((d) => d.isSuperseded || d.relevance < 2);

  const detailsByCategory: Record<string, { chapterIndex: number; content: string; relevance: number }[]> = {};
  for (const d of activeDetails) {
    const cat = d.category || "info";
    if (!detailsByCategory[cat]) detailsByCategory[cat] = [];
    detailsByCategory[cat].push({ chapterIndex: d.chapterIndex, content: d.content, relevance: d.relevance });
  }
  for (const items of Object.values(detailsByCategory)) {
    items.sort((a, b) => b.relevance - a.relevance || a.chapterIndex - b.chapterIndex);
  }

  const archivedByCategory: Record<string, { chapterIndex: number; content: string; isSuperseded: boolean }[]> = {};
  for (const d of archivedDetails) {
    const cat = d.category || "info";
    if (!archivedByCategory[cat]) archivedByCategory[cat] = [];
    archivedByCategory[cat].push({ chapterIndex: d.chapterIndex, content: d.content, isSuperseded: d.isSuperseded });
  }

  // Primary aliases: names/titles with high relevance (≥4), capped at 8
  // Everything else goes to the historical/archive section
  const primaryAliases = entry.aliases
    .filter((a) => a.relevance >= 4)
    .slice(0, 8);
  const historicalAliases = entry.aliases.filter((a) => a.relevance < 4);

  // Group relationships
  const deduped = new Map<string, { targetId: string; relation: string; since: number }>();
  for (const rel of entry.relationships) {
    const existing = deduped.get(rel.targetId);
    if (!existing || rel.since > existing.since) deduped.set(rel.targetId, rel);
  }
  const uniqueRels = Array.from(deduped.values());
  const relGroups: { label: string; rels: typeof uniqueRels }[] = [];
  const assigned = new Set<string>();
  for (const group of RELATION_GROUPS) {
    const matching = uniqueRels.filter((r) => !assigned.has(r.targetId) && group.match.test(r.relation));
    if (matching.length > 0) {
      relGroups.push({ label: group.label, rels: matching });
      for (const r of matching) assigned.add(r.targetId);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6">
      {/* Back + merge buttons */}
      <div className="mb-4 flex items-center gap-2">
        {canGoBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/50">
            <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
            Back
          </button>
        )}
        <div className="relative ml-auto" ref={mergeRef}>
          <button
            onClick={() => { setShowMergePicker(!showMergePicker); setMergeSearch(""); }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/50"
          >
            <Merge className="h-3 w-3" strokeWidth={1.5} />
            Merge into...
          </button>
          {showMergePicker && (
            <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-white/[0.08] bg-[var(--bg-overlay)] p-2 shadow-lg shadow-black/40 backdrop-blur-xl">
              <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5">
                <Search className="h-3 w-3 shrink-0 text-white/25" strokeWidth={1.5} />
                <input
                  type="text"
                  autoFocus
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                  placeholder={`Search ${TYPE_META[entry.type].plural.toLowerCase()}...`}
                  className="flex-1 bg-transparent text-xs text-white/70 placeholder:text-white/25 outline-none"
                />
                <button onClick={() => setShowMergePicker(false)} className="text-white/20 hover:text-white/40">
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              </div>
              <div className="mt-1.5 max-h-48 overflow-y-auto">
                {mergeTargets.length === 0 ? (
                  <p className="py-3 text-center text-xs text-white/25">No matching entries</p>
                ) : mergeTargets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { onMerge(entry.id, t.id); setShowMergePicker(false); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.06]"
                  >
                    <span style={{ color: TYPE_META[t.type].color }}>{TYPE_META[t.type].icon}</span>
                    <span className="truncate text-white/60">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Article header */}
      <div className="mb-6 flex gap-4">
        {/* Type icon */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg" style={{ background: meta.bg }}>
          <span style={{ color: meta.color }}>{meta.icon}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-lg px-1.5 py-0.5 text-xs font-medium" style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
            <span className="rounded-lg px-1.5 py-0.5 text-xs capitalize" style={{ background: "var(--bg-surface)" }}>
              <span className="text-white/35">{entry.status}</span>
            </span>
            {entry.significance >= 3 && (
              <span className="text-xs text-amber-400/60">{"★".repeat(entry.significance)}</span>
            )}
          </div>
          <h1 className="mt-1 text-sm font-bold tracking-tight text-white/90">{entry.name}</h1>
          {primaryAliases.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {primaryAliases.map((a) => (
                <span key={a.alias} className="inline-flex items-center gap-1 rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/40">
                  {a.alias}
                  {a.alias_type !== "name" && <span className="text-white/20">{a.alias_type}</span>}
                </span>
              ))}
              {historicalAliases.length > 0 && (
                <span className="inline-flex items-center rounded border border-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/20">
                  +{historicalAliases.length} historical
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick info bar */}
      <div className="mb-6 flex flex-wrap gap-2">
        <InfoPill icon={<Clock className="h-3 w-3" strokeWidth={1.5} />} label={`First: Ch. ${fmtCh(entry.firstAppearance, chapterLabels)}`} />
        <InfoPill icon={<BookOpen className="h-3 w-3" strokeWidth={1.5} />} label={`${entry.chapterAppearances.length} ${entry.chapterAppearances.length === 1 ? "chapter" : "chapters"}`} />
        {uniqueRels.length > 0 && (
          <InfoPill icon={<User className="h-3 w-3" strokeWidth={1.5} />} label={`${uniqueRels.length} ${uniqueRels.length === 1 ? "connection" : "connections"}`} />
        )}
      </div>

      {/* Short description */}
      <p className="mb-6 text-sm leading-relaxed text-white/60">{entry.shortDescription}</p>

      <div className="h-px bg-white/[0.06]" />

      {/* Two-column layout: main content + sidebar info */}
      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* Main column */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* Overview */}
          {entry.description && (
            <ArticleSection title="Overview">
              <p className="text-sm leading-relaxed text-white/55 whitespace-pre-wrap">{entry.description}</p>
            </ArticleSection>
          )}

          {/* Details by category */}
          {Object.entries(detailsByCategory).map(([category, items]) => (
            <ArticleSection key={category} title={formatCategory(category)}>
              <div className="space-y-1.5">
                {items.map((item, i) => (
                  <div key={i} className="flex gap-3 rounded-lg bg-[var(--bg-surface)] px-3 py-2">
                    <span className="shrink-0 rounded-lg px-1.5 py-0.5 text-xs tabular-nums font-medium" style={{ background: meta.bg, color: meta.color }}>
                      {fmtCh(item.chapterIndex, chapterLabels)}
                    </span>
                    <p className="text-xs leading-relaxed text-white/55">{item.content}</p>
                  </div>
                ))}
              </div>
            </ArticleSection>
          ))}

          {/* Archive — superseded / low-relevance details */}
          {Object.keys(archivedByCategory).length > 0 && (
            <ArchivedDetailsSection archivedByCategory={archivedByCategory} metaBg={meta.bg} metaColor={meta.color} chapterLabels={chapterLabels} />
          )}

          {/* Historical aliases */}
          {historicalAliases.length > 0 && (
            <HistoricalAliasesSection aliases={historicalAliases} />
          )}

          {/* Relationships */}
          {relGroups.length > 0 && (
            <ArticleSection title="Relationships">
              <div className="space-y-4">
                {relGroups.map((group) => (
                  <div key={group.label}>
                    <span className="text-xs font-medium text-white/25">{group.label}</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {group.rels.map((rel) => {
                        const target = resolvedNames.get(rel.targetId);
                        const targetName = target?.name ?? rel.targetId.replace(/-/g, " ");
                        const targetMeta = target ? TYPE_META[target.type] : null;
                        return (
                          <button
                            key={rel.targetId}
                            onClick={() => onNavigate(rel.targetId)}
                            className="group flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] px-2.5 py-1.5 text-left transition-all hover:border-white/[0.12] hover:bg-white/[0.06]"
                          >
                            {targetMeta && (
                              <span style={{ color: targetMeta.color }}>{targetMeta.icon}</span>
                            )}
                            <span className="text-xs font-medium text-white/70 group-hover:text-white/90">{targetName}</span>
                            <span className="text-xs text-white/20">{rel.relation}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ArticleSection>
          )}
        </div>

        {/* Sidebar infobox */}
        <div className="w-full shrink-0 lg:w-[220px]">
          <div className="rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] overflow-hidden lg:sticky lg:top-6">
            {/* Infobox header */}
            <div className="px-3 py-2" style={{ background: meta.bg }}>
              <span className="text-xs font-medium" style={{ color: meta.color }}>{meta.label} Info</span>
            </div>
            <div className="divide-y divide-white/[0.04] px-3">
              <InfoRow label="Status" value={entry.status} />
              <InfoRow label="First seen" value={`Chapter ${entry.firstAppearance + 1}`} />
              <InfoRow label="Appearances" value={`${entry.chapterAppearances.length}`} />
              <InfoRow label="Significance" value={entry.significance >= 3 ? "★".repeat(entry.significance) : `${entry.significance}/5`} />
              {primaryAliases.length > 0 && (
                <InfoRow label="Names" value={primaryAliases.map((a) => a.alias).join(", ")} />
              )}
              {historicalAliases.length > 0 && (
                <InfoRow label="Other refs" value={`${historicalAliases.length} contextual`} />
              )}
            </div>
            {/* Chapter appearances */}
            <div className="border-t border-white/[0.04] px-3 py-2">
              <span className="text-xs text-white/25">Chapters</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {entry.chapterAppearances.map((ch) => (
                  <span key={ch} className="rounded-lg px-1.5 py-0.5 text-xs tabular-nums" style={{ background: meta.bg, color: meta.color }}>
                    {ch + 1}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="h-16" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ══════════════════════════════════════════════════════════ */

function EntryCard({ entry, onClick, showChapter }: { entry: EntryListItem; onClick: () => void; showChapter?: boolean }) {
  const meta = TYPE_META[entry.type];
  return (
    <button onClick={onClick} className="group flex items-start gap-3 rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] p-3 text-left transition-all hover:border-white/[0.12] hover:bg-white/[0.04]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: meta.bg }}>
        <span style={{ color: meta.color }}>{meta.icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-white/70 group-hover:text-white/90">{entry.name}</span>
          {showChapter && <span className="shrink-0 text-xs tabular-nums text-white/20">Ch. {entry.first_appearance + 1}</span>}
          {entry.significance >= 3 && <span className="shrink-0 text-xs text-amber-400/50">★</span>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/35">{entry.short_description}</p>
      </div>
      <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-white/10 transition-colors group-hover:text-white/30" strokeWidth={1.5} />
    </button>
  );
}

function SectionHeader({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color }}>{icon}</span>
      <span className="text-xs font-medium uppercase tracking-wider" style={{ color }}>{label}</span>
      <div className="h-px flex-1" style={{ background: `${color}20` }} />
    </div>
  );
}

function ArticleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/30">{title}</h3>
      {children}
    </div>
  );
}

function InfoPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-white/40">
      {icon}
      {label}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <span className="text-xs text-white/30">{label}</span>
      <span className="text-right text-xs text-white/55">{value}</span>
    </div>
  );
}

function ArchivedDetailsSection({
  archivedByCategory,
  metaBg,
  metaColor,
  chapterLabels,
}: {
  archivedByCategory: Record<string, { chapterIndex: number; content: string; isSuperseded: boolean }[]>;
  metaBg: string;
  metaColor: string;
  chapterLabels: ChapterLabels;
}) {
  const [open, setOpen] = useState(false);
  const totalCount = Object.values(archivedByCategory).reduce((n, arr) => n + arr.length, 0);
  return (
    <div className="rounded-lg border border-white/[0.04] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-white/25 hover:text-white/40 transition-colors"
      >
        <span>{totalCount} archived / superseded entr{totalCount === 1 ? "y" : "ies"}</span>
        <span className="text-white/15">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-white/[0.04] px-3 py-3 space-y-4">
          {Object.entries(archivedByCategory).map(([cat, items]) => (
            <div key={cat}>
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/20">{cat.replace(/_/g, " ")}</p>
              <div className="space-y-1">
                {items.map((item, i) => (
                  <div key={i} className="flex gap-3 rounded-lg bg-white/[0.02] px-3 py-2 opacity-50">
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-xs tabular-nums" style={{ background: metaBg, color: metaColor, opacity: 0.6 }}>
                      {fmtCh(item.chapterIndex, chapterLabels)}
                    </span>
                    <p className="text-xs leading-relaxed text-white/35 line-through decoration-white/20">
                      {item.content}
                    </p>
                    {item.isSuperseded && (
                      <span className="ml-auto shrink-0 text-[9px] text-amber-400/40">superseded</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoricalAliasesSection({ aliases }: { aliases: WikiAliasDetailed[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-white/[0.04] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-white/25 hover:text-white/40 transition-colors"
      >
        <span>{aliases.length} contextual / historical reference{aliases.length !== 1 ? "s" : ""}</span>
        <span className="text-white/15">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-white/[0.04] px-3 py-3 flex flex-wrap gap-1.5">
          {aliases.map((a) => (
            <span key={a.alias} className="inline-flex items-center gap-1 rounded border border-white/[0.04] bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-white/30">
              {a.alias}
              <span className="text-white/15">{a.alias_type}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, count, active, onClick, icon, color }: { label: string; count: number; active: boolean; onClick: () => void; icon?: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors ${
        active
          ? "bg-[var(--accent-brand)]/15 font-medium text-[var(--accent-brand)]"
          : "text-white/35 hover:bg-white/[0.04] hover:text-white/55"
      }`}
    >
      {icon && !active && <span style={{ color: color ?? "inherit" }}>{icon}</span>}
      {label}
      <span className="tabular-nums opacity-50">{count}</span>
    </button>
  );
}

function ChapterRow({ chapter, chapterLabels }: { chapter: ChapterSummary; chapterLabels: ChapterLabels }) {
  let events: string[] = [];
  try { events = JSON.parse(chapter.key_events); } catch { /* ignore */ }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] p-3">
      <div className="flex items-center gap-2">
        <span className="rounded-lg px-1.5 py-0.5 text-xs font-medium tabular-nums" style={{ background: "rgba(253, 164, 175, 0.12)", color: "rgb(253, 164, 175)" }}>
          {fmtCh(chapter.chapter_index, chapterLabels)}
        </span>
        <MoodBadge mood={chapter.mood} />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-white/45">{chapter.summary}</p>
      {events.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {events.map((ev, i) => (
            <span key={i} className="rounded-lg bg-white/[0.04] px-1.5 py-0.5 text-xs text-white/25">
              {ev.replace(/-/g, " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MoodBadge({ mood }: { mood: string }) {
  if (!mood) return null;
  const MOOD_COLORS: Record<string, string> = { tension: "rgba(251, 113, 133, 0.15)", action: "rgba(251, 191, 36, 0.15)", calm: "rgba(52, 211, 153, 0.15)", mystery: "rgba(167, 139, 250, 0.15)", revelation: "rgba(96, 165, 250, 0.15)" };
  const MOOD_TEXT: Record<string, string> = { tension: "rgba(253, 164, 175, 0.9)", action: "rgba(252, 211, 77, 0.9)", calm: "rgba(110, 231, 183, 0.9)", mystery: "rgba(196, 181, 253, 0.9)", revelation: "rgba(147, 197, 253, 0.9)" };
  return (
    <span className="rounded-lg px-1.5 py-0.5 text-xs font-medium capitalize" style={{ background: MOOD_COLORS[mood] ?? "var(--bg-inset)", color: MOOD_TEXT[mood] ?? "var(--text-muted)" }}>
      {mood}
    </span>
  );
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
