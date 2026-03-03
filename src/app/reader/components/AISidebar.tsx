"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Sparkles, Type, MessageCircle, Paintbrush, BookOpen, Loader2, Check, AlertCircle } from "lucide-react";
import type { BookChapter, ThemeClasses } from "../lib/types";
import { needsEnrichment, buildChapterRenamePrompt, formatRenamedTitle } from "@/lib/ai-prompts";
import { createOpenRouterClient } from "@/lib/openrouter";

interface AISidebarProps {
  theme: ThemeClasses;
  chapters: BookChapter[];
  bookTitle: string;
  filePath: string;
  enrichedNames: Record<number, string>;
  onEnrichedNamesChange: (names: Record<number, string>) => void;
  onClose: () => void;
}

interface EnrichProgress {
  status: "idle" | "running" | "done" | "error";
  current: number;
  total: number;
  startedAt: number;
  error?: string;
}

export function AISidebar({
  theme,
  chapters,
  bookTitle,
  filePath,
  enrichedNames,
  onEnrichedNamesChange,
  onClose,
}: AISidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  const [enrichProgress, setEnrichProgress] = useState<EnrichProgress>({
    status: "idle", current: 0, total: 0, startedAt: 0,
  });

  // Toggles for non-functional features
  const [aiBuddy, setAiBuddy] = useState(false);
  const [immersiveFormatting, setImmersiveFormatting] = useState(false);
  const [smartSummary, setSmartSummary] = useState(false);

  // Count how many chapters need enrichment
  const chaptersToEnrich = chapters.filter((ch, i) =>
    needsEnrichment(ch.title) && !enrichedNames[i]
  );
  const alreadyEnriched = Object.keys(enrichedNames).length;

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

  const runEnrichment = useCallback(async () => {
    const apiKey = await window.electronAPI?.getSetting("openrouterApiKey");
    if (!apiKey) {
      setEnrichProgress((p) => ({ ...p, status: "error", error: "No API key configured. Set it in Settings." }));
      return;
    }

    const toEnrich = chapters
      .map((ch, i) => ({ ch, i }))
      .filter(({ ch, i }) => needsEnrichment(ch.title) && !enrichedNames[i]);

    if (toEnrich.length === 0) {
      setEnrichProgress({ status: "done", current: 0, total: 0, startedAt: Date.now() });
      return;
    }

    abortRef.current = false;
    setEnrichProgress({ status: "running", current: 0, total: toEnrich.length, startedAt: Date.now() });

    const client = createOpenRouterClient(apiKey);
    const newNames = { ...enrichedNames };

    for (let idx = 0; idx < toEnrich.length; idx++) {
      if (abortRef.current) break;

      const { ch, i } = toEnrich[idx];
      setEnrichProgress((p) => ({ ...p, current: idx }));

      try {
        // Build content preview — full chapter text, capped at ~2000 chars
        const contentPreview = ch.paragraphs.join("\n").slice(0, 2000);
        const prompt = buildChapterRenamePrompt(ch.title, contentPreview, bookTitle);

        const response = await client.chat(
          [{ role: "user", content: prompt }],
          "openai/gpt-4o-mini",
          { max_tokens: 30, temperature: 0.3 },
        );

        const subtitle = response.choices?.[0]?.message?.content?.trim();
        if (subtitle) {
          newNames[i] = formatRenamedTitle(ch.title, subtitle);
          onEnrichedNamesChange({ ...newNames });
        }
      } catch (err) {
        // If a single chapter fails, log and continue
        console.error(`Failed to enrich chapter ${i}:`, err);
      }
    }

    // Save to DB
    await window.electronAPI?.setSetting(
      `enrichedChapters:${filePath}`,
      JSON.stringify(newNames),
    );

    setEnrichProgress((p) => ({
      ...p,
      status: abortRef.current ? "idle" : "done",
      current: abortRef.current ? p.current : toEnrich.length,
    }));
  }, [chapters, bookTitle, filePath, enrichedNames, onEnrichedNamesChange]);

  const cancelEnrichment = useCallback(() => {
    abortRef.current = true;
  }, []);

  const clearEnrichment = useCallback(async () => {
    onEnrichedNamesChange({});
    await window.electronAPI?.setSetting(
      `enrichedChapters:${filePath}`,
      JSON.stringify({}),
    );
    setEnrichProgress({ status: "idle", current: 0, total: 0, startedAt: 0 });
  }, [filePath, onEnrichedNamesChange]);

  // Time remaining estimate
  const elapsed = enrichProgress.status === "running" ? (Date.now() - enrichProgress.startedAt) / 1000 : 0;
  const perChapter = enrichProgress.current > 0 ? elapsed / enrichProgress.current : 0;
  const remaining = perChapter * (enrichProgress.total - enrichProgress.current);

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${value ? "bg-[var(--accent-brand)]" : theme.subtle}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : ""}`}
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

      {/* Settings list */}
      <div className="flex-1 overflow-y-auto">
        {/* Section: Content */}
        <div className="px-3 pb-1 pt-3">
          <span className={`text-[11px] font-medium uppercase tracking-wider ${theme.muted}`}>Content</span>
        </div>

        <div className="px-1.5">
          {/* Enrich Chapters — functional */}
          <EnrichChaptersRow
            theme={theme}
            progress={enrichProgress}
            chaptersToEnrich={chaptersToEnrich.length}
            alreadyEnriched={alreadyEnriched}
            totalChapters={chapters.length}
            elapsed={elapsed}
            remaining={remaining}
            onRun={runEnrichment}
            onCancel={cancelEnrichment}
            onClear={clearEnrichment}
          />

          {/* Smart Summary */}
          <SettingRow
            icon={<BookOpen className={`h-3.5 w-3.5 ${smartSummary ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />}
            label="Smart Summary"
            description="Generate a recap of previous chapters when you resume reading"
            theme={theme}
            active={smartSummary}
            toggle={<Toggle value={smartSummary} onChange={() => setSmartSummary((v) => !v)} />}
          />
        </div>

        <div className={`mx-3 my-2 h-px ${theme.subtle}`} />

        {/* Section: Experience */}
        <div className="px-3 pb-1">
          <span className={`text-[11px] font-medium uppercase tracking-wider ${theme.muted}`}>Experience</span>
        </div>

        <div className="px-1.5">
          {/* AI Buddy */}
          <SettingRow
            icon={<MessageCircle className={`h-3.5 w-3.5 ${aiBuddy ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />}
            label="AI Buddy"
            description="Chat about the book, ask questions, discuss characters"
            theme={theme}
            active={aiBuddy}
            toggle={<Toggle value={aiBuddy} onChange={() => setAiBuddy((v) => !v)} />}
          />

          {/* Immersive Formatting */}
          <SettingRow
            icon={<Paintbrush className={`h-3.5 w-3.5 ${immersiveFormatting ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />}
            label="Immersive Formatting"
            description="Enhance typography and layout for a more polished reading feel"
            theme={theme}
            active={immersiveFormatting}
            toggle={<Toggle value={immersiveFormatting} onChange={() => setImmersiveFormatting((v) => !v)} />}
          />
        </div>

        <div className={`mx-3 my-2 h-px ${theme.subtle}`} />

        {/* Info */}
        <div className="px-3 pb-3">
          <div className={`rounded-lg px-3 py-2.5 ${theme.subtle}`}>
            <p className={`text-[11px] leading-relaxed ${theme.muted}`}>
              AI features require an OpenRouter API key. Configure it in the main app settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Enrich Chapters Row ─────────────────────────── */

function EnrichChaptersRow({
  theme,
  progress,
  chaptersToEnrich,
  alreadyEnriched,
  totalChapters,
  elapsed,
  remaining,
  onRun,
  onCancel,
  onClear,
}: {
  theme: ThemeClasses;
  progress: EnrichProgress;
  chaptersToEnrich: number;
  alreadyEnriched: number;
  totalChapters: number;
  elapsed: number;
  remaining: number;
  onRun: () => void;
  onCancel: () => void;
  onClear: () => void;
}) {
  const isRunning = progress.status === "running";
  const isDone = progress.status === "done";
  const isError = progress.status === "error";
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  // Re-render every second for the timer
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  return (
    <div className={`rounded-lg px-3 py-2.5 transition-colors ${isRunning || isDone ? "bg-[var(--accent-brand)]/5" : ""}`}>
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Type className={`h-3.5 w-3.5 ${isRunning || isDone ? "text-[var(--accent-brand)]" : theme.muted}`} strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-[13px] font-medium ${theme.text}`}>Enrich Chapters</div>
          <div className={`mt-0.5 text-[11px] leading-relaxed ${theme.muted}`}>
            Add descriptive subtitles to generic chapter names
          </div>
        </div>
      </div>

      {/* Progress / action area */}
      <div className="mt-2.5 pl-6">
        {isRunning ? (
          <div className="space-y-2">
            {/* Progress bar */}
            <div className={`h-1.5 w-full overflow-hidden rounded-full ${theme.subtle}`}>
              <div
                className="h-full rounded-full bg-[var(--accent-brand)] transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between">
              <span className={`text-[11px] tabular-nums ${theme.muted}`}>
                {progress.current}/{progress.total} chapters
              </span>
              <span className={`text-[11px] tabular-nums ${theme.muted}`}>
                {formatTime(remaining)} remaining
              </span>
            </div>

            {/* Cancel button */}
            <button
              onClick={onCancel}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${theme.btn}`}
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
              Cancel
            </button>
          </div>
        ) : isDone ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
              <span className={`text-[12px] ${theme.text}`}>
                {alreadyEnriched} chapter{alreadyEnriched !== 1 ? "s" : ""} enriched
              </span>
            </div>
            <button
              onClick={onClear}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${theme.btn}`}
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
              Clear enrichments
            </button>
          </div>
        ) : isError ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-red-400" strokeWidth={1.5} />
              <span className="text-[11px] text-red-400">{progress.error}</span>
            </div>
            <button
              onClick={onRun}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-brand)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--accent-brand-fg)] transition-colors hover:opacity-90"
            >
              <Sparkles className="h-3 w-3" strokeWidth={1.5} />
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <span className={`text-[11px] ${theme.muted}`}>
              {chaptersToEnrich > 0
                ? `${chaptersToEnrich} chapter${chaptersToEnrich !== 1 ? "s" : ""} can be enriched`
                : alreadyEnriched > 0
                  ? `All enriched (${alreadyEnriched} chapters)`
                  : "No generic chapter names found"}
            </span>

            <div className="flex items-center gap-2">
              {chaptersToEnrich > 0 && (
                <button
                  onClick={onRun}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-brand)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--accent-brand-fg)] transition-colors hover:opacity-90 active:scale-[0.98]"
                >
                  <Sparkles className="h-3 w-3" strokeWidth={1.5} />
                  Enrich{chaptersToEnrich < totalChapters ? ` ${chaptersToEnrich}` : ""} chapters
                </button>
              )}

              {alreadyEnriched > 0 && (
                <button
                  onClick={onClear}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${theme.btn}`}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
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

/* ── Helpers ──────────────────────────────────────── */

function formatTime(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "calculating...";
  const s = Math.ceil(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}
