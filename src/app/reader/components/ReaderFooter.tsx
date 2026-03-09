"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  GitBranch,
  X,
  Trash2,
  Volume2,
  Loader2,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemeClasses, TTSStatus } from "../lib/types";

interface ReaderFooterProps {
  currentPage: number;
  totalPages: number;
  chapterIndex: number;
  chapterCount: number;
  chapterTitle: string;
  theme: ThemeClasses;
  immersiveMode: boolean;
  immersiveVisible: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  // TTS
  ttsStatus: TTSStatus;
  ttsRate: number;
  wordsRemaining: number;
  // Branch mode
  branchMode?: boolean;
  branchEntityName?: string;
  onExitBranch?: () => void;
  savedBranches?: SimBranchRow[];
  showBranchList?: boolean;
  onToggleBranchList?: () => void;
  onLoadBranch?: (branch: SimBranchRow) => void;
  onDeleteBranch?: (branchId: string) => void;
  activeBranchId?: string;
}

export const FOOTER_HEIGHT = 52;

/* ── ETA helpers ──────────────────────────────────────────── */

function formatEta(words: number, wpm: number): string {
  if (words <= 0) return "";
  const mins = words / wpm;
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `~${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

/* ── Progress bar ─────────────────────────────────────────── */

function ProgressBar({
  chapterIndex,
  chapterCount,
  currentPage,
  totalPages,
  branchMode,
}: {
  chapterIndex: number;
  chapterCount: number;
  currentPage: number;
  totalPages: number;
  branchMode: boolean;
}) {
  if (branchMode) {
    return (
      <div className="absolute top-0 left-0 right-0 h-[3px]">
        <div className="h-full w-full" style={{ backgroundColor: "var(--accent-brand)", opacity: 0.5 }} />
      </div>
    );
  }

  if (chapterCount === 0) return null;

  // Overall book progress: chapters done + fractional current chapter
  const chapterFraction = totalPages > 1 ? (currentPage + 1) / totalPages : 1;
  const bookPct = ((chapterIndex + chapterFraction) / chapterCount) * 100;

  // Start of current chapter as % of total book
  const chapterStartPct = (chapterIndex / chapterCount) * 100;

  return (
    <div
      className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden"
      style={{ backgroundColor: "var(--accent-brand)", opacity: 0.1 }}
    >
      {/* Completed chapters */}
      <div
        className="absolute top-0 left-0 h-full transition-all duration-500"
        style={{
          width: `${chapterStartPct}%`,
          backgroundColor: "var(--accent-brand)",
          opacity: 0.5,
        }}
      />
      {/* Current chapter page fill */}
      <div
        className="absolute top-0 h-full transition-all duration-300"
        style={{
          left: `${chapterStartPct}%`,
          width: `${(chapterFraction / chapterCount) * 100}%`,
          backgroundColor: "var(--accent-brand)",
          opacity: 1,
        }}
      />
    </div>
  );
}

/* ── TTS status pill ──────────────────────────────────────── */

function TtsPill({ status }: { status: TTSStatus }) {
  if (status === "idle") return null;

  if (status === "synthesizing") {
    return (
      <div className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
        style={{ backgroundColor: "var(--accent-brand)", opacity: 0.15 }}>
        <Loader2
          className="h-2.5 w-2.5 animate-spin"
          style={{ color: "var(--accent-brand)" }}
          strokeWidth={2}
        />
      </div>
    );
  }

  if (status === "paused") {
    return (
      <div className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
        style={{ backgroundColor: "var(--accent-brand)", opacity: 0.12 }}>
        <Volume2
          className="h-2.5 w-2.5"
          style={{ color: "var(--accent-brand)", opacity: 0.5 }}
          strokeWidth={2}
        />
      </div>
    );
  }

  // playing
  return (
    <div className="flex items-center gap-[2px]">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-[2px] rounded-full"
          style={{
            backgroundColor: "var(--accent-brand)",
            animation: `ttsWave 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
            height: "8px",
          }}
        />
      ))}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────── */

