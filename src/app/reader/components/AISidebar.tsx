"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  X, Sparkles, Type, MessageCircle, Paintbrush, KeyRound,
  Trash2, Clapperboard, ExternalLink,
  BookMarked, Square, RefreshCw, Check, Layers, Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookChapter, ThemeClasses } from "../lib/types";
import { needsEnrichment } from "@/lib/ai-prompts";
import type { StyleDictionary } from "@/lib/ai-style-dictionary";
import { type ChapterLabels } from "@/lib/chapter-labels";
import { BulkAnalyserModal } from "./BulkAnalyserModal";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListIcon, type ListIconTint } from "@/components/ui/list-group";
import { ProgressRing } from "@/components/ui/progress-ring";
import { NumberTicker } from "@/components/ui/number-ticker";

/** Feature tint → ListIcon tint + CSS color for rings/status. */
const TINT_COLOR: Partial<Record<ListIconTint, string>> = {
  accent: "var(--accent-brand)",
  purple: "var(--system-purple)",
  blue: "var(--system-blue)",
  green: "var(--system-green)",
  pink: "var(--system-pink)",
  orange: "var(--system-orange)",
  teal: "var(--system-teal)",
};

interface AISidebarProps {
  theme: ThemeClasses;
  chapters: BookChapter[];
  enrichedNames: Record<number, string>;
  enrichEnabled: boolean;
  enrichingChapter: number | null;
  enrichAllProgress: { current: number; total: number } | null;
  onEnrichToggle: () => void;
  onEnrichAll: (upToChapter?: number) => void;
  onCancelEnrichAll: () => void;
  onClearEnrichedNames: () => void;
  formattingEnabled: boolean;
  formattedChapterCount: number;
  formattingChapter: number | null;
  formatAllProgress: { current: number; total: number } | null;
  onFormattingToggle: () => void;
  onFormatAll: (upToChapter?: number) => void;
  onCancelFormatAll: () => void;
  onClearFormatting: () => void;
  styleDictionary: StyleDictionary | null;
  condenseEnabled: boolean;
  condensedChapterCount: number;
  condensingChapter: number | null;
  condenseAllProgress: { current: number; total: number } | null;
  onCondenseToggle: () => void;
  onCondenseAll: (upToChapter?: number) => void;
  onCancelCondenseAll: () => void;
  onClearCondense: () => void;
  currentChapterCondenseDone: boolean;
  filePath: string;
  bookTitle: string;
  wikiEnabled: boolean;
  wikiEntryCount: number;
  wikiProcessedCount: number;
  wikiProcessingChapter: number | null;
  wikiAllProgress: { current: number; total: number } | null;
  totalChapters: number;
  currentChapter: number;
  currentChapterWikiDone: boolean;
  currentChapterFormatDone: boolean;
  currentChapterEnrichDone: boolean;
  onWikiToggle: () => void;
  onWikiProcessAll: (upToChapter?: number) => void;
  onCondenseRetry: () => void;
  onWikiRetry: () => void;
  onFormatRetry: () => void;
  onEnrichRetry: () => void;
  onCancelWikiProcessAll: () => void;
  onClearWiki: () => void;
  buddyEnabled: boolean;
  onBuddyToggle: () => void;
  simulateEnabled: boolean;
  onSimulateToggle: () => void;
  commentsEnabled: boolean;
  commentingChapter: number | null;
  chapterCommentCount: number;
  onCommentsToggle: () => void;
  onClearComments: () => void;
  onClose: () => void;
  chapterLabels?: ChapterLabels;
  onBulkStart?: (features: import("./BulkAnalyserModal").FeatureKey[], fromIndex: number, upToIndex: number) => void;
}

