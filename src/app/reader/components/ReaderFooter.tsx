"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, GitBranch, X, Trash2 } from "lucide-react";
import type { ThemeClasses } from "../lib/types";

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

export const FOOTER_HEIGHT = 44;

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

  return (
    <footer
      className={`shrink-0 border-t ${theme.border} ${theme.surface} transition-all duration-300 relative`}
      style={{
        height: `${FOOTER_HEIGHT}px`,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(100%)",
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      <div className="flex h-full items-center justify-between px-4">
        {/* Left side */}
        {branchMode ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onExitBranch}
              className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-colors ${theme.btn}`}
              title="Exit branch"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              Exit
            </button>
          </div>
        ) : (
          <button
            onClick={onPrev}
            disabled={!canGoPrev}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${theme.btn} disabled:opacity-30`}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}

        {/* Center info */}
        <div className="flex items-center gap-3">
          {branchMode ? (
            <>
              <div className="flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5" style={{ color: "var(--accent-brand)" }} strokeWidth={1.5} />
                <span className="text-[12px] font-medium" style={{ color: "var(--accent-brand)" }}>
                  Branch
                </span>
              </div>
              <span className={`text-[11px] ${theme.muted} opacity-30`}>·</span>
              <span className={`max-w-[200px] truncate text-[12px] ${theme.muted}`}>
                {branchEntityName}
              </span>
            </>
          ) : (
            <>
              <span className={`text-[12px] tabular-nums ${theme.muted}`}>
                Page {currentPage + 1} of {totalPages}
              </span>
              <span className={`text-[11px] ${theme.muted} opacity-30`}>·</span>
              <span className={`max-w-[300px] truncate text-[12px] ${theme.muted}`}>
                {chapterTitle}
              </span>
            </>
          )}
        </div>

        {/* Right side */}
        {branchMode ? (
          <div className="flex items-center gap-1">
            {savedBranches.length > 0 && (
              <button
                onClick={onToggleBranchList}
                className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-colors ${theme.btn} ${showBranchList ? "bg-white/[0.08]" : ""}`}
                title="Saved branches"
              >
                <GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} />
                {savedBranches.length}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {savedBranches.length > 0 && (
              <button
                onClick={onToggleBranchList}
                className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-colors ${theme.btn} ${showBranchList ? "bg-white/[0.08]" : ""}`}
                title="Saved branches"
              >
                <GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} />
                {savedBranches.length}
              </button>
            )}
            <button
              onClick={onNext}
              disabled={!canGoNext}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${theme.btn} disabled:opacity-30`}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {!branchMode && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{ backgroundColor: "var(--accent-brand)", opacity: 0.15 }}
        >
          <div
            className="h-full transition-all duration-300"
            style={{
              width: totalPages > 1 ? `${((currentPage + 1) / totalPages) * 100}%` : "100%",
              backgroundColor: "var(--accent-brand)",
              opacity: 0.7,
            }}
          />
        </div>
      )}

      {/* Branch accent bar */}
      {branchMode && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{ backgroundColor: "var(--accent-brand)", opacity: 0.5 }}
        />
      )}

      {/* Branch list popover */}
      {showBranchList && savedBranches.length > 0 && (
        <div
          className="absolute bottom-full right-4 mb-2 w-[280px] rounded-lg shadow-lg shadow-black/40"
          style={{
            background: "var(--bg-overlay)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.08)",
            animation: "branchListIn 0.12s ease-out",
          }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <span className="text-[11px] font-medium text-white/40 uppercase tracking-wide">
              Saved Branches
            </span>
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            {savedBranches.map((branch) => (
              <div
                key={branch.id}
                className={`flex items-center justify-between gap-2 px-3 py-1.5 transition-colors hover:bg-white/[0.05] ${
                  activeBranchId === branch.id ? "bg-white/[0.08]" : ""
                }`}
              >
                <button
                  onClick={() => onLoadBranch?.(branch)}
                  className="flex flex-1 flex-col items-start min-w-0"
                >
                  <span className="text-[12px] text-white/80 truncate w-full text-left">
                    {branch.entity_name}
                  </span>
                  <span className="text-[11px] text-white/30">
                    Ch. {branch.chapter_index + 1} · {new Date(branch.created_at).toLocaleDateString()}
                  </span>
                </button>
                {confirmDelete === branch.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { onDeleteBranch?.(branch.id); setConfirmDelete(null); }}
                      className="rounded-lg px-1.5 py-0.5 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded-lg px-1.5 py-0.5 text-[11px] text-white/40 hover:bg-white/[0.05] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(branch.id)}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors ${theme.btn} opacity-0 group-hover:opacity-100 hover:!opacity-100`}
                    style={{ opacity: 0.3 }}
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
        @keyframes branchListIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </footer>
  );
}
