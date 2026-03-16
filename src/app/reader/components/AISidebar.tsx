"use client";

import { useState, useEffect, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  X, Sparkles, Type, MessageCircle, Paintbrush, KeyRound,
  Loader2, Trash2, Clapperboard, ExternalLink,
  BookMarked, Square, RefreshCw, Check, Layers, Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookChapter, ThemeClasses } from "../lib/types";
import { needsEnrichment } from "@/lib/ai-prompts";
import type { StyleDictionary } from "@/lib/ai-style-dictionary";
import { type ChapterLabels } from "@/lib/chapter-labels";
import { BulkAnalyserModal } from "./BulkAnalyserModal";

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

  useEffect(() => {
    window.electronAPI?.getSetting("openrouterApiKey").then((key) => {
      setHasApiKey(!!key && key.length > 0);
    });
  }, []);

  useClickOutside(sidebarRef, onClose, "[data-reader-header]");

  const disabled = hasApiKey === false;
  const loading = hasApiKey === null;

  /* ── Derived state ───────────────────────────────────────── */

  const alreadyEnriched = Object.keys(enrichedNames).length;
  const enrichToDo = chapters.filter((ch, i) => needsEnrichment(ch.title) && !enrichedNames[i]).length;

  const isEnrichRunning = enrichAllProgress !== null || enrichingChapter !== null;
  const isFormatRunning = formatAllProgress !== null || formattingChapter !== null;
  const isCondenseRunning = condenseAllProgress !== null || condensingChapter !== null;
  const isWikiRunning = wikiProcessingChapter !== null;

  /* ── External links ──────────────────────────────────────── */

  const openStyleDict = () => window.electronAPI?.openStyleDictionary({ filePath, title: bookTitle });
  const openWiki = () => window.electronAPI?.openWiki({ filePath, title: bookTitle });

  return (
    <div
      ref={sidebarRef}
      className={cn(
        "absolute right-0 top-0 z-20 flex h-full w-[280px] flex-col border-l",
        theme.panel, theme.border,
      )}
      style={{ animation: "slideInRight 0.18s ease", boxShadow: "rgba(0,0,0,0.25) -8px 0 24px -4px" }}
    >
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          <span className={cn("text-sm font-semibold", theme.text)}>AI Tools</span>
        </div>
        <button
          onClick={onClose}
          className={cn("flex h-6 w-6 items-center justify-center rounded-lg transition-colors", theme.btn)}
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* ── API key warning ── */}
      {!loading && disabled && (
        <div className="mx-3 mb-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <div className="flex items-start gap-2">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" strokeWidth={1.5} />
            <p className="text-xs leading-relaxed text-amber-300/80">
              Add an <span className="font-medium text-amber-300">OpenRouter API key</span> in Settings to enable AI.
            </p>
          </div>
        </div>
      )}

      {/* ── Feature list ── */}
      <div className={cn("flex-1 overflow-y-auto", disabled ? "pointer-events-none select-none opacity-40" : "")}>

        {/* ── Reading ── */}
        <Section label="Reading" theme={theme} />

        <FeatureRow
          Icon={Paintbrush} label="Formatting" color="#a78bfa" theme={theme}
          active={formattingEnabled} onToggle={onFormattingToggle}
          running={isFormatRunning}
          status={fmtStatus(formattedChapterCount, chapters.length, formatAllProgress, formattingChapter)}
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
          Icon={Minimize2} label="Concise" color="#60a5fa" theme={theme}
          active={condenseEnabled} onToggle={onCondenseToggle}
          running={isCondenseRunning}
          status={fmtStatus(condensedChapterCount, chapters.length, condenseAllProgress, condensingChapter)}
          canRetry={condenseEnabled && !isCondenseRunning && currentChapterCondenseDone}
          onRetry={onCondenseRetry}
          canCancel={isCondenseRunning}
          onCancel={onCancelCondenseAll}
          canClear={condensedChapterCount > 0 && !isCondenseRunning}
          onClear={onClearCondense}
        />


        {/* ── Analysis ── */}
        <Section label="Analysis" theme={theme} />

        <FeatureRow
          Icon={BookMarked} label="Wiki" color="var(--accent-brand)" theme={theme}
          active={wikiEnabled} onToggle={onWikiToggle}
          running={isWikiRunning}
          status={fmtWikiStatus(wikiProcessedCount, totalChapters, wikiAllProgress, wikiProcessingChapter)}
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
          Icon={Type} label="Titles" color="#34d399" theme={theme}
          active={enrichEnabled} onToggle={onEnrichToggle}
          running={isEnrichRunning}
          status={fmtEnrichStatus(alreadyEnriched, enrichToDo, enrichAllProgress, enrichingChapter)}
          canRetry={enrichEnabled && !isEnrichRunning && currentChapterEnrichDone}
          onRetry={onEnrichRetry}
          canCancel={isEnrichRunning}
          onCancel={onCancelEnrichAll}
          canClear={alreadyEnriched > 0 && !isEnrichRunning}
          onClear={onClearEnrichedNames}
        />

        {/* ── Experience ── */}
        <Section label="Experience" theme={theme} />

        <FeatureRow
          Icon={MessageCircle} label="Buddy" color="#f472b6" theme={theme}
          active={buddyEnabled && wikiEnabled} onToggle={onBuddyToggle}
          disabled={!wikiEnabled}
          lockNote={!wikiEnabled ? "Requires Wiki" : undefined}
        />

        <FeatureRow
          Icon={Clapperboard} label="Simulate" color="#fb923c" theme={theme}
          active={simulateEnabled && wikiEnabled} onToggle={onSimulateToggle}
          disabled={!wikiEnabled}
          lockNote={!wikiEnabled ? "Requires Wiki" : undefined}
        />

        <FeatureRow
          Icon={MessageCircle} label="Comments" color="#a3e635" theme={theme}
          active={commentsEnabled} onToggle={onCommentsToggle}
          running={commentingChapter !== null}
          status={chapterCommentCount > 0 ? `${chapterCommentCount} ch.` : undefined}
          canClear={chapterCommentCount > 0 && commentingChapter === null}
          onClear={onClearComments}
        />
      </div>

      {/* ── Bulk Analyse ── */}
      <div className={cn("shrink-0 border-t px-3 py-3", theme.border)}>
        <button
          onClick={() => setBulkOpen(true)}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all",
            disabled ? "cursor-not-allowed opacity-30" : "hover:opacity-90 active:scale-[0.99]",
          )}
          style={{ background: "var(--accent-brand)", color: "var(--accent-brand-fg)" }}
        >
          <Layers className="h-3.5 w-3.5" strokeWidth={1.5} />
          Bulk Analyse
        </button>
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
    </div>
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

