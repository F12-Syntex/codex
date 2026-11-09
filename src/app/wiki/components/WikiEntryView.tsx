"use client";

import { useState, useEffect } from "react";
import {
  User, Swords, MapPin, Flame, Lightbulb,
} from "lucide-react";
import type { WikiEntry, WikiEntryType } from "@/lib/ai-wiki";

interface WikiEntryViewProps {
  entry: WikiEntry;
  filePath: string;
  onEntryClick: (id: string) => void;
}

const TYPE_META: Record<WikiEntryType, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  character: {
    icon: <User className="size-4" strokeWidth={1.75} />,
    label: "Character",
    color: "rgb(147, 197, 253)",
    bg: "rgba(96, 165, 250, 0.12)",
  },
  item: {
    icon: <Swords className="size-4" strokeWidth={1.75} />,
    label: "Item",
    color: "rgb(252, 211, 77)",
    bg: "rgba(251, 191, 36, 0.12)",
  },
  location: {
    icon: <MapPin className="size-4" strokeWidth={1.75} />,
    label: "Location",
    color: "rgb(110, 231, 183)",
    bg: "rgba(52, 211, 153, 0.12)",
  },
  event: {
    icon: <Flame className="size-4" strokeWidth={1.75} />,
    label: "Event",
    color: "rgb(253, 164, 175)",
    bg: "rgba(251, 113, 133, 0.12)",
  },
  concept: {
    icon: <Lightbulb className="size-4" strokeWidth={1.75} />,
    label: "Concept",
    color: "rgb(196, 181, 253)",
    bg: "rgba(167, 139, 250, 0.12)",
  },
};

