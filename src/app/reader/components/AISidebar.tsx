"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkles, Type, MessageCircle, Paintbrush, BookOpen, KeyRound, Loader2, Trash2, Zap, Clapperboard, ExternalLink, BarChart3, BookMarked } from "lucide-react";
import type { BookChapter, ThemeClasses } from "../lib/types";
import { needsEnrichment } from "@/lib/ai-prompts";
import type { StyleDictionary } from "@/lib/ai-style-dictionary";
import type { BookWiki } from "@/lib/ai-wiki";

interface AISidebarProps {
  theme: ThemeClasses;
  chapters: BookChapter[];
  enrichedNames: Record<number, string>;
  enrichEnabled: boolean;
  enrichingChapter: number | null;
  enrichAllProgress: { current: number; total: number } | null;
  onEnrichToggle: () => void;
  onEnrichAll: () => void;
  onClearEnrichedNames: () => void;
  formattingEnabled: boolean;
  formattedChapters: Record<number, string[]>;
  formattingChapter: number | null;
  formatAllProgress: { current: number; total: number } | null;
  onFormattingToggle: () => void;
  onFormatAll: () => void;
  onClearFormatting: () => void;
  styleDictionary: StyleDictionary | null;
  filePath: string;
  bookTitle: string;
  wikiEnabled: boolean;
  bookWiki: BookWiki | null;
  wikiProcessingChapter: number | null;
  totalChapters: number;
  currentChapter: number;
  onWikiToggle: () => void;
  onWikiProcessAll: () => void;
  onClearWiki: () => void;
  onClose: () => void;
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
  onClearEnrichedNames,
  formattingEnabled,
  formattedChapters,
  formattingChapter,
  formatAllProgress,
  onFormattingToggle,
  onFormatAll,
  onClearFormatting,
  styleDictionary,
  filePath,
  bookTitle,
  wikiEnabled,
  bookWiki,
  wikiProcessingChapter,
  totalChapters,
  currentChapter,
  onWikiToggle,
  onWikiProcessAll,
  onClearWiki,
  onClose,
}: AISidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  const alreadyEnriched = Object.keys(enrichedNames).length;
  const chaptersToEnrichCount = chapters.filter((ch, i) =>
    needsEnrichment(ch.title) && !enrichedNames[i]
  ).length;
  const isRunningAll = enrichAllProgress !== null && enrichingChapter !== null;

  const alreadyFormatted = Object.keys(formattedChapters).length;
  const chaptersToFormatCount = chapters.length - alreadyFormatted;
  const isFormattingAll = formatAllProgress !== null && formattingChapter !== null;

  const wikiEntryCount = bookWiki ? Object.keys(bookWiki.entries).length : 0;
  const wikiProcessedCount = bookWiki ? bookWiki.processedChapters.length : 0;
  const wikiChaptersToProcess = totalChapters - wikiProcessedCount;

  // Helper: get chapter display name
  const chapterName = (idx: number) => {
    const ch = chapters[idx];
    if (!ch) return `Chapter ${idx + 1}`;
    const enriched = enrichedNames[idx];
    if (enriched) return enriched;
    return ch.title || `Chapter ${idx + 1}`;
  };

  useEffect(() => {
    window.electronAPI?.getSetting("openrouterApiKey").then((key) => {
      setHasApiKey(!!key && key.length > 0);
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sidebarRef.current && !sidebarRef.current.contains(target)) {
        const header = document.querySelector("[data-reader-header]");
        if (header?.contains(target)) return;
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const disabled = hasApiKey === false;
  const loading = hasApiKey === null;

  const openStyleDictionary = () => {
    window.electronAPI?.openStyleDictionary({ filePath, title: bookTitle });
  };

  const openWikiViewer = () => {
    window.electronAPI?.openWiki({ filePath, title: bookTitle });
  };

  const Toggle = ({ value, onChange, isDisabled }: { value: boolean; onChange: () => void; isDisabled?: boolean }) => (
    <button
      onClick={isDisabled ? undefined : onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        isDisabled
          ? "cursor-not-allowed opacity-30 " + theme.subtle
          : value
            ? "bg-[var(--accent-brand)]"
            : theme.subtle
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value && !isDisabled ? "translate-x-4" : ""}`}
      />
    </button>
  );

  // ── Progress Indicators ──────────────────────────────

  const enrichSubContent = () => {
    if (!enrichEnabled || disabled) return null;

    if (isRunningAll) {
      return (
        <div className="mt-2 space-y-1.5">
          <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-inset)" }}>
            <div
              className="h-full rounded-full bg-[var(--accent-brand)] transition-all duration-300"
              style={{ width: `${enrichAllProgress.total > 0 ? Math.round(((enrichAllProgress.current + 1) / enrichAllProgress.total) * 100) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-brand)]" strokeWidth={2} />
              <span className={`text-[11px] truncate max-w-[160px] ${theme.muted}`}>{chapterName(enrichingChapter!)}</span>
            </div>
            <span className={`text-[11px] tabular-nums ${theme.muted}`}>
              {enrichAllProgress.current + 1}/{enrichAllProgress.total}
            </span>
          </div>
        </div>
      );
    }

    if (enrichingChapter !== null) {
      return (
        <div className="mt-1.5 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-brand)]" strokeWidth={2} />
          <span className={`text-[11px] truncate ${theme.muted}`}>{chapterName(enrichingChapter)}</span>
        </div>
      );
    }

    return (
      <div className="mt-2 flex items-center gap-1.5">
        {chaptersToEnrichCount > 0 && (
          <button
            onClick={onEnrichAll}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--accent-brand)] transition-colors"
            style={{ background: "var(--accent-brand-dim)" }}
          >
            <Zap className="h-3 w-3" strokeWidth={1.5} />
            Enrich All ({chaptersToEnrichCount})
          </button>
        )}
        {alreadyEnriched > 0 && (
          <button
            onClick={onClearEnrichedNames}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-colors ${theme.btn}`}
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.5} />
            Clear
          </button>
        )}
        {chaptersToEnrichCount === 0 && alreadyEnriched > 0 && (
          <span className={`text-[11px] ${theme.muted}`}>{alreadyEnriched} chapters renamed</span>
        )}
      </div>
    );
  };

  const formattingSubContent = () => {
    if (!formattingEnabled || disabled) return null;

    if (isFormattingAll) {
      return (
        <div className="mt-2 space-y-1.5">
          <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-inset)" }}>
            <div
              className="h-full rounded-full bg-[var(--accent-brand)] transition-all duration-300"
              style={{ width: `${formatAllProgress.total > 0 ? Math.round(((formatAllProgress.current + 1) / formatAllProgress.total) * 100) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-brand)]" strokeWidth={2} />
              <span className={`text-[11px] truncate max-w-[160px] ${theme.muted}`}>{chapterName(formattingChapter!)}</span>
            </div>
            <span className={`text-[11px] tabular-nums ${theme.muted}`}>
              {formatAllProgress.current + 1}/{formatAllProgress.total}
            </span>
          </div>
        </div>
      );
    }

    if (formattingChapter !== null) {
      return (
        <div className="mt-1.5 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-brand)]" strokeWidth={2} />
          <span className={`text-[11px] truncate ${theme.muted}`}>{chapterName(formattingChapter)}</span>
        </div>
      );
    }

    return (
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {chaptersToFormatCount > 0 && (
          <button
            onClick={onFormatAll}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--accent-brand)] transition-colors"
            style={{ background: "var(--accent-brand-dim)" }}
          >
            <Zap className="h-3 w-3" strokeWidth={1.5} />
            Format All ({chaptersToFormatCount})
          </button>
        )}
        {alreadyFormatted > 0 && (
          <button
            onClick={onClearFormatting}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-colors ${theme.btn}`}
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.5} />
            Clear
          </button>
        )}
        {chaptersToFormatCount === 0 && alreadyFormatted > 0 && (
          <span className={`text-[11px] ${theme.muted}`}>{alreadyFormatted} chapters formatted</span>
        )}
      </div>
    );
  };

  const wikiSubContent = () => {
    if (!wikiEnabled || disabled) return null;

    // Processing indicator (formatting + wiki combined)
    if (formattingChapter !== null || wikiProcessingChapter !== null) {
      const activeChapter = wikiProcessingChapter ?? formattingChapter ?? 0;
      const phase = formattingChapter !== null ? "Formatting" : "Analyzing";
      return (
        <div className="mt-2 space-y-1.5">
          <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-inset)" }}>
            <div
              className="h-full rounded-full bg-[var(--accent-brand)] transition-all duration-300"
              style={{ width: `${totalChapters > 0 ? Math.round((wikiProcessedCount / totalChapters) * 100) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--accent-brand)]" strokeWidth={2} />
              <span className={`text-[11px] truncate ${theme.muted}`}>{phase}: {chapterName(activeChapter)}</span>
            </div>
            <span className={`text-[11px] tabular-nums shrink-0 ${theme.muted}`}>
              {wikiProcessedCount}/{totalChapters}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {wikiChaptersToProcess > 0 && (
          <button
            onClick={onWikiProcessAll}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--accent-brand)] transition-colors"
            style={{ background: "var(--accent-brand-dim)" }}
          >
            <Zap className="h-3 w-3" strokeWidth={1.5} />
            Analyze All ({wikiChaptersToProcess})
          </button>
        )}
        {wikiEntryCount > 0 && (
          <button
            onClick={onClearWiki}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-colors ${theme.btn}`}
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.5} />
            Clear
          </button>
        )}
        {wikiEntryCount > 0 && (
          <span className={`text-[11px] ${theme.muted}`}>
            {wikiEntryCount} {wikiEntryCount === 1 ? "entry" : "entries"} · {wikiProcessedCount} ch.
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      ref={sidebarRef}
      className={`absolute right-0 top-0 z-20 flex h-full w-[340px] flex-col ${theme.panel} border-l ${theme.border} shadow-lg shadow-black/30`}
      style={{ animation: "slideInRight 0.2s ease" }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between border-b px-3 py-2 ${theme.border}`}>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-brand)]/15">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          </div>
          <span className={`text-[13px] font-medium ${theme.text}`}>AI Tools</span>
        </div>
        <button
          onClick={onClose}
          className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* API key warning */}
      {!loading && disabled && (
        <div className={`flex items-start gap-2.5 border-b px-3 py-2.5 ${theme.border}`} style={{ background: "var(--bg-inset)" }}>
          <KeyRound className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${theme.muted}`} strokeWidth={1.5} />
          <p className={`text-[11px] leading-relaxed ${theme.muted}`}>
            API key required. Go to <span className={`font-medium ${theme.text}`}>Settings &rarr; AI &rarr; OpenRouter API Key</span> to configure.
          </p>
        </div>
      )}

      {/* Settings */}
      <div className={`flex-1 overflow-y-auto ${disabled ? "opacity-50 pointer-events-none select-none" : ""}`}>

        {/* ── Intelligence section ── */}
        <div className="px-3 pb-1 pt-3">
          <span className={`text-[11px] font-medium uppercase tracking-wider ${theme.muted}`}>Intelligence</span>
        </div>

        <div className="space-y-0.5 px-1.5">
          {/* AI Wiki — the main feature, auto-enables formatting */}
          <div className={`rounded-lg px-3 py-2.5 transition-colors ${wikiEnabled && !disabled ? "bg-[var(--accent-brand)]/5" : ""}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <BookMarked className={`h-3.5 w-3.5 ${wikiEnabled && !disabled ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-medium ${theme.text}`}>AI Wiki</div>
                <div className={`mt-0.5 text-[11px] leading-relaxed ${theme.muted}`}>
                  Progressive encyclopedia — click highlighted names for details
                </div>
                {wikiSubContent()}
              </div>
              <Toggle value={wikiEnabled} onChange={onWikiToggle} isDisabled={disabled} />
            </div>
          </div>

          {/* Open Wiki Viewer */}
          {wikiEnabled && wikiEntryCount > 0 && (
            <button
              onClick={openWikiViewer}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--accent-brand)]/5"
            >
              <div className="mt-0.5">
                <BookOpen className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className={`text-[13px] font-medium ${theme.text}`}>Open Wiki</div>
                <div className={`mt-0.5 text-[11px] leading-relaxed ${theme.muted}`}>
                  {wikiEntryCount} {wikiEntryCount === 1 ? "entry" : "entries"} — full viewer
                </div>
              </div>
              <ExternalLink className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${theme.muted}`} strokeWidth={1.5} />
            </button>
          )}

          {/* Enrich Chapters */}
          <div className={`rounded-lg px-3 py-2.5 transition-colors ${enrichEnabled && !disabled ? "bg-[var(--accent-brand)]/5" : ""}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Type className={`h-3.5 w-3.5 ${enrichEnabled && !disabled ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-medium ${theme.text}`}>Enrich Chapters</div>
                <div className={`mt-0.5 text-[11px] leading-relaxed ${theme.muted}`}>
                  AI-rename generic chapter titles
                </div>
                {enrichSubContent()}
              </div>
              <Toggle value={enrichEnabled} onChange={onEnrichToggle} isDisabled={disabled} />
            </div>
          </div>

          {/* Smart Summary — coming soon */}
          <SettingRow
            icon={<BookOpen className={`h-3.5 w-3.5 ${theme.muted}`} strokeWidth={1.5} />}
            label="Smart Summary"
            description="Recap previous chapters when you resume"
            theme={theme}
            comingSoon
          />
        </div>

        <div className={`mx-3 my-2 h-px ${theme.subtle}`} />

        {/* ── Experience section ── */}
        <div className="px-3 pb-1">
          <span className={`text-[11px] font-medium uppercase tracking-wider ${theme.muted}`}>Experience</span>
        </div>

        <div className="space-y-0.5 px-1.5">
          {/* AI Buddy — coming soon */}
          <SettingRow
            icon={<MessageCircle className={`h-3.5 w-3.5 ${theme.muted}`} strokeWidth={1.5} />}
            label="AI Buddy"
            description="Chat about the book, ask questions, discuss characters"
            theme={theme}
            comingSoon
          />

          {/* Immersive Formatting */}
          <div className={`rounded-lg px-3 py-2.5 transition-colors ${formattingEnabled && !disabled ? "bg-[var(--accent-brand)]/5" : ""}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Paintbrush className={`h-3.5 w-3.5 ${formattingEnabled && !disabled ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className={`text-[13px] font-medium ${theme.text}`}>Immersive Formatting</div>
                  {wikiEnabled && formattingEnabled && (
                    <span className="rounded-lg px-1.5 py-0.5 text-[11px] text-[var(--accent-brand)]" style={{ background: "var(--accent-brand-dim)" }}>
                      Auto
                    </span>
                  )}
                </div>
                <div className={`mt-0.5 text-[11px] leading-relaxed ${theme.muted}`}>
                  AI-enhanced typography, stat blocks, and dialogue
                </div>
                {formattingSubContent()}
              </div>
              <Toggle value={formattingEnabled} onChange={onFormattingToggle} isDisabled={disabled || wikiEnabled} />
            </div>
          </div>

          {/* Style Dictionary */}
          {formattingEnabled && styleDictionary && styleDictionary.rules.length > 0 && (
            <button
              onClick={openStyleDictionary}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--accent-brand)]/5"
            >
              <div className="mt-0.5">
                <BarChart3 className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className={`text-[13px] font-medium ${theme.text}`}>Style Dictionary</div>
                <div className={`mt-0.5 text-[11px] leading-relaxed ${theme.muted}`}>
                  {styleDictionary.rules.length} learned {styleDictionary.rules.length === 1 ? "rule" : "rules"} — view and regenerate
                </div>
              </div>
              <ExternalLink className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${theme.muted}`} strokeWidth={1.5} />
            </button>
          )}

          {/* Immersive Simulate — coming soon */}
          <SettingRow
            icon={<Clapperboard className={`h-3.5 w-3.5 ${theme.muted}`} strokeWidth={1.5} />}
            label="Immersive Simulate"
            description="AI-generated ambient sounds and music for scenes"
            theme={theme}
            comingSoon
          />
        </div>
      </div>
    </div>
  );
}

/* ── Setting Row ──────────────────────────────────── */

function SettingRow({
  icon,
  label,
  description,
  theme,
  comingSoon,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  theme: ThemeClasses;
  comingSoon?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${comingSoon ? "opacity-40 select-none" : ""}`}>
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] font-medium ${theme.text}`}>{label}</span>
          {comingSoon && (
            <span className={`rounded-lg px-1.5 py-0.5 text-[11px] ${theme.subtle} ${theme.muted}`}>Soon</span>
          )}
        </div>
        <div className={`mt-0.5 text-[11px] leading-relaxed ${theme.muted}`}>{description}</div>
      </div>
    </div>
  );
}
