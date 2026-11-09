/**
 * One presentation table for chapter AI kinds, shared by AIToolsPanel, BulkSheet and BulkDock
 * (replaces the duplicated FEATURE_META in BulkAnalyserModal / BulkProgressDock).
 */

import { BookMarked, MessageCircle, Minimize2, Paintbrush, Type } from "lucide-react";
import type { ChapterKind, KindState } from "@shared/ai/types";
import type { ListIconTint } from "@/components/ui/list-group";

export interface KindMeta {
  label: string;
  /** Shorter label for compact rows (dock, chips). */
  short: string;
  description: string;
  Icon: React.ElementType;
  tint: ListIconTint;
  /** CSS color for rings/dots (system color variable). */
  color: string;
}

export const KIND_ORDER: readonly ChapterKind[] = ["knowledge", "rewrite", "format", "title", "comments"];

export const KIND_META: Record<ChapterKind, KindMeta> = {
  knowledge: {
    label: "Wiki", short: "Wiki", description: "Characters, places and events as you read",
    Icon: BookMarked, tint: "accent", color: "var(--accent-brand)",
  },
  rewrite: {
    label: "Rewrite", short: "Rewrite", description: "Polish fixes errors; Concise tightens the prose",
    Icon: Minimize2, tint: "blue", color: "var(--system-blue)",
  },
  format: {
    label: "Formatting", short: "Format", description: "Dialogue, system messages and stats styled",
    Icon: Paintbrush, tint: "purple", color: "var(--system-purple)",
  },
  title: {
    label: "Chapter titles", short: "Titles", description: "Name untitled chapters from their content",
    Icon: Type, tint: "green", color: "var(--system-green)",
  },
  comments: {
    label: "Reader comments", short: "Comments", description: "A few reactions from a fellow reader",
    Icon: MessageCircle, tint: "teal", color: "var(--system-teal)",
  },
};

export const STATE_LABEL: Record<KindState, string> = {
  off: "Off",
  missing: "Not yet",
  queued: "Queued",
  running: "Working",
  ready: "Ready",
  stale: "Outdated",
  error: "Failed",
  skipped: "Not needed",
};

/** "3m 20s", "45s", "1h 05m". */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
