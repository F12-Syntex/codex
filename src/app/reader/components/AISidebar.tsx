"use client";

import { useState, useEffect, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  X, Sparkles, Type, MessageCircle, Paintbrush, KeyRound,
  Loader2, Trash2, Clapperboard, ExternalLink, BarChart3,
  BookMarked, Square, Play, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookChapter, ThemeClasses } from "../lib/types";
import { needsEnrichment } from "@/lib/ai-prompts";
import type { StyleDictionary } from "@/lib/ai-style-dictionary";

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
}

type Scope = "current" | "all";

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
}: AISidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [scope, setScope] = useState<Scope>("current");

  useEffect(() => {
    window.electronAPI?.getSetting("openrouterApiKey").then((key) => {
      setHasApiKey(!!key && key.length > 0);
    });
  }, []);

  useClickOutside(sidebarRef, onClose, "[data-reader-header]");

  const disabled = hasApiKey === false;
  const loading = hasApiKey === null;
  const chapterLimit = scope === "current" ? currentChapter : undefined;

  /* ── Counts ─────────────────────────────────────────────── */

  const alreadyEnriched = Object.keys(enrichedNames).length;
  const enrichToDo = chapters.filter((ch, i) => needsEnrichment(ch.title) && !enrichedNames[i]).length;

  const wikiToDo = totalChapters - wikiProcessedCount;

  /* ── Running state ───────────────────────────────────────── */

  const isEnrichRunning = enrichAllProgress !== null || enrichingChapter !== null;
  const isFormatRunning = formatAllProgress !== null || formattingChapter !== null;
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

  const formatToDo = chapters.length - formattedChapterCount;

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
        "absolute right-0 top-0 z-20 flex h-full w-[300px] flex-col border-l shadow-lg shadow-black/30",
        theme.panel,
        theme.border,
      )}
      style={{ animation: "slideInRight 0.18s ease" }}
    >
      {/* ── Header ── */}
      <div className={cn("flex shrink-0 items-center justify-between border-b px-3 py-2.5", theme.border)}>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-brand)]/15">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          </div>
          <span className={cn("text-sm font-medium", theme.text)}>AI Tools</span>
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
        <div
          className={cn("flex shrink-0 items-start gap-2.5 border-b px-3 py-2.5", theme.border)}
          style={{ background: "var(--bg-inset)" }}
        >
          <KeyRound className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", theme.muted)} strokeWidth={1.5} />
          <p className={cn("text-xs leading-relaxed", theme.muted)}>
            Add an <span className={cn("font-medium", theme.text)}>OpenRouter API key</span> in Settings → AI to use these features.
          </p>
        </div>
      )}

      {/* ── Scope bar ── */}
      <div className={cn("flex shrink-0 items-center gap-2 border-b px-3 py-2", theme.border)}>
        <span className={cn("text-xs", theme.muted)} style={{ opacity: 0.6 }}>Analyse</span>
        <div className="flex flex-1 rounded-lg overflow-hidden" style={{ background: "var(--bg-inset)" }}>
          <button
            onClick={() => setScope("current")}
            className={cn(
              "flex-1 py-1 text-xs font-medium transition-colors",
              scope === "current"
                ? "bg-[var(--accent-brand)] text-white"
                : cn(theme.muted, "hover:text-white/60"),
            )}
          >
            Ch. {currentChapter + 1}
          </button>
          <button
            onClick={() => setScope("all")}
            className={cn(
              "flex-1 py-1 text-xs font-medium transition-colors",
              scope === "all"
                ? "bg-[var(--accent-brand)] text-white"
                : cn(theme.muted, "hover:text-white/60"),
            )}
          >
            All
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className={cn("flex-1 overflow-y-auto py-1", disabled ? "pointer-events-none select-none opacity-40" : "")}>

        <GroupLabel label="Intelligence" theme={theme} />

        {/* AI Wiki */}
        <Row
          Icon={BookMarked}
          label="AI Wiki"
          active={wikiEnabled}
          onToggle={onWikiToggle}
          status={wikiStatusText}
          running={isWikiRunning}
          runCount={wikiRunCount}
          canRun={wikiEnabled && !isWikiRunning && (scope === "current" ? !currentChapterWikiDone : wikiToDo > 0)}
          onRun={() => onWikiProcessAll(chapterLimit)}
          canRetry={wikiEnabled && !isWikiRunning && scope === "current" && currentChapterWikiDone}
          onRetry={onWikiRetry}
          onCancel={onCancelWikiProcessAll}
          canClear={wikiEntryCount > 0 && !isWikiRunning}
          onClear={onClearWiki}
          linkIcon={wikiEnabled && wikiEntryCount > 0 ? ExternalLink : undefined}
          onLink={wikiEnabled && wikiEntryCount > 0 ? openWiki : undefined}
          theme={theme}
        />

        {/* Formatting — independent feature */}
        <Row
          Icon={Paintbrush}
          label="Formatting"
          active={formattingEnabled}
          onToggle={onFormattingToggle}
          status={
            formattedChapterCount >= chapters.length && chapters.length > 0 ? "done"
            : formattedChapterCount > 0 ? `${formattedChapterCount} / ${chapters.length}`
            : undefined
          }
          running={isFormatRunning}
          runCount={formatRunCount}
          canRun={formattingEnabled && !isFormatRunning && (scope === "current" ? !currentChapterFormatDone : formatToDo > 0)}
          onRun={() => onFormatAll(chapterLimit)}
          canRetry={formattingEnabled && !isFormatRunning && scope === "current" && currentChapterFormatDone}
          onRetry={onFormatRetry}
          onCancel={onCancelFormatAll}
          canClear={formattedChapterCount > 0 && !isFormatRunning}
          onClear={onClearFormatting}
          linkIcon={formattingEnabled && styleDictionary && styleDictionary.rules.length > 0 ? BarChart3 : undefined}
          onLink={formattingEnabled && styleDictionary && styleDictionary.rules.length > 0 ? openStyleDict : undefined}
          theme={theme}
        />

        {/* Chapter Titles */}
        <Row
          Icon={Type}
          label="Chapter Titles"
          active={enrichEnabled}
          onToggle={onEnrichToggle}
          status={enrichStatusText}
          running={isEnrichRunning}
          runCount={enrichRunCount}
          canRun={enrichEnabled && !isEnrichRunning && (scope === "current" ? !currentChapterEnrichDone : enrichToDo > 0)}
          onRun={() => onEnrichAll(chapterLimit)}
          canRetry={enrichEnabled && !isEnrichRunning && scope === "current" && currentChapterEnrichDone}
          onRetry={onEnrichRetry}
          onCancel={onCancelEnrichAll}
          canClear={alreadyEnriched > 0 && !isEnrichRunning}
          onClear={onClearEnrichedNames}
          theme={theme}
        />

        <div className={cn("mx-3 my-1.5 h-px", theme.subtle)} />

        <GroupLabel label="Experience" theme={theme} />

        {/* AI Buddy */}
        <Row
          Icon={MessageCircle}
          label="AI Buddy"
          active={buddyEnabled && wikiEnabled}
          onToggle={onBuddyToggle}
          toggleDisabled={!wikiEnabled}
          lockNote={!wikiEnabled ? "needs Wiki" : undefined}
          theme={theme}
        />

        {/* Simulate */}
        <Row
          Icon={Clapperboard}
          label="Simulate"
          active={simulateEnabled && wikiEnabled}
          onToggle={onSimulateToggle}
          toggleDisabled={!wikiEnabled}
          lockNote={!wikiEnabled ? "needs Wiki" : undefined}
          theme={theme}
        />

        {/* Comments */}
        <Row
          Icon={MessageCircle}
          label="Comments"
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
  );
}

