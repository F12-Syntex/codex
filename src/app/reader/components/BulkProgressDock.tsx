"use client";

import { useState, useEffect, useRef } from "react";
import {
  Loader2, CheckCircle2, AlertTriangle, Square,
  BookMarked, Paintbrush, Type, ChevronDown, ChevronUp,
  Clock, X, Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemeClasses } from "../lib/types";
import { fmtCh, type ChapterLabels } from "@/lib/chapter-labels";

/* ── Types ─────────────────────────────────────────────────── */

export type FeatureKey = "wiki" | "format" | "titles" | "condense";

const FEATURE_META: Record<FeatureKey, { label: string; Icon: React.ElementType; color: string }> = {
  wiki:     { label: "AI Wiki",        Icon: BookMarked,  color: "var(--accent-brand)" },
  format:   { label: "Formatting",     Icon: Paintbrush,  color: "#a78bfa" },
  titles:   { label: "Chapter Titles", Icon: Type,        color: "#34d399" },
  condense: { label: "Concise",        Icon: Minimize2,   color: "#60a5fa" },
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

interface BulkProgressDockProps {
  isRunning: boolean;
  isDone: boolean;
  phases: PhaseState[];
  currentPhaseIdx: number;
  eta: number | null;
  onCancel: () => void;
  onDismiss: () => void;
  chapterLabels: ChapterLabels;
  /** Currently processing chapter index per feature */
  activeChapters: Partial<Record<FeatureKey, number | null>>;
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

/* ── Component ──────────────────────────────────────────────── */

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
  const overallPct = totalPhases > 0
    ? phases.reduce((sum, p) => {
        if (p.status === "done") return sum + 1;
        if (p.status === "running" && p.total > 0) return sum + p.completed / p.total;
        return sum;
      }, 0) / totalPhases
    : 0;

  const wasCancelled = phases.some(p => p.status === "cancelled");

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col overflow-hidden rounded-lg border border-white/[0.08] shadow-lg shadow-black/40"
      style={{
        background: "var(--bg-overlay)",
        backdropFilter: "blur(16px)",
        width: expanded ? "320px" : "260px",
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
                ? (wasCancelled ? "Analysis cancelled" : "Analysis complete")
                : "Analysing..."
              }
            </span>
            {isRunning && currentPhase && (
              <span className="text-xs text-white/30">
                {totalCompleted + 1}/{totalPhases}
              </span>
            )}
          </div>

          {/* Mini progress info */}
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
                      <span className="text-xs tabular-nums text-white/25">
                        {currentPhase.completed}/{currentPhase.total}
                      </span>
                    )}
                    {activeChapter !== null && activeChapter !== undefined && (
                      <span className="text-xs text-white/20">
                        Ch. {fmtCh(activeChapter, chapterLabels) ?? activeChapter + 1}
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
      <div className="h-0.5 mx-3 mb-1 rounded-full overflow-hidden" style={{ background: "var(--bg-inset)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.round(overallPct * 100)}%`,
            background: isDone
              ? (wasCancelled ? "#facc15" : "#34d399")
              : "var(--accent-brand)",
          }}
        />
      </div>

      {/* ── ETA ── */}
      {isRunning && eta !== null && (
        <div className="flex items-center gap-1 px-3 pb-2">
          <Clock className="h-3 w-3 text-white/20" strokeWidth={1.5} />
          <span className="text-xs tabular-nums text-white/25">
            ETA {fmtEta(eta)}
          </span>
        </div>
      )}

      {/* ── Expanded phase details ── */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-3 py-2 space-y-2">
          {phases.map((phase, idx) => {
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
                  <div className="ml-5 h-0.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inset)" }}>
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
