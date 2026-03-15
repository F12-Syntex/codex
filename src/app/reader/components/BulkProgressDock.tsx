"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2, CheckCircle2, AlertTriangle, Square,
  BookMarked, Paintbrush, Type, ChevronDown, ChevronUp,
  Clock, X, Minimize2,
} from "lucide-react";
import { fmtCh, type ChapterLabels } from "@/lib/chapter-labels";

/* ── Types (exported for Reader) ──────────────────────────── */

export type FeatureKey = "wiki" | "format" | "titles" | "condense";

export type PhaseStatus = "pending" | "running" | "done" | "cancelled";

export interface PhaseState {
  feature: FeatureKey;
  status: PhaseStatus;
  completed: number;
  total: number;
  startTime: number | null;
  endTime: number | null;
}

export interface BulkRunState {
  isRunning: boolean;
  isDone: boolean;
  phases: PhaseState[];
  currentPhaseIdx: number;
}

const FEATURE_META: Record<FeatureKey, { label: string; Icon: React.ElementType; color: string }> = {
  wiki:     { label: "AI Wiki",        Icon: BookMarked,  color: "var(--accent-brand)" },
  format:   { label: "Formatting",     Icon: Paintbrush,  color: "#a78bfa" },
  titles:   { label: "Chapter Titles", Icon: Type,        color: "#34d399" },
  condense: { label: "Concise",        Icon: Minimize2,   color: "#60a5fa" },
};

/* ── Hook: useBulkRun — manages all phase tracking in Reader ── */

interface BulkRunDeps {
  wikiAllProgress: { current: number; total: number } | null;
  wikiProcessingChapter: number | null;
  formatAllProgress: { current: number; total: number } | null;
  formattingChapter: number | null;
  enrichAllProgress: { current: number; total: number } | null;
  enrichingChapter: number | null;
  condenseAllProgress: { current: number; total: number } | null;
  condensingChapter: number | null;
  onRunWiki: (upTo?: number) => void;
  onRunFormat: (upTo?: number) => void;
  onRunTitles: (upTo?: number) => void;
  onRunCondense: (upTo?: number) => void;
  cancelWiki: () => void;
  cancelFormat: () => void;
  cancelTitles: () => void;
  cancelCondense: () => void;
}