export function ReaderFooter({
  currentPage,
  totalPages,
  chapterIndex,
  chapterCount,
  chapterTitle,
  theme,
  immersiveMode,
  immersiveVisible,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  ttsStatus,
  ttsRate,
  wordsRemaining,
  branchMode = false,
  branchEntityName,
  onExitBranch,
  savedBranches = [],
  showBranchList = false,
  onToggleBranchList,
  onLoadBranch,
  onDeleteBranch,
  activeBranchId,
}: ReaderFooterProps) {
  const isVisible = !immersiveMode || immersiveVisible;
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const ttsActive = ttsStatus !== "idle";
  const wpm = 150 * ttsRate;
  const eta = ttsActive ? formatEta(wordsRemaining, wpm) : "";

  return (
    <footer
      className={cn(
        "relative shrink-0 transition-all duration-300",
        theme.surface,
      )}
      style={{
        height: `${FOOTER_HEIGHT}px`,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(100%)",
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      <ProgressBar
        chapterIndex={chapterIndex}
        chapterCount={chapterCount}
        currentPage={currentPage}
        totalPages={totalPages}
        branchMode={branchMode}
      />

      <div className="flex h-full items-center px-3">
        {/* ── Left nav (fixed width) ────── */}
        <div className="flex w-8 shrink-0 items-center">
          {branchMode ? (
            <button
              onClick={onExitBranch}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors",
                theme.btn,
              )}
            >
              <X className="h-3 w-3" strokeWidth={2} />
              Exit
            </button>
          ) : (
            <button
              onClick={onPrev}
              disabled={!canGoPrev}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                theme.btn,
                "disabled:opacity-20",
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* ── Center info (flex-1, stable) ─ */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2.5">
          {branchMode ? (
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <GitBranch
                  className="h-3 w-3"
                  style={{ color: "var(--accent-brand)" }}
                  strokeWidth={2}
                />
                <span className="text-xs font-medium" style={{ color: "var(--accent-brand)" }}>
                  Branch
                </span>
              </div>
              <Dot />
              <span className={cn("min-w-0 truncate text-xs", theme.muted)}>
                {branchEntityName}
              </span>
            </>
          ) : (
            <>
              {/* Chapter title */}
              <div className="flex min-w-0 items-center gap-1.5">
                <BookOpen
                  className={cn("h-3 w-3 shrink-0", theme.muted)}
                  strokeWidth={1.5}
                  style={{ opacity: 0.35 }}
                />
                <span
                  className={cn("min-w-0 truncate text-xs", theme.muted)}
                  style={{ opacity: 0.65 }}
                  title={chapterTitle}
                >
                  {chapterTitle}
                </span>
              </div>

              <Dot />

              {/* Page counter */}
              <span className={cn("shrink-0 text-xs tabular-nums", theme.muted)} style={{ opacity: 0.5 }}>
                {currentPage + 1}
                <span style={{ opacity: 0.45 }}> / {totalPages}</span>
              </span>

              <Dot />

              {/* Chapter counter */}
              <span className={cn("shrink-0 text-xs tabular-nums", theme.muted)} style={{ opacity: 0.38 }}>
                Ch {chapterIndex + 1}
                <span style={{ opacity: 0.7 }}> / {chapterCount}</span>
              </span>
            </>
          )}
        </div>

        {/* ── Right zone (fixed width, TTS + nav) ── */}
        <div className="flex w-[120px] shrink-0 items-center justify-end gap-2">
          {/* TTS indicator — always rendered, fades in/out */}
          <div
            className="flex items-center gap-2 transition-opacity duration-300"
            style={{ opacity: ttsActive ? 1 : 0, pointerEvents: "none" }}
          >
            <TtsPill status={ttsStatus} />
            {/* ETA — fixed-width slot to prevent layout shift */}
            <span
              className="w-14 text-right text-xs tabular-nums font-medium"
              style={{ color: "var(--accent-brand)", opacity: 0.85 }}
            >
              {eta}
            </span>
          </div>

          {/* Branch list button */}
          {savedBranches.length > 0 && (
            <button
              onClick={onToggleBranchList}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors",
                theme.btn,
                showBranchList && "bg-white/[0.08]",
              )}
            >
              <GitBranch className="h-3 w-3" strokeWidth={1.5} />
              {savedBranches.length}
            </button>
          )}

          {/* → nav button */}
          {!branchMode && (
            <button
              onClick={onNext}
              disabled={!canGoNext}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                theme.btn,
                "disabled:opacity-20",
              )}
            >
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Branch list popover */}
      {showBranchList && savedBranches.length > 0 && (
        <div
          className="absolute bottom-full right-4 mb-2 w-[280px] rounded-lg shadow-lg shadow-black/40"
          style={{
            background: "var(--bg-overlay)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.08)",
            animation: "footerPopIn 0.12s ease-out",
          }}
        >
          <div
            className="px-3 py-2 border-b"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <span className="text-xs font-medium text-white/40 uppercase tracking-wider">
              Saved Branches
            </span>
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            {savedBranches.map((branch) => (
              <div
                key={branch.id}
                className={cn(
                  "flex items-center justify-between gap-2 px-3 py-1.5 transition-colors hover:bg-white/[0.05]",
                  activeBranchId === branch.id && "bg-white/[0.08]",
                )}
              >
                <button
                  onClick={() => onLoadBranch?.(branch)}
                  className="flex flex-1 flex-col items-start min-w-0"
                >
                  <span className="text-xs text-white/80 truncate w-full text-left">
                    {branch.entity_name}
                  </span>
                  <span className="text-xs text-white/30">
                    Ch. {branch.chapter_index + 1} ·{" "}
                    {new Date(branch.created_at).toLocaleDateString()}
                  </span>
                </button>
                {confirmDelete === branch.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        onDeleteBranch?.(branch.id);
                        setConfirmDelete(null);
                      }}
                      className="rounded-lg px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded-lg px-1.5 py-0.5 text-xs text-white/40 hover:bg-white/[0.05] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(branch.id)}
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors",
                      theme.btn,
                    )}
                    style={{ opacity: 0.35 }}
                    title="Delete branch"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes footerPopIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ttsWave {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1.2); }
        }
      `}</style>
    </footer>
  );
}

/* ── Tiny separator dot ───────────────────────────────────── */
function Dot() {
  return (
    <span className="shrink-0 text-white/[0.12] select-none text-xs">·</span>
  );
}