export function AISidebar({
  theme, chapters,
  enrichedNames, enrichEnabled, enrichingChapter, enrichAllProgress,
  onEnrichToggle, onEnrichAll, onCancelEnrichAll, onClearEnrichedNames,
  formattingEnabled, formattedChapterCount, formattingChapter, formatAllProgress,
  onFormattingToggle, onFormatAll, onCancelFormatAll, onClearFormatting,
  styleDictionary,
  condenseEnabled, condensedChapterCount, condensingChapter, condenseAllProgress,
  onCondenseToggle, onCondenseAll, onCancelCondenseAll, onClearCondense,
  currentChapterCondenseDone,
  filePath, bookTitle,
  wikiEnabled, wikiEntryCount, wikiProcessedCount, wikiProcessingChapter, wikiAllProgress,
  totalChapters, currentChapter,
  currentChapterWikiDone, currentChapterFormatDone, currentChapterEnrichDone,
  onWikiToggle, onWikiProcessAll,
  onCondenseRetry, onWikiRetry, onFormatRetry, onEnrichRetry,
  onCancelWikiProcessAll, onClearWiki,
  buddyEnabled, onBuddyToggle,
  simulateEnabled, onSimulateToggle,
  commentsEnabled, commentingChapter, chapterCommentCount,
  onCommentsToggle, onClearComments,
  onClose, chapterLabels = {}, onBulkStart,
}: AISidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const reduce = useReducedMotion();
  // The Bulk Analyser modal is portaled to <body>; while it's open, clicks in it
  // must not count as "outside" the sidebar (they used to be DOM children).
  const handleOutside = useCallback(() => {
    if (!bulkOpen) onClose();
  }, [bulkOpen, onClose]);

  useEffect(() => {
    window.electronAPI?.getSetting("openrouterApiKey").then((key) => {
      setHasApiKey(!!key && key.length > 0);
    });
  }, []);

  useClickOutside(sidebarRef, handleOutside, "[data-reader-header]");

  const disabled = hasApiKey === false;
  const loading = hasApiKey === null;

  /* ── Derived state ───────────────────────────────────────── */

  const alreadyEnriched = Object.keys(enrichedNames).length;
  const enrichToDo = chapters.filter((ch, i) => needsEnrichment(ch.title) && !enrichedNames[i]).length;

  const isEnrichRunning = enrichAllProgress !== null || enrichingChapter !== null;
  const isFormatRunning = formatAllProgress !== null || formattingChapter !== null;
  const isCondenseRunning = condenseAllProgress !== null || condensingChapter !== null;
  const isWikiRunning = wikiProcessingChapter !== null;
  const activeTools = [
    formattingEnabled, condenseEnabled, wikiEnabled, enrichEnabled,
    buddyEnabled && wikiEnabled, simulateEnabled && wikiEnabled, commentsEnabled,
  ].filter(Boolean).length;

  /* ── External links ──────────────────────────────────────── */

  const openStyleDict = () => window.electronAPI?.openStyleDictionary({ filePath, title: bookTitle });
  const openWiki = () => window.electronAPI?.openWiki({ filePath, title: bookTitle });

  return (
    <motion.div
      ref={sidebarRef}
      className="glass-thin grain absolute top-2 right-2 bottom-2 z-20 flex w-[288px] flex-col overflow-hidden rounded-2xl text-label"
      style={{
        boxShadow: "inset 0 0 0 0.5px var(--glass-edge), inset 0 1px 0 0 var(--glass-highlight), var(--shadow-lg)",
      }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 400, damping: 34 }}
    >
      {/* ── Header ── */}
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

      {/* ── API key warning ── */}
      {!loading && disabled && (
        <div className="mx-2 mb-1 flex items-start gap-2.5 rounded-lg bg-warning/10 px-3 py-2.5">
          <KeyRound className="mt-px size-4 shrink-0 text-warning" strokeWidth={1.75} />
          <p className="text-xs leading-relaxed text-label-secondary">
            Add an <span className="font-medium text-warning">OpenRouter API key</span> in Settings to enable AI.
          </p>
        </div>
      )}

      {/* ── Overview: wiki coverage ring + tools-on count ── */}
      <div className="mx-2 mb-1 flex shrink-0 items-center gap-3 rounded-lg bg-fill-quaternary px-3 py-2.5">
        <ProgressRing
          size={38}
          stroke={3.5}
          value={totalChapters > 0 ? wikiProcessedCount / totalChapters : 0}
          indeterminate={isWikiRunning && totalChapters === 0}
          aria-label="Wiki coverage"
        >
          <span className="text-2xs font-semibold tabular-nums text-label">
            {totalChapters > 0 ? Math.round((wikiProcessedCount / totalChapters) * 100) : 0}
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <div className="text-headline text-label">
            <NumberTicker value={activeTools} className="tabular-nums" /> of 7 tools on
          </div>
          <div className="truncate text-xs text-label-tertiary">
            {wikiEnabled
              ? `Wiki covers ${wikiProcessedCount} of ${totalChapters} chapters`
              : "Wiki is off"}
          </div>
        </div>
      </div>

      {/* ── Feature list ── */}
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-2 pb-2", disabled ? "pointer-events-none select-none opacity-40" : "")}>

        {/* ── Reading ── */}
        <Section label="Reading" />

        <FeatureRow
          Icon={Paintbrush} label="Formatting" tint="purple"
          active={formattingEnabled} onToggle={onFormattingToggle}
          running={isFormatRunning}
          status={fmtStatus(formattedChapterCount, chapters.length, formatAllProgress, formattingChapter)}
          progress={formatAllProgress}
          canRetry={formattingEnabled && !isFormatRunning && currentChapterFormatDone}
          onRetry={onFormatRetry}
          canCancel={isFormatRunning}
          onCancel={onCancelFormatAll}
          canClear={formattedChapterCount > 0 && !isFormatRunning}
          onClear={onClearFormatting}
          extraAction={formattingEnabled && styleDictionary && styleDictionary.rules.length > 0
            ? { icon: ExternalLink, onClick: openStyleDict, title: "Style dictionary" } : undefined}
        />

        <FeatureRow
          Icon={Minimize2} label="Concise" tint="blue"
          active={condenseEnabled} onToggle={onCondenseToggle}
          running={isCondenseRunning}
          status={fmtStatus(condensedChapterCount, chapters.length, condenseAllProgress, condensingChapter)}
          progress={condenseAllProgress}
          canRetry={condenseEnabled && !isCondenseRunning && currentChapterCondenseDone}
          onRetry={onCondenseRetry}
          canCancel={isCondenseRunning}
          onCancel={onCancelCondenseAll}
          canClear={condensedChapterCount > 0 && !isCondenseRunning}
          onClear={onClearCondense}
        />


        {/* ── Analysis ── */}
        <Section label="Analysis" />

        <FeatureRow
          Icon={BookMarked} label="Wiki" tint="accent"
          active={wikiEnabled} onToggle={onWikiToggle}
          running={isWikiRunning}
          status={fmtWikiStatus(wikiProcessedCount, totalChapters, wikiAllProgress, wikiProcessingChapter)}
          progress={wikiAllProgress}
          canRetry={wikiEnabled && !isWikiRunning && currentChapterWikiDone}
          onRetry={onWikiRetry}
          canCancel={isWikiRunning}
          onCancel={onCancelWikiProcessAll}
          canClear={wikiEntryCount > 0 && !isWikiRunning}
          onClear={onClearWiki}
          extraAction={wikiEnabled && wikiEntryCount > 0
            ? { icon: ExternalLink, onClick: openWiki, title: "Open wiki" } : undefined}
          badge={wikiEnabled && wikiEntryCount > 0 ? `${wikiEntryCount}` : undefined}
        />

        <FeatureRow
          Icon={Type} label="Titles" tint="green"
          active={enrichEnabled} onToggle={onEnrichToggle}
          running={isEnrichRunning}
          status={fmtEnrichStatus(alreadyEnriched, enrichToDo, enrichAllProgress, enrichingChapter)}
          progress={enrichAllProgress}
          canRetry={enrichEnabled && !isEnrichRunning && currentChapterEnrichDone}
          onRetry={onEnrichRetry}
          canCancel={isEnrichRunning}
          onCancel={onCancelEnrichAll}
          canClear={alreadyEnriched > 0 && !isEnrichRunning}
          onClear={onClearEnrichedNames}
        />

        {/* ── Experience ── */}
        <Section label="Experience" />

        <FeatureRow
          Icon={MessageCircle} label="Buddy" tint="pink"
          active={buddyEnabled && wikiEnabled} onToggle={onBuddyToggle}
          disabled={!wikiEnabled}
          lockNote={!wikiEnabled ? "Requires Wiki" : undefined}
        />

        <FeatureRow
          Icon={Clapperboard} label="Simulate" tint="orange"
          active={simulateEnabled && wikiEnabled} onToggle={onSimulateToggle}
          disabled={!wikiEnabled}
          lockNote={!wikiEnabled ? "Requires Wiki" : undefined}
        />

        <FeatureRow
          Icon={MessageCircle} label="Comments" tint="teal"
          active={commentsEnabled} onToggle={onCommentsToggle}
          running={commentingChapter !== null}
          status={chapterCommentCount > 0 ? `${chapterCommentCount} ch.` : undefined}
          canClear={chapterCommentCount > 0 && commentingChapter === null}
          onClear={onClearComments}
        />
      </div>

      {/* ── Bulk Analyse ── */}
      <div className="shrink-0 border-t border-separator p-3">
        <Button
          onClick={() => setBulkOpen(true)}
          disabled={disabled}
          className="w-full"
        >
          <Layers className="size-4" strokeWidth={1.75} />
          Bulk Analyse…
        </Button>
      </div>

      <BulkAnalyserModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onStart={(features, fromIndex, upToIndex) => { setBulkOpen(false); onBulkStart?.(features, fromIndex, upToIndex); }}
        theme={theme}
        chapterLabels={chapterLabels}
        totalChapters={totalChapters}
        currentChapter={currentChapter}
        wikiEnabled={wikiEnabled}
        formattingEnabled={formattingEnabled}
        enrichEnabled={enrichEnabled}
        condenseEnabled={condenseEnabled}
      />
    </motion.div>
  );
}

