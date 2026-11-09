"use client";

import { useState } from "react";
import {
  BookMarked, Paintbrush, Type, Play, Minimize2, Layers,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { GlassModal } from "@/components/ui/glass-modal";
import { ListGroup, ListRow, type ListIconTint } from "@/components/ui/list-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { ThemeClasses } from "../lib/types";
import { fmtCh, type ChapterLabels } from "@/lib/chapter-labels";

/* ── Types ─────────────────────────────────────────────────── */

export type FeatureKey = "wiki" | "format" | "titles" | "condense";

export const FEATURE_META: Record<FeatureKey, { label: string; Icon: React.ElementType; color: string }> = {
  wiki:     { label: "AI Wiki",         Icon: BookMarked,  color: "var(--accent-brand)" },
  format:   { label: "Formatting",      Icon: Paintbrush,  color: "var(--system-purple)" },
  titles:   { label: "Chapter Titles",  Icon: Type,        color: "var(--system-green)" },
  condense: { label: "Concise Reading", Icon: Minimize2,   color: "var(--system-blue)" },
};

/* Presentational extras for the list rows (tint + one-line description). */
const FEATURE_ROW: Record<FeatureKey, { tint: ListIconTint; description: string }> = {
  wiki:     { tint: "accent", description: "Characters, places and events as you read" },
  format:   { tint: "purple", description: "Dialogue, letters and scene breaks styled" },
  titles:   { tint: "green",  description: "Name untitled chapters from their content" },
  condense: { tint: "blue",   description: "A tighter, faster-reading version" },
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

  const reduce = useReducedMotion();

  const toggleFeature = (key: FeatureKey) => {
    setSelectedFeatures(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const fromNum = Math.max(1, Math.min(maxChapter, parseInt(fromInput) || 1));
  const toNum = Math.max(fromNum, Math.min(maxChapter, parseInt(upToInput) || 1));

  const handleStart = () => {
    const fromIndex = storyChToIndex(fromNum, chapterLabels);
    const upToIndex = storyChToIndex(toNum, chapterLabels);
    onStart(selectedFeatures, fromIndex, upToIndex);
  };

  const featureCount = selectedFeatures.length;
  const rangeStart = maxChapter > 0 ? (fromNum - 1) / maxChapter : 0;
  const rangeWidth = maxChapter > 0 ? (toNum - fromNum + 1) / maxChapter : 0;

  return (
    <GlassModal
      open={isOpen}
      onClose={onClose}
      width={460}
      maxHeight="85vh"
      title="Bulk Analyse"
      subtitle="Run several AI features across a range of chapters"
      icon={
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand/15 text-brand shadow-[0_0_24px_-6px_var(--accent-brand)]">
          <Layers className="size-5" strokeWidth={1.75} />
        </span>
      }
    >
      <GlassModal.Body className="space-y-5 pt-2">
        {/* Step 1 — features */}
        <ListGroup title={<StepTitle n={1}>Features</StepTitle>}>
          {(Object.entries(FEATURE_META) as [FeatureKey, typeof FEATURE_META[FeatureKey]][]).map(([key, meta]) => {
            const enabled =
              key === "wiki"     ? wikiEnabled :
              key === "format"   ? formattingEnabled :
              key === "condense" ? condenseEnabled :
                                   enrichEnabled;
            const selected = selectedFeatures.includes(key);
            const row = FEATURE_ROW[key];
            return (
              <ListRow
                key={key}
                icon={<meta.Icon />}
                iconTint={enabled && selected ? row.tint : undefined}
                label={meta.label}
                description={enabled ? row.description : "Turn it on in AI Tools first"}
                className={cn(!enabled && "opacity-40")}
              >
                <Switch
                  checked={selected && enabled}
                  disabled={!enabled}
                  onCheckedChange={() => toggleFeature(key)}
                  aria-label={meta.label}
                />
              </ListRow>
            );
          })}
        </ListGroup>

        {/* Step 2 — chapter range */}
        <ListGroup
          title={<StepTitle n={2}>Chapters</StepTitle>}
          footer="Already-processed chapters are skipped automatically."
        >
          <div className="space-y-3 px-3 py-3">
            <div className="flex items-center gap-2">
              <RangeField label="From" value={fromInput} max={maxChapter} onChange={setFromInput} />
              <span aria-hidden className="h-px w-3 shrink-0 bg-separator-strong" />
              <RangeField label="To" value={upToInput} max={maxChapter} onChange={setUpToInput} />
              <span className="shrink-0 pl-1 text-xs tabular-nums text-label-tertiary">of {maxChapter}</span>
            </div>
            {/* Range preview — where in the book this run lands */}
            <div className="relative h-1.5 overflow-hidden rounded-full bg-fill-tertiary" aria-hidden>
              <motion.div
                className="absolute inset-y-0 rounded-full bg-brand"
                initial={false}
                animate={{ left: `${rangeStart * 100}%`, width: `${Math.max(rangeWidth * 100, 1.5)}%` }}
                transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.45 }}
              />
            </div>
          </div>
        </ListGroup>
      </GlassModal.Body>

      <GlassModal.Footer className="justify-between">
        <span className="text-xs tabular-nums text-label-secondary">
          {featureCount} feature{featureCount !== 1 ? "s" : ""} · Ch. {fromNum}–{toNum}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleStart} disabled={featureCount === 0}>
            <Play className="size-3.5" strokeWidth={0} fill="currentColor" />
            Start Analysis
          </Button>
        </div>
      </GlassModal.Footer>
    </GlassModal>
  );
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="inline-flex size-4 items-center justify-center rounded-full bg-fill-secondary text-2xs font-semibold tabular-nums text-label-secondary">
        {n}
      </span>
      {children}
    </span>
  );
}

function RangeField({ label, value, max, onChange }: {
  label: string;
  value: string;
  max: number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md bg-fill-tertiary px-3 transition-shadow duration-150 focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-brand)_45%,transparent)]">
      <span className="shrink-0 text-xs text-label-tertiary">{label}</span>
      <input
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent text-right text-sm font-medium tabular-nums text-label outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
}