export function WikiEntryView({ entry, filePath, onEntryClick }: WikiEntryViewProps) {
  const typeMeta = TYPE_META[entry.type];
  const [resolvedNames, setResolvedNames] = useState<Map<string, string>>(new Map());

  // Resolve relationship target names from DB
  useEffect(() => {
    const resolve = async () => {
      const api = window.electronAPI;
      if (!api) return;
      const entries = await api.wikiGetEntries(filePath);
      const nameMap = new Map(entries.map((e) => [e.id, e.name]));
      setResolvedNames(nameMap);
    };
    resolve();
  }, [filePath]);

  // Group details by category
  const detailsByCategory: Record<string, { chapterIndex: number; content: string }[]> = {};
  for (const d of entry.details) {
    const cat = d.category || "info";
    if (!detailsByCategory[cat]) detailsByCategory[cat] = [];
    detailsByCategory[cat].push({ chapterIndex: d.chapterIndex, content: d.content });
  }

  return (
    <div className="mx-auto max-w-[700px] px-8 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <span
            className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
            style={{ background: typeMeta.bg, color: typeMeta.color }}
          >
            {typeMeta.icon}
            {typeMeta.label}
          </span>
          <span className="inline-flex h-6 items-center rounded-full bg-fill-tertiary px-2.5 text-xs capitalize text-label-secondary">
            {entry.status}
          </span>
          {entry.aliases.length > 0 && (
            <span className="text-xs text-label-tertiary">
              aka {entry.aliases.join(", ")}
            </span>
          )}
        </div>

        <h1 className="text-large-title font-display text-label">
          {entry.name}
        </h1>

        <p className="mt-3 text-base leading-relaxed text-label-secondary">
          {entry.shortDescription}
        </p>

        {/* Chapter appearances */}
        <div className="mt-4 flex flex-wrap gap-1">
          {entry.chapterAppearances.map((ch) => (
            <span
              key={ch}
              className="inline-flex h-5 items-center rounded-full px-2 text-2xs tabular-nums font-medium"
              style={{ background: typeMeta.bg, color: typeMeta.color }}
            >
              Ch. {ch + 1}
            </span>
          ))}
        </div>
      </div>

      <div className="h-px bg-separator" />

      {/* Description */}
      {entry.description && (
        <div className="mt-6">
          <SectionTitle>Overview</SectionTitle>
          <div className="mt-3 text-sm leading-relaxed text-label-secondary whitespace-pre-wrap">
            {entry.description}
          </div>
        </div>
      )}

      {/* Details by category */}
      {Object.keys(detailsByCategory).length > 0 && (
        <div className="mt-6 space-y-5">
          {Object.entries(detailsByCategory).map(([category, items]) => (
            <div key={category}>
              <SectionTitle>{formatCategory(category)}</SectionTitle>
              <div className="mt-2 space-y-2">
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="flex gap-3 rounded-lg bg-fill-quaternary px-3.5 py-2.5 hairline"
                  >
                    <span className="shrink-0 text-2xs tabular-nums text-label-tertiary">
                      Ch. {item.chapterIndex + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-label-secondary">
                      {item.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Relationships */}
      {entry.relationships.length > 0 && (
        <RelationshipsSection
          relationships={entry.relationships}
          resolvedNames={resolvedNames}
          onEntryClick={onEntryClick}
        />
      )}

      <div className="h-12" />
    </div>
  );
}

/* ── Relationships Section ────────────────────────────── */

const RELATION_GROUPS: { label: string; match: RegExp }[] = [
  { label: "Allies & Friends", match: /ally|friend|companion|comrade|partner|trusted/i },
  { label: "Family", match: /family|father|mother|brother|sister|parent|child|son|daughter|spouse|husband|wife|sibling|relative|kin/i },
  { label: "Rivals & Enemies", match: /enemy|rival|antagonist|opponent|adversary|nemesis|hostile/i },
  { label: "Mentors & Students", match: /mentor|student|teacher|master|apprentice|disciple|pupil|guide/i },
  { label: "Other", match: /.*/ },
];

function RelationshipsSection({
  relationships,
  resolvedNames,
  onEntryClick,
}: {
  relationships: { targetId: string; relation: string; since: number }[];
  resolvedNames: Map<string, string>;
  onEntryClick: (id: string) => void;
}) {
  // Deduplicate: keep the latest relation per target
  const deduped = new Map<string, { targetId: string; relation: string; since: number }>();
  for (const rel of relationships) {
    const existing = deduped.get(rel.targetId);
    if (!existing || rel.since > existing.since) {
      deduped.set(rel.targetId, rel);
    }
  }
  const uniqueRels = Array.from(deduped.values());

  // Group by relation type
  const groups: { label: string; rels: typeof uniqueRels }[] = [];
  const assigned = new Set<string>();

  for (const group of RELATION_GROUPS) {
    const matching = uniqueRels.filter(
      (r) => !assigned.has(r.targetId) && group.match.test(r.relation),
    );
    if (matching.length > 0) {
      groups.push({ label: group.label, rels: matching });
      for (const r of matching) assigned.add(r.targetId);
    }
  }

  return (
    <div className="mt-6">
      <SectionTitle>Relationships ({uniqueRels.length})</SectionTitle>
      <div className="mt-2 space-y-3">
        {groups.map((group) => (
          <div key={group.label}>
            <span className="text-section px-1">
              {group.label}
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {group.rels.map((rel) => {
                const targetName = resolvedNames.get(rel.targetId) ?? rel.targetId.replace(/-/g, " ");
                return (
                  <button
                    key={rel.targetId}
                    onClick={() => onEntryClick(rel.targetId)}
                    className="focus-ring pressable group inline-flex h-7 items-center gap-1.5 rounded-full bg-fill-tertiary px-3 text-left hover:bg-fill-secondary"
                    title={`${rel.relation} (Ch. ${rel.since + 1})`}
                  >
                    <span className="text-xs font-medium text-label">
                      {targetName}
                    </span>
                    <span className="text-xs text-label-tertiary">{rel.relation}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-headline text-label">
      {children}
    </h3>
  );
}

function formatCategory(cat: string): string {
  return cat
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
