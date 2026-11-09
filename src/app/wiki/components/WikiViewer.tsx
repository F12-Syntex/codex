"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, ArrowLeft,
  User, Swords, MapPin, Flame, Lightbulb,
  BookOpen, GitBranch, Clock, ChevronRight, ChevronDown, Hash,
  Merge, Undo2, X, BarChart2, Package, Coins, Zap, Shield, Activity,
  Quote, Sparkles,
} from "lucide-react";
import { WindowChrome, WindowShell } from "@/components/ui/window-chrome";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { BlurFade } from "@/components/ui/blur-fade";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import type { WikiEntry, WikiEntryType, WikiArc, WikiAliasDetailed } from "@/lib/ai-wiki";
import { fmtCh, type ChapterLabels } from "@/lib/chapter-labels";
import { fetchWikiEntry } from "@/lib/ai-wiki";
import { WikiAIChat } from "./WikiAIChat";
import { RelationshipGraph } from "./RelationshipGraph";
import { WikiSidebar, WikiSidebarSkeleton, EntityAvatar, type WikiView } from "./WikiSidebar";

interface WikiViewerProps {
  filePath: string;
  bookTitle: string;
  initialEntryId?: string;
}

const TYPE_META: Record<WikiEntryType, { icon: React.ReactNode; label: string; plural: string; color: string; bg: string }> = {
  character: { icon: <User className="size-3.5" strokeWidth={1.75} />, label: "Character", plural: "Characters", color: "rgb(147, 197, 253)", bg: "rgba(96, 165, 250, 0.12)" },
  item: { icon: <Swords className="size-3.5" strokeWidth={1.75} />, label: "Item", plural: "Items", color: "rgb(252, 211, 77)", bg: "rgba(251, 191, 36, 0.12)" },
  location: { icon: <MapPin className="size-3.5" strokeWidth={1.75} />, label: "Location", plural: "Locations", color: "rgb(110, 231, 183)", bg: "rgba(52, 211, 153, 0.12)" },
  event: { icon: <Flame className="size-3.5" strokeWidth={1.75} />, label: "Event", plural: "Events", color: "rgb(253, 164, 175)", bg: "rgba(251, 113, 133, 0.12)" },
  concept: { icon: <Lightbulb className="size-3.5" strokeWidth={1.75} />, label: "Concept", plural: "Concepts", color: "rgb(196, 181, 253)", bg: "rgba(167, 139, 250, 0.12)" },
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
  const [activeView, setActiveView] = useState<WikiView>("encyclopedia");
  const [processedChapters, setProcessedChapters] = useState<number[]>([]);
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

    setEntries((entryRows ?? []).map((e) => ({
      id: e.id, name: e.name, type: e.type as WikiEntryType,
      short_description: e.short_description, first_appearance: e.first_appearance,
      significance: e.significance, status: e.status,
    })));
    setProcessedCount((processed ?? []).length);
    setProcessedChapters(processed ?? []);
    setArcs((arcRows ?? []).map((a) => ({
      id: a.id, name: a.name, description: a.description, arcType: a.arc_type,
      status: a.status, startChapter: a.start_chapter, endChapter: a.end_chapter,
    })));
    setChapterSummaries((summaryRows ?? []).map((s) => ({
      chapter_index: s.chapter_index, summary: s.summary,
      key_events: s.key_events, mood: s.mood,
    })));
    setMergeLog((mergeLogRows ?? []).map((m) => ({
      id: m.id, source_name: m.source_name, target_name: m.target_name, merged_at: m.merged_at,
    })));
    setMcStats((statRows ?? []).map((s) => ({
      id: s.id, stat_key: s.stat_key, category: s.category,
      display_name: s.display_name, value: s.value,
      is_active: s.is_active === 1, last_chapter: s.last_chapter,
    })));
    setMcEntityId(mcId ?? null);
    setIsLoading(false);
  }, [filePath]);

  useEffect(() => {
    if (!filePath) { setIsLoading(false); return; }
    window.electronAPI?.wikiPurgeNullEntries(filePath).catch(() => {});
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

  // Sidebar: switching section returns from an open article
  const selectView = useCallback((view: WikiView) => {
    setSelectedEntryId(null);
    setSelectedEntry(null);
    setActiveView(view);
  }, []);

  const chrome = (
    <WindowChrome icon={<BookOpen strokeWidth={1.75} />} title="Wiki" subtitle={bookTitle} zoomKey="wiki" zoom={zoom} onZoomChange={setZoom} />
  );

  if (isLoading) {
    return (
      <WindowShell>
        {chrome}
        <div className="flex min-h-0 flex-1 gap-2 p-2" style={{ zoom: zoom / 100 }}>
          <WikiSidebarSkeleton />
          <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand animate-pop-in">
              <BookOpen className="size-5" strokeWidth={1.75} />
            </div>
            <ShimmerText className="text-sm">Opening the wiki…</ShimmerText>
          </main>
        </div>
      </WindowShell>
    );
  }

  if (totalEntries === 0) {
    return (
      <WindowShell>
        {chrome}
        <div className="flex min-h-0 flex-1 items-center justify-center p-8" style={{ zoom: zoom / 100 }}>
          <EmptyWiki bookTitle={bookTitle} />
        </div>
      </WindowShell>
    );
  }

  const contentKey = selectedEntry ? `entry:${selectedEntry.id}` : activeView;

  return (
    <WindowShell>
      {chrome}

      <div className="flex min-h-0 flex-1 gap-2 p-2" style={{ zoom: zoom / 100 }}>
        <WikiSidebar
          typeMeta={TYPE_META}
          typeOrder={TYPE_ORDER}
          entries={entries}
          groupedFiltered={groupedFiltered}
          filteredCount={filteredEntries.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterType={filterType}
          onFilterChange={setFilterType}
          selectedEntryId={selectedEntryId}
          activeView={activeView}
          onSelectView={selectView}
          onSelectEntry={navigateTo}
          processedCount={processedCount}
        />

        <main className="relative min-w-0 flex-1 overflow-hidden rounded-2xl">
          {/* Graph view fills the entire area without scroll */}
          {!selectedEntry && activeView === "graph" && (
            <RelationshipGraph
              filePath={filePath}
              chapterLabels={chapterLabels}
              entries={entries}
              onNavigate={navigateTo}
            />
          )}

          {/* Scrollable views */}
          {(selectedEntry || activeView !== "graph") && (
            <div
              ref={scrollRef}
              className="h-full overflow-y-auto"
              style={{
                paddingBottom: chatOpen && !chatExpanded
                  ? "clamp(280px, 45%, 420px)"
                  : undefined,
              }}
            >
              <div key={contentKey} className="animate-blur-in">
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
            </div>
          )}

          <WikiAIChat
            filePath={filePath}
            bookTitle={bookTitle}
            onEntryClick={navigateTo}
            chapterLabels={chapterLabels}
            onOpenChange={(open, expanded) => { setChatOpen(open); setChatExpanded(expanded); }}
          />
        </main>
      </div>
    </WindowShell>
  );
}

/* ══════════════════════════════════════════════════════════
   EMPTY — no wiki data yet
   ══════════════════════════════════════════════════════════ */

function EmptyWiki({ bookTitle }: { bookTitle: string }) {
  const ghost: WikiEntryType[] = ["character", "location", "item", "event", "concept"];
  return (
    <div className="flex w-full max-w-xl flex-col items-center text-center">
      {/* Constellation of ghost entities */}
      <div className="relative mb-8 h-40 w-80">
        <svg aria-hidden className="absolute inset-0 size-full text-separator-strong" viewBox="0 0 320 160" fill="none">
          <path d="M160 80 L52 38 M160 80 L268 34 M160 80 L64 132 M160 80 L256 128" stroke="currentColor" strokeDasharray="2 4" />
        </svg>
        {ghost.map((t, i) => {
          const pos = [
            "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
            "left-8 top-4", "right-8 top-2", "left-12 bottom-2", "right-12 bottom-3",
          ][i];
          const meta = TYPE_META[t];
          return (
            <motion.span
              key={t}
              className={`absolute ${pos}`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: i === 0 ? 1 : 0.55, scale: 1 }}
              transition={{ type: "spring", bounce: 0.35, duration: 0.6, delay: 0.08 * i }}
            >
              <span
                className={`flex items-center justify-center rounded-full ${i === 0 ? "size-16 [&_svg]:size-7" : "size-10 [&_svg]:size-4"}`}
                style={{ background: meta.bg, color: meta.color, boxShadow: `inset 0 0 0 0.5px ${meta.color}50` }}
              >
                {meta.icon}
              </span>
            </motion.span>
          );
        })}
      </div>
      <p className="text-section">The Wiki</p>
      <h1 className="mt-2 text-large-title text-label">{bookTitle}</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-label-secondary">
        Nothing has been written here yet. Turn on <span className="text-label">AI Wiki</span> in the reader and
        Codex will chronicle characters, places and events as you read.
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STATS PAGE — MC profile + stats reference
   ══════════════════════════════════════════════════════════ */

const STAT_CATEGORY_META: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  attributes: { icon: <Shield className="size-3.5" strokeWidth={1.75} />, label: "Attributes", color: "rgb(147, 197, 253)", bg: "rgba(96, 165, 250, 0.12)" },
  skills: { icon: <Zap className="size-3.5" strokeWidth={1.75} />, label: "Skills", color: "rgb(196, 181, 253)", bg: "rgba(167, 139, 250, 0.12)" },
  inventory: { icon: <Package className="size-3.5" strokeWidth={1.75} />, label: "Inventory", color: "rgb(110, 231, 183)", bg: "rgba(52, 211, 153, 0.12)" },
  currency: { icon: <Coins className="size-3.5" strokeWidth={1.75} />, label: "Currency", color: "rgb(252, 211, 77)", bg: "rgba(251, 191, 36, 0.12)" },
  status: { icon: <Activity className="size-3.5" strokeWidth={1.75} />, label: "Status Effects", color: "rgb(253, 164, 175)", bg: "rgba(251, 113, 133, 0.12)" },
  other: { icon: <BarChart2 className="size-3.5" strokeWidth={1.75} />, label: "Other", color: "var(--label-secondary)", bg: "var(--fill-tertiary)" },
};

const STAT_CATEGORY_ORDER = ["attributes", "skills", "inventory", "currency", "status", "other"];

/** Shared page frame: centered reading column with the standard gutter. */
function Page({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto w-full px-8 pt-8 pb-24 ${wide ? "max-w-5xl" : "max-w-4xl"}`}>
      {children}
    </div>
  );
}

function PageHero({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-10">
      <p className="text-section">{eyebrow}</p>
      <h1 className="mt-1.5 text-large-title text-label text-balance">{title}</h1>
      {children}
    </header>
  );
}

function StatTile({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return (
    <div className="glass-thin flex flex-1 items-center gap-3 rounded-xl px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <NumberTicker value={value} className="block text-xl font-semibold tabular-nums text-label" />
        <p className="truncate text-xs text-label-tertiary">{label}</p>
      </div>
    </div>
  );
}

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
      <div className="flex min-h-[70vh] items-center justify-center px-8">
        <EmptyState
          icon={<BarChart2 className="size-10" strokeWidth={1.25} />}
          title="No stats tracked yet"
          description="Levels, skills and inventory appear here as the AI processes chapters."
        />
      </div>
    );
  }

  const renderStat = (stat: MCStat, meta: typeof STAT_CATEGORY_META[string], showIcon: boolean) => (
    <div key={stat.stat_key} className="rounded-lg bg-fill-quaternary p-3.5 hairline">
      <div className="flex items-center gap-2">
        {showIcon && (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full" style={{ background: meta.bg, color: meta.color }}>
            {meta.icon}
          </span>
        )}
        <span className="truncate text-xs font-medium text-label-secondary">{stat.display_name}</span>
      </div>
      {stat.value && (
        <p className="mt-2 text-base font-semibold tabular-nums" style={{ color: showIcon ? meta.color : undefined }}>{stat.value}</p>
      )}
      <p className="mt-0.5 text-2xs tabular-nums text-label-tertiary">Ch. {fmtCh(stat.last_chapter, chapterLabels) ?? stat.last_chapter + 1}</p>
    </div>
  );

  return (
    <Page>
      <PageHero eyebrow="Protagonist" title={mcEntry?.name ?? "Character Stats"}>
        <p className="mt-2 text-sm text-label-secondary">
          {activeStats.length} active {activeStats.length === 1 ? "stat" : "stats"}
          {inactiveStats.length > 0 && <span className="text-label-tertiary"> · {inactiveStats.length} lost or consumed</span>}
        </p>
      </PageHero>

      {/* MC Profile Card */}
      {mcEntry && (
        <BlurFade className="mb-10">
          <button onClick={onNavigateToMC} className="focus-ring group block w-full rounded-2xl text-left">
            <SpotlightCard className="glass-thin grain relative rounded-2xl p-5 transition-shadow duration-200 group-hover:shadow-md">
              <div className="flex items-start gap-4">
                <EntityAvatar name={mcEntry.name} type="character" meta={TYPE_META.character} size="xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-xl font-semibold text-label">{mcEntry.name}</span>
                    {mcEntry.significance >= 3 && <span className="text-xs text-warning">{"★".repeat(mcEntry.significance)}</span>}
                    <Badge variant="outline" className="ml-auto capitalize">{mcEntry.status}</Badge>
                  </div>
                  {mcEntry.aliases.filter((a) => a.relevance >= 4).length > 0 && (
                    <p className="mt-1 text-xs text-label-tertiary">aka {mcEntry.aliases.filter((a) => a.relevance >= 4).slice(0, 5).map((a) => a.alias).join(", ")}</p>
                  )}
                  <p className="mt-2.5 text-sm leading-relaxed text-label-secondary">{mcEntry.shortDescription}</p>
                  {mcEntry.description && (
                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-label-tertiary">{mcEntry.description}</p>
                  )}
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-label-quaternary transition-transform duration-200 ease-apple group-hover:translate-x-0.5 group-hover:text-label-secondary" strokeWidth={1.75} />
              </div>
            </SpotlightCard>
          </button>
        </BlurFade>
      )}

      {/* Stat categories */}
      {STAT_CATEGORY_ORDER.map((cat) => {
        const items = groupedActive[cat];
        if (!items || items.length === 0) return null;
        const meta = STAT_CATEGORY_META[cat] ?? STAT_CATEGORY_META.other;
        return (
          <section key={cat} className="mb-8">
            <SectionHeader icon={meta.icon} label={meta.label} color={meta.color} count={items.length} />
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
              {items.map((stat) => renderStat(stat, meta, true))}
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
            <section key={cat} className="mb-8">
              <SectionHeader icon={meta.icon} label={cat.charAt(0).toUpperCase() + cat.slice(1)} color={meta.color} count={items.length} />
              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
                {items.map((stat) => renderStat(stat, meta, false))}
              </div>
            </section>
          );
        })}

      {/* Lost/consumed items */}
      {inactiveStats.length > 0 && (
        <section className="mb-8">
          <SectionHeader icon={<X className="size-3.5" strokeWidth={1.75} />} label="Lost / Consumed" color="var(--label-tertiary)" count={inactiveStats.length} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {inactiveStats.map((stat) => (
              <span key={stat.stat_key} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-fill-quaternary px-3">
                <span className="text-xs text-label-tertiary line-through">{stat.display_name}</span>
                {stat.value && <span className="text-2xs text-label-quaternary">{stat.value}</span>}
              </span>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════
   HOME PAGE — encyclopedia landing
   ══════════════════════════════════════════════════════════ */

function HomePage({
  bookTitle, entries, filteredEntries, groupedFiltered, arcs, chapterSummaries,
  processedCount, mergeLog, searchQuery, filterType, onEntryClick, onUnmerge, chapterLabels,
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
  const arcSpan = Math.max(processedCount, 1, ...arcs.map((a) => (a.endChapter ?? a.startChapter) + 1));

  return (
    <Page>
      <PageHero eyebrow="Encyclopedia" title={bookTitle}>
        <div className="mt-6 flex gap-2">
          <StatTile value={entries.length} label="Entries" icon={<BookOpen strokeWidth={1.75} />} />
          <StatTile value={processedCount} label="Chapters analyzed" icon={<Hash strokeWidth={1.75} />} />
          <StatTile value={arcs.length} label="Story arcs" icon={<GitBranch strokeWidth={1.75} />} />
        </div>
      </PageHero>

      {/* If searching/filtering, show flat results */}
      {(searchQuery || filterType !== "all") ? (
        <div className="space-y-8">
          <p className="text-sm text-label-secondary">
            <span className="tabular-nums text-label">{filteredEntries.length}</span> {filteredEntries.length === 1 ? "result" : "results"}
            {searchQuery && <> for <span className="text-label">&ldquo;{searchQuery}&rdquo;</span></>}
          </p>
          {TYPE_ORDER.map((type) => {
            const items = groupedFiltered[type];
            if (!items || items.length === 0) return null;
            const meta = TYPE_META[type];
            return (
              <section key={type}>
                <SectionHeader icon={meta.icon} label={meta.plural} color={meta.color} count={items.length} />
                <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {items.map((e) => (
                    <EntryCard key={e.id} entry={e} onClick={() => onEntryClick(e.id)} />
                  ))}
                </div>
              </section>
            );
          })}
          {filteredEntries.length === 0 && (
            <EmptyState
              icon={<Search className="size-10" strokeWidth={1.25} />}
              title="No entries match"
              description="Try another name or clear the type filter."
            />
          )}
        </div>
      ) : (
        <>
          {/* Main Characters — cast portraits */}
          {mainCharacters.length > 0 && (
            <section className="mb-12">
              <SectionHeader icon={<User className="size-3.5" strokeWidth={1.75} />} label="Main Characters" color={TYPE_META.character.color} count={mainCharacters.length} />
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
                {mainCharacters.map((e, i) => (
                  <BlurFade key={e.id} delay={0.03 * i}>
                    <button onClick={() => onEntryClick(e.id)} className="focus-ring group block h-full w-full rounded-2xl text-left">
                      <SpotlightCard className="glass-thin relative flex h-full flex-col rounded-2xl p-4 transition-shadow duration-200 group-hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <EntityAvatar name={e.name} type="character" meta={TYPE_META.character} size="lg" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-headline text-label">{e.name}</p>
                            <p className="truncate text-xs capitalize text-label-tertiary">{e.status}</p>
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-label-secondary">{e.short_description}</p>
                      </SpotlightCard>
                    </button>
                  </BlurFade>
                ))}
              </div>
            </section>
          )}

          {/* Recently introduced — grouped list */}
          {recentEntries.length > 0 && (
            <section className="mb-12">
              <SectionHeader icon={<Clock className="size-3.5" strokeWidth={1.75} />} label="Recently Introduced" color={TYPE_META.concept.color} />
              <div className="mt-3 overflow-hidden rounded-lg bg-fill-quaternary hairline [&>*+*]:border-t [&>*+*]:border-separator">
                {recentEntries.map((e) => {
                  const meta = TYPE_META[e.type];
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEntryClick(e.id)}
                      className="focus-ring group flex h-11 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-fill-quaternary"
                    >
                      <EntityAvatar name={e.name} type={e.type} meta={meta} />
                      <span className="w-40 shrink-0 truncate text-sm font-medium text-label">{e.name}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-label-tertiary">{e.short_description}</span>
                      <span className="shrink-0 rounded-full bg-fill-tertiary px-2 py-0.5 text-2xs tabular-nums text-label-secondary">Ch. {e.first_appearance + 1}</span>
                      <ChevronRight className="size-3.5 shrink-0 text-label-quaternary transition-transform duration-200 ease-apple group-hover:translate-x-0.5" strokeWidth={1.75} />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Story Arcs — span bars across the chapters read */}
          {arcs.length > 0 && (
            <section className="mb-12">
              <SectionHeader icon={<GitBranch className="size-3.5" strokeWidth={1.75} />} label="Story Arcs" color={TYPE_META.item.color} count={arcs.length} />
              <div className="mt-3 space-y-2">
                {arcs.map((arc) => {
                  const startPct = (arc.startChapter / arcSpan) * 100;
                  const endPct = (((arc.endChapter ?? arcSpan - 1) + 1) / arcSpan) * 100;
                  const active = arc.status === "active";
                  return (
                    <div key={arc.id} className="rounded-lg bg-fill-quaternary p-4 hairline">
                      <div className="flex items-center gap-2">
                        <span className="text-headline text-label">{arc.name}</span>
                        <Badge variant={active ? "success" : "default"} className="capitalize">{arc.status}</Badge>
                        <span className="ml-auto text-2xs tabular-nums text-label-tertiary">
                          Ch. {arc.startChapter + 1}{arc.endChapter != null ? `–${arc.endChapter + 1}` : "+"}
                        </span>
                      </div>
                      {arc.description && (
                        <p className="mt-1.5 text-xs leading-relaxed text-label-secondary">{arc.description}</p>
                      )}
                      <div className="relative mt-3 h-1 rounded-xs bg-fill-tertiary">
                        <motion.div
                          className={`absolute inset-y-0 rounded-xs ${active ? "bg-success" : "bg-label-tertiary"}`}
                          style={{ left: `${startPct}%` }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(endPct - startPct, 1.5)}%` }}
                          transition={{ type: "spring", bounce: 0.2, duration: 0.7 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Chapter Timeline — vertical rail */}
          {chapterSummaries.length > 0 && (
            <section className="mb-12">
              <SectionHeader icon={<Hash className="size-3.5" strokeWidth={1.75} />} label="Chapter Timeline" color={TYPE_META.event.color} />
              <ol className="relative mt-4 ml-3 border-l border-separator-strong">
                {chapterSummaries
                  .filter((ch) => Object.keys(chapterLabels).length === 0 || ch.chapter_index in chapterLabels)
                  .map((ch) => (
                    <ChapterRow key={ch.chapter_index} chapter={ch} chapterLabels={chapterLabels} />
                  ))}
              </ol>
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
                <section key={type} className="mb-12">
                  <SectionHeader icon={meta.icon} label={`Other ${meta.plural}`} color={meta.color} count={others.length} />
                  <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {others.map((e) => <EntryCard key={e.id} entry={e} onClick={() => onEntryClick(e.id)} />)}
                  </div>
                </section>
              );
            }
            return (
              <section key={type} className="mb-12">
                <SectionHeader icon={meta.icon} label={meta.plural} color={meta.color} count={items.length} />
                <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {items.map((e) => <EntryCard key={e.id} entry={e} onClick={() => onEntryClick(e.id)} />)}
                </div>
              </section>
            );
          })}
        </>
      )}

      {/* Merge log */}
      {mergeLog.length > 0 && !searchQuery && filterType === "all" && (
        <section className="mb-12">
          <ListGroup title="Merged Entries" footer="Undo a merge to restore the original entry.">
            {mergeLog.map((m) => (
              <ListRow
                key={m.id}
                icon={<Merge strokeWidth={1.75} />}
                iconTint="purple"
                label={<><span className="font-medium">{m.source_name}</span><span className="text-label-tertiary"> merged into </span><span className="font-medium">{m.target_name}</span></>}
              >
                <button
                  onClick={() => onUnmerge(m.id)}
                  className="focus-ring pressable inline-flex h-7 items-center gap-1.5 rounded-full bg-fill-tertiary px-3 text-xs font-medium text-label-secondary hover:bg-fill-secondary hover:text-label"
                  title="Undo merge"
                >
                  <Undo2 className="size-3.5" strokeWidth={1.75} />
                  Undo
                </button>
              </ListRow>
            ))}
          </ListGroup>
        </section>
      )}
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════
   ENTRY PAGE — article for a single entity
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

  const detailsByCategory: Record<string, { chapterIndex: number; content: string; relevance: number; sourceText: string }[]> = {};
  for (const d of activeDetails) {
    const cat = d.category || "info";
    if (!detailsByCategory[cat]) detailsByCategory[cat] = [];
    detailsByCategory[cat].push({ chapterIndex: d.chapterIndex, content: d.content, relevance: d.relevance, sourceText: d.sourceText });
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
    <article className="relative">
      {/* Floating article toolbar */}
      <div className="sticky top-0 z-20 flex h-14 items-center gap-2 px-6">
        {canGoBack && (
          <button
            onClick={onBack}
            className="glass-thin focus-ring pressable inline-flex h-8 items-center gap-1.5 rounded-full pl-2.5 pr-3.5 text-xs font-medium text-label-secondary hover:text-label"
          >
            <ArrowLeft className="size-3.5" strokeWidth={2} />
            Back
          </button>
        )}
        <div className="relative ml-auto" ref={mergeRef}>
          <button
            onClick={() => { setShowMergePicker(!showMergePicker); setMergeSearch(""); }}
            className={`glass-thin focus-ring pressable inline-flex h-8 items-center gap-1.5 rounded-full pl-2.5 pr-3.5 text-xs font-medium ${showMergePicker ? "text-label" : "text-label-secondary hover:text-label"}`}
          >
            <Merge className="size-3.5" strokeWidth={1.75} />
            Merge into…
          </button>
          <AnimatePresence>
            {showMergePicker && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                style={{ transformOrigin: "top right" }}
                className="glass-thick absolute right-0 top-full z-30 mt-2 w-72 rounded-xl p-1"
              >
                <div className="flex h-8 items-center gap-2 rounded-md bg-fill-tertiary px-2.5">
                  <Search className="size-3.5 shrink-0 text-label-tertiary" strokeWidth={2} />
                  <input
                    type="text"
                    autoFocus
                    value={mergeSearch}
                    onChange={(e) => setMergeSearch(e.target.value)}
                    placeholder={`Search ${TYPE_META[entry.type].plural.toLowerCase()}…`}
                    className="min-w-0 flex-1 bg-transparent text-sm text-label outline-none placeholder:text-label-tertiary"
                  />
                  <button onClick={() => setShowMergePicker(false)} className="text-label-tertiary hover:text-label" aria-label="Close">
                    <X className="size-3.5" strokeWidth={2} />
                  </button>
                </div>
                <p className="px-2 pt-2.5 pb-1 text-section">Merge {entry.name} into</p>
                <div className="max-h-56 overflow-y-auto">
                  {mergeTargets.length === 0 ? (
                    <p className="py-4 text-center text-xs text-label-tertiary">No matching entries</p>
                  ) : mergeTargets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { onMerge(entry.id, t.id); setShowMergePicker(false); }}
                      className="group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-label transition-colors hover:bg-brand hover:text-brand-fg"
                    >
                      <EntityAvatar name={t.name} type={t.type} meta={TYPE_META[t.type]} size="sm" />
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-8 pt-4 pb-24">
        {/* Article header */}
        <header className="flex flex-col items-start">
          <div className="relative">
            <span aria-hidden className="absolute -inset-6 rounded-full opacity-60 blur-2xl" style={{ background: meta.bg }} />
            <EntityAvatar name={entry.name} type={entry.type} meta={meta} size="xl" className="relative" />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            <Badge className="gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
              {meta.label}
            </Badge>
            <Badge variant="outline" className="capitalize">{entry.status}</Badge>
            {entry.significance >= 3 && (
              <span className="ml-1 text-xs tracking-widest text-warning">{"★".repeat(entry.significance)}</span>
            )}
          </div>
          <h1 className="mt-3 text-large-title text-label text-balance">{entry.name}</h1>
          {primaryAliases.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {primaryAliases.map((a) => (
                <span key={a.alias} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-fill-tertiary px-2.5 text-xs text-label-secondary">
                  {a.alias}
                  {a.alias_type !== "name" && <span className="text-2xs text-label-tertiary">{a.alias_type}</span>}
                </span>
              ))}
              {historicalAliases.length > 0 && (
                <span className="inline-flex h-6 items-center rounded-full px-2.5 text-xs text-label-tertiary ring-[0.5px] ring-separator-strong ring-inset">
                  +{historicalAliases.length} historical
                </span>
              )}
            </div>
          )}

          {/* Quick info */}
          <div className="mt-5 flex flex-wrap gap-1.5">
            <InfoPill icon={<Clock className="size-3.5" strokeWidth={1.75} />} label={`First: Ch. ${fmtCh(entry.firstAppearance, chapterLabels)}`} />
            <InfoPill icon={<BookOpen className="size-3.5" strokeWidth={1.75} />} label={`${entry.chapterAppearances.length} ${entry.chapterAppearances.length === 1 ? "chapter" : "chapters"}`} />
            {uniqueRels.length > 0 && (
              <InfoPill icon={<User className="size-3.5" strokeWidth={1.75} />} label={`${uniqueRels.length} ${uniqueRels.length === 1 ? "connection" : "connections"}`} />
            )}
          </div>

          {/* Lede */}
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-label-secondary select-text">
            <LinkedText text={entry.shortDescription} entries={allEntries} currentEntryId={entry.id} onNavigate={onNavigate} />
          </p>
        </header>

        <div className="my-8 h-px bg-separator" />

        {/* Two-column layout: main content + infobox */}
        <div className="flex flex-col gap-10 xl:flex-row">
          {/* Main column */}
          <div className="min-w-0 flex-1 space-y-10">
            {/* Overview */}
            {entry.description && (
              <ArticleSection title="Overview">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-label-secondary select-text">
                  <LinkedText text={entry.description} entries={allEntries} currentEntryId={entry.id} onNavigate={onNavigate} />
                </p>
              </ArticleSection>
            )}

            {/* Details by category */}
            {Object.entries(detailsByCategory).map(([category, items]) => (
              <ArticleSection key={category} title={formatCategory(category)}>
                <div className="overflow-hidden rounded-lg bg-fill-quaternary hairline [&>*+*]:border-t [&>*+*]:border-separator">
                  {items.map((item, i) => (
                    <div key={i} className="flex gap-3 px-3.5 py-3">
                      <span
                        className="mt-px inline-flex h-5 shrink-0 items-center rounded-full px-2 text-2xs font-medium tabular-nums"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {fmtCh(item.chapterIndex, chapterLabels)}
                      </span>
                      <p className="flex-1 text-sm leading-relaxed text-label-secondary select-text">
                        <LinkedText text={item.content} entries={allEntries} currentEntryId={entry.id} onNavigate={onNavigate} />
                        <SourcePreview sourceText={item.sourceText} chapterIndex={item.chapterIndex} chapterLabels={chapterLabels} />
                      </p>
                    </div>
                  ))}
                </div>
              </ArticleSection>
            ))}

            {/* Relationships */}
            {relGroups.length > 0 && (
              <ArticleSection title="Relationships">
                <div className="space-y-5">
                  {relGroups.map((group) => (
                    <div key={group.label}>
                      <span className="text-section">{group.label}</span>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {group.rels.map((rel) => {
                          const target = resolvedNames.get(rel.targetId);
                          const targetName = target?.name ?? rel.targetId.replace(/-/g, " ");
                          const targetMeta = target ? TYPE_META[target.type] : null;
                          return (
                            <button
                              key={rel.targetId}
                              onClick={() => onNavigate(rel.targetId)}
                              className="focus-ring pressable group inline-flex h-8 items-center gap-2 rounded-full bg-fill-tertiary pl-1 pr-3 text-left hover:bg-fill-secondary"
                            >
                              {targetMeta && target ? (
                                <EntityAvatar name={target.name} type={target.type} meta={targetMeta} />
                              ) : (
                                <span className="size-6 rounded-full bg-fill-secondary" />
                              )}
                              <span className="text-xs font-medium text-label">{targetName}</span>
                              <span className="text-xs text-label-tertiary">{rel.relation}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ArticleSection>
            )}

            {/* Archive — superseded / low-relevance details */}
            {Object.keys(archivedByCategory).length > 0 && (
              <ArchivedDetailsSection archivedByCategory={archivedByCategory} metaBg={meta.bg} metaColor={meta.color} chapterLabels={chapterLabels} />
            )}

            {/* Historical aliases */}
            {historicalAliases.length > 0 && (
              <HistoricalAliasesSection aliases={historicalAliases} />
            )}
          </div>

          {/* Infobox */}
          <aside className="w-full shrink-0 xl:w-64">
            <div className="glass-thin grain relative overflow-hidden rounded-2xl xl:sticky xl:top-16">
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <span className="size-2 rounded-full" style={{ background: meta.color }} />
                <span className="text-headline text-label">{meta.label} Info</span>
              </div>
              <div className="px-4 [&>*+*]:border-t [&>*+*]:border-separator">
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
              <div className="mt-1 border-t border-separator px-4 pt-3 pb-4">
                <span className="text-section">Chapters</span>
                <div className="mt-2 flex flex-wrap gap-1">
                  {entry.chapterAppearances.map((ch) => (
                    <span key={ch} className="inline-flex h-5 min-w-6 items-center justify-center rounded-full bg-fill-tertiary px-1.5 text-2xs tabular-nums text-label-secondary">
                      {ch + 1}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </article>
  );
}

/* ══════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ══════════════════════════════════════════════════════════ */

function EntryCard({ entry, onClick, showChapter }: { entry: EntryListItem; onClick: () => void; showChapter?: boolean }) {
  const meta = TYPE_META[entry.type];
  return (
    <button
      onClick={onClick}
      className="focus-ring group flex items-start gap-3 rounded-lg bg-fill-quaternary p-3 text-left hairline transition-colors duration-150 hover:bg-fill-tertiary"
    >
      <EntityAvatar name={entry.name} type={entry.type} meta={meta} size="lg" className="size-8" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-headline text-label">{entry.name}</span>
          {showChapter && <span className="shrink-0 text-2xs tabular-nums text-label-tertiary">Ch. {entry.first_appearance + 1}</span>}
          {entry.significance >= 3 && <span className="size-1.5 shrink-0 rounded-full bg-warning/70" />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-label-tertiary">{entry.short_description}</p>
      </div>
      <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-label-quaternary transition-transform duration-200 ease-apple group-hover:translate-x-0.5 group-hover:text-label-tertiary" strokeWidth={1.75} />
    </button>
  );
}

function SectionHeader({ icon, label, color, count }: { icon: React.ReactNode; label: string; color: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-5 items-center justify-center [&_svg]:size-3.5" style={{ color }}>{icon}</span>
      <span className="text-section">{label}</span>
      {count != null && <span className="text-2xs tabular-nums text-label-quaternary">{count}</span>}
      <div className="h-px flex-1 bg-separator" />
    </div>
  );
}

function ArticleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-headline text-label">{title}</h3>
      {children}
    </section>
  );
}

function InfoPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex h-7 items-center gap-1.5 rounded-full bg-fill-quaternary px-3 text-xs text-label-secondary ring-[0.5px] ring-separator ring-inset [&_svg]:text-label-tertiary">
      {icon}
      {label}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-9 items-start justify-between gap-3 py-2">
      <span className="text-xs text-label-tertiary">{label}</span>
      <span className="text-right text-xs capitalize text-label">{value}</span>
    </div>
  );
}

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg bg-fill-quaternary hairline">
      <button
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex h-10 w-full items-center justify-between px-3.5 text-xs text-label-secondary transition-colors hover:text-label"
      >
        <span>{label}</span>
        <ChevronDown className={`size-3.5 text-label-tertiary transition-transform duration-200 ease-apple ${open ? "rotate-180" : ""}`} strokeWidth={2} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="overflow-hidden"
          >
            <div className="border-t border-separator px-3.5 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
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
  const totalCount = Object.values(archivedByCategory).reduce((n, arr) => n + arr.length, 0);
  return (
    <Disclosure label={`${totalCount} archived / superseded entr${totalCount === 1 ? "y" : "ies"}`}>
      <div className="space-y-4">
        {Object.entries(archivedByCategory).map(([cat, items]) => (
          <div key={cat}>
            <p className="mb-1.5 text-section">{cat.replace(/_/g, " ")}</p>
            <div className="space-y-1">
              {items.map((item, i) => (
                <div key={i} className="flex items-start gap-3 rounded-md px-1 py-1.5 opacity-60">
                  <span className="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-2xs tabular-nums" style={{ background: metaBg, color: metaColor }}>
                    {fmtCh(item.chapterIndex, chapterLabels)}
                  </span>
                  <p className="text-xs leading-relaxed text-label-tertiary line-through decoration-label-quaternary">
                    {item.content}
                  </p>
                  {item.isSuperseded && (
                    <span className="ml-auto shrink-0 text-2xs text-warning">superseded</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Disclosure>
  );
}

function HistoricalAliasesSection({ aliases }: { aliases: WikiAliasDetailed[] }) {
  return (
    <Disclosure label={`${aliases.length} contextual / historical reference${aliases.length !== 1 ? "s" : ""}`}>
      <div className="flex flex-wrap gap-1.5">
        {aliases.map((a) => (
          <span key={a.alias} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-fill-tertiary px-2.5 text-xs text-label-secondary">
            {a.alias}
            <span className="text-2xs text-label-tertiary">{a.alias_type}</span>
          </span>
        ))}
      </div>
    </Disclosure>
  );
}

function ChapterRow({ chapter, chapterLabels }: { chapter: ChapterSummary; chapterLabels: ChapterLabels }) {
  let events: string[] = [];
  try { events = JSON.parse(chapter.key_events); } catch { /* ignore */ }

  return (
    <li className="relative pb-5 pl-6 last:pb-0">
      <span aria-hidden className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-canvas ring-2 ring-separator-strong" />
      <div className="flex items-center gap-2">
        <span className="text-headline tabular-nums text-label">Ch. {fmtCh(chapter.chapter_index, chapterLabels)}</span>
        <MoodBadge mood={chapter.mood} />
      </div>
      <p className="mt-1 text-sm leading-relaxed text-label-secondary">{chapter.summary}</p>
      {events.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {events.map((ev, i) => (
            <span key={i} className="inline-flex h-5 items-center rounded-full bg-fill-quaternary px-2 text-2xs text-label-tertiary">
              {ev.replace(/-/g, " ")}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function MoodBadge({ mood }: { mood: string }) {
  if (!mood) return null;
  const MOOD_COLORS: Record<string, string> = { tension: "rgba(251, 113, 133, 0.15)", action: "rgba(251, 191, 36, 0.15)", calm: "rgba(52, 211, 153, 0.15)", mystery: "rgba(167, 139, 250, 0.15)", revelation: "rgba(96, 165, 250, 0.15)" };
  const MOOD_TEXT: Record<string, string> = { tension: "rgba(253, 164, 175, 0.9)", action: "rgba(252, 211, 77, 0.9)", calm: "rgba(110, 231, 183, 0.9)", mystery: "rgba(196, 181, 253, 0.9)", revelation: "rgba(147, 197, 253, 0.9)" };
  return (
    <span
      className="inline-flex h-5 items-center rounded-full px-2 text-2xs font-medium capitalize"
      style={{ background: MOOD_COLORS[mood] ?? "var(--fill-tertiary)", color: MOOD_TEXT[mood] ?? "var(--label-secondary)" }}
    >
      {mood}
    </span>
  );
}

/* ── Clickable entity links in text ─────────────────────── */

function LinkedText({
  text,
  entries,
  currentEntryId,
  onNavigate,
}: {
  text: string;
  entries: EntryListItem[];
  currentEntryId?: string;
  onNavigate: (id: string) => void;
}) {
  const segments = useMemo(() => {
    if (!text || entries.length === 0) return [{ text, entityId: null as string | null }];

    // Build sorted list of (name/alias → entryId), longest first for greedy matching
    const nameMap: { name: string; lower: string; id: string; type: WikiEntryType }[] = [];
    for (const e of entries) {
      if (e.id === currentEntryId) continue; // Don't link self
      if (e.name.length >= 2) nameMap.push({ name: e.name, lower: e.name.toLowerCase(), id: e.id, type: e.type });
    }
    nameMap.sort((a, b) => b.name.length - a.name.length);

    // Scan text for matches
    const result: { text: string; entityId: string | null; entityType?: WikiEntryType }[] = [];
    const lower = text.toLowerCase();
    let cursor = 0;
    const used = new Uint8Array(text.length); // track matched ranges

    // First pass: find all non-overlapping matches (longest first)
    const matches: { start: number; end: number; id: string; type: WikiEntryType }[] = [];
    for (const entry of nameMap) {
      let searchFrom = 0;
      while (searchFrom < lower.length) {
        const idx = lower.indexOf(entry.lower, searchFrom);
        if (idx === -1) break;
        const end = idx + entry.lower.length;
        // Check word boundaries
        const before = idx === 0 || /[\s,.\-—()"';:!?/\[\]]/.test(text[idx - 1]);
        const after = end === text.length || /[\s,.\-—()"';:!?/\[\]]/.test(text[end]);
        if (before && after) {
          // Check no overlap with existing matches
          let overlaps = false;
          for (let i = idx; i < end; i++) {
            if (used[i]) { overlaps = true; break; }
          }
          if (!overlaps) {
            matches.push({ start: idx, end, id: entry.id, type: entry.type });
            for (let i = idx; i < end; i++) used[i] = 1;
          }
        }
        searchFrom = idx + 1;
      }
    }

    // Sort matches by position
    matches.sort((a, b) => a.start - b.start);

    // Build segments
    for (const m of matches) {
      if (m.start > cursor) {
        result.push({ text: text.slice(cursor, m.start), entityId: null });
      }
      result.push({ text: text.slice(m.start, m.end), entityId: m.id, entityType: m.type });
      cursor = m.end;
    }
    if (cursor < text.length) {
      result.push({ text: text.slice(cursor), entityId: null });
    }

    return result;
  }, [text, entries, currentEntryId]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.entityId ? (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); onNavigate(seg.entityId!); }}
            className="inline cursor-pointer border-b border-dotted border-current/40 font-medium transition-opacity hover:opacity-80"
            style={{ color: seg.entityType ? TYPE_META[seg.entityType]?.color : undefined }}
          >
            {seg.text}
          </button>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

/* ── Source text preview popover ────────────────────────── */

function SourcePreview({
  sourceText,
  chapterIndex,
  chapterLabels,
}: {
  sourceText: string;
  chapterIndex: number;
  chapterLabels: ChapterLabels;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!sourceText) return null;

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-1 inline-flex size-5 translate-y-0.5 items-center justify-center rounded-full text-label-quaternary transition-colors hover:bg-fill-tertiary hover:text-label-secondary"
        title={`Source from Ch. ${fmtCh(chapterIndex, chapterLabels)}`}
      >
        <Quote className="size-3" strokeWidth={2} />
      </button>
      {open && (
        <span className="glass-thick absolute bottom-full left-0 z-40 mb-2 block w-80 rounded-xl p-3.5 animate-pop-in">
          <span className="mb-1.5 flex items-center gap-1.5">
            <Quote className="size-3 shrink-0 text-label-tertiary" strokeWidth={2} />
            <span className="text-section">
              Source — Ch. {fmtCh(chapterIndex, chapterLabels)}
            </span>
          </span>
          <span className="block font-display text-sm leading-relaxed italic text-label select-text">
            &ldquo;{sourceText}&rdquo;
          </span>
        </span>
      )}
    </span>
  );
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
