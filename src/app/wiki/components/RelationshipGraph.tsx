"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  User, Swords, MapPin, Flame, Lightbulb,
  ChevronRight, ArrowLeft, ZoomIn, ZoomOut, Home,
} from "lucide-react";
import type { WikiEntryType } from "@/lib/ai-wiki";
import type { ChapterLabels } from "@/lib/chapter-labels";

/* ── Types ─────────────────────────────────────────────── */

interface EntryListItem {
  id: string;
  name: string;
  type: WikiEntryType;
  significance: number;
}

interface RelRow {
  source_id: string;
  target_id: string;
  relation: string;
}

/* ── Type colors & icons ───────────────────────────────── */

const TYPE_META: Record<WikiEntryType, { color: string; bg: string; icon: React.ElementType }> = {
  character: { color: "rgb(147, 197, 253)", bg: "rgba(96, 165, 250, 0.12)", icon: User },
  item:      { color: "rgb(252, 211, 77)",  bg: "rgba(251, 191, 36, 0.12)", icon: Swords },
  location:  { color: "rgb(110, 231, 183)", bg: "rgba(52, 211, 153, 0.12)", icon: MapPin },
  event:     { color: "rgb(253, 164, 175)", bg: "rgba(251, 113, 133, 0.12)", icon: Flame },
  concept:   { color: "rgb(196, 181, 253)", bg: "rgba(167, 139, 250, 0.12)", icon: Lightbulb },
};

/* ── Relation categories ───────────────────────────────── */

const RELATION_CATEGORIES: { label: string; match: RegExp; color: string }[] = [
  { label: "Allies", match: /ally|friend|companion|comrade|partner|trusted/i, color: "rgb(110, 231, 183)" },
  { label: "Family", match: /family|father|mother|brother|sister|parent|child|son|daughter|spouse|husband|wife|sibling/i, color: "rgb(252, 211, 77)" },
  { label: "Rivals", match: /enemy|rival|antagonist|opponent|adversary|nemesis|hostile/i, color: "rgb(253, 164, 175)" },
  { label: "Mentors", match: /mentor|student|teacher|master|apprentice|disciple|guide/i, color: "rgb(196, 181, 253)" },
  { label: "Other", match: /.*/, color: "rgb(148, 163, 184)" },
];

function categorizeRelation(relation: string): typeof RELATION_CATEGORIES[0] {
  return RELATION_CATEGORIES.find(c => c.match.test(relation)) ?? RELATION_CATEGORIES[RELATION_CATEGORIES.length - 1];
}

/* ── Grouped relations for a node ──────────────────────── */

interface GroupedRelation {
  category: string;
  color: string;
  entries: { id: string; name: string; type: WikiEntryType; relation: string; significance: number }[];
}

function groupRelationsForEntity(
  entityId: string,
  entries: EntryListItem[],
  rels: RelRow[],
): GroupedRelation[] {
  const entryMap = new Map(entries.map(e => [e.id, e]));
  const related = rels
    .filter(r => r.source_id === entityId || r.target_id === entityId)
    .map(r => {
      const otherId = r.source_id === entityId ? r.target_id : r.source_id;
      const other = entryMap.get(otherId);
      if (!other) return null;
      return { id: otherId, name: other.name, type: other.type, relation: r.relation, significance: other.significance };
    })
    .filter(Boolean) as GroupedRelation["entries"];

  // Deduplicate
  const seen = new Set<string>();
  const unique = related.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  // Group by category
  const groups = new Map<string, GroupedRelation>();
  for (const r of unique) {
    const cat = categorizeRelation(r.relation);
    if (!groups.has(cat.label)) {
      groups.set(cat.label, { category: cat.label, color: cat.color, entries: [] });
    }
    groups.get(cat.label)!.entries.push(r);
  }

  // Sort entries within each group by significance
  for (const group of groups.values()) {
    group.entries.sort((a, b) => b.significance - a.significance);
  }

  return Array.from(groups.values());
}

