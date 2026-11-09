"use client";

/**
 * BulkDock — a glass pill above the reader footer showing the book's bulk run (`BulkStatus` from
 * main via `useBulkRun`). Collapsed: overall ring, current kind/chapter, ETA, Stop. Expanded:
 * per-kind progress. Status comes from the orchestrator's job graph, never from UI flags, so it
 * always reaches "done" (AI_AUDIT S2-5) and Stop cancels only this run (S2-3).
 *
 * Morph choreography adapted from 21st.dev "Dynamic Island" (educalvolpz, id 12160): one layout
 * spring for the container (pill ↔ card radius) and keyed content that springs in from
 * scale 0.9 + blur, ending at `filter: none` so the glass keeps blurring (conventions §2).
 */

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Square, X } from "lucide-react";
import type { BulkStatus } from "@shared/ai/types";
import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/ui/progress-ring";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { bulkKinds, bulkProgress, useBulkRun } from "@/lib/ai/chapters";
import { KIND_META, fmtDuration } from "./kind-meta";

export interface BulkDockProps {
  filePath: string;
  /** Display label for a 0-based chapter index (default `Ch. ${i + 1}`). */
  chapterLabel?: (index: number) => string;
  /** Positioning from the host (the dock renders nothing when there is no run). */
  className?: string;
}

const defaultLabel = (i: number) => `Ch. ${i + 1}`;

function headline(s: BulkStatus): string {
  switch (s.state) {
    case "running": return "Processing chapters";
    case "done": return "Bulk run complete";
    case "cancelled": return "Bulk run stopped";
    case "error": return "Bulk run failed";
  }
}

export function BulkDock({ filePath, chapterLabel = defaultLabel, className }: BulkDockProps) {
  const { status, cancel, dismiss } = useBulkRun(filePath);
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const spring = reduce ? { duration: 0 } : { type: "spring" as const, bounce: 0.3, duration: 0.45 };

  return (
    <AnimatePresence>
      {status && (
        <motion.div
          key={status.runId}
          layout
          role="status"
          aria-live="polite"
          className={cn("glass flex flex-col overflow-hidden text-label", expanded ? "w-80" : "w-auto max-w-[min(100%,26rem)]", className)}
          style={{ borderRadius: expanded ? 20 : 28 }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.92, filter: "blur(6px)" }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
          transition={spring}
        >
          <Pill status={status} expanded={expanded} chapterLabel={chapterLabel}
            onToggle={() => setExpanded((e) => !e)} onStop={() => void cancel()} onDismiss={dismiss} />
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="details"
                layout="position"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, filter: "blur(5px)" }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={spring}
                className="mx-2 mb-2 space-y-0.5 rounded-lg bg-fill-quaternary p-1"
              >
                {bulkKinds(status).map((k) => (
                  <KindRow key={k} status={status} kind={k} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Pill({
  status, expanded, chapterLabel, onToggle, onStop, onDismiss,
}: {
  status: BulkStatus;
  expanded: boolean;
  chapterLabel: (i: number) => string;
  onToggle: () => void;
  onStop: () => void;
  onDismiss: () => void;
}) {
  const running = status.state === "running";
  const pct = bulkProgress(status);
  const failed = Object.values(status.perKind).reduce((n, k) => n + k.failed, 0);
  const ringColor = running ? "var(--accent-brand)" : status.state === "done" && failed === 0 ? "var(--system-green)" : "var(--system-orange)";
  const active = status.active[0];
  const activeMeta = active ? KIND_META[active.kind] : null;
  const kinds = bulkKinds(status);

  return (
    <motion.div layout="position" className="flex h-14 items-center gap-3 pr-2 pl-2.5">
      <ProgressRing size={36} stroke={3.5} value={pct} color={ringColor} aria-label="Bulk progress">
        {running ? (
          <span className="text-2xs font-semibold tabular-nums text-label">
            <NumberTicker value={Math.round(pct * 100)} />
          </span>
        ) : status.state === "done" && failed === 0 ? (
          <Check className="size-4 text-success" strokeWidth={2.75} />
        ) : (
          <AlertTriangle className="size-3.5 text-warning" strokeWidth={2.25} />
        )}
      </ProgressRing>

      <div className="min-w-0 flex-1 pr-1">
        <div className="truncate text-headline text-label">
          {running ? <ShimmerText>{headline(status)}</ShimmerText> : headline(status)}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={running && activeMeta ? `${active!.kind}:${active!.chapterIndex}` : status.state}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5 truncate text-xs text-label-tertiary"
          >
            {running && activeMeta ? (
              <>
                <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: activeMeta.color }} />
                <span className="text-label-secondary">{activeMeta.short}</span>
                <span>· {chapterLabel(active!.chapterIndex)}</span>
                {status.active.length > 1 && <span className="tabular-nums">+{status.active.length - 1}</span>}
                {status.etaMs !== undefined && status.etaMs > 0 && <span className="tabular-nums">· ~{fmtDuration(status.etaMs)} left</span>}
              </>
            ) : running ? (
              <span>Waiting for a free slot…</span>
            ) : (
              <span className="tabular-nums">
                {kinds.length} feature{kinds.length === 1 ? "" : "s"}
                {status.endedAt ? ` · ${fmtDuration(status.endedAt - status.startedAt)}` : ""}
                {failed > 0 ? ` · ${failed} failed` : ""}
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-1">
        {running && (
          <DockButton onClick={onStop} title="Stop bulk run" danger>
            <Square className="size-2.5" fill="currentColor" strokeWidth={0} />
          </DockButton>
        )}
        <DockButton onClick={onToggle} title={expanded ? "Hide details" : "Show details"}>
          {expanded ? <ChevronDown className="size-3.5" strokeWidth={2} /> : <ChevronUp className="size-3.5" strokeWidth={2} />}
        </DockButton>
        {!running && (
          <DockButton onClick={onDismiss} title="Dismiss">
            <X className="size-3.5" strokeWidth={2} />
          </DockButton>
        )}
      </div>
    </motion.div>
  );
}

function KindRow({ status, kind }: { status: BulkStatus; kind: keyof BulkStatus["perKind"] }) {
  const meta = KIND_META[kind];
  const k = status.perKind[kind];
  const settled = Math.min(k.total, k.done + k.failed);
  const complete = settled >= k.total;
  const isActive = status.active.some((a) => a.kind === kind);
  return (
    <div className="flex h-9 items-center gap-2.5 rounded-md px-2">
      {complete && k.failed === 0 ? (
        <ProgressRing size={20} stroke={2} value={1} color="var(--system-green)" aria-label={`${meta.label} done`}>
          <Check className="size-2.5 text-success" strokeWidth={3} />
        </ProgressRing>
      ) : (
        <ProgressRing
          size={20}
          stroke={2}
          value={k.total > 0 ? settled / k.total : 0}
          color={status.state === "running" ? meta.color : "var(--system-orange)"}
          aria-label={`${meta.label} progress`}
        />
      )}
      <meta.Icon className={cn("size-3.5 shrink-0", isActive ? "text-label" : "text-label-secondary")} strokeWidth={1.75} />
      <span className="flex-1 truncate text-sm text-label">{meta.short}</span>
      {k.failed > 0 && <span className="text-xs tabular-nums text-danger">{k.failed} failed</span>}
      <span className="text-xs tabular-nums text-label-secondary">
        {k.done}/{k.total}
      </span>
    </div>
  );
}

function DockButton({ onClick, title, danger, children }: { onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }) {
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

export default BulkDock;
