"use client";

/**
 * "This chapter" — one row per chapter AI kind with its live state, ↻ (re-run THIS chapter only)
 * and Clear (this chapter, this kind only; two-click confirm). Fixes AI_AUDIT S1-1: nothing here
 * can wipe the book or switch a feature off.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, Minus, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import type { ChapterKind, ChapterStatus, KindState } from "@shared/ai/types";
import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/ui/progress-ring";
import { KIND_META, KIND_ORDER, STATE_LABEL } from "./kind-meta";

export interface ChapterStatusListProps {
  status: ChapterStatus | null;
  onRetry: (kind: ChapterKind) => void;
  onClear: (kind: ChapterKind) => void;
  /** Disable actions (e.g. no API key). */
  disabled?: boolean;
  className?: string;
}

export function ChapterStatusList({ status, onRetry, onClear, disabled, className }: ChapterStatusListProps) {
  const reduce = useReducedMotion();
  const kinds = status ? KIND_ORDER.filter((k) => status.kinds[k] !== "off") : [];

  if (!status) {
    return (
      <div className={cn("space-y-1 px-1 py-1", className)} aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-md bg-fill-quaternary" />
        ))}
      </div>
    );
  }

  if (kinds.length === 0) {
    return (
      <p className={cn("px-2.5 py-2 text-xs text-label-tertiary", className)}>
        Turn on a feature above to process this chapter.
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-col", className)}>
      <AnimatePresence initial={false}>
        {kinds.map((kind) => (
          <motion.li
            key={kind}
            layout={reduce ? false : "position"}
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
          >
            <StatusRow
              kind={kind}
              state={status.kinds[kind]}
              error={status.errors?.[kind]?.message}
              disabled={disabled}
              onRetry={() => onRetry(kind)}
              onClear={() => onClear(kind)}
            />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function StateGlyph({ state, color, label }: { state: KindState; color: string; label: string }) {
  switch (state) {
    case "running":
      return <ProgressRing size={16} stroke={2} indeterminate color={color} aria-label={`${label}: working`} />;
    case "queued":
      return <ProgressRing size={16} stroke={2} value={0} aria-label={`${label}: queued`} className="animate-pulse" />;
    case "ready":
      return (
        <ProgressRing size={16} stroke={2} value={1} color="var(--system-green)" aria-label={`${label}: ready`}>
          <Check className="size-2.5 text-success" strokeWidth={3} />
        </ProgressRing>
      );
    case "stale":
      return <RefreshCw className="size-4 text-warning" strokeWidth={1.75} aria-label={`${label}: outdated`} />;
    case "error":
      return <AlertTriangle className="size-4 text-danger" strokeWidth={1.75} aria-label={`${label}: failed`} />;
    case "skipped":
      return <Minus className="size-4 text-label-quaternary" strokeWidth={1.75} aria-label={`${label}: not needed`} />;
    default:
      return <ProgressRing size={16} stroke={2} value={0} aria-label={`${label}: not processed`} />;
  }
}

function StatusRow({
  kind, state, error, disabled, onRetry, onClear,
}: {
  kind: ChapterKind;
  state: KindState;
  error?: string;
  disabled?: boolean;
  onRetry: () => void;
  onClear: () => void;
}) {
  const meta = KIND_META[kind];
  const busy = state === "queued" || state === "running";
  const hasData = state === "ready" || state === "stale" || (kind === "knowledge" && state === "error");
  const actionable = !busy && !disabled && (state !== "skipped" || hasData);
  const [confirm, setConfirm] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const clear = () => {
    if (confirm) {
      if (timer.current) clearTimeout(timer.current);
      setConfirm(false);
      onClear();
    } else {
      setConfirm(true);
      timer.current = setTimeout(() => setConfirm(false), 2500);
    }
  };

  return (
    <div
      className="group flex h-9 items-center gap-2.5 rounded-md px-2.5 transition-colors duration-150 hover:bg-fill-quaternary"
      title={state === "error" && error ? error : undefined}
    >
      <span className="inline-flex size-4 shrink-0 items-center justify-center">
        <StateGlyph state={state} color={meta.color} label={meta.label} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-label">{meta.short}</span>
      <span
        className={cn(
          "shrink-0 text-2xs tabular-nums",
          state === "error" ? "text-danger" : state === "stale" ? "text-warning" : "text-label-tertiary",
          actionable && "group-hover:hidden group-focus-within:hidden",
        )}
      >
        {STATE_LABEL[state]}
      </span>
      {actionable && (
        <div className="hidden shrink-0 items-center gap-1 group-hover:flex group-focus-within:flex">
          <RowButton onClick={onRetry} label={`Redo ${meta.short.toLowerCase()} for this chapter`}>
            <RotateCw className="size-3" strokeWidth={2} />
          </RowButton>
          {hasData && (
            <RowButton onClick={clear} label={confirm ? "Click again to clear" : `Clear ${meta.short.toLowerCase()} for this chapter`} danger={confirm}>
              {confirm ? <span className="px-1 text-2xs font-medium">Clear?</span> : <Trash2 className="size-3" strokeWidth={2} />}
            </RowButton>
          )}
        </div>
      )}
    </div>
  );
}

function RowButton({ onClick, label, danger, children }: { onClick: () => void; label: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "focus-ring pressable inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 transition-colors duration-150",
        danger ? "bg-danger/15 text-danger" : "bg-fill-tertiary text-label-secondary hover:bg-fill-secondary hover:text-label",
      )}
    >
      {children}
    </button>
  );
}