/* ── Sub-components ───────────────────────────────────────── */

function GroupLabel({ label, theme }: { label: string; theme: ThemeClasses }) {
  return (
    <div className="px-3 pb-0.5 pt-2">
      <span className={cn("text-xs font-medium uppercase tracking-wider", theme.muted)} style={{ opacity: 0.45 }}>
        {label}
      </span>
    </div>
  );
}

interface RowProps {
  Icon: React.ElementType;
  label: string;
  subLabel?: string;
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

function Row({
  Icon,
  label,
  subLabel,
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
}: RowProps) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-[7px] transition-colors", active ? "bg-[var(--accent-brand)]/[0.04]" : "")}>
      {/* Toggle */}
      <button
        onClick={toggleDisabled ? undefined : onToggle}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          toggleDisabled
            ? cn("cursor-not-allowed opacity-25", theme.subtle)
            : active
              ? "bg-[var(--accent-brand)]"
              : theme.subtle,
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            active && !toggleDisabled ? "translate-x-4" : "",
          )}
        />
      </button>

      {/* Icon + label */}
      <Icon
        className={cn("h-3.5 w-3.5 shrink-0", active ? "text-[var(--accent-brand)]" : theme.muted)}
        strokeWidth={1.5}
        style={{ opacity: active ? 1 : 0.5 }}
      />
      <div className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-tight", active ? theme.text : theme.muted)} style={{ opacity: active ? 1 : 0.5 }}>
          {label}
        </span>
        {subLabel && (
          <span className={cn("block text-xs leading-tight", theme.muted)} style={{ opacity: 0.35 }}>
            {subLabel}
          </span>
        )}
        {lockNote && (
          <span className={cn("block text-xs leading-tight", theme.muted)} style={{ opacity: 0.35 }}>
            {lockNote}
          </span>
        )}
        {/* Status shown inline under label — avoids overflow with long counts like "62 / 1434" */}
        {!running && status && (
          <span
            className={cn("block text-xs tabular-nums leading-tight", status === "done" ? "text-[var(--accent-brand)]" : theme.muted)}
            style={{ opacity: status === "done" ? 0.7 : 0.4 }}
          >
            {status}
          </span>
        )}
        {/* Running count shown inline under label */}
        {running && (
          <div className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-brand)]" strokeWidth={2} />
            {runCount && (
              <span className={cn("text-xs tabular-nums", theme.muted)} style={{ opacity: 0.6 }}>
                {runCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Run / Retry / Stop button */}
      {running && onCancel ? (
        <ActionBtn onClick={onCancel} theme={theme}>
          <Square className="h-2.5 w-2.5" strokeWidth={2} fill="currentColor" />
        </ActionBtn>
      ) : canRun && onRun ? (
        <button
          onClick={onRun}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors"
          style={{ background: "var(--accent-brand-dim)", color: "var(--accent-brand)" }}
        >
          <Play className="h-2.5 w-2.5" strokeWidth={0} fill="currentColor" />
        </button>
      ) : canRetry && onRetry ? (
        <button
          onClick={onRetry}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors"
          style={{ background: "var(--accent-brand-dim)", color: "var(--accent-brand)" }}
        >
          <RefreshCw className="h-3 w-3" strokeWidth={2} />
        </button>
      ) : (
        <div className="h-6 w-6 shrink-0" />
      )}

      {/* Clear button — always shown when data exists and not running */}
      {canClear && onClear && !running ? (
        <ActionBtn onClick={onClear} theme={theme}>
          <Trash2 className="h-3 w-3" strokeWidth={1.5} />
        </ActionBtn>
      ) : (
        <div className="h-6 w-6 shrink-0" />
      )}

      {/* Optional link button */}
      {LinkIcon && onLink ? (
        <ActionBtn onClick={onLink} theme={theme}>
          <LinkIcon className="h-3 w-3" strokeWidth={1.5} />
        </ActionBtn>
      ) : (
        <div className="h-6 w-6 shrink-0" />
      )}
    </div>
  );
}

function LinkRow({
  Icon,
  label,
  onClick,
  theme,
}: {
  Icon: React.ElementType;
  label: string;
  onClick: () => void;
  theme: ThemeClasses;
}) {
  return (
    <button
      onClick={onClick}
      className={cn("flex w-full items-center gap-2 px-3 py-[7px] transition-colors hover:bg-white/[0.03]")}
    >
      <div className="w-9 shrink-0" />
      <Icon className={cn("h-3.5 w-3.5 shrink-0 text-[var(--accent-brand)]")} strokeWidth={1.5} style={{ opacity: 0.6 }} />
      <span className={cn("min-w-0 flex-1 truncate text-left text-xs", theme.muted)} style={{ opacity: 0.5 }}>
        {label}
      </span>
      <ExternalLink className={cn("h-3 w-3 shrink-0", theme.muted)} strokeWidth={1.5} style={{ opacity: 0.3 }} />
      <div className="h-6 w-6 shrink-0" />
    </button>
  );
}

function ActionBtn({
  onClick,
  theme,
  children,
}: {
  onClick: () => void;
  theme: ThemeClasses;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors", theme.btn)}
    >
      {children}
    </button>
  );
}
