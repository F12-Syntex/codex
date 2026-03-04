"use client";

import {
  User, Swords, MapPin, Flame, Lightbulb,
  Link2, Clock,
} from "lucide-react";
import type { BookWiki, WikiEntry, WikiEntryType } from "@/lib/ai-wiki";

interface WikiEntryViewProps {
  entry: WikiEntry;
  wiki: BookWiki;
}

const TYPE_META: Record<WikiEntryType, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  character: {
    icon: <User className="h-4 w-4" strokeWidth={1.5} />,
    label: "Character",
    color: "rgb(147, 197, 253)",
    bg: "rgba(96, 165, 250, 0.12)",
  },
  item: {
    icon: <Swords className="h-4 w-4" strokeWidth={1.5} />,
    label: "Item",
    color: "rgb(252, 211, 77)",
    bg: "rgba(251, 191, 36, 0.12)",
  },
  location: {
    icon: <MapPin className="h-4 w-4" strokeWidth={1.5} />,
    label: "Location",
    color: "rgb(110, 231, 183)",
    bg: "rgba(52, 211, 153, 0.12)",
  },
  event: {
    icon: <Flame className="h-4 w-4" strokeWidth={1.5} />,
    label: "Event",
    color: "rgb(253, 164, 175)",
    bg: "rgba(251, 113, 133, 0.12)",
  },
  concept: {
    icon: <Lightbulb className="h-4 w-4" strokeWidth={1.5} />,
    label: "Concept",
    color: "rgb(196, 181, 253)",
    bg: "rgba(167, 139, 250, 0.12)",
  },
};

export function WikiEntryView({ entry, wiki }: WikiEntryViewProps) {
  const typeMeta = TYPE_META[entry.type];

  // Group details by category
  const detailsByCategory: Record<string, { chapterIndex: number; content: string }[]> = {};
  for (const d of entry.details) {
    const cat = d.category || "info";
    if (!detailsByCategory[cat]) detailsByCategory[cat] = [];
    detailsByCategory[cat].push({ chapterIndex: d.chapterIndex, content: d.content });
  }

  // Resolve relationship target names
  const resolvedRelationships = entry.relationships.map((rel) => ({
    ...rel,
    targetName: wiki.entries[rel.targetId]?.name ?? rel.targetId.replace(/-/g, " "),
  }));

  return (
    <div className="mx-auto max-w-[700px] px-8 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium"
            style={{ background: typeMeta.bg, color: typeMeta.color }}
          >
            {typeMeta.icon}
            {typeMeta.label}
          </span>
          {entry.aliases.length > 0 && (
            <span className="text-[11px] text-white/30">
              aka {entry.aliases.join(", ")}
            </span>
          )}
        </div>

        <h1 className="text-[24px] font-bold tracking-tight text-white/90">
          {entry.name}
        </h1>

        <p className="mt-2 text-[14px] leading-relaxed text-white/60">
          {entry.shortDescription}
        </p>

        {/* Chapter appearances bar */}
        <div className="mt-4 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-white/25" strokeWidth={1.5} />
          <span className="text-[11px] text-white/30">
            First: Ch. {entry.firstAppearance + 1}
          </span>
          <span className="text-[11px] text-white/20">·</span>
          <span className="text-[11px] text-white/30">
            Appears in {entry.chapterAppearances.length} {entry.chapterAppearances.length === 1 ? "chapter" : "chapters"}
          </span>
        </div>

        {/* Chapter appearance timeline */}
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.chapterAppearances.map((ch) => (
            <span
              key={ch}
              className="rounded-lg px-1.5 py-0.5 text-[11px] tabular-nums font-medium"
              style={{ background: typeMeta.bg, color: typeMeta.color }}
            >
              {ch + 1}
            </span>
          ))}
        </div>
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* Description */}
      {entry.description && (
        <div className="mt-6">
          <SectionTitle>Overview</SectionTitle>
          <div className="mt-2 text-[13px] leading-relaxed text-white/60 whitespace-pre-wrap">
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
                    className="flex gap-3 rounded-lg px-3 py-2"
                    style={{ background: "var(--bg-surface)" }}
                  >
                    <span className="shrink-0 text-[11px] tabular-nums text-white/25">
                      Ch. {item.chapterIndex + 1}
                    </span>
                    <p className="text-[12px] leading-relaxed text-white/60">
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
      {resolvedRelationships.length > 0 && (
        <div className="mt-6">
          <SectionTitle>Relationships</SectionTitle>
          <div className="mt-2 space-y-1">
            {resolvedRelationships.map((rel, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ background: "var(--bg-surface)" }}
              >
                <Link2 className="h-3.5 w-3.5 shrink-0 text-white/25" strokeWidth={1.5} />
                <div className="flex-1">
                  <span className="text-[12px] font-medium capitalize text-white/70">
                    {rel.targetName}
                  </span>
                  <span className="mx-2 text-[11px] text-white/25">—</span>
                  <span className="text-[11px] capitalize text-white/40">{rel.relation}</span>
                </div>
                <span className="text-[11px] tabular-nums text-white/20">
                  Ch. {rel.since + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="h-12" />
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium uppercase tracking-wider text-white/30">
      {children}
    </h3>
  );
}

function formatCategory(cat: string): string {
  return cat
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
