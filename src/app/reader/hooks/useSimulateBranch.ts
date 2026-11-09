"use client";

/**
 * useSimulateBranch — "what if…" branches anchored by ParaRef (owner WS-E; AI_AUDIT §5.5).
 *
 * Replaces Reader's inline `handleSimulate*` handlers. Branch state lives in main
 * (`assistant_branches` / `assistant_branch_segments`); continuations run as `branch.continue`
 * jobs (creative role, Interactive, group `branch:<id>`), are appended in main, and stream here as
 * a live preview. Nothing is written to the wiki.
 *
 *   const sim = useSimulateBranch(filePath, renderedChapter, { chapterIndex });
 *   sim.start(paraRef, { id: entityId, name: "Mira" });   // enter a new branch at that paragraph
 *   await sim.submit("She refuses the deal");             // generate the next segment
 *   sim.truncateAt  → index into chapter.paras after which the page shows the branch instead
 */

import * as React from "react";
import type { BranchChoice, SimBranch, SimSegment } from "@shared/assistant/types";
import type { ParaId, ParaRef, RenderedChapter } from "@shared/pipeline/types";
import type { AIErrorInfo } from "@shared/ai/types";
import { onAIEvent } from "@/lib/ai/events";
import { hasRpc } from "@/lib/ai/rpc";
import { ai } from "@/lib/ai/bridge";
import { branches as branchApi } from "@/lib/assistant/bridge";

export interface SimulateEntity {
  id?: string;
  name: string;
}

export interface UseSimulateBranchOptions {
  /** Spine index of `chapter` (stored on new branches for listing and legacy migration). */
  chapterIndex?: number;
}

export interface SimulateBranchState {
  /** The branch being shown, or null when reading the original text. */
  active: SimBranch | null;
  segments: SimSegment[];
  /** Choices offered after the latest segment. */
  choices: BranchChoice[];
  /** Every branch of this book, most recent first. */
  branches: SimBranch[];
  /** A continuation is being generated. */
  pending: boolean;
  /** Live preview of the continuation being written (plain text, paragraphs split by blank lines). */
  streamText: string;
  error: AIErrorInfo | null;
  /** Index into `chapter.paras` of the branch point when the active branch is in this chapter. */
  truncateAt: number | null;
  /** Create a branch at `ref` (optionally centred on an entity) and make it active. */
  start: (ref: ParaRef, entity?: SimulateEntity, title?: string) => Promise<SimBranch | null>;
  /** Generate the next segment; resolves when it is stored (or failed). */
  submit: (text: string) => Promise<boolean>;
  /** Stop showing the branch (a running continuation still finishes and is saved). */
  exit: () => void;
  /** Cancel the running continuation. */
  cancel: () => void;
  load: (branchId: string) => Promise<void>;
  remove: (branchId: string) => Promise<void>;
  reload: () => Promise<void>;
}

/** Follows `mergedInto` (dropped paragraphs fall back to the previous visible one). */
function anchorIndex(ch: RenderedChapter, paraId: ParaId): number {
  let i = ch.byId[paraId];
  if (i === undefined) return -1;
  for (let hops = 0; hops < 8; hops++) {
    const p = ch.paras[i];
    if (!p.hidden) return i;
    if (p.mergedInto && ch.byId[p.mergedInto] !== undefined) i = ch.byId[p.mergedInto];
    else break;
  }
  for (let j = i; j >= 0; j--) if (!ch.paras[j].hidden) return j;
  return ch.visible[0] ?? -1;
}

/** Strip the `<story>`/`<choices>` protocol from a streaming buffer for display. */
function previewOf(raw: string): string {
  const start = raw.search(/<story>/i);
  let s = start >= 0 ? raw.slice(start + 7) : raw;
  const end = s.search(/<\/story>|<choices>/i);
  if (end >= 0) s = s.slice(0, end);
  return s.replace(/<[^>]*>?/g, "").replace(/\*\*?/g, "").trim();
}

const errInfo = (e: unknown): AIErrorInfo => ({ code: "unknown", message: e instanceof Error ? e.message : String(e), retryable: true });

