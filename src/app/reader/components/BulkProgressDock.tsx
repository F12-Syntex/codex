"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Check, AlertTriangle, Square,
  BookMarked, Paintbrush, Type, ChevronDown, ChevronUp,
  X, Minimize2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/ui/progress-ring";
import { NumberTicker } from "@/components/ui/number-ticker";
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
  format:   { label: "Formatting",     Icon: Paintbrush,  color: "var(--system-purple)" },
  titles:   { label: "Chapter Titles", Icon: Type,        color: "var(--system-green)" },
  condense: { label: "Concise",        Icon: Minimize2,   color: "var(--system-blue)" },
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
  onRunWiki: (from?: number, upTo?: number) => void;
  onRunFormat: (from?: number, upTo?: number) => void;
  onRunTitles: (from?: number, upTo?: number) => void;
  onRunCondense: (from?: number, upTo?: number) => void;
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

  const fromRef = useRef(0);
  const upToRef = useRef(0);
  const phaseTriggeredRef = useRef(false);
  const phaseStartedRef = useRef(false);
  const phaseIdleCountRef = useRef(0);
  const durationsRef = useRef<number[]>([]);
  const chapterStartRef = useRef(0);
  const prevChapterRef = useRef<number | null>(null);

  const start = useCallback((features: FeatureKey[], fromIndex: number, upToIndex: number) => {
    fromRef.current = fromIndex;
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
      if (feature === "wiki") deps.onRunWiki(fromRef.current, upToRef.current);
      else if (feature === "format") deps.onRunFormat(fromRef.current, upToRef.current);
      else if (feature === "titles") deps.onRunTitles(fromRef.current, upToRef.current);
      else if (feature === "condense") deps.onRunCondense(fromRef.current, upToRef.current);
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
      phaseIdleCountRef.current = 0;

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
      phaseIdleCountRef.current = 0;
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

  // Skip phases where all chapters are already processed — the "all" function
  // returns immediately, so progress props never change. Detect this by polling:
  // if the phase was triggered but never started running after 500ms, skip it.
  useEffect(() => {
    if (!isRunning || currentPhaseIdx < 0 || currentPhaseIdx >= phases.length) return;
    if (!phaseTriggeredRef.current || phaseStartedRef.current) return;

    const timer = setTimeout(() => {
      if (!phaseStartedRef.current && phaseTriggeredRef.current) {
        // Phase was triggered but feature never started — nothing to process, skip it
        setPhases(prev => prev.map((p, i) =>
          i === currentPhaseIdx ? { ...p, status: "done", total: 0, completed: 0, endTime: Date.now() } : p
        ));
        if (currentPhaseIdx + 1 < phases.length) {
          setCurrentPhaseIdx(i => i + 1);
        } else {
          setIsRunning(false);
          setIsDone(true);
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhaseIdx, isRunning, phases.length,
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
  const reduce = useReducedMotion();

  if (!isRunning && !isDone) return null;

  const currentPhase = currentPhaseIdx >= 0 && currentPhaseIdx < phases.length
    ? phases[currentPhaseIdx]
    : null;

  // Calculate overall percentage across all phases
  const totalPhases = phases.length;
  const overallPct = totalPhases > 0
    ? phases.reduce((sum, p) => {
        if (p.status === "done") return sum + 1;
        if (p.status === "running" && p.total > 0) return sum + p.completed / p.total;
        return sum;
      }, 0) / totalPhases
    : 0;

  const wasCancelled = phases.some(p => p.status === "cancelled");
  const ringColor = isDone
    ? (wasCancelled ? "var(--system-orange)" : "var(--system-green)")
    : "var(--accent-brand)";
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, bounce: 0.2, duration: 0.45 };

  const activeMeta = currentPhase ? FEATURE_META[currentPhase.feature] : null;
  const activeChapter = currentPhase ? activeChapters[currentPhase.feature] : null;

  return (
    <motion.div
      layout
      className={cn("glass flex flex-col overflow-hidden text-label", expanded ? "w-[320px]" : "w-auto")}
      style={{ borderRadius: expanded ? 20 : 28 }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.92, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={spring}
    >
      {/* ── Pill: ring · status · actions ── */}
      <motion.div layout="position" className="flex h-14 items-center gap-3 pr-2 pl-2.5">
        <ProgressRing
          size={36}
          stroke={3.5}
          value={isDone ? 1 : overallPct}
          color={ringColor}
          aria-label="Overall progress"
        >
          {isDone ? (
            wasCancelled
              ? <AlertTriangle className="size-3.5 text-warning" strokeWidth={2.25} />
              : <Check className="size-4 text-success" strokeWidth={2.75} />
          ) : (
            <span className="text-2xs font-semibold tabular-nums text-label">
              <NumberTicker value={Math.round(overallPct * 100)} />
            </span>
          )}
        </ProgressRing>

        <div className="min-w-0 flex-1 pr-1">
          <div className="text-headline whitespace-nowrap text-label">
            {isDone ? (wasCancelled ? "Cancelled" : "Analysis complete") : "Analysing…"}
          </div>
          <div className="flex items-center gap-1.5 whitespace-nowrap text-xs text-label-tertiary">
            {isRunning && activeMeta && currentPhase ? (
              <>
                <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: activeMeta.color }} />
                <span className="text-label-secondary">{activeMeta.label}</span>
                {currentPhase.total > 0 && (
                  <span className="tabular-nums">{currentPhase.completed}/{currentPhase.total}</span>
                )}
                {activeChapter !== null && activeChapter !== undefined && (
                  <span>· Ch. {fmtCh(activeChapter, chapterLabels) ?? activeChapter + 1}</span>
                )}
                {eta !== null && eta > 0 && (
                  <span className="tabular-nums">· {fmtEta(eta)}</span>
                )}
              </>
            ) : (
              <span className="tabular-nums">
                {phases.filter(p => p.status === "done").length} of {totalPhases} feature{totalPhases !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isRunning && (
            <DockButton onClick={onCancel} title="Cancel" danger>
              <Square className="size-2.5" fill="currentColor" strokeWidth={0} />
            </DockButton>
          )}
          <DockButton onClick={() => setExpanded(!expanded)} title={expanded ? "Collapse" : "Show details"}>
            {expanded ? <ChevronDown className="size-3.5" strokeWidth={2} /> : <ChevronUp className="size-3.5" strokeWidth={2} />}
          </DockButton>
          {isDone && (
            <DockButton onClick={onDismiss} title="Dismiss">
              <X className="size-3.5" strokeWidth={2} />
            </DockButton>
          )}
        </div>
      </motion.div>

      {/* ── Expanded phase details ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="phases"
            layout="position"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={spring}
            className="mx-2 mb-2 space-y-0.5 rounded-xl bg-fill-quaternary p-1"
          >
            {phases.map((phase) => {
              const meta = FEATURE_META[phase.feature];
              const pct = phase.total > 0 ? phase.completed / phase.total : 0;
              const pending = phase.status === "pending";

              return (
                <div key={phase.feature} className="flex h-9 items-center gap-2.5 rounded-lg px-2">
                  {phase.status === "done" ? (
                    <ProgressRing size={20} stroke={2} value={1} color="var(--system-green)" aria-label={`${meta.label} done`}>
                      <Check className="size-2.5 text-success" strokeWidth={3} />
                    </ProgressRing>
                  ) : phase.status === "cancelled" ? (
                    <ProgressRing size={20} stroke={2} value={pct} color="var(--system-orange)" aria-label={`${meta.label} cancelled`}>
                      <X className="size-2.5 text-warning" strokeWidth={3} />
                    </ProgressRing>
                  ) : phase.status === "running" ? (
                    <ProgressRing
                      size={20}
                      stroke={2}
                      value={pct}
                      indeterminate={phase.total === 0}
                      color={meta.color}
                      aria-label={`${meta.label} progress`}
                    />
                  ) : (
                    <ProgressRing size={20} stroke={2} value={0} aria-label={`${meta.label} pending`} />
                  )}
                  <meta.Icon
                    className={cn("size-3.5 shrink-0", pending ? "text-label-quaternary" : "text-label-secondary")}
                    strokeWidth={1.75}
                  />
                  <span className={cn("flex-1 truncate text-sm", pending ? "text-label-tertiary" : "text-label")}>
                    {meta.label}
                  </span>
                  {phase.status === "running" && phase.total > 0 && (
                    <span className="text-xs tabular-nums text-label-secondary">
                      {phase.completed}/{phase.total}
                    </span>
                  )}
                  {phase.status === "done" && phase.startTime && phase.endTime && (
                    <span className="text-xs tabular-nums text-label-tertiary">
                      {fmtDuration(phase.endTime - phase.startTime)}
                    </span>
                  )}
                  {pending && <span className="text-xs text-label-quaternary">Queued</span>}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DockButton({ onClick, title, danger, children }: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "focus-ring pressable inline-flex size-7 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary transition-colors duration-150",
        danger ? "hover:bg-danger/15 hover:text-danger" : "hover:bg-fill-secondary hover:text-label",
      )}
    >
      {children}
    </button>
  );
}
