"use client";

/**
 * BulkSheet — start one orchestrator bulk run (`bulk:start`) over a chapter range.
 * GlassModal + grouped list of kinds + range picker (presets and a two-thumb slider).
 * Replaces BulkAnalyserModal; already-processed chapters are counted as done by main.
 */

import { useEffect, useMemo, useState } from "react";
import { Layers, Play } from "lucide-react";
import type { ChapterKind } from "@shared/ai/types";
import { cn } from "@/lib/utils";
import { GlassModal } from "@/components/ui/glass-modal";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useBookAIPrefs, useBulkRun } from "@/lib/ai/chapters";
import { KIND_META, KIND_ORDER } from "./kind-meta";

export interface BulkSheetProps {
  open: boolean;
  onClose: () => void;
  filePath: string;
  /** 0-based chapter the reader is on (default end of "Up to here"). */
  currentChapter: number;
  totalChapters: number;
  /** Display label for a 0-based chapter index (default `Ch. ${i + 1}`). */
  chapterLabel?: (index: number) => string;
  /** Called with the new run id after main accepted the run. */
  onStarted?: (runId: string) => void;
}

type Preset = "upto" | "rest" | "all" | "custom";

const defaultLabel = (i: number) => `Ch. ${i + 1}`;

export function BulkSheet({
  open, onClose, filePath, currentChapter, totalChapters, chapterLabel = defaultLabel, onStarted,
}: BulkSheetProps) {
  const { prefs, setPrefs } = useBookAIPrefs(open ? filePath : null);
  const bulk = useBulkRun(open ? filePath : null);
  const last = Math.max(0, totalChapters - 1);
  const here = Math.min(Math.max(0, currentChapter), last);

  const [selected, setSelected] = useState<ChapterKind[]>([]);
  const [preset, setPreset] = useState<Preset>("upto");
  const [range, setRange] = useState<[number, number]>([0, here]);
  const [starting, setStarting] = useState(false);

  const enabled = (k: ChapterKind) => {
    if (!prefs) return false;
    switch (k) {
      case "title": return prefs.titles;
      case "rewrite": return prefs.rewrite !== "off";
      case "format": return prefs.formatting;
      case "comments": return prefs.comments;
      case "knowledge": return prefs.knowledge;
    }
  };

  // On open: preselect what is on for this book, range "up to here".
  useEffect(() => {
    if (!open) return;
    setPreset("upto");
    setRange([0, here]);
  }, [open, here]);
  const prefsKey = prefs ? JSON.stringify(prefs) : "";
  useEffect(() => {
    if (open && prefs) setSelected(KIND_ORDER.filter((k) => enabled(k) && k !== "comments"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefsKey]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === "upto") setRange([0, here]);
    else if (p === "rest") setRange([here, last]);
    else if (p === "all") setRange([0, last]);
  };

  const kinds = useMemo(() => selected.filter(enabled), [selected, prefsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = range[1] - range[0] + 1;

  const start = async () => {
    if (kinds.length === 0 || starting) return;
    setStarting(true);
    const runId = await bulk.start({ kinds, from: range[0], to: range[1] });
    setStarting(false);
    if (runId) {
      onStarted?.(runId);
      onClose();
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      width={460}
      maxHeight="85vh"
      title="Bulk run"
      subtitle="Process a range of chapters in the background"
      icon={
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand/15 text-brand shadow-[0_0_24px_-6px_var(--accent-brand)]">
          <Layers className="size-5" strokeWidth={1.75} />
        </span>
      }
    >
      <GlassModal.Body className="space-y-5 pt-2">
        <ListGroup title="Features">
          {KIND_ORDER.map((k) => {
            const meta = KIND_META[k];
            const on = enabled(k);
            const checked = on && selected.includes(k);
            return (
              <ListRow
                key={k}
                // Plain glyph in the 24px slot, tinted while selected: one left text edge (§13.4).
                icon={<meta.Icon strokeWidth={1.75} style={checked ? { color: meta.color } : undefined} />}
                label={meta.label}
                description={
                  on ? (
                    k === "rewrite" && prefs ? `${prefs.rewrite === "polish" ? "Polish" : "Concise"} · ${meta.description}` : meta.description
                  ) : (
                    <span>
                      Off for this book ·{" "}
                      <button
                        type="button"
                        className="focus-ring rounded-xs font-medium text-brand hover:underline"
                        onClick={() => void setPrefs(k === "rewrite" ? { rewrite: "concise" } : k === "title" ? { titles: true } : k === "format" ? { formatting: true } : { [k]: true })}
                      >
                        Turn on
                      </button>
                    </span>
                  )
                }
                className={cn(!on && "opacity-60")}
              >
                <Switch
                  checked={checked}
                  disabled={!on}
                  onCheckedChange={(v) => setSelected((s) => (v ? [...s, k] : s.filter((x) => x !== k)))}
                  aria-label={meta.label}
                />
              </ListRow>
            );
          })}
        </ListGroup>

        <ListGroup title="Chapters" footer="Chapters that are already done are counted, not redone.">
          <div className="space-y-3.5 px-3 py-3">
            <SegmentedControl<Preset>
              size="sm"
              fill
              value={preset}
              onValueChange={applyPreset}
              options={[
                { value: "upto", label: "Up to here" },
                { value: "rest", label: "From here" },
                { value: "all", label: "Whole book" },
                { value: "custom", label: "Custom" },
              ]}
            />
            <Slider
              min={0}
              max={last}
              step={1}
              minStepsBetweenThumbs={0}
              value={range}
              disabled={totalChapters <= 1}
              onValueChange={(v) => {
                setPreset("custom");
                setRange([Math.min(v[0], v[1]), Math.max(v[0], v[1])] as [number, number]);
              }}
              aria-label="Chapter range"
            />
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="text-label">{chapterLabel(range[0])}</span>
              <span className="text-label-tertiary">
                {count} chapter{count === 1 ? "" : "s"} of {totalChapters}
              </span>
              <span className="text-label">{chapterLabel(range[1])}</span>
            </div>
          </div>
        </ListGroup>

        {(bulk.running || bulk.error) && (
          <p className={cn("px-3 text-xs", bulk.error ? "text-danger" : "text-label-secondary")}>
            {bulk.error ?? "A bulk run is already in progress for this book. Stop it before starting another."}
          </p>
        )}
      </GlassModal.Body>
      <GlassModal.Footer className="justify-between">
        <span className="text-xs tabular-nums text-label-secondary">
          {kinds.length} feature{kinds.length === 1 ? "" : "s"} · {count} chapter{count === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void start()} disabled={kinds.length === 0 || bulk.running || starting || totalChapters === 0}>
            <Play className="size-3.5" strokeWidth={0} fill="currentColor" />
            Start
          </Button>
        </div>
      </GlassModal.Footer>
    </GlassModal>
  );
}

export default BulkSheet;