export function useSimulateBranch(filePath: string, chapter: RenderedChapter | null, opts: UseSimulateBranchOptions = {}): SimulateBranchState {
  const [branches, setBranches] = React.useState<SimBranch[]>([]);
  const [active, setActive] = React.useState<SimBranch | null>(null);
  const [segments, setSegments] = React.useState<SimSegment[]>([]);
  const [pending, setPending] = React.useState(false);
  const [buffer, setBuffer] = React.useState("");
  const [error, setError] = React.useState<AIErrorInfo | null>(null);
  const jobRef = React.useRef<string | null>(null);
  /** Deltas that arrive while `branch:continue` is pending (before the jobId is known). */
  const earlyRef = React.useRef<{ jobId: string; text: string }[] | null>(null);
  const activeRef = React.useRef<SimBranch | null>(null);
  React.useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const reload = React.useCallback(async () => {
    if (!hasRpc() || !filePath) return;
    try {
      setBranches(await branchApi.list(filePath));
    } catch (e) {
      setError(errInfo(e));
    }
  }, [filePath]);

  React.useEffect(() => {
    setActive(null);
    setSegments([]);
    void reload();
  }, [reload]);

  // Stream deltas of our own continuation job.
  React.useEffect(() => {
    if (!hasRpc()) return;
    return onAIEvent("delta", (e) => {
      if (e.jobId === jobRef.current) setBuffer((b) => b + e.text);
      else if (earlyRef.current && earlyRef.current.length < 500) earlyRef.current.push({ jobId: e.jobId, text: e.text });
    });
  }, []);

  const load = React.useCallback(async (branchId: string) => {
    if (!hasRpc()) return;
    setError(null);
    try {
      const list = branches.length ? branches : await branchApi.list(filePath);
      const b = list.find((x) => x.id === branchId) ?? null;
      setActive(b);
      setSegments(b ? await branchApi.segments(b.id) : []);
    } catch (e) {
      setError(errInfo(e));
    }
  }, [branches, filePath]);

  const start = React.useCallback(async (ref: ParaRef, entity?: SimulateEntity, title?: string) => {
    if (!hasRpc()) return null;
    setError(null);
    try {
      const b = await branchApi.create({
        filePath,
        ref,
        chapterIndex: opts.chapterIndex ?? -1,
        ...(entity?.id ? { entityId: entity.id } : {}),
        ...(entity?.name ? { entityName: entity.name } : {}),
        ...(title ? { title } : {}),
      });
      setActive(b);
      setSegments([]);
      setBranches((bs) => [b, ...bs.filter((x) => x.id !== b.id)]);
      return b;
    } catch (e) {
      setError(errInfo(e));
      return null;
    }
  }, [filePath, opts.chapterIndex]);

  const submit = React.useCallback(async (text: string) => {
    const b = activeRef.current;
    if (!b || !text.trim() || !hasRpc()) return false;
    setError(null);
    setBuffer("");
    setPending(true);
    try {
      earlyRef.current = [];
      let ticket: Awaited<ReturnType<typeof branchApi.continue>>;
      try {
        ticket = await branchApi.continue(b.id, text.trim());
      } catch (err) {
        earlyRef.current = null;
        throw err;
      }
      // Keep the first streamed deltas that raced the ticket (QA-P2-13).
      const early = earlyRef.current ?? [];
      earlyRef.current = null;
      const jobId = ticket.jobId;
      jobRef.current = jobId;
      const head = early.filter((d) => d.jobId === jobId).map((d) => d.text).join("");
      if (head) setBuffer((buf) => head + buf);
      const r = await ai.result(ticket.jobId);
      if (r.state !== "done") {
        if (r.state === "error") setError(r.error ?? errInfo("The continuation failed"));
        return false;
      }
      const segs = await branchApi.segments(b.id);
      if (activeRef.current?.id === b.id) setSegments(segs);
      setBranches((bs) => bs.map((x) => (x.id === b.id ? { ...x, segmentCount: segs.length, updatedAt: Date.now() } : x)));
      return true;
    } catch (e) {
      setError(errInfo(e));
      return false;
    } finally {
      jobRef.current = null;
      setPending(false);
      setBuffer("");
    }
  }, []);

  const cancel = React.useCallback(() => {
    const id = jobRef.current;
    if (id) void ai.cancel({ jobId: id }).catch(() => undefined);
  }, []);

  const exit = React.useCallback(() => {
    setActive(null);
    setSegments([]);
    setError(null);
  }, []);

  const remove = React.useCallback(async (branchId: string) => {
    try {
      await branchApi.remove(branchId);
    } catch (e) {
      setError(errInfo(e));
    }
    setBranches((bs) => bs.filter((b) => b.id !== branchId));
    if (activeRef.current?.id === branchId) {
      setActive(null);
      setSegments([]);
    }
  }, []);

  const truncateAt = React.useMemo(() => {
    if (!active || !chapter || active.ref.chapterId !== chapter.chapterId) return null;
    const i = anchorIndex(chapter, active.ref.paraId);
    return i < 0 ? null : i;
  }, [active, chapter]);

  const choices = segments.length ? segments[segments.length - 1].choices : [];

  return {
    active, segments, choices, branches, pending, streamText: pending ? previewOf(buffer) : "", error, truncateAt,
    start, submit, exit, cancel, load, remove, reload,
  };
}
