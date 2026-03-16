"use client";

import { useState } from "react";
import {
  X, BookMarked, Paintbrush, Type, Play, Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemeClasses } from "../lib/types";
import { fmtCh, type ChapterLabels } from "@/lib/chapter-labels";

/* ── Types ─────────────────────────────────────────────────── */

export type FeatureKey = "wiki" | "format" | "titles" | "condense";

export const FEATURE_META: Record<FeatureKey, { label: string; Icon: React.ElementType; color: string }> = {
  wiki:     { label: "AI Wiki",         Icon: BookMarked,  color: "var(--accent-brand)" },
  format:   { label: "Formatting",      Icon: Paintbrush,  color: "#a78bfa" },
  titles:   { label: "Chapter Titles",  Icon: Type,        color: "#34d399" },
  condense: { label: "Concise Reading", Icon: Minimize2,   color: "#60a5fa" },
};

interface BulkAnalyserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (features: FeatureKey[], fromIndex: number, upToIndex: number) => void;
  theme: ThemeClasses;
  chapterLabels: ChapterLabels;
  totalChapters: number;
  currentChapter: number;
  wikiEnabled: boolean;
  formattingEnabled: boolean;
  enrichEnabled: boolean;
  condenseEnabled: boolean;
}

/* ── Helpers ────────────────────────────────────────────────── */

function storyChToIndex(storyNum: number, labels: ChapterLabels): number {
  if (Object.keys(labels).length === 0) return storyNum - 1;
  let bestIdx = -1, bestNum = -1;
  for (const [idx, num] of Object.entries(labels)) {
    if (num <= storyNum && num > bestNum) { bestNum = num; bestIdx = Number(idx); }
  }
  return bestIdx === -1 ? storyNum - 1 : bestIdx;
}

function maxStoryChapter(labels: ChapterLabels, totalChapters: number): number {
  if (Object.keys(labels).length === 0) return totalChapters;
  return Math.max(...Object.values(labels));
}

/* ── Component ──────────────────────────────────────────────── */

