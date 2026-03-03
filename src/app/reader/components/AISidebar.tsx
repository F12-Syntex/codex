"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkles, Type, MessageCircle, Paintbrush, BookOpen, Check, KeyRound, Loader2, Trash2 } from "lucide-react";
import type { BookChapter, ThemeClasses } from "../lib/types";
import { needsEnrichment } from "@/lib/ai-prompts";

interface AISidebarProps {
  theme: ThemeClasses;
  chapters: BookChapter[];
  enrichedNames: Record<number, string>;
  enrichEnabled: boolean;
  enrichingChapter: number | null;
  onEnrichToggle: () => void;
  onClearEnrichedNames: () => void;
  onClose: () => void;
}

export function AISidebar({
  theme,
  chapters,
  enrichedNames,
  enrichEnabled,
  enrichingChapter,
  onEnrichToggle,
  onClearEnrichedNames,
  onClose,
}: AISidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);

  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  // Toggles for non-functional features
  const [aiBuddy, setAiBuddy] = useState(false);
  const [immersiveFormatting, setImmersiveFormatting] = useState(false);
  const [smartSummary, setSmartSummary] = useState(false);

  const alreadyEnriched = Object.keys(enrichedNames).length;
  const chaptersToEnrichCount = chapters.filter((ch, i) =>
    needsEnrichment(ch.title) && !enrichedNames[i]
  ).length;

  // Check for API key on mount
  useEffect(() => {
    window.electronAPI?.getSetting("openrouterApiKey").then((key) => {
      setHasApiKey(!!key && key.length > 0);
    });
  }, []);

  // Click outside to close
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

      {/* API key warning banner */}
      {!loading && disabled && (
        <div className={`flex items-start gap-2.5 border-b px-3 py-2.5 ${theme.border}`} style={{ background: "var(--bg-inset)" }}>
          <KeyRound className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${theme.muted}`} strokeWidth={1.5} />
          <p className={`text-[11px] leading-relaxed ${theme.muted}`}>
            API key required. Go to <span className={`font-medium ${theme.text}`}>Settings &rarr; AI &rarr; OpenRouter API Key</span> to configure.
          </p>
        </div>
      )}

      {/* Settings list */}
      <div className={`flex-1 overflow-y-auto ${disabled ? "opacity-50 pointer-events-none select-none" : ""}`}>
        {/* Section: Content */}
        <div className="px-3 pb-1 pt-3">
          <span className={`text-[11px] font-medium uppercase tracking-wider ${theme.muted}`}>Content</span>
        </div>

        <div className="space-y-0.5 px-1.5">
          {/* Enrich Chapters */}
          <div className={`rounded-lg px-3 py-2.5 transition-colors ${enrichEnabled && !disabled ? "bg-[var(--accent-brand)]/5" : ""}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Type className={`h-3.5 w-3.5 ${enrichEnabled && !disabled ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-medium ${theme.text}`}>Enrich Chapters</div>
                <div className={`mt-0.5 text-[11px] leading-relaxed ${theme.muted}`}>
                  Rename generic chapters via the table of contents
                </div>

                {/* Enriching indicator */}
                {enrichingChapter !== null && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-brand)]" strokeWidth={2} />
                    <span className={`text-[11px] ${theme.muted}`}>
                      Renaming chapter {enrichingChapter + 1}...
                    </span>
                  </div>
                )}

                {/* Stats + clear */}
                {alreadyEnriched > 0 && enrichingChapter === null && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={2} />
                      <span className={`text-[11px] ${theme.muted}`}>
                        {alreadyEnriched} renamed
                      </span>
                    </div>
                    <button
                      onClick={onClearEnrichedNames}
                      className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] transition-colors ${theme.btn}`}
                    >
                      <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                      Clear
                    </button>
                  </div>
                )}

                {/* Idle hint */}
                {!enrichEnabled && chaptersToEnrichCount > 0 && enrichingChapter === null && (
                  <div className={`mt-1 text-[11px] ${theme.muted}`}>
                    {chaptersToEnrichCount} chapter{chaptersToEnrichCount !== 1 ? "s" : ""} can be improved
                  </div>
                )}
              </div>
              <Toggle value={enrichEnabled} onChange={onEnrichToggle} isDisabled={disabled} />
            </div>
          </div>

          {/* Smart Summary */}
          <SettingRow
            icon={<BookOpen className={`h-3.5 w-3.5 ${smartSummary && !disabled ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />}
            label="Smart Summary"
            description="Generate a recap of previous chapters when you resume reading"
            theme={theme}
            active={smartSummary && !disabled}
            toggle={<Toggle value={smartSummary} onChange={() => setSmartSummary((v) => !v)} isDisabled={disabled} />}
          />
        </div>

        <div className={`mx-3 my-2 h-px ${theme.subtle}`} />

        {/* Section: Experience */}
        <div className="px-3 pb-1">
          <span className={`text-[11px] font-medium uppercase tracking-wider ${theme.muted}`}>Experience</span>
        </div>

        <div className="space-y-0.5 px-1.5">
          {/* AI Buddy */}
          <SettingRow
            icon={<MessageCircle className={`h-3.5 w-3.5 ${aiBuddy && !disabled ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />}
            label="AI Buddy"
            description="Chat about the book, ask questions, discuss characters"
            theme={theme}
            active={aiBuddy && !disabled}
            toggle={<Toggle value={aiBuddy} onChange={() => setAiBuddy((v) => !v)} isDisabled={disabled} />}
          />

          {/* Immersive Formatting */}
          <SettingRow
            icon={<Paintbrush className={`h-3.5 w-3.5 ${immersiveFormatting && !disabled ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />}
            label="Immersive Formatting"
            description="Enhance typography and layout for a more polished reading feel"
            theme={theme}
            active={immersiveFormatting && !disabled}
            toggle={<Toggle value={immersiveFormatting} onChange={() => setImmersiveFormatting((v) => !v)} isDisabled={disabled} />}
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
  active,
  toggle,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  theme: ThemeClasses;
  active: boolean;
  toggle: React.ReactNode;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${active ? "bg-[var(--accent-brand)]/5" : ""}`}>
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] font-medium ${theme.text}`}>{label}</div>
        <div className={`mt-0.5 text-[11px] leading-relaxed ${theme.muted}`}>{description}</div>
      </div>
      {toggle}
    </div>
  );
}
