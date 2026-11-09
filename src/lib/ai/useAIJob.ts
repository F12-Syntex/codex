"use client";

/**
 * `useAIJob` — run one AI job from a component and follow it live (owner: WS-A).
 *
 *   const job = useAIJob<DefineInput, DefineOutput>();
 *   job.run({ task: "selection.define", input, priority: Priority.Interactive, scope: { filePath } });
 *   job.status   // "idle" | "queued" | "running" | "done" | "error" | "cancelled"
 *   job.output / job.error / job.text (streamed) / job.progress / job.cached
 *   job.cancel()
 *
 * - One job at a time per hook: `run` withdraws the previous job (if still active) first.
 * - Unmount withdraws the job (`cancelOnUnmount`, default true). Main only cancels a job when no
 *   other window still wants it, so joined jobs keep running elsewhere.
 * - Events that arrive before `ai:submit` returns are buffered, so no early delta is lost.
 * - Outside Electron, `run` resolves `null` and `error` reports that AI is unavailable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AIErrorInfo, AIEvent, JobResult, JobSpec, JobState } from "@shared/ai/types";
import { ai, hasRpc } from "./bridge";
import { onAnyAIEvent } from "./events";

export type AIJobStatus = "idle" | JobState;

export interface AIJobState<O> {
  status: AIJobStatus;
  jobId: string | null;
  output?: O;
  error?: AIErrorInfo;
  /** Concatenated `delta` text (jobs submitted with `stream: true`). */
  text: string;
  progress?: { done: number; total: number };
  cached: boolean;
  joined: boolean;
}

export interface UseAIJobOptions {
  /** Withdraw the active job when the component unmounts. Default true. */
  cancelOnUnmount?: boolean;
}

export interface UseAIJob<I, O> extends AIJobState<O> {
  /** Submit and wait. Resolves the final result (or null if superseded/unavailable). */
  run(spec: JobSpec<I>): Promise<JobResult<O> | null>;
  cancel(): void;
  /** Back to idle (withdraws an active job). */
  reset(): void;
  /** True while queued or running. */
  busy: boolean;
}

const IDLE: AIJobState<never> = { status: "idle", jobId: null, text: "", cached: false, joined: false };
const ACTIVE = new Set<AIJobStatus>(["queued", "running"]);

export function useAIJob<I = unknown, O = unknown>(opts: UseAIJobOptions = {}): UseAIJob<I, O> {
  const cancelOnUnmount = opts.cancelOnUnmount ?? true;
  const [state, setState] = useState<AIJobState<O>>(IDLE);
  const jobRef = useRef<string | null>(null);
  const runSeq = useRef(0);
  const buffer = useRef<AIEvent[] | null>(null);
  const mounted = useRef(true);

  const apply = useCallback((e: AIEvent) => {
    if (e.type === "delta") {
      setState((s) => (s.jobId === e.jobId ? { ...s, text: s.text + e.text } : s));
    } else if (e.type === "job") {
      setState((s) => {
        if (s.jobId !== e.jobId || !ACTIVE.has(s.status)) return s;
        const next: AIJobState<O> = { ...s, status: e.state };
        if (e.progress) next.progress = e.progress;
        if (e.error) next.error = e.error;
        return next;
      });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const off = onAnyAIEvent((e) => {
      if (e.type !== "job" && e.type !== "delta") return;
      if (buffer.current) {
        buffer.current.push(e);
        if (buffer.current.length > 500) buffer.current.shift();
        return;
      }
      if (e.jobId === jobRef.current) apply(e);
    });
    return () => {
      mounted.current = false;
      off();
      const id = jobRef.current;
      if (cancelOnUnmount && id) void ai.cancel({ jobId: id }).catch(() => {});
    };
  }, [apply, cancelOnUnmount]);

  const withdraw = useCallback(() => {
    const id = jobRef.current;
    jobRef.current = null;
    if (id) void ai.cancel({ jobId: id }).catch(() => {});
  }, []);

  const run = useCallback(
    async (spec: JobSpec<I>): Promise<JobResult<O> | null> => {
      const seq = ++runSeq.current;
      withdraw();
      if (!hasRpc()) {
        setState({ ...IDLE, status: "error", error: { code: "unknown", message: "AI is only available in the desktop app", retryable: false } });
        return null;
      }
      setState({ ...IDLE, status: "queued" });
      buffer.current = [];
      let ticket;
      try {
        ticket = await ai.submit(spec as JobSpec);
      } catch (err) {
        buffer.current = null;
        if (seq === runSeq.current && mounted.current) {
          setState({ ...IDLE, status: "error", error: { code: "unknown", message: err instanceof Error ? err.message : String(err), retryable: false } });
        }
        return null;
      }
      const early = buffer.current ?? [];
      buffer.current = null;
      if (seq !== runSeq.current) {
        void ai.cancel({ jobId: ticket.jobId }).catch(() => {});
        return null;
      }
      // Unmounted while `submit` was pending: the unmount cleanup saw no job to cancel (QA-P2-6).
      if (!mounted.current) {
        if (cancelOnUnmount) void ai.cancel({ jobId: ticket.jobId }).catch(() => {});
        return null;
      }
      jobRef.current = ticket.jobId;
      setState({ ...IDLE, status: ticket.cached ? "done" : "queued", jobId: ticket.jobId, cached: ticket.cached, joined: ticket.joined });
      for (const e of early) if ("jobId" in e && e.jobId === ticket.jobId) apply(e);

      const result = (await ai.result(ticket.jobId)) as JobResult<O>;
      if (seq !== runSeq.current || !mounted.current) return result;
      if (jobRef.current === ticket.jobId) jobRef.current = null;
      setState((s) => ({
        ...s,
        status: result.state,
        output: result.output,
        error: result.error,
        cached: s.cached || result.cached,
        progress: result.state === "done" && s.progress ? { done: s.progress.total, total: s.progress.total } : s.progress,
      }));
      return result;
    },
    [apply, withdraw, cancelOnUnmount],
  );

  const cancel = useCallback(() => {
    const id = jobRef.current;
    if (!id) return;
    withdraw();
    runSeq.current++;
    setState((s) => (ACTIVE.has(s.status) ? { ...s, status: "cancelled" } : s));
  }, [withdraw]);

  const reset = useCallback(() => {
    withdraw();
    runSeq.current++;
    setState(IDLE);
  }, [withdraw]);

  return { ...state, run, cancel, reset, busy: ACTIVE.has(state.status) };
}
