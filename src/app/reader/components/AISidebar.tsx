"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  X, Sparkles, Type, MessageCircle, Paintbrush, KeyRound,
  Loader2, Trash2, Clapperboard, ExternalLink, BarChart3,
  BookMarked, Square, Play, RefreshCw, Check, Layers, Minimize2,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookChapter, ThemeClasses } from "../lib/types";
import { needsEnrichment } from "@/lib/ai-prompts";
import type { StyleDictionary } from "@/lib/ai-style-dictionary";
import { fmtCh, type ChapterLabels } from "@/lib/chapter-labels";
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
  onBulkStart?: (features: import("./BulkAnalyserModal").FeatureKey[], upToIndex: number) => void;
}

export function AISidebar({
  theme,
  chapters,
  enrichedNames,
  enrichEnabled,
  enrichingChapter,
  enrichAllProgress,
  onEnrichToggle,
  onEnrichAll,
  onCancelEnrichAll,
  onClearEnrichedNames,
  formattingEnabled,
  formattedChapterCount,
  formattingChapter,
  formatAllProgress,
  onFormattingToggle,
  onFormatAll,
  onCancelFormatAll,
  onClearFormatting,
  styleDictionary,
  condenseEnabled,
  condensedChapterCount,
  condensingChapter,
  condenseAllProgress,
  onCondenseToggle,
  onCondenseAll,
  onCancelCondenseAll,
  onClearCondense,
  currentChapterCondenseDone,
  filePath,
  bookTitle,
  wikiEnabled,
  wikiEntryCount,
  wikiProcessedCount,
  wikiProcessingChapter,
  wikiAllProgress,
  totalChapters,
  currentChapter,
  currentChapterWikiDone,
  currentChapterFormatDone,
  currentChapterEnrichDone,
  onWikiToggle,
  onWikiProcessAll,
  onCondenseRetry,
  onWikiRetry,
  onFormatRetry,
  onEnrichRetry,
  onCancelWikiProcessAll,
  onClearWiki,
  buddyEnabled,
  onBuddyToggle,
  simulateEnabled,
  onSimulateToggle,
  commentsEnabled,
  commentingChapter,
  chapterCommentCount,
  onCommentsToggle,
  onClearComments,
  onClose,
  chapterLabels = {},
  onBulkStart,
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

  /* ── Counts ─────────────────────────────────────────────── */

  const alreadyEnriched = Object.keys(enrichedNames).length;
  const enrichToDo = chapters.filter((ch, i) => needsEnrichment(ch.title) && !enrichedNames[i]).length;

  /* ── Running state ───────────────────────────────────────── */

  const isEnrichRunning = enrichAllProgress !== null || enrichingChapter !== null;
  const isFormatRunning = formatAllProgress !== null || formattingChapter !== null;
  const isCondenseRunning = condenseAllProgress !== null || condensingChapter !== null;
  const isWikiRunning = wikiProcessingChapter !== null;

  /* ── Status strings ──────────────────────────────────────── */

  const wikiStatusText =
    wikiProcessedCount >= totalChapters && totalChapters > 0 ? "done"
    : wikiProcessedCount > 0 ? `${wikiProcessedCount} / ${totalChapters}`
    : undefined;

  const enrichStatusText =
    enrichToDo === 0 && alreadyEnriched > 0 ? "done"
    : alreadyEnriched > 0 ? `${alreadyEnriched} renamed`
    : undefined;

  const enrichRunCount = enrichAllProgress
    ? `${enrichAllProgress.current + 1} / ${enrichAllProgress.total}`
    : enrichingChapter !== null ? "…" : undefined;

  const formatRunCount = formatAllProgress
    ? `${formatAllProgress.current + 1} / ${formatAllProgress.total}`
    : formattingChapter !== null ? "…" : undefined;

  const condenseRunCount = condenseAllProgress
    ? `${condenseAllProgress.current + 1} / ${condenseAllProgress.total}`
    : condensingChapter !== null ? "…" : undefined;

  const wikiRunCount = isWikiRunning
    ? wikiAllProgress
      ? `${wikiAllProgress.current} / ${wikiAllProgress.total} ch`
      : `ch. ${(wikiProcessingChapter ?? 0) + 1}`
    : undefined;

  /* ── External links ──────────────────────────────────────── */

  const openStyleDict = () => window.electronAPI?.openStyleDictionary({ filePath, title: bookTitle });
  const openWiki = () => window.electronAPI?.openWiki({ filePath, title: bookTitle });

  return (
    <div
      ref={sidebarRef}
      className={cn(
        "absolute right-0 top-0 z-20 flex h-full w-[320px] flex-col border-l",
        theme.panel,
        theme.border,
      )}
      style={{ animation: "slideInRight 0.18s ease", boxShadow: "rgba(0,0,0,0.25) -8px 0 24px -4px" }}
    >
      {/* ── Header ── */}
      <div className={cn("flex shrink-0 items-center justify-between px-4 py-3")}>
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: "var(--accent-brand-dim)" }}
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          </div>
          <div>
            <span className={cn("text-sm font-semibold", theme.text)}>AI Tools</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-colors", theme.btn)}
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* ── API key warning ── */}
      {!loading && disabled && (
        <div className="mx-3 mb-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" strokeWidth={1.5} />
            <p className="text-xs leading-relaxed text-amber-300/80">
              Add an <span className="font-medium text-amber-300">OpenRouter API key</span> in Settings → AI to enable these features.
            </p>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className={cn("flex-1 overflow-y-auto px-3 pb-3", disabled ? "pointer-events-none select-none opacity-40" : "")}>

        {/* ═══════ Analysis Section ═══════ */}
        <SectionHeader label="Analysis" theme={theme} />

        <div className="space-y-1.5">
          {/* AI Wiki */}
          <FeatureCard
            Icon={BookMarked}
            label="AI Wiki"
            description="Extract characters, items, locations"
            color="var(--accent-brand)"
            active={wikiEnabled}
            onToggle={onWikiToggle}
            status={wikiStatusText}
            running={isWikiRunning}
            runCount={wikiRunCount}
            canRun={wikiEnabled && !isWikiRunning && !currentChapterWikiDone}
            onRun={() => onWikiProcessAll(currentChapter)}
            canRetry={wikiEnabled && !isWikiRunning && currentChapterWikiDone}
            onRetry={onWikiRetry}
            onCancel={onCancelWikiProcessAll}
            canClear={wikiEntryCount > 0 && !isWikiRunning}
            onClear={onClearWiki}
            linkIcon={wikiEnabled && wikiEntryCount > 0 ? ExternalLink : undefined}
            onLink={wikiEnabled && wikiEntryCount > 0 ? openWiki : undefined}
            theme={theme}
          />

          {/* Chapter Titles */}
          <FeatureCard
            Icon={Type}
            label="Chapter Titles"
            description="Enrich generic chapter names"
            color="#34d399"
            active={enrichEnabled}
            onToggle={onEnrichToggle}
            status={enrichStatusText}
            running={isEnrichRunning}
            runCount={enrichRunCount}
            canRun={enrichEnabled && !isEnrichRunning && !currentChapterEnrichDone}
            onRun={() => onEnrichAll(currentChapter)}
            canRetry={enrichEnabled && !isEnrichRunning && currentChapterEnrichDone}
            onRetry={onEnrichRetry}
            onCancel={onCancelEnrichAll}
            canClear={alreadyEnriched > 0 && !isEnrichRunning}
            onClear={onClearEnrichedNames}
            theme={theme}
          />
        </div>

        {/* ═══════ Reading Section ═══════ */}
        <SectionHeader label="Reading" theme={theme} />

        <div className="space-y-1.5">
          {/* Formatting */}
          <FeatureCard
            Icon={Paintbrush}
            label="Formatting"
            description="Visual HTML enhancements for text"
            color="#a78bfa"
            active={formattingEnabled}
            onToggle={onFormattingToggle}
            status={
              formattedChapterCount >= chapters.length && chapters.length > 0 ? "done"
              : formattedChapterCount > 0 ? `${formattedChapterCount} / ${chapters.length}`
              : undefined
            }
            running={isFormatRunning}
            runCount={formatRunCount}
            canRun={formattingEnabled && !isFormatRunning && !currentChapterFormatDone}
            onRun={() => onFormatAll(currentChapter)}
            canRetry={formattingEnabled && !isFormatRunning && currentChapterFormatDone}
            onRetry={onFormatRetry}
            onCancel={onCancelFormatAll}
            canClear={formattedChapterCount > 0 && !isFormatRunning}
            onClear={onClearFormatting}
            linkIcon={formattingEnabled && styleDictionary && styleDictionary.rules.length > 0 ? BarChart3 : undefined}
            onLink={formattingEnabled && styleDictionary && styleDictionary.rules.length > 0 ? openStyleDict : undefined}
            theme={theme}
          />

          {/* Concise Reading */}
          <FeatureCard
            Icon={Minimize2}
            label="Concise Reading"
            description="Condense text to 55–70% length"
            color="#60a5fa"
            active={condenseEnabled}
            onToggle={onCondenseToggle}
            status={
              condensedChapterCount >= chapters.length && chapters.length > 0 ? "done"
              : condensedChapterCount > 0 ? `${condensedChapterCount} / ${chapters.length}`
              : undefined
            }
            running={isCondenseRunning}
            runCount={condenseRunCount}
            canRun={condenseEnabled && !isCondenseRunning && !currentChapterCondenseDone}
            onRun={() => onCondenseAll(currentChapter)}
            canRetry={condenseEnabled && !isCondenseRunning && currentChapterCondenseDone}
            onRetry={onCondenseRetry}
            onCancel={onCancelCondenseAll}
            canClear={condensedChapterCount > 0 && !isCondenseRunning}
            onClear={onClearCondense}
            theme={theme}
          />

          {/* Note about concise reading always being formatted */}
          {condenseEnabled && (
            <div className="flex items-start gap-2 rounded-lg px-2.5 py-2" style={{ background: "var(--bg-inset)" }}>
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-[#60a5fa]" strokeWidth={1.5} style={{ opacity: 0.6 }} />
              <p className={cn("text-xs leading-relaxed", theme.muted)} style={{ opacity: 0.5 }}>
                Concise output is always formatted — formatting is applied during condensing in a single AI pass.
              </p>
            </div>
          )}
        </div>

        {/* ═══════ Experience Section ═══════ */}
        <SectionHeader label="Experience" theme={theme} />

        <div className="space-y-1.5">
          {/* AI Buddy */}
          <FeatureCard
            Icon={MessageCircle}
            label="AI Buddy"
            description="Chat about the book"
            color="#f472b6"
            active={buddyEnabled && wikiEnabled}
            onToggle={onBuddyToggle}
            toggleDisabled={!wikiEnabled}
            lockNote={!wikiEnabled ? "Requires Wiki" : undefined}
            theme={theme}
          />

          {/* Simulate */}
          <FeatureCard
            Icon={Clapperboard}
            label="Simulate"
            description="Branching narrative continuations"
            color="#fb923c"
            active={simulateEnabled && wikiEnabled}
            onToggle={onSimulateToggle}
            toggleDisabled={!wikiEnabled}
            lockNote={!wikiEnabled ? "Requires Wiki" : undefined}
            theme={theme}
          />

          {/* Comments */}
          <FeatureCard
            Icon={MessageCircle}
            label="Comments"
            description="Inline reader reactions"
            color="#a3e635"
            active={commentsEnabled}
            onToggle={onCommentsToggle}
            status={chapterCommentCount > 0 ? `${chapterCommentCount} ch.` : undefined}
            running={commentingChapter !== null}
            canClear={chapterCommentCount > 0 && commentingChapter === null}
            onClear={onClearComments}
            theme={theme}
          />
        </div>
      </div>

      {/* ── Bulk Analyse button ── */}
      <div className={cn("shrink-0 border-t px-3 py-3", theme.border)}>
        <button
          onClick={() => setBulkOpen(true)}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-medium transition-all",
            disabled ? "cursor-not-allowed opacity-30" : "hover:opacity-90 active:scale-[0.99]",
          )}
          style={{ background: "var(--accent-brand)", color: "var(--accent-brand-fg)" }}
        >
          <Layers className="h-3.5 w-3.5" strokeWidth={1.5} />
          Bulk Analyse
        </button>
      </div>

      {/* ── Bulk modal ── */}
      <BulkAnalyserModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onStart={(features, upToIndex) => { setBulkOpen(false); onBulkStart?.(features, upToIndex); }}
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

/* ── Sub-components ───────────────────────────────────────── */

function SectionHeader({ label, theme }: { label: string; theme: ThemeClasses }) {
  return (
    <div className="pb-1.5 pt-4 first:pt-1">
      <span
        className={cn("text-xs font-semibold uppercase tracking-widest", theme.muted)}
        style={{ opacity: 0.35, fontSize: "10px", letterSpacing: "0.1em" }}
      >
        {label}
      </span>
    </div>
  );
}

/* ── Feature Card ────────────────────────────────────────── */

interface FeatureCardProps {
  Icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  active: boolean;
  onToggle: () => void;
  toggleDisabled?: boolean;
  lockNote?: string;
  status?: string;
  running?: boolean;
  runCount?: string;
  canRun?: boolean;
  onRun?: () => void;
  canRetry?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
  canClear?: boolean;
  onClear?: () => void;
  linkIcon?: React.ElementType;
  onLink?: () => void;
  theme: ThemeClasses;
}

function FeatureCard({
  Icon,
  label,
  description,
  color,
  active,
  onToggle,
  toggleDisabled,
  lockNote,
  status,
  running,
  runCount,
  canRun,
  onRun,
  canRetry,
  onRetry,
  onCancel,
  canClear,
  onClear,
  linkIcon: LinkIcon,
  onLink,
  theme,
}: FeatureCardProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClearClick = () => {
    if (confirmingClear) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingClear(false);
      onClear?.();
    } else {
      setConfirmingClear(true);
      confirmTimerRef.current = setTimeout(() => setConfirmingClear(false), 2500);
    }
  };

  const hasActions = running || canRun || canRetry || canClear || (LinkIcon && onLink);

  return (
    <div
      className={cn(
        "rounded-lg border transition-all",
        active
          ? "border-white/[0.08] bg-white/[0.03]"
          : cn(theme.border, "bg-transparent"),
      )}
    >
      {/* Main row: toggle + icon + label */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {/* Toggle */}
        <button
          onClick={toggleDisabled ? undefined : onToggle}
          className={cn(
            "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
            toggleDisabled
              ? cn("cursor-not-allowed opacity-25", theme.subtle)
              : active
                ? ""
                : theme.subtle,
          )}
          style={active && !toggleDisabled ? { background: color } : undefined}
        >
          <span
            className={cn(
              "absolute left-[3px] top-[3px] h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
              active && !toggleDisabled ? "translate-x-3.5" : "",
            )}
          />
        </button>

        {/* Icon */}
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: active ? `${color}15` : "transparent",
          }}
        >
          <Icon
            className="h-3.5 w-3.5"
            strokeWidth={1.5}
            style={{ color: active ? color : undefined, opacity: active ? 0.9 : 0.3 }}
          />
        </div>

        {/* Label + description */}
        <div className="min-w-0 flex-1">
          <span
            className={cn("block text-sm font-medium leading-tight", theme.text)}
            style={{ opacity: active ? 1 : 0.5 }}
          >
            {label}
          </span>
          {lockNote ? (
            <span className={cn("block text-xs leading-tight", theme.muted)} style={{ opacity: 0.3 }}>
              {lockNote}
            </span>
          ) : (
            <span className={cn("block text-xs leading-tight", theme.muted)} style={{ opacity: 0.3 }}>
              {description}
            </span>
          )}
        </div>
      </div>

      {/* Status + action bar (only when active and has something to show) */}
      {active && (hasActions || status) && (
        <div className={cn("flex items-center gap-1.5 border-t px-3 py-1.5", "border-white/[0.04]")}>
          {/* Status */}
          <div className="min-w-0 flex-1">
            {running ? (
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" style={{ color }} strokeWidth={2} />
                {runCount && (
                  <span className={cn("text-xs tabular-nums", theme.muted)} style={{ opacity: 0.6 }}>
                    {runCount}
                  </span>
                )}
              </div>
            ) : status ? (
              <span
                className={cn("text-xs tabular-nums", status === "done" ? "" : theme.muted)}
                style={{
                  opacity: status === "done" ? 0.7 : 0.4,
                  color: status === "done" ? color : undefined,
                }}
              >
                {status}
              </span>
            ) : null}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {/* Run / Stop / Retry */}
            {running && onCancel ? (
              <SmallBtn onClick={onCancel} theme={theme} title="Stop">
                <Square className="h-2.5 w-2.5" strokeWidth={2} fill="currentColor" />
              </SmallBtn>
            ) : canRun && onRun ? (
              <SmallBtn onClick={onRun} color={color} title="Run">
                <Play className="h-2.5 w-2.5" strokeWidth={0} fill="currentColor" />
              </SmallBtn>
            ) : canRetry && onRetry ? (
              <SmallBtn onClick={onRetry} color={color} title="Retry">
                <RefreshCw className="h-3 w-3" strokeWidth={2} />
              </SmallBtn>
            ) : null}

            {/* Clear */}
            {canClear && onClear && !running && (
              <SmallBtn
                onClick={handleClearClick}
                title={confirmingClear ? "Click again to confirm" : "Clear data"}
                danger={confirmingClear}
                theme={theme}
              >
                {confirmingClear
                  ? <Check className="h-3 w-3" strokeWidth={2.5} />
                  : <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                }
              </SmallBtn>
            )}

            {/* Link */}
            {LinkIcon && onLink && (
              <SmallBtn onClick={onLink} theme={theme} title="Open">
                <LinkIcon className="h-3 w-3" strokeWidth={1.5} />
              </SmallBtn>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tiny action button ──────────────────────────────────── */

function SmallBtn({
  onClick,
  theme,
  color,
  danger,
  title,
  children,
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
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-all",
        danger
          ? "bg-red-500/20 text-red-400 scale-105"
          : color
            ? ""
            : theme?.btn,
      )}
      style={color && !danger ? { background: `${color}20`, color } : undefined}
    >
      {children}
    </button>
  );
}