/* ── Layout positions for the tree branches ──────────── */

const BRANCH_ANGLES = [
  { angle: -Math.PI / 2, label: "top" },    // up
  { angle: Math.PI / 2, label: "bottom" },  // down
  { angle: Math.PI, label: "left" },         // left
  { angle: 0, label: "right" },              // right
  { angle: -Math.PI / 4, label: "top-right" },
  { angle: -3 * Math.PI / 4, label: "top-left" },
  { angle: Math.PI / 4, label: "bottom-right" },
  { angle: 3 * Math.PI / 4, label: "bottom-left" },
];

/* ── Component ─────────────────────────────────────────── */

interface RelationshipGraphProps {
  filePath: string;
  chapterLabels: ChapterLabels;
  entries: EntryListItem[];
  onNavigate: (id: string) => void;
}

export function RelationshipGraph({ filePath, entries, onNavigate }: RelationshipGraphProps) {
  const [rels, setRels] = useState<RelRow[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch all relationships
  useEffect(() => {
    window.electronAPI?.wikiGetAllRelationships(filePath).then((rows: RelRow[]) => {
      if (rows) setRels(rows);
    });
  }, [filePath]);

  // Auto-detect MC (highest significance character)
  const mcEntity = useMemo(() => {
    const chars = entries
      .filter(e => e.type === "character")
      .sort((a, b) => b.significance - a.significance);
    return chars[0] ?? entries[0] ?? null;
  }, [entries]);

  // Set initial focus to MC
  useEffect(() => {
    if (mcEntity && !focusedId) {
      setFocusedId(mcEntity.id);
    }
  }, [mcEntity, focusedId]);

  const focusedEntry = useMemo(() => {
    return entries.find(e => e.id === focusedId) ?? null;
  }, [entries, focusedId]);

  const groupedRelations = useMemo(() => {
    if (!focusedId) return [];
    return groupRelationsForEntity(focusedId, entries, rels);
  }, [focusedId, entries, rels]);

  const navigateTo = useCallback((id: string) => {
    if (focusedId) {
      setHistory(prev => [...prev, focusedId!]);
    }
    setFocusedId(id);
    setExpandedCategories(new Set());
  }, [focusedId]);

  const goBack = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setFocusedId(prev);
    setExpandedCategories(new Set());
  }, [history]);

  const goHome = useCallback(() => {
    if (mcEntity) {
      setHistory([]);
      setFocusedId(mcEntity.id);
      setExpandedCategories(new Set());
    }
  }, [mcEntity]);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  if (entries.length === 0 || !focusedEntry) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-white/30">
        No entities to graph
      </div>
    );
  }

  const focusMeta = TYPE_META[focusedEntry.type];
  const FocusIcon = focusMeta.icon;
  const totalRelations = groupedRelations.reduce((sum, g) => sum + g.entries.length, 0);

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: "var(--bg-inset)" }}>
      {/* Navigation bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <button
          onClick={goBack}
          disabled={history.length === 0}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50 disabled:opacity-20"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          onClick={goHome}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50"
        >
          <Home className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <div className="h-4 w-px bg-white/[0.06]" />
        <div className="flex items-center gap-1.5 text-xs text-white/40">
          {history.length > 0 && (
            <>
              <span className="text-white/20">
                {entries.find(e => e.id === history[history.length - 1])?.name ?? "..."}
              </span>
              <ChevronRight className="h-3 w-3 text-white/15" />
            </>
          )}
          <span style={{ color: focusMeta.color }} className="font-medium">{focusedEntry.name}</span>
        </div>
        <span className="ml-auto text-xs text-white/20">{totalRelations} connections</span>
      </div>

      {/* Graph content */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center py-8 px-6">
          {/* ── Central node ── */}
          <button
            onClick={() => onNavigate(focusedEntry.id)}
            className="group relative flex flex-col items-center gap-2 mb-8"
          >
            <div
              className="flex h-20 w-20 items-center justify-center rounded-lg transition-all group-hover:scale-105"
              style={{
                background: focusMeta.bg,
                border: `2px solid ${focusMeta.color}`,
                boxShadow: `0 0 24px ${focusMeta.color}25`,
              }}
            >
              <FocusIcon className="h-8 w-8" style={{ color: focusMeta.color }} strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold" style={{ color: focusMeta.color }}>{focusedEntry.name}</div>
              <div className="text-xs text-white/30 capitalize">{focusedEntry.type}</div>
            </div>
          </button>

          {/* ── Category branches ── */}
          {groupedRelations.length === 0 ? (
            <p className="text-xs text-white/25 mt-4">No connections found</p>
          ) : (
            <div className="w-full max-w-[600px] space-y-2">
              {groupedRelations.map((group) => {
                const isExpanded = expandedCategories.has(group.category);
                const visibleEntries = isExpanded ? group.entries : group.entries.slice(0, 4);
                const hasMore = group.entries.length > 4;

                return (
                  <div key={group.category} className="rounded-lg border border-white/[0.06] overflow-hidden">
                    {/* Category header */}
                    <button
                      onClick={() => toggleCategory(group.category)}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
                    >
                      {/* Branch line */}
                      <div className="h-4 w-1 rounded-full" style={{ background: group.color }} />
                      <span className="text-xs font-semibold text-white/60">{group.category}</span>
                      <span className="text-xs text-white/25">{group.entries.length}</span>
                      <ChevronRight
                        className={`ml-auto h-3 w-3 text-white/20 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        strokeWidth={1.5}
                      />
                    </button>

                    {/* Entity nodes */}
                    <div className="border-t border-white/[0.04] px-2 py-1.5 space-y-0.5">
                      {visibleEntries.map((entry) => {
                        const meta = TYPE_META[entry.type];
                        const EntryIcon = meta.icon;
                        return (
                          <div
                            key={entry.id}
                            className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.03] cursor-pointer"
                            onClick={() => navigateTo(entry.id)}
                          >
                            {/* Connection line */}
                            <div className="flex items-center gap-1.5">
                              <div className="h-px w-4" style={{ background: group.color, opacity: 0.3 }} />
                              <div
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all group-hover:scale-110"
                                style={{ background: meta.bg }}
                              >
                                <EntryIcon className="h-3.5 w-3.5" style={{ color: meta.color }} strokeWidth={1.5} />
                              </div>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-white/70 group-hover:text-white/90 truncate transition-colors">
                                {entry.name}
                              </div>
                              <div className="text-xs text-white/25 truncate">
                                {entry.relation}
                              </div>
                            </div>

                            {/* Navigate arrow */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); onNavigate(entry.id); }}
                                className="flex h-6 w-6 items-center justify-center rounded-lg text-white/15 opacity-0 group-hover:opacity-100 transition-all hover:bg-white/[0.06] hover:text-white/40"
                                title="View wiki entry"
                              >
                                <ChevronRight className="h-3 w-3" strokeWidth={1.5} />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Show more */}
                      {hasMore && !isExpanded && (
                        <button
                          onClick={() => toggleCategory(group.category)}
                          className="w-full py-1.5 text-xs text-white/25 hover:text-white/40 transition-colors"
                        >
                          +{group.entries.length - 4} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="shrink-0 flex items-center justify-center gap-4 border-t border-white/[0.06] px-4 py-2">
        {(Object.entries(TYPE_META) as [WikiEntryType, typeof TYPE_META[WikiEntryType]][]).map(([type, meta]) => {
          const Icon = meta.icon;
          return (
            <div key={type} className="flex items-center gap-1">
              <Icon className="h-3 w-3" style={{ color: meta.color, opacity: 0.6 }} strokeWidth={1.5} />
              <span className="text-xs capitalize text-white/30">{type}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
