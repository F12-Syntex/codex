"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, BookMarked, Paintbrush, Type, Play, Square,
  CheckCircle2, Clock, AlertTriangle, Loader2, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemeClasses, BookChapter } from "../lib/types";
import { fmtCh, type ChapterLabels } from "@/lib/chapter-labels";

/* ── Types ─────────────────────────────────────────────────── */

export type FeatureKey = "wiki" | "format" | "titles";

const FEATURE_META: Record<FeatureKey, { label: string; Icon: React.ElementType; color: string }> = {
  wiki:    { label: "AI Wiki",         Icon: BookMarked, color: "var(--accent-brand)" },
  format:  { label: "Formatting",      Icon: Paintbrush, color: "#a78bfa" },
  titles:  { label: "Chapter Titles",  Icon: Type,       color: "#34d399" },
};

type PhaseStatus = "pending" | "running" | "done" | "cancelled";

interface PhaseState {
  feature: FeatureKey;
  status: PhaseStatus;
  completed: number;
  total: number;
  startTime: number | null;
  endTime: number | null;
}

interface LogEntry {
  id: number;
  ts: number;
  feature: FeatureKey;
  chapterIndex: number | null;
  type: "phase_start" | "chapter_active" | "chapter_done" | "phase_done" | "cancelled";
  duration?: number;
}