function Section({ label, theme }: { label: string; theme: ThemeClasses }) {
  return (
    <div className="px-4 pb-1 pt-4 first:pt-2">
      <span
        className={cn("text-xs font-medium uppercase tracking-wider", theme.muted)}
        style={{ opacity: 0.3, fontSize: "10px" }}
      >
        {label}
      </span>
    </div>
  );
}

/* ── Feature row ───────────────────────────────────────────── */

interface FeatureRowProps {
  Icon: React.ElementType;
  label: string;
  color: string;
  theme: ThemeClasses;
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
  lockNote?: string;
  running?: boolean;
  status?: string;
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
  Icon, label, color, theme,
  active, onToggle, disabled: toggleDisabled, lockNote,
  running, status, badge,
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

  return (
    <div className={cn(
      "group flex items-center gap-2 px-4 py-[7px] transition-colors",
      active ? "bg-white/[0.02]" : "",
    )}>
      {/* Toggle */}
      <button
        onClick={toggleDisabled ? undefined : onToggle}
        className={cn(
          "relative h-[16px] w-7 shrink-0 rounded-full transition-colors",
          toggleDisabled ? "cursor-not-allowed opacity-20" : "",
        )}
        style={{ background: active && !toggleDisabled ? color : "var(--bg-inset)" }}
      >
        <span
          className={cn(
            "absolute left-[2px] top-[2px] h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
            active && !toggleDisabled ? "translate-x-[11px]" : "",
          )}
        />
      </button>

      {/* Icon */}
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        strokeWidth={1.5}
        style={{ color: active ? color : undefined, opacity: active ? 0.8 : 0.25 }}
      />

      {/* Label */}
      <span
        className={cn("flex-1 text-sm", theme.text)}
        style={{ opacity: active ? 0.9 : 0.4 }}
      >
        {lockNote || label}
      </span>

      {/* Status / actions (right side) */}
      <div className="flex items-center gap-1">
        {/* Running spinner + cancel */}
        {isRunning && (
          <>
            <span className={cn("text-xs tabular-nums", theme.muted)} style={{ opacity: 0.5 }}>
              {status !== "..." ? status : ""}
            </span>
            <Loader2 className="h-3 w-3 animate-spin" style={{ color }} strokeWidth={2} />
            {canCancel && onCancel && (
              <ActionBtn onClick={onCancel} theme={theme} title="Stop">
                <Square className="h-2.5 w-2.5" strokeWidth={2} fill="currentColor" />
              </ActionBtn>
            )}
          </>
        )}

        {/* Idle status */}
        {!isRunning && status && (
          <span
            className={cn("text-xs tabular-nums", theme.muted)}
            style={{ opacity: isDone ? 0.6 : 0.4, color: isDone ? color : undefined }}
          >
            {status}
          </span>
        )}

        {/* Badge (e.g. wiki entry count) */}
        {!isRunning && badge && (
          <span
            className="rounded-lg px-1.5 py-0.5 text-xs tabular-nums"
            style={{ background: `${color}15`, color, opacity: 0.7 }}
          >
            {badge}
          </span>
        )}

        {/* Re-process current chapter */}
        {!isRunning && canRetry && onRetry && (
          <ActionBtn onClick={onRetry} color={color} title="Re-process chapter">
            <RefreshCw className="h-3 w-3" strokeWidth={2} />
          </ActionBtn>
        )}

        {/* Clear data */}
        {!isRunning && canClear && onClear && (
          <ActionBtn
            onClick={handleClear}
            title={confirmClear ? "Confirm clear" : "Clear all"}
            danger={confirmClear}
            theme={theme}
          >
            {confirmClear
              ? <Check className="h-3 w-3" strokeWidth={2.5} />
              : <Trash2 className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.5} />
            }
          </ActionBtn>
        )}

        {/* Extra action (external link) */}
        {!isRunning && extraAction && (
          <ActionBtn onClick={extraAction.onClick} theme={theme} title={extraAction.title}>
            <extraAction.icon className="h-3 w-3" strokeWidth={1.5} />
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

/* ── Tiny action button ────────────────────────────────────── */

function ActionBtn({
  onClick, theme, color, danger, title, children,
}: {
  onClick: () => void;
  theme?: ThemeClasses;
  color?: string;
  danger?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-lg transition-all",
        danger ? "bg-red-500/20 text-red-400" : color ? "" : theme?.btn,
      )}
      style={color && !danger ? { color } : undefined}
    >
      {children}
    </button>
  );
}
