"use client";

/**
 * AIToolsPanel — the reader's AI Tools sidebar (replaces AISidebar). A floating `glass-thick`
 * rounded-2xl panel over the reading area with:
 *  - Features: per-book prefs (`book_ai_prefs`), saved atomically in main;
 *  - This chapter: live per-kind state with ↻ (redo THIS chapter only) and Clear (this chapter,
 *    this kind only) — AI_AUDIT S1-1;
 *  - Book: ready/total per kind from `chapters:status`;
 *  - Bulk…: opens BulkSheet. Progress shows in BulkDock (mounted by the reader).
 * Every number comes from main (orchestrator), never from UI flags.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BookOpen, KeyRound, Layers, Palette, Sparkles, X } from "lucide-react";
import type { BookAIPrefs, ChapterKind } from "@shared/ai/types";
import { cn } from "@/lib/utils";
import { useClickOutside } from "@/hooks/useClickOutside";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ProgressRing } from "@/components/ui/progress-ring";
import { NumberTicker } from "@/components/ui/number-ticker";
import { rpc } from "@/lib/ai/rpc";
import { hasRpc } from "@/lib/ai/bridge";
import { useBookAIPrefs, useBookAIStatus, useBulkRun, useChapterArtifacts } from "@/lib/ai/chapters";
import { ChapterStatusList } from "./ChapterStatusList";
import { BulkSheet } from "./BulkSheet";
import { KIND_META, KIND_ORDER } from "./kind-meta";

export interface AIToolsPanelProps {
  filePath: string;
  /** 0-based chapter the reader is showing. */
  chapterIndex: number;
  onClose: () => void;
  /** Total chapters (range picker, prefetch guard). Default: from `chapters:status`. */
  totalChapters?: number;
  /** Display label for a 0-based chapter index (default `Ch. ${i + 1}`). */
  chapterLabel?: (index: number) => string;
  /** Shown when the wiki has content. */
  onOpenWiki?: () => void;
  /** Shown when formatting is on. */
  onOpenStyleDictionary?: () => void;
  /** Selector for elements whose clicks must not close the panel (default: the reader header). */
  ignoreOutsideSelector?: string;
  className?: string;
}

const defaultLabel = (i: number) => `Ch. ${i + 1}`;

function isOn(prefs: BookAIPrefs, k: ChapterKind): boolean {
  switch (k) {
    case "title": return prefs.titles;
    case "rewrite": return prefs.rewrite !== "off";
    case "format": return prefs.formatting;
    case "comments": return prefs.comments;
    case "knowledge": return prefs.knowledge;
  }
}

function patchFor(k: Exclude<ChapterKind, "rewrite">, on: boolean): Partial<BookAIPrefs> {
  switch (k) {
    case "title": return { titles: on };
    case "format": return { formatting: on };
    case "comments": return { comments: on };
    case "knowledge": return { knowledge: on };
  }
}

