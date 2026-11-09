"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ChevronRight, ArrowLeft, Home, Network } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { WikiEntryType } from "@shared/knowledge/types";
import type { ChapterLabels } from "@/lib/chapter-labels";
import { WIKI_RELATION_CATEGORIES, WIKI_TYPE_META, WIKI_TYPE_ORDER, tintOf } from "@/lib/wiki-type-meta";

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

/* Shared wiki palette (src/lib/wiki-type-meta). */
const TYPE_META = WIKI_TYPE_META;

/* ── Relation categories ───────────────────────────────── */

const RELATION_CATEGORIES = WIKI_RELATION_CATEGORIES;

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

/* ── Component ─────────────────────────────────────────── */

interface RelationshipGraphProps {
  chapterLabels: ChapterLabels;
  /** Entries visible at the wiki's frontier. */
  entries: EntryListItem[];
  /** Relationships visible at the same frontier (`WikiSnapshot.relationships`). */
  relationships: { sourceId: string; targetId: string; relation: string }[];
  onNavigate: (id: string) => void;
}

export function RelationshipGraph({ entries, relationships, onNavigate }: RelationshipGraphProps) {
  const rels = useMemo<RelRow[]>(
    () => relationships.map((r) => ({ source_id: r.sourceId, target_id: r.targetId, relation: r.relation })),
    [relationships],
  );
  const [pickedId, setFocusedId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Auto-detect MC (highest significance character)
  const mcEntity = useMemo(() => {
    const chars = entries
      .filter(e => e.type === "character")
      .sort((a, b) => b.significance - a.significance);
    return chars[0] ?? entries[0] ?? null;
  }, [entries]);

  // Focus starts on the MC, and falls back to it when the picked entry leaves the visible set
  // (e.g. "Show everything" switched off).
  const focusedId = pickedId && entries.some((e) => e.id === pickedId) ? pickedId : mcEntity?.id ?? null;

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
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={<Network strokeWidth={1.25} />} title="No entities to graph" description="Connections appear once the wiki knows a few characters." />
      </div>
    );
  }

  const focusMeta = TYPE_META[focusedEntry.type];
  const FocusIcon = focusMeta.Icon;
  const totalRelations = groupedRelations.reduce((sum, g) => sum + g.entries.length, 0);
  const spring = reduceMotion ? { duration: 0 } : { type: "spring" as const, bounce: 0.25, duration: 0.5 };

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-col overflow-hidden">
      {/* Floating controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="glass pointer-events-auto flex h-9 items-center gap-0.5 rounded-full px-1">
          <button
            onClick={goBack}
            disabled={history.length === 0}
            title="Back"
            className="focus-ring pressable flex size-7 items-center justify-center rounded-full text-label-secondary hover:bg-fill-tertiary hover:text-label disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ArrowLeft className="size-3.5" strokeWidth={2} />
          </button>
          <button
            onClick={goHome}
            title="Center on protagonist"
            className="focus-ring pressable flex size-7 items-center justify-center rounded-full text-label-secondary hover:bg-fill-tertiary hover:text-label"
          >
            <Home className="size-3.5" strokeWidth={1.75} />
          </button>
          <span aria-hidden className="mx-1 h-4 w-px bg-separator-strong" />
          <div className="flex items-center gap-1.5 pr-2 text-xs">
            {history.length > 0 && (
              <>
                <span className="max-w-32 truncate text-label-secondary">
                  {entries.find(e => e.id === history[history.length - 1])?.name ?? "..."}
                </span>
                <ChevronRight className="size-3.5 text-label-tertiary" strokeWidth={2} />
              </>
            )}
            <span className="max-w-48 truncate font-medium text-label">{focusedEntry.name}</span>
            <span className="ml-1 rounded-full bg-fill-tertiary px-1.5 text-2xs tabular-nums text-label-secondary">{totalRelations}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="glass-thin pointer-events-auto flex h-9 items-center gap-3 rounded-full px-3.5">
          {WIKI_TYPE_ORDER.map((type) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: TYPE_META[type].color }} />
              <span className="text-2xs capitalize text-label-secondary">{type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Graph content */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-8 pt-20 pb-28">
          {/* ── Central node ── */}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.button
              key={focusedEntry.id}
              onClick={() => onNavigate(focusedEntry.id)}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={spring}
              className="focus-ring group relative mb-10 flex flex-col items-center gap-3 rounded-2xl p-2"
              title="Open wiki entry"
            >
              <span aria-hidden className="absolute top-2 size-24 rounded-full blur-2xl" style={{ background: focusMeta.bg }} />
              <div
                className="relative flex size-24 items-center justify-center rounded-full transition-transform duration-300 ease-spring group-hover:scale-105"
                style={{
                  background: focusMeta.bg,
                  boxShadow: `inset 0 0 0 1.5px ${focusMeta.color}, 0 0 40px ${tintOf(focusMeta.color, 19)}`,
                }}
              >
                <FocusIcon className="size-10" style={{ color: focusMeta.color }} strokeWidth={1.25} />
              </div>
              <div className="relative text-center">
                <div className="font-display text-xl font-semibold text-label">{focusedEntry.name}</div>
                <div className="mt-0.5 text-xs capitalize text-label-secondary">{focusedEntry.type} · {totalRelations} connections</div>
              </div>
            </motion.button>
          </AnimatePresence>

          {/* ── Category branches ── */}
          {groupedRelations.length === 0 ? (
            <p className="mt-2 text-sm text-label-secondary">No connections found</p>
          ) : (
            <div className="grid w-full max-w-3xl grid-cols-1 gap-3 lg:grid-cols-2">
              {groupedRelations.map((group, gi) => {
                const isExpanded = expandedCategories.has(group.category);
                const visibleEntries = isExpanded ? group.entries : group.entries.slice(0, 4);
                const hasMore = group.entries.length > 4;

                return (
                  <motion.div
                    key={`${focusedEntry.id}:${group.category}`}
                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: reduceMotion ? 0 : 0.04 * gi }}
                    className="glass-thin overflow-hidden rounded-2xl p-1.5"
                  >
                    {/* Category header */}
                    <button
                      onClick={() => toggleCategory(group.category)}
                      className="focus-ring flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 transition-colors hover:bg-fill-quaternary"
                    >
                      <span className="size-2 rounded-full" style={{ background: group.color }} />
                      <span className="text-headline text-label">{group.category}</span>
                      <span className="text-2xs tabular-nums text-label-secondary">{group.entries.length}</span>
                      <ChevronRight
                        className={`ml-auto size-3.5 text-label-tertiary transition-transform duration-200 ease-apple ${isExpanded ? "rotate-90" : ""}`}
                        strokeWidth={2}
                      />
                    </button>

                    {/* Entity nodes */}
                    <div className="mt-0.5 space-y-0.5">
                      {visibleEntries.map((entry) => {
                        const meta = TYPE_META[entry.type];
                        const EntryIcon = meta.Icon;
                        return (
                          <div
                            key={entry.id}
                            className="group flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 transition-colors hover:bg-fill-quaternary"
                            onClick={() => navigateTo(entry.id)}
                          >
                            {/* Connection line */}
                            <span className="h-px w-3 shrink-0" style={{ background: group.color, opacity: 0.4 }} />
                            <div
                              className="flex size-8 shrink-0 items-center justify-center rounded-full transition-transform duration-200 ease-spring group-hover:scale-110"
                              style={{ background: meta.bg }}
                            >
                              <EntryIcon className="size-3.5" style={{ color: meta.color }} strokeWidth={1.75} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-label">{entry.name}</div>
                              <div className="truncate text-xs text-label-secondary">{entry.relation}</div>
                            </div>

                            {/* Navigate arrow */}
                            <button
                              onClick={(e) => { e.stopPropagation(); onNavigate(entry.id); }}
                              className="focus-ring flex size-7 shrink-0 items-center justify-center rounded-full text-label-tertiary opacity-0 transition-opacity hover:bg-fill-tertiary hover:text-label group-hover:opacity-100 focus-visible:opacity-100"
                              title="View wiki entry"
                            >
                              <ChevronRight className="size-3.5" strokeWidth={2} />
                            </button>
                          </div>
                        );
                      })}

                      {/* Show more */}
                      {hasMore && !isExpanded && (
                        <button
                          onClick={() => toggleCategory(group.category)}
                          className="focus-ring h-8 w-full rounded-lg text-xs text-label-secondary transition-colors hover:bg-fill-quaternary hover:text-label"
                        >
                          +{group.entries.length - 4} more
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