export function BulkAnalyserModal({
  isOpen,
  onClose,
  onStart,
  theme,
  chapterLabels,
  totalChapters,
  currentChapter,
  wikiEnabled,
  formattingEnabled,
  enrichEnabled,
  condenseEnabled,
}: BulkAnalyserModalProps) {
  const maxChapter = maxStoryChapter(chapterLabels, totalChapters);
  const currentStoryChapter = fmtCh(currentChapter, chapterLabels) ?? currentChapter + 1;

  const [selectedFeatures, setSelectedFeatures] = useState<FeatureKey[]>(["wiki", "format"]);
  const [fromInput, setFromInput] = useState<string>("1");
  const [upToInput, setUpToInput] = useState<string>(String(currentStoryChapter));

  const toggleFeature = (key: FeatureKey) => {
    setSelectedFeatures(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  if (!isOpen) return null;

  const fromNum = Math.max(1, Math.min(maxChapter, parseInt(fromInput) || 1));
  const toNum = Math.max(fromNum, Math.min(maxChapter, parseInt(upToInput) || 1));

  const handleStart = () => {
    const fromIndex = storyChToIndex(fromNum, chapterLabels);
    const upToIndex = storyChToIndex(toNum, chapterLabels);
    onStart(selectedFeatures, fromIndex, upToIndex);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={cn(
          "relative flex w-[420px] max-h-[85vh] flex-col rounded-lg border shadow-lg shadow-black/40",
          theme.panel,
          theme.border,
        )}
        style={{ background: "var(--bg-overlay)", animation: "overlay-in 0.15s ease" }}
      >
        {/* Header */}
        <div className={cn("flex shrink-0 items-center justify-between border-b px-4 py-3", theme.border)}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--accent-brand-dim)" }}>
              <Paintbrush className="h-3.5 w-3.5" style={{ color: "var(--accent-brand)" }} strokeWidth={1.5} />
            </div>
            <div>
              <p className={cn("text-sm font-semibold leading-tight", theme.text)}>Bulk Analyse</p>
              <p className={cn("text-xs leading-tight", theme.muted)} style={{ opacity: 0.45 }}>
                Run multiple features across chapters
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-colors", theme.btn)}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-4">
          {/* Feature selection */}
          <div>
            <p className={cn("mb-2 text-xs font-medium uppercase tracking-wider", theme.muted)} style={{ opacity: 0.45 }}>
              Features
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(FEATURE_META) as [FeatureKey, typeof FEATURE_META[FeatureKey]][]).map(([key, meta]) => {
                const enabled =
                  key === "wiki"     ? wikiEnabled :
                  key === "format"   ? formattingEnabled :
                  key === "condense" ? condenseEnabled :
                                       enrichEnabled;
                const selected = selectedFeatures.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleFeature(key)}
                    disabled={!enabled}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all",
                      !enabled ? "cursor-not-allowed opacity-30" : "cursor-pointer",
                      selected && enabled
                        ? "border-[var(--accent-brand)]/40 bg-[var(--accent-brand)]/10"
                        : cn(theme.border, "bg-[var(--bg-inset)] hover:bg-[var(--bg-elevated)]"),
                    )}
                  >
                    <meta.Icon
                      className="h-4 w-4"
                      style={{ color: selected && enabled ? meta.color : undefined, opacity: selected ? 1 : 0.4 }}
                      strokeWidth={1.5}
                    />
                    <span
                      className={cn("text-xs font-medium leading-tight text-center", theme.text)}
                      style={{ opacity: selected && enabled ? 1 : 0.4 }}
                    >
                      {meta.label}
                    </span>
                    {selected && enabled && (
                      <div className="h-1 w-1 rounded-full" style={{ background: meta.color }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chapter range */}
          <div>
            <p className={cn("mb-2 text-xs font-medium uppercase tracking-wider", theme.muted)} style={{ opacity: 0.45 }}>
              Chapter range
            </p>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-2 rounded-lg border px-3 py-2 flex-1"
                style={{ background: "var(--bg-inset)", borderColor: "var(--glass-border)" }}
              >
                <span className={cn("text-xs shrink-0", theme.muted)} style={{ opacity: 0.4 }}>From</span>
                <input
                  type="number"
                  min={1}
                  max={maxChapter}
                  value={fromInput}
                  onChange={e => setFromInput(e.target.value)}
                  className={cn(
                    "w-12 bg-transparent text-sm font-medium tabular-nums outline-none",
                    theme.text,
                  )}
                />
              </div>
              <span className={cn("text-xs shrink-0", theme.muted)} style={{ opacity: 0.3 }}>–</span>
              <div
                className="flex items-center gap-2 rounded-lg border px-3 py-2 flex-1"
                style={{ background: "var(--bg-inset)", borderColor: "var(--glass-border)" }}
              >
                <span className={cn("text-xs shrink-0", theme.muted)} style={{ opacity: 0.4 }}>To</span>
                <input
                  type="number"
                  min={1}
                  max={maxChapter}
                  value={upToInput}
                  onChange={e => setUpToInput(e.target.value)}
                  className={cn(
                    "w-12 bg-transparent text-sm font-medium tabular-nums outline-none",
                    theme.text,
                  )}
                />
              </div>
              <span className={cn("text-xs tabular-nums shrink-0", theme.muted)} style={{ opacity: 0.3 }}>
                / {maxChapter}
              </span>
            </div>
            <p className={cn("mt-1.5 text-xs", theme.muted)} style={{ opacity: 0.3 }}>
              Already-processed chapters are skipped automatically
            </p>
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={selectedFeatures.length === 0}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
              selectedFeatures.length === 0
                ? "cursor-not-allowed opacity-30"
                : "hover:opacity-90 active:scale-[0.99]",
            )}
            style={{
              background: selectedFeatures.length > 0 ? "var(--accent-brand)" : "var(--bg-inset)",
              color: selectedFeatures.length > 0 ? "var(--accent-brand-fg)" : undefined,
            }}
          >
            <Play className="h-3.5 w-3.5" strokeWidth={0} fill="currentColor" />
            Start Analysis
            <span className="opacity-60">— {selectedFeatures.length} feature{selectedFeatures.length !== 1 ? "s" : ""}, Ch. {fromNum}–{toNum}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