export function AIToolsPanel({
  filePath, chapterIndex, onClose, totalChapters, chapterLabel = defaultLabel,
  onOpenWiki, onOpenStyleDictionary, ignoreOutsideSelector = "[data-reader-header]", className,
}: AIToolsPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  const { prefs, setPrefs } = useBookAIPrefs(filePath);
  const chapter = useChapterArtifacts(filePath, chapterIndex);
  const { status: book } = useBookAIStatus(filePath);
  const bulk = useBulkRun(filePath);

  useEffect(() => {
    if (!hasRpc()) return;
    let alive = true;
    rpc("ai:settings:get").then((s) => alive && setHasKey(s.hasKey), () => alive && setHasKey(null));
    return () => {
      alive = false;
    };
  }, []);

  // The BulkSheet is portaled; clicks in it are not "outside" the panel.
  const onOutside = useCallback(() => {
    if (!bulkOpen) onClose();
  }, [bulkOpen, onClose]);
  useClickOutside(ref, onOutside, ignoreOutsideSelector);

  const noKey = hasKey === false;
  const total = totalChapters ?? (book ? Math.max(...Object.values(book.totals).map((t) => t.total), 0) : 0);

  const enabledKinds = prefs ? KIND_ORDER.filter((k) => isOn(prefs, k)) : [];
  const chapterReady = chapter.status ? enabledKinds.filter((k) => ["ready", "skipped"].includes(chapter.status!.kinds[k])).length : 0;
  const chapterBusy = chapter.status ? enabledKinds.some((k) => ["queued", "running"].includes(chapter.status!.kinds[k])) : false;

  return (
    <motion.aside
      ref={ref}
      aria-label="AI tools"
      className={cn(
        "glass-thick grain absolute top-2 right-2 bottom-2 z-20 flex w-80 flex-col overflow-hidden rounded-2xl text-label",
        className,
      )}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 16, scale: 0.98 }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 400, damping: 34 }}
    >
      {/* Header */}
      <div className="flex h-13 shrink-0 items-center gap-2.5 pr-3 pl-4">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Sparkles className="size-3.5" strokeWidth={2} />
        </span>
        <span className="flex-1 font-display text-base font-semibold text-label">AI Tools</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="focus-ring pressable inline-flex size-7 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary transition-colors hover:bg-fill-secondary hover:text-label"
        >
          <X className="size-3.5" strokeWidth={2.25} />
        </button>
      </div>

      {noKey && (
        <div className="mx-2 mb-1 flex items-start gap-2.5 rounded-lg bg-warning/10 px-3 py-2.5">
          <KeyRound className="mt-px size-4 shrink-0 text-warning" strokeWidth={1.75} />
          <p className="text-xs leading-relaxed text-label-secondary">
            Add an <span className="font-medium text-warning">OpenRouter API key</span> in Settings → Intelligence to use AI tools.
          </p>
        </div>
      )}

      <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-2", noKey && "pointer-events-none select-none opacity-50")}>
        {/* This chapter: summary + live status */}
        <section aria-label="This chapter">
          <div className="flex items-center gap-3 rounded-lg bg-fill-quaternary px-3 py-2.5">
            <ProgressRing
              size={38}
              stroke={3.5}
              value={enabledKinds.length ? chapterReady / enabledKinds.length : 0}
              indeterminate={chapterBusy && chapterReady === 0}
              color={chapterReady === enabledKinds.length && enabledKinds.length > 0 ? "var(--system-green)" : "var(--accent-brand)"}
              aria-label="This chapter"
            >
              <span className="text-2xs font-semibold tabular-nums text-label">
                <NumberTicker value={chapterReady} />/{enabledKinds.length}
              </span>
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <div className="truncate text-headline text-label">{chapterLabel(chapterIndex)}</div>
              <div className="truncate text-xs text-label-tertiary">
                {enabledKinds.length === 0
                  ? "No AI features on for this book"
                  : chapterBusy
                    ? "Working on this chapter…"
                    : `${chapterReady} of ${enabledKinds.length} ready`}
              </div>
            </div>
          </div>
          <ChapterStatusList
            className="mt-1"
            status={chapter.status}
            disabled={noKey}
            onRetry={(k) => void chapter.retry(k)}
            onClear={(k) => void chapter.clear(k)}
          />
        </section>

        {/* Features (per-book prefs) */}
        <ListGroup title="Features">
          {prefs ? (
            <>
              <FeatureSwitch kind="knowledge" checked={prefs.knowledge} onChange={(v) => void setPrefs(patchFor("knowledge", v))} />
              <ListRow
                icon={<KIND_META.rewrite.Icon />}
                iconTint={prefs.rewrite !== "off" ? KIND_META.rewrite.tint : undefined}
                label="Rewrite"
                description={prefs.rewrite === "polish" ? "Fixes errors, keeps every word" : prefs.rewrite === "concise" ? "Tighter prose, same story" : undefined}
                className="flex-wrap"
              >
                <SegmentedControl<BookAIPrefs["rewrite"]>
                  size="sm"
                  value={prefs.rewrite}
                  onValueChange={(v) => void setPrefs({ rewrite: v })}
                  options={[
                    { value: "off", label: "Off" },
                    { value: "polish", label: "Polish" },
                    { value: "concise", label: "Concise" },
                  ]}
                  aria-label="Rewrite mode"
                />
              </ListRow>
              <FeatureSwitch kind="format" checked={prefs.formatting} onChange={(v) => void setPrefs(patchFor("format", v))} />
              <FeatureSwitch kind="title" checked={prefs.titles} onChange={(v) => void setPrefs(patchFor("title", v))} />
              <FeatureSwitch kind="comments" checked={prefs.comments} onChange={(v) => void setPrefs(patchFor("comments", v))} />
              <ListRow label="Prepare next chapter" description="Process ahead while you read">
                <Switch size="sm" checked={prefs.prefetchNext} onCheckedChange={(v) => void setPrefs({ prefetchNext: v })} aria-label="Prepare next chapter" />
              </ListRow>
            </>
          ) : (
            <div className="h-44 animate-pulse" />
          )}
        </ListGroup>

        {/* Book totals */}
        {book && enabledKinds.length > 0 && (
          <ListGroup title="This book">
            {enabledKinds.map((k) => {
              const t = book.totals[k];
              const meta = KIND_META[k];
              const running = book.running.filter((r) => r.kind === k).length;
              return (
                <div key={k} className="flex h-9 items-center gap-2.5 px-3">
                  <ProgressRing
                    size={16}
                    stroke={2}
                    value={t.total ? t.ready / t.total : 0}
                    color={t.total > 0 && t.ready >= t.total ? "var(--system-green)" : meta.color}
                    aria-label={`${meta.label} coverage`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-label">{meta.short}</span>
                  {running > 0 && <span className="text-2xs text-label-tertiary">{running} working</span>}
                  <span className="text-xs tabular-nums text-label-secondary">
                    <NumberTicker value={t.ready} />/{t.total}
                  </span>
                </div>
              );
            })}
          </ListGroup>
        )}

        {(onOpenWiki || onOpenStyleDictionary) && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {onOpenWiki && prefs?.knowledge && (
              <Button size="sm" variant="secondary" onClick={onOpenWiki}>
                <BookOpen strokeWidth={1.75} />
                Open wiki
              </Button>
            )}
            {onOpenStyleDictionary && prefs?.formatting && (
              <Button size="sm" variant="secondary" onClick={onOpenStyleDictionary}>
                <Palette strokeWidth={1.75} />
                Style dictionary
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Bulk */}
      <div className="shrink-0 border-t border-separator p-3">
        <Button onClick={() => setBulkOpen(true)} disabled={noKey || bulk.running} className="w-full">
          <Layers className="size-4" strokeWidth={1.75} />
          {bulk.running ? "Bulk run in progress…" : "Bulk run…"}
        </Button>
      </div>

      <BulkSheet
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        filePath={filePath}
        currentChapter={chapterIndex}
        totalChapters={total}
        chapterLabel={chapterLabel}
      />
    </motion.aside>
  );
}

function FeatureSwitch({ kind, checked, onChange }: { kind: Exclude<ChapterKind, "rewrite">; checked: boolean; onChange: (v: boolean) => void }) {
  const meta = KIND_META[kind];
  return (
    <ListRow icon={<meta.Icon />} iconTint={checked ? meta.tint : undefined} label={meta.label} description={meta.description}>
      <Switch size="sm" checked={checked} onCheckedChange={onChange} aria-label={meta.label} />
    </ListRow>
  );
}

export default AIToolsPanel;