/* ── Status formatters ─────────────────────────────────────── */

function fmtStatus(
  doneCount: number, total: number,
  progress: { current: number; total: number } | null,
  activeChapter: number | null,
): string | undefined {
  if (progress) return `${progress.current + 1}/${progress.total}`;
  if (activeChapter !== null) return "...";
  if (doneCount >= total && total > 0) return "done";
  if (doneCount > 0) return `${doneCount}/${total}`;
  return undefined;
}

function fmtWikiStatus(
  processedCount: number, total: number,
  progress: { current: number; total: number } | null,
  activeChapter: number | null,
): string | undefined {
  if (progress) return `${progress.current}/${progress.total}`;
  if (activeChapter !== null) return `ch. ${activeChapter + 1}`;
  if (processedCount >= total && total > 0) return "done";
  if (processedCount > 0) return `${processedCount}/${total}`;
  return undefined;
}

function fmtEnrichStatus(
  enriched: number, toDo: number,
  progress: { current: number; total: number } | null,
  activeChapter: number | null,
): string | undefined {
  if (progress) return `${progress.current + 1}/${progress.total}`;
  if (activeChapter !== null) return "...";
  if (toDo === 0 && enriched > 0) return "done";
  if (enriched > 0) return `${enriched}`;
  return undefined;
}