interface BulkAnalyserModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeClasses;
  chapters: BookChapter[];
  chapterLabels: ChapterLabels;
  totalChapters: number;
  currentChapter: number;
  wikiEnabled: boolean;
  formattingEnabled: boolean;
  enrichEnabled: boolean;
  wikiAllProgress: { current: number; total: number } | null;
  wikiProcessingChapter: number | null;
  formatAllProgress: { current: number; total: number } | null;
  formattingChapter: number | null;
  enrichAllProgress: { current: number; total: number } | null;
  enrichingChapter: number | null;
  onRunWiki: (upTo?: number) => void;
  onRunFormat: (upTo?: number) => void;
  onRunTitles: (upTo?: number) => void;
  onCancelWiki: () => void;
  onCancelFormat: () => void;
  onCancelTitles: () => void;
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

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}m ${sec}s`;
}

function fmtEta(ms: number): string {
  if (ms < 60_000) return `~${Math.ceil(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `~${m}m ${s}s`;
}

/* ── Component ──────────────────────────────────────────────── */

export function BulkAnalyserModal({
  isOpen,
  onClose,
  theme,
  chapters,
  chapterLabels,
  totalChapters,
  currentChapter,
  wikiEnabled,
  formattingEnabled,
  enrichEnabled,
  wikiAllProgress,
  wikiProcessingChapter,
  formatAllProgress,
  formattingChapter,
  enrichAllProgress,
  enrichingChapter,
  onRunWiki,
  onRunFormat,
  onRunTitles,
  onCancelWiki,
  onCancelFormat,
  onCancelTitles,
}: BulkAnalyserModalProps) {
  const maxChapter = maxStoryChapter(chapterLabels, totalChapters);
  const currentStoryChapter = fmtCh(currentChapter, chapterLabels) ?? currentChapter + 1;

  /* ── Setup state ── */
  const [selectedFeatures, setSelectedFeatures] = useState<FeatureKey[]>(["wiki", "format"]);
  const [upToInput, setUpToInput] = useState<string>(String(currentStoryChapter));

  /* ── Run state ── */
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [phases, setPhases] = useState<PhaseState[]>([]);
  const [currentPhaseIdx, setCurrentPhaseIdx] = useState(-1);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [durations, setDurations] = useState<number[]>([]);
  const logIdRef = useRef(0);
  const logScrollRef = useRef<HTMLDivElement>(null);

  /* ── ETA calculation ── */
  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : null;

  const remainingInCurrentPhase = (() => {
    if (currentPhaseIdx < 0 || currentPhaseIdx >= phases.length) return 0;
    const ph = phases[currentPhaseIdx];
    return ph.status === "running" ? ph.total - ph.completed : 0;
  })();
  const remainingInPendingPhases = phases
    .slice(currentPhaseIdx + 1)
    .filter(p => p.status === "pending")
    .reduce((sum, p) => sum + (p.total || 50), 0); // estimate pending phases
  const totalRemaining = remainingInCurrentPhase + remainingInPendingPhases;
  const eta = avgDuration !== null && totalRemaining > 0
    ? avgDuration * totalRemaining
    : null;

  /* ── Log helpers ── */
  const addLog = useCallback((entry: Omit<LogEntry, "id" | "ts">) => {
    const id = ++logIdRef.current;
    setLogEntries(prev => {
      const updated = [...prev, { ...entry, id, ts: Date.now() }];
      return updated.slice(-200); // cap at 200 entries
    });
  }, []);

  const addDuration = useCallback((ms: number) => {
    setDurations(prev => [...prev.slice(-19), ms]);
  }, []);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logEntries.length]);

  /* ── Phase trigger — fires when currentPhaseIdx changes ── */
  const upToIndexRef = useRef(0);
  const phaseTriggeredRef = useRef(false);
  const phaseStartedRef = useRef(false);

  useEffect(() => {
    if (!isRunning || currentPhaseIdx < 0 || currentPhaseIdx >= phases.length) return;
    phaseTriggeredRef.current = false;
    phaseStartedRef.current = false;
    const feature = phases[currentPhaseIdx].feature;

    const t = setTimeout(() => {
      phaseTriggeredRef.current = true;
      addLog({ feature, chapterIndex: null, type: "phase_start" });
      setPhases(prev => prev.map((p, i) => i === currentPhaseIdx ? { ...p, status: "running", startTime: Date.now() } : p));
      if (feature === "wiki") onRunWiki(upToIndexRef.current);
      else if (feature === "format") onRunFormat(upToIndexRef.current);
      else if (feature === "titles") onRunTitles(upToIndexRef.current);
    }, 150);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhaseIdx, isRunning]);

  /* ── Phase completion detector ── */
  useEffect(() => {
    if (!isRunning || currentPhaseIdx < 0 || currentPhaseIdx >= phases.length) return;
    if (!phaseTriggeredRef.current) return;

    const feature = phases[currentPhaseIdx].feature;
    const isCurrentlyRunning =
      feature === "wiki"   ? (wikiAllProgress !== null || wikiProcessingChapter !== null) :
      feature === "format" ? (formatAllProgress !== null || formattingChapter !== null) :
                             (enrichAllProgress !== null || enrichingChapter !== null);

    if (isCurrentlyRunning) {
      phaseStartedRef.current = true;
      // Update phase totals from actual progress
      const prog =
        feature === "wiki"   ? wikiAllProgress :
        feature === "format" ? formatAllProgress :
                               enrichAllProgress;
      if (prog) {
        setPhases(prev => prev.map((p, i) =>
          i === currentPhaseIdx ? { ...p, completed: prog.current, total: prog.total } : p
        ));
      }
    } else if (phaseStartedRef.current) {
      // Was running, now stopped → phase complete
      phaseStartedRef.current = false;
      const endTime = Date.now();
      setPhases(prev => prev.map((p, i) =>
        i === currentPhaseIdx ? { ...p, status: "done", completed: p.total, endTime } : p
      ));
      addLog({ feature, chapterIndex: null, type: "phase_done" });

      if (currentPhaseIdx + 1 < phases.length) {
        setCurrentPhaseIdx(i => i + 1);
      } else {
        setIsRunning(false);
        setIsDone(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wikiAllProgress, wikiProcessingChapter, formatAllProgress, formattingChapter, enrichAllProgress, enrichingChapter]);

  /* ── Per-chapter log entries for Wiki ── */
  const prevWikiChapterRef = useRef<number | null>(null);
  const wikiChapterStartRef = useRef(0);
  useEffect(() => {
    if (!isRunning || phases[currentPhaseIdx]?.feature !== "wiki") return;
    const curr = wikiProcessingChapter;
    if (curr === prevWikiChapterRef.current) return;
    const now = Date.now();
    if (prevWikiChapterRef.current !== null) {
      const dur = now - wikiChapterStartRef.current;
      addLog({ feature: "wiki", chapterIndex: prevWikiChapterRef.current, type: "chapter_done", duration: dur });
      addDuration(dur);
    }
    if (curr !== null) {
      wikiChapterStartRef.current = now;
      addLog({ feature: "wiki", chapterIndex: curr, type: "chapter_active" });
    }
    prevWikiChapterRef.current = curr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wikiProcessingChapter]);

  /* ── Per-chapter log entries for Format ── */
  const prevFormatChapterRef = useRef<number | null>(null);
  const formatChapterStartRef = useRef(0);
  useEffect(() => {
    if (!isRunning || phases[currentPhaseIdx]?.feature !== "format") return;
    const curr = formattingChapter;
    if (curr === prevFormatChapterRef.current) return;
    const now = Date.now();
    if (prevFormatChapterRef.current !== null) {
      const dur = now - formatChapterStartRef.current;
      addLog({ feature: "format", chapterIndex: prevFormatChapterRef.current, type: "chapter_done", duration: dur });
      addDuration(dur);
    }
    if (curr !== null) {
      formatChapterStartRef.current = now;
      addLog({ feature: "format", chapterIndex: curr, type: "chapter_active" });
    }
    prevFormatChapterRef.current = curr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formattingChapter]);

  /* ── Per-chapter log entries for Titles ── */
  const prevTitlesChapterRef = useRef<number | null>(null);
  const titlesChapterStartRef = useRef(0);
  useEffect(() => {
    if (!isRunning || phases[currentPhaseIdx]?.feature !== "titles") return;
    const curr = enrichingChapter;
    if (curr === prevTitlesChapterRef.current) return;
    const now = Date.now();
    if (prevTitlesChapterRef.current !== null) {
      const dur = now - titlesChapterStartRef.current;
      addLog({ feature: "titles", chapterIndex: prevTitlesChapterRef.current, type: "chapter_done", duration: dur });
      addDuration(dur);
    }
    if (curr !== null) {
      titlesChapterStartRef.current = now;
      addLog({ feature: "titles", chapterIndex: curr, type: "chapter_active" });
    }
    prevTitlesChapterRef.current = curr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichingChapter]);

  /* ── Start / Cancel ── */
  const handleStart = () => {
    const storyNum = Math.max(1, Math.min(maxChapter, parseInt(upToInput) || 1));
    const upToIndex = storyChToIndex(storyNum, chapterLabels);
    upToIndexRef.current = upToIndex;

    const initialPhases: PhaseState[] = selectedFeatures.map(feature => ({
      feature,
      status: "pending",
      completed: 0,
      total: 0,
      startTime: null,
      endTime: null,
    }));

    setPhases(initialPhases);
    setLogEntries([]);
    setDurations([]);
    setIsDone(false);
    setIsRunning(true);
    setCurrentPhaseIdx(0);

    // Reset chapter tracking refs
    prevWikiChapterRef.current = null;
    prevFormatChapterRef.current = null;
    prevTitlesChapterRef.current = null;
  };

  const handleCancel = () => {
    const feature = phases[currentPhaseIdx]?.feature;
    if (feature === "wiki") onCancelWiki();
    else if (feature === "format") onCancelFormat();
    else if (feature === "titles") onCancelTitles();
    setPhases(prev => prev.map((p, i) => i === currentPhaseIdx ? { ...p, status: "cancelled" } : p));
    addLog({ feature: feature ?? "wiki", chapterIndex: null, type: "cancelled" });
    setIsRunning(false);
    setIsDone(true);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsDone(false);
    setPhases([]);
    setCurrentPhaseIdx(-1);
    setLogEntries([]);
    setDurations([]);
  };

  const toggleFeature = (key: FeatureKey) => {
    setSelectedFeatures(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  if (!isOpen) return null;

  const storyNum = Math.max(1, Math.min(maxChapter, parseInt(upToInput) || 1));

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !isRunning) onClose(); }}
    >
      <div
        className={cn(
          "relative flex w-[420px] max-h-[85vh] flex-col rounded-lg border shadow-lg shadow-black/40",
          theme.panel,
          theme.border,
        )}
        style={{ background: "var(--bg-overlay)", animation: "overlay-in 0.15s ease" }}
      >
        {/* Header */}
        <div className={cn("flex shrink-0 items-center justify-between border-b px-4 py-3", theme.border)}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--accent-brand-dim)" }}>
              <Paintbrush className="h-3.5 w-3.5" style={{ color: "var(--accent-brand)" }} strokeWidth={1.5} />
            </div>
            <div>
              <p className={cn("text-sm font-semibold leading-tight", theme.text)}>Bulk Analyse</p>
              <p className={cn("text-xs leading-tight", theme.muted)} style={{ opacity: 0.45 }}>
                Run multiple features across chapters
              </p>
            </div>
          </div>
          {!isRunning && (
            <button
              onClick={onClose}
              className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-colors", theme.btn)}
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Setup view */}
          {!isRunning && !isDone && (
            <div className="space-y-4 p-4">
              {/* Feature selection */}
              <div>
                <p className={cn("mb-2 text-xs font-medium uppercase tracking-wider", theme.muted)} style={{ opacity: 0.45 }}>
                  Features
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(FEATURE_META) as [FeatureKey, typeof FEATURE_META[FeatureKey]][]).map(([key, meta]) => {
                    const enabled =
                      key === "wiki"   ? wikiEnabled :
                      key === "format" ? formattingEnabled :
                                         enrichEnabled;
                    const selected = selectedFeatures.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleFeature(key)}
                        disabled={!enabled}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all",
                          !enabled ? "cursor-not-allowed opacity-30" : "cursor-pointer",
                          selected && enabled
                            ? "border-[var(--accent-brand)]/40 bg-[var(--accent-brand)]/10"
                            : cn(theme.border, "bg-[var(--bg-inset)] hover:bg-[var(--bg-elevated)]"),
                        )}
                      >
                        <meta.Icon
                          className="h-4 w-4"
                          style={{ color: selected && enabled ? meta.color : undefined, opacity: selected ? 1 : 0.4 }}
                          strokeWidth={1.5}
                        />
                        <span
                          className={cn("text-xs font-medium leading-tight text-center", theme.text)}
                          style={{ opacity: selected && enabled ? 1 : 0.4 }}
                        >
                          {meta.label}
                        </span>
                        {selected && enabled && (
                          <div className="h-1 w-1 rounded-full" style={{ background: meta.color }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chapter range */}
              <div>
                <p className={cn("mb-2 text-xs font-medium uppercase tracking-wider", theme.muted)} style={{ opacity: 0.45 }}>
                  Analyse up to
                </p>
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 flex-1"
                    style={{ background: "var(--bg-inset)", borderColor: "var(--glass-border)" }}
                  >
                    <span className={cn("text-xs", theme.muted)} style={{ opacity: 0.4 }}>Ch.</span>
                    <input
                      type="number"
                      min={1}
                      max={maxChapter}
                      value={upToInput}
                      onChange={e => setUpToInput(e.target.value)}
                      className={cn(
                        "w-16 bg-transparent text-sm font-medium tabular-nums outline-none",
                        theme.text,
                      )}
                    />
                  </div>
                  <span className={cn("text-xs tabular-nums shrink-0", theme.muted)} style={{ opacity: 0.4 }}>
                    of {maxChapter.toLocaleString()}
                  </span>
                </div>
                <p className={cn("mt-1.5 text-xs", theme.muted)} style={{ opacity: 0.3 }}>
                  Already-processed chapters are skipped automatically
                </p>
              </div>

              {/* Start button */}
              <button
                onClick={handleStart}
                disabled={selectedFeatures.length === 0}
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
                  selectedFeatures.length === 0
                    ? "cursor-not-allowed opacity-30"
                    : "hover:opacity-90 active:scale-[0.99]",
                )}
                style={{
                  background: selectedFeatures.length > 0 ? "var(--accent-brand)" : "var(--bg-inset)",
                  color: selectedFeatures.length > 0 ? "var(--accent-brand-fg)" : undefined,
                }}
              >
                <Play className="h-3.5 w-3.5" strokeWidth={0} fill="currentColor" />
                Start Analysis
                <span className="opacity-60">— {selectedFeatures.length} feature{selectedFeatures.length !== 1 ? "s" : ""}, Ch. 1–{storyNum}</span>
              </button>
            </div>
          )}

          {/* Running / Done view */}
          {(isRunning || isDone) && (
            <div className="flex flex-col">
              {/* Phase list */}
              <div className={cn("border-b p-4 space-y-3", theme.border)}>
                {phases.map((phase, idx) => {
                  const meta = FEATURE_META[phase.feature];
                  const isActive = idx === currentPhaseIdx && isRunning;
                  const pct = phase.total > 0 ? phase.completed / phase.total : 0;

                  return (
                    <div key={phase.feature} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        {phase.status === "running" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" style={{ color: meta.color }} strokeWidth={2} />
                        ) : phase.status === "done" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={1.5} />
                        ) : phase.status === "cancelled" ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-400" strokeWidth={1.5} />
                        ) : (
                          <div className="h-3.5 w-3.5 shrink-0 rounded-full border" style={{ borderColor: "var(--glass-border)" }} />
                        )}
                        <span
                          className={cn("flex-1 text-sm font-medium", theme.text)}
                          style={{ opacity: phase.status === "pending" ? 0.35 : 1 }}
                        >
                          {meta.label}
                        </span>
                        {phase.status === "running" && phase.total > 0 && (
                          <span className={cn("text-xs tabular-nums", theme.muted)} style={{ opacity: 0.6 }}>
                            {phase.completed} / {phase.total}
                          </span>
                        )}
                        {phase.status === "done" && phase.startTime && phase.endTime && (
                          <span className={cn("text-xs tabular-nums", theme.muted)} style={{ opacity: 0.4 }}>
                            {fmtDuration(phase.endTime - phase.startTime)}
                          </span>
                        )}
                        {phase.status === "pending" && (
                          <span className={cn("text-xs", theme.muted)} style={{ opacity: 0.25 }}>waiting</span>
                        )}
                      </div>
                      {/* Progress bar */}
                      {(phase.status === "running" || phase.status === "done") && phase.total > 0 && (
                        <div className="ml-5 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-inset)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.round(pct * 100)}%`,
                              background: phase.status === "done" ? "#34d399" : meta.color,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ETA */}
                {isRunning && eta !== null && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <Clock className={cn("h-3 w-3", theme.muted)} strokeWidth={1.5} style={{ opacity: 0.4 }} />
                    <span className={cn("text-xs tabular-nums", theme.muted)} style={{ opacity: 0.5 }}>
                      ETA {fmtEta(eta)}
                    </span>
                  </div>
                )}

                {isDone && !isRunning && (
                  <div className="flex items-center gap-1.5 rounded-lg px-3 py-2" style={{ background: "var(--bg-inset)" }}>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.5} />
                    <span className={cn("text-xs font-medium", theme.text)}>
                      {phases.some(p => p.status === "cancelled") ? "Cancelled" : "Analysis complete"}
                    </span>
                  </div>
                )}
              </div>

              {/* Activity log */}
              <div className="flex flex-col" style={{ minHeight: 0 }}>
                <div className={cn("flex items-center justify-between border-b px-4 py-2", theme.border)}>
                  <span className={cn("text-xs font-medium uppercase tracking-wider", theme.muted)} style={{ opacity: 0.4 }}>
                    Activity log
                  </span>
                  <span className={cn("text-xs tabular-nums", theme.muted)} style={{ opacity: 0.3 }}>
                    {logEntries.length} entries
                  </span>
                </div>
                <div
                  ref={logScrollRef}
                  className="overflow-y-auto font-mono"
                  style={{ maxHeight: "200px", background: "var(--bg-inset)" }}
                >
                  {logEntries.length === 0 ? (
                    <p className={cn("px-4 py-3 text-xs", theme.muted)} style={{ opacity: 0.3 }}>
                      Waiting for activity…
                    </p>
                  ) : (
                    <div className="py-1">
                      {logEntries.map(entry => (
                        <LogLine key={entry.id} entry={entry} chapterLabels={chapterLabels} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {(isRunning || isDone) && (
          <div className={cn("flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3", theme.border)}>
            {isDone ? (
              <button
                onClick={handleReset}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  theme.btn,
                )}
              >
                Run again
              </button>
            ) : null}
            {isDone && (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                style={{ background: "var(--accent-brand)", color: "var(--accent-brand-fg)" }}
              >
                Close
              </button>
            )}
            {isRunning && (
              <button
                onClick={handleCancel}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  "bg-red-500/15 text-red-400 hover:bg-red-500/25",
                )}
              >
                <Square className="h-2.5 w-2.5" fill="currentColor" strokeWidth={0} />
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Log line ────────────────────────────────────────────────── */

function LogLine({ entry, chapterLabels }: { entry: LogEntry; chapterLabels: ChapterLabels }) {
  const meta = FEATURE_META[entry.feature];
  const time = new Date(entry.ts).toTimeString().slice(0, 8);
  const chStr = entry.chapterIndex !== null
    ? `Ch. ${fmtCh(entry.chapterIndex, chapterLabels) ?? entry.chapterIndex + 1}`
    : null;

  const [dot, dotColor, textOpacity] = (() => {
    switch (entry.type) {
      case "phase_start":   return ["▶", "var(--accent-brand)", 0.7];
      case "chapter_active": return ["●", meta.color, 1];
      case "chapter_done":  return ["✓", "#34d399", 0.55];
      case "phase_done":    return ["■", "#34d399", 0.65];
      case "cancelled":     return ["✕", "#f87171", 0.65];
      default:              return ["·", "currentColor", 0.4];
    }
  })();

  return (
    <div
      className="flex items-baseline gap-2 px-4 py-0.5 hover:bg-white/[0.02] transition-colors"
      style={{ opacity: textOpacity as number }}
    >
      <span className="w-16 shrink-0 text-xs" style={{ opacity: 0.3 }}>{time}</span>
      <span className="w-2 shrink-0 text-center text-xs" style={{ color: dotColor as string }}>{dot}</span>
      <span className="w-14 shrink-0 text-xs" style={{ color: meta.color, opacity: 0.7 }}>
        {meta.label.split(" ")[0]}
      </span>
      <span className="flex-1 truncate text-xs" style={{ opacity: 0.75 }}>
        {entry.type === "phase_start" && "Starting…"}
        {entry.type === "phase_done" && "Done"}
        {entry.type === "cancelled" && "Cancelled"}
        {(entry.type === "chapter_active" || entry.type === "chapter_done") && chStr}
        {entry.type === "chapter_done" && entry.duration !== undefined && (
          <span style={{ opacity: 0.4 }}> — {fmtDuration(entry.duration)}</span>
        )}
      </span>
    </div>
  );
}