export function useBulkRun(deps: BulkRunDeps) {
  const [phases, setPhases] = useState<PhaseState[]>([]);
  const [currentPhaseIdx, setCurrentPhaseIdx] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [showDock, setShowDock] = useState(false);

  const upToRef = useRef(0);
  const phaseTriggeredRef = useRef(false);
  const phaseStartedRef = useRef(false);
  const durationsRef = useRef<number[]>([]);
  const chapterStartRef = useRef(0);
  const prevChapterRef = useRef<number | null>(null);

  const start = useCallback((features: FeatureKey[], upToIndex: number) => {
    upToRef.current = upToIndex;
    durationsRef.current = [];
    prevChapterRef.current = null;

    const initial: PhaseState[] = features.map(feature => ({
      feature,
      status: "pending",
      completed: 0,
      total: 0,
      startTime: null,
      endTime: null,
    }));

    setPhases(initial);
    setCurrentPhaseIdx(0);
    setIsRunning(true);
    setIsDone(false);
    setShowDock(true);
    phaseTriggeredRef.current = false;
    phaseStartedRef.current = false;
  }, []);

  const cancel = useCallback(() => {
    if (currentPhaseIdx >= 0 && currentPhaseIdx < phases.length) {
      const feature = phases[currentPhaseIdx].feature;
      if (feature === "wiki") deps.cancelWiki();
      else if (feature === "format") deps.cancelFormat();
      else if (feature === "titles") deps.cancelTitles();
      else if (feature === "condense") deps.cancelCondense();

      setPhases(prev => prev.map((p, i) =>
        i === currentPhaseIdx ? { ...p, status: "cancelled" as PhaseStatus } : p
      ));
    }
    setIsRunning(false);
    setIsDone(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhaseIdx, phases]);

  const dismiss = useCallback(() => {
    setShowDock(false);
    setIsRunning(false);
    setIsDone(false);
    setPhases([]);
    setCurrentPhaseIdx(-1);
  }, []);

  // Phase trigger — kick off the current phase's feature
  useEffect(() => {
    if (!isRunning || currentPhaseIdx < 0 || currentPhaseIdx >= phases.length) return;
    phaseTriggeredRef.current = false;
    phaseStartedRef.current = false;
    prevChapterRef.current = null;

    const feature = phases[currentPhaseIdx].feature;
    const t = setTimeout(() => {
      phaseTriggeredRef.current = true;
      setPhases(prev => prev.map((p, i) =>
        i === currentPhaseIdx ? { ...p, status: "running", startTime: Date.now() } : p
      ));
      if (feature === "wiki") deps.onRunWiki(upToRef.current);
      else if (feature === "format") deps.onRunFormat(upToRef.current);
      else if (feature === "titles") deps.onRunTitles(upToRef.current);
      else if (feature === "condense") deps.onRunCondense(upToRef.current);
    }, 150);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhaseIdx, isRunning]);

  // Progress sync — update phase completed/total from actual progress props
  const getProgressForFeature = useCallback((feature: FeatureKey) => {
    switch (feature) {
      case "wiki": return deps.wikiAllProgress;
      case "format": return deps.formatAllProgress;
      case "titles": return deps.enrichAllProgress;
      case "condense": return deps.condenseAllProgress;
    }
  }, [deps.wikiAllProgress, deps.formatAllProgress, deps.enrichAllProgress, deps.condenseAllProgress]);

  const getChapterForFeature = useCallback((feature: FeatureKey): number | null => {
    switch (feature) {
      case "wiki": return deps.wikiProcessingChapter;
      case "format": return deps.formattingChapter;
      case "titles": return deps.enrichingChapter;
      case "condense": return deps.condensingChapter;
    }
  }, [deps.wikiProcessingChapter, deps.formattingChapter, deps.enrichingChapter, deps.condensingChapter]);

  useEffect(() => {
    if (!isRunning || currentPhaseIdx < 0 || currentPhaseIdx >= phases.length) return;
    if (!phaseTriggeredRef.current) return;

    const feature = phases[currentPhaseIdx].feature;
    const prog = getProgressForFeature(feature);
    const chapter = getChapterForFeature(feature);
    const isCurrentlyRunning = prog !== null || chapter !== null;

    if (isCurrentlyRunning) {
      phaseStartedRef.current = true;

      // Track per-chapter durations for ETA
      if (chapter !== null && chapter !== prevChapterRef.current) {
        const now = Date.now();
        if (prevChapterRef.current !== null) {
          durationsRef.current = [...durationsRef.current.slice(-19), now - chapterStartRef.current];
        }
        chapterStartRef.current = now;
        prevChapterRef.current = chapter;
      }

      if (prog) {
        setPhases(prev => prev.map((p, i) =>
          i === currentPhaseIdx ? { ...p, completed: prog.current, total: prog.total } : p
        ));
      }
    } else if (phaseStartedRef.current) {
      // Phase just finished
      phaseStartedRef.current = false;
      const endTime = Date.now();
      setPhases(prev => prev.map((p, i) =>
        i === currentPhaseIdx ? { ...p, status: "done", completed: p.total, endTime } : p
      ));

      if (currentPhaseIdx + 1 < phases.length) {
        setCurrentPhaseIdx(i => i + 1);
      } else {
        setIsRunning(false);
        setIsDone(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deps.wikiAllProgress, deps.wikiProcessingChapter,
    deps.formatAllProgress, deps.formattingChapter,
    deps.enrichAllProgress, deps.enrichingChapter,
    deps.condenseAllProgress, deps.condensingChapter,
  ]);

  // Compute ETA
  const eta = (() => {
    if (!isRunning || currentPhaseIdx < 0 || currentPhaseIdx >= phases.length) return null;
    const durations = durationsRef.current;
    if (durations.length === 0) return null;
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const ph = phases[currentPhaseIdx];
    const remainingCurrent = ph.status === "running" && ph.total > 0 ? ph.total - ph.completed : 0;
    const remainingPending = phases.slice(currentPhaseIdx + 1)
      .filter(p => p.status === "pending")
      .reduce((sum, p) => sum + (p.total || 50), 0);
    return avg * (remainingCurrent + remainingPending);
  })();

  const state: BulkRunState & { eta: number | null } = {
    isRunning,
    isDone,
    phases,
    currentPhaseIdx,
    eta,
  };

  return { state, showDock, start, cancel, dismiss };
}

/* ── Helpers ────────────────────────────────────────────────── */

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

/* ── Dock Component ────────────────────────────────────────── */

interface BulkProgressDockProps {
  isRunning: boolean;
  isDone: boolean;
  phases: PhaseState[];
  currentPhaseIdx: number;
  eta: number | null;
  onCancel: () => void;
  onDismiss: () => void;
  chapterLabels: ChapterLabels;
  activeChapters: Partial<Record<FeatureKey, number | null>>;
}

export function BulkProgressDock({
  isRunning,
  isDone,
  phases,
  currentPhaseIdx,
  eta,
  onCancel,
  onDismiss,
  chapterLabels,
  activeChapters,
}: BulkProgressDockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!isRunning && !isDone) return null;

  const currentPhase = currentPhaseIdx >= 0 && currentPhaseIdx < phases.length
    ? phases[currentPhaseIdx]
    : null;

  const totalCompleted = phases.filter(p => p.status === "done").length;
  const totalPhases = phases.length;

  // Calculate overall percentage across all phases
  const overallPct = totalPhases > 0
    ? phases.reduce((sum, p) => {
        if (p.status === "done") return sum + 1;
        if (p.status === "running" && p.total > 0) return sum + p.completed / p.total;
        return sum;
      }, 0) / totalPhases
    : 0;

  // Current phase percentage
  const currentPhasePct = currentPhase && currentPhase.total > 0
    ? currentPhase.completed / currentPhase.total
    : 0;

  const wasCancelled = phases.some(p => p.status === "cancelled");

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-white/[0.08] shadow-lg shadow-black/40"
      style={{
        background: "var(--bg-overlay)",
        backdropFilter: "blur(16px)",
        width: expanded ? "320px" : "280px",
        animation: "overlay-in 0.15s ease",
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {isRunning && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--accent-brand)]" strokeWidth={2} />
        )}
        {isDone && !wasCancelled && (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={1.5} />
        )}
        {isDone && wasCancelled && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-400" strokeWidth={1.5} />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/70">
              {isDone
                ? (wasCancelled ? "Cancelled" : "Complete")
                : "Analysing..."
              }
            </span>
            {isRunning && (
              <span className="text-xs font-medium tabular-nums text-white/40">
                {Math.round(overallPct * 100)}%
              </span>
            )}
          </div>

          {/* Current phase info */}
          {isRunning && currentPhase && (
            <div className="mt-0.5 flex items-center gap-1.5">
              {(() => {
                const meta = FEATURE_META[currentPhase.feature];
                const activeChapter = activeChapters[currentPhase.feature];
                return (
                  <>
                    <span className="text-xs" style={{ color: meta.color, opacity: 0.7 }}>
                      {meta.label}
                    </span>
                    {currentPhase.total > 0 && (
                      <span className="text-xs tabular-nums text-white/30">
                        {currentPhase.completed}/{currentPhase.total}
                      </span>
                    )}
                    {activeChapter !== null && activeChapter !== undefined && (
                      <span className="text-xs text-white/20">
                        · Ch. {fmtCh(activeChapter, chapterLabels) ?? activeChapter + 1}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isRunning && (
            <button
              onClick={onCancel}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-red-500/15 hover:text-red-400"
              title="Cancel"
            >
              <Square className="h-2.5 w-2.5" fill="currentColor" strokeWidth={0} />
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/50"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
          {isDone && (
            <button
              onClick={onDismiss}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/50"
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* ── Overall progress bar ── */}
      <div className="h-1.5 mx-3 mb-2 rounded-full overflow-hidden" style={{ background: "var(--bg-inset)" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.round(overallPct * 100)}%`,
            background: isDone
              ? (wasCancelled ? "#facc15" : "#34d399")
              : "var(--accent-brand)",
          }}
        />
      </div>

      {/* ── ETA ── */}
      {isRunning && eta !== null && eta > 0 && (
        <div className="flex items-center gap-1 px-3 pb-2">
          <Clock className="h-3 w-3 text-white/20" strokeWidth={1.5} />
          <span className="text-xs tabular-nums text-white/30">
            {fmtEta(eta)} remaining
          </span>
        </div>
      )}

      {/* ── Expanded phase details ── */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-3 py-2 space-y-2.5">
          {phases.map((phase) => {
            const meta = FEATURE_META[phase.feature];
            const pct = phase.total > 0 ? phase.completed / phase.total : 0;

            return (
              <div key={phase.feature} className="space-y-1">
                <div className="flex items-center gap-2">
                  {phase.status === "running" ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: meta.color }} strokeWidth={2} />
                  ) : phase.status === "done" ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" strokeWidth={1.5} />
                  ) : phase.status === "cancelled" ? (
                    <AlertTriangle className="h-3 w-3 shrink-0 text-yellow-400" strokeWidth={1.5} />
                  ) : (
                    <div className="h-3 w-3 shrink-0 rounded-full border border-white/[0.1]" />
                  )}
                  <span
                    className="flex-1 text-xs font-medium text-white/60"
                    style={{ opacity: phase.status === "pending" ? 0.4 : 1 }}
                  >
                    {meta.label}
                  </span>
                  {phase.status === "running" && phase.total > 0 && (
                    <span className="text-xs tabular-nums text-white/30">
                      {phase.completed}/{phase.total}
                    </span>
                  )}
                  {phase.status === "done" && phase.startTime && phase.endTime && (
                    <span className="text-xs tabular-nums text-white/20">
                      {fmtDuration(phase.endTime - phase.startTime)}
                    </span>
                  )}
                </div>
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
        </div>
      )}
    </div>
  );
}