/* ── Section header ────────────────────────────────────────── */

function Section({ label }: { label: string }) {
  return (
    <div className="px-2.5 pt-4 pb-1.5 first:pt-1">
      <span className="text-section text-label-tertiary">{label}</span>
    </div>
  );
}

/* ── Feature row ───────────────────────────────────────────── */

interface FeatureRowProps {
  Icon: React.ElementType;
  label: string;
  tint: ListIconTint;
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
  lockNote?: string;
  running?: boolean;
  status?: string;
  /** Batch progress, used to fill the running ring. */
  progress?: { current: number; total: number } | null;
  badge?: string;
  canRetry?: boolean;
  onRetry?: () => void;
  canCancel?: boolean;
  onCancel?: () => void;
  canClear?: boolean;
  onClear?: () => void;
  extraAction?: { icon: React.ElementType; onClick: () => void; title: string };
}

function FeatureRow({
  Icon, label, tint,
  active, onToggle, disabled: toggleDisabled, lockNote,
  running, status, progress, badge,
  canRetry, onRetry,
  canCancel, onCancel,
  canClear, onClear,
  extraAction,
}: FeatureRowProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClear = () => {
    if (confirmClear) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirmClear(false);
      onClear?.();
    } else {
      setConfirmClear(true);
      timerRef.current = setTimeout(() => setConfirmClear(false), 2500);
    }
  };

  const isRunning = running === true;
  const isDone = status === "done";
  const color = TINT_COLOR[tint] ?? "var(--accent-brand)";
  const on = active && !toggleDisabled;
  const ringValue = progress && progress.total > 0 ? progress.current / progress.total : undefined;

  return (
    <div className="group flex h-9 items-center gap-2.5 rounded-md px-2.5 transition-colors duration-150 hover:bg-fill-quaternary">
      {/* Icon tile */}
      <ListIcon
        tint={tint}
        className={cn(
          "transition-[background-color,color,box-shadow] duration-200",
          !on && "bg-fill-tertiary text-label-tertiary shadow-none",
        )}
      >
        <Icon />
      </ListIcon>

      {/* Label */}
      <span className={cn(
        "min-w-0 flex-1 truncate text-sm transition-colors",
        toggleDisabled ? "text-label-tertiary" : on ? "text-label" : "text-label-secondary",
      )}>
        {lockNote || label}
      </span>

      {/* Status / actions (right side) */}
      <div className="flex items-center gap-1">
        {/* Running ring + cancel */}
        {isRunning && (
          <>
            {status && status !== "..." && (
              <span className="text-2xs tabular-nums text-label-tertiary">{status}</span>
            )}
            <ProgressRing
              size={16}
              stroke={2}
              color={color}
              value={ringValue}
              indeterminate={ringValue === undefined}
              aria-label={`${label} progress`}
            />
            {canCancel && onCancel && (
              <ActionBtn onClick={onCancel} title="Stop" danger>
                <Square className="size-2.5" strokeWidth={2} fill="currentColor" />
              </ActionBtn>
            )}
          </>
        )}

        {/* Idle status */}
        {!isRunning && status && (
          isDone ? (
            <span className="inline-flex items-center gap-0.5 text-2xs font-medium" style={{ color }}>
              <Check className="size-3" strokeWidth={2.5} />
              done
            </span>
          ) : (
            <span className="text-2xs tabular-nums text-label-tertiary">{status}</span>
          )
        )}

        {/* Badge (e.g. wiki entry count) */}
        {!isRunning && badge && (
          <Badge variant="accent" className="tabular-nums">{badge}</Badge>
        )}

        {/* Re-process current chapter */}
        {!isRunning && canRetry && onRetry && (
          <ActionBtn onClick={onRetry} title="Re-process chapter">
            <RefreshCw className="size-3" strokeWidth={2} />
          </ActionBtn>
        )}

        {/* Clear data */}
        {!isRunning && canClear && onClear && (
          <ActionBtn
            onClick={handleClear}
            title={confirmClear ? "Confirm clear" : "Clear all"}
            danger={confirmClear}
            filled={confirmClear}
            className={confirmClear ? undefined : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}
          >
            {confirmClear
              ? <Check className="size-3" strokeWidth={2.5} />
              : <Trash2 className="size-3" strokeWidth={1.75} />
            }
          </ActionBtn>
        )}

        {/* Extra action (external link) */}
        {!isRunning && extraAction && (
          <ActionBtn onClick={extraAction.onClick} title={extraAction.title}>
            <extraAction.icon className="size-3" strokeWidth={1.75} />
          </ActionBtn>
        )}

        {/* Toggle */}
        <Switch
          size="sm"
          checked={on}
          disabled={toggleDisabled}
          onCheckedChange={() => { if (!toggleDisabled) onToggle(); }}
          aria-label={`${label} ${on ? "on" : "off"}`}
          className="ml-1"
        />
      </div>
    </div>
  );
}

/* ── Tiny action button ────────────────────────────────────── */

function ActionBtn({
  onClick, danger, filled, title, className, children,
}: {
  onClick: () => void;
  danger?: boolean;
  filled?: boolean;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "focus-ring pressable inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-[background-color,color,opacity] duration-150",
        filled
          ? "bg-danger/15 text-danger"
          : danger
            ? "text-label-tertiary hover:bg-danger/15 hover:text-danger"
            : "text-label-tertiary hover:bg-fill-tertiary hover:text-label",
        className,
      )}
    >
      {children}
    </button>
  );
}
