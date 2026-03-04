"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { WikiEntry, WikiEntryType } from "@/lib/ai-wiki";
import { getEntryAtChapter } from "@/lib/ai-wiki";

/* ── WikiInfoPanel — non-invasive bottom bar shown on entity click ── */

interface WikiInfoPanelProps {
  entry: WikiEntry;
  currentChapter: number;
  onClose: () => void;
  onOpenWiki?: () => void;
}

const TYPE_LABELS: Record<WikiEntryType, string> = {
  character: "Character",
  item: "Item",
  location: "Location",
  event: "Event",
  concept: "Concept",
};

const TYPE_COLORS: Record<WikiEntryType, { bg: string; text: string }> = {
  character: { bg: "rgba(96, 165, 250, 0.15)", text: "rgb(147, 197, 253)" },
  item: { bg: "rgba(251, 191, 36, 0.15)", text: "rgb(252, 211, 77)" },
  location: { bg: "rgba(52, 211, 153, 0.15)", text: "rgb(110, 231, 183)" },
  event: { bg: "rgba(251, 113, 133, 0.15)", text: "rgb(253, 164, 175)" },
  concept: { bg: "rgba(167, 139, 250, 0.15)", text: "rgb(196, 181, 253)" },
};

export function WikiInfoPanel({ entry, currentChapter, onClose }: WikiInfoPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const chapterData = getEntryAtChapter(entry, currentChapter);
  const typeStyle = TYPE_COLORS[entry.type] ?? TYPE_COLORS.concept;

  // Group details by category
  const detailsByCategory: Record<string, string[]> = {};
  for (const d of chapterData.details) {
    const cat = d.category || "info";
    if (!detailsByCategory[cat]) detailsByCategory[cat] = [];
    detailsByCategory[cat].push(d.content);
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute bottom-0 left-0 right-0 z-40 border-t border-white/[0.08] shadow-xl shadow-black/40"
      style={{
        background: "var(--bg-overlay, #1a1a1a)",
        backdropFilter: "blur(20px)",
        animation: "slideUpPanel 0.2s ease",
      }}
    >
      <div className="mx-auto max-w-[800px] px-4 py-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] font-medium"
              style={{ background: typeStyle.bg, color: typeStyle.text }}
            >
              {TYPE_LABELS[entry.type]}
            </span>
            <span className="text-[14px] font-semibold text-white/90 truncate">{entry.name}</span>
            {entry.aliases.length > 0 && (
              <span className="text-[11px] text-white/30 truncate hidden sm:inline">
                aka {entry.aliases.slice(0, 2).join(", ")}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/60"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content row */}
        <div className="mt-1.5 flex gap-6">
          {/* Description */}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] leading-relaxed text-white/60 line-clamp-2">
              {chapterData.shortDescription || entry.shortDescription}
            </p>
          </div>

          {/* Key details (compact) */}
          <div className="flex gap-4 shrink-0">
            {Object.entries(detailsByCategory).slice(0, 2).map(([cat, items]) => (
              <div key={cat} className="max-w-[180px]">
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/30">
                  {cat.replace(/_/g, " ")}
                </span>
                <p className="text-[11px] leading-relaxed text-white/50 line-clamp-2">
                  {items[0]}
                </p>
              </div>
            ))}

            {/* Relationships (compact) */}
            {chapterData.relationships.length > 0 && (
              <div className="max-w-[160px]">
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/30">
                  Relations
                </span>
                {chapterData.relationships.slice(0, 2).map((rel, i) => (
                  <p key={i} className="text-[11px] text-white/50">
                    <span className="capitalize">{rel.relation}</span>: {rel.targetId.replace(/-/g, " ")}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chapter info */}
        <div className="mt-1.5 flex items-center gap-3">
          <span className="text-[11px] text-white/25">
            First seen Ch. {entry.firstAppearance + 1}
          </span>
          <span className="text-[11px] text-white/25">·</span>
          <span className="text-[11px] text-white/25">
            {entry.chapterAppearances.length} {entry.chapterAppearances.length === 1 ? "appearance" : "appearances"}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes slideUpPanel {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ── Entity highlighting utilities ────────────────────── */

/**
 * Build a regex that matches all entity names/aliases in the wiki.
 * Returns matches sorted by length (longest first) to avoid partial matches.
 */
export function buildEntityRegex(
  entityIndex: Array<{ id: string; name: string }>,
): RegExp | null {
  if (entityIndex.length === 0) return null;

  // Escape special regex chars and sort by length desc
  const patterns = entityIndex
    .filter((e) => e.name.length >= 2) // Skip single-char names
    .map((e) => escapeRegex(e.name));

  if (patterns.length === 0) return null;

  // Word-boundary match, case insensitive
  return new RegExp(`\\b(${patterns.join("|")})\\b`, "gi");
}

/**
 * Inject wiki entity spans into HTML paragraph text.
 * Returns modified HTML with <span data-wiki-id="..." class="wiki-entity wiki-entity-{color}"> wrappers.
 */
export function injectWikiEntities(
  html: string,
  entityIndex: Array<{ id: string; name: string; color: string }>,
  regex: RegExp,
): string {
  // Build a name→entity lookup (case-insensitive)
  const lookup = new Map<string, { id: string; color: string }>();
  for (const e of entityIndex) {
    lookup.set(e.name.toLowerCase(), { id: e.id, color: e.color });
  }

  // Split HTML into tags and text segments, only modify text segments
  const parts = html.split(/(<[^>]+>)/);
  let insideTag = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith("<")) {
      // Check for tags we shouldn't inject into
      if (part.startsWith("<span data-wiki-id")) insideTag = true;
      if (part === "</span>" && insideTag) insideTag = false;
      continue;
    }
    if (insideTag) continue;

    // Replace entity names in text segments
    regex.lastIndex = 0;
    parts[i] = part.replace(regex, (match) => {
      const entity = lookup.get(match.toLowerCase());
      if (!entity) return match;
      return `<span data-wiki-id="${entity.id}" class="wiki-entity wiki-entity-${entity.color}">${match}</span>`;
    });
  }

  return parts.join("");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
