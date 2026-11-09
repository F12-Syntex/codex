"use client";

/**
 * Renderer hooks for chapter artifacts, book status, per-book prefs and bulk runs (owner: WS-D).
 * AI_AUDIT §4.4.6, §5.5. Thin: all state lives in main (orchestrator); these hooks read it over
 * RPC and refresh on `ai:event`s (`artifact`, `job`, `knowledge`, `bulk`). Nothing here infers
 * progress from UI flags (S2-4, S2-5).
 *
 *   const { prefs, setPrefs } = useBookAIPrefs(filePath);
 *   const { artifacts, status, retry, clear } = useChapterArtifacts(filePath, chapterIndex, { ensure: true, totalChapters });
 *   const { status: book } = useBookAIStatus(filePath);
 *   const bulk = useBulkRun(filePath);   // bulk.start({kinds, from, to}), bulk.cancel(), bulk.dismiss()
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BookAIPrefs, BookAIStatus, BulkRequest, BulkStatus, ChapterArtifacts, ChapterKind, ChapterStatus,
} from "@shared/ai/types";
import { Priority } from "@shared/ai/types";
import { bulk as bulkRpc, chapters as chaptersRpc, hasRpc } from "./bridge";
import { onAIEvent } from "./events";
import { rpc } from "./rpc";

// ── Same-window prefs bus (prefs have no ai:event; every panel in a window stays in sync) ──

type PrefsListener = (filePath: string, prefs: BookAIPrefs) => void;
const prefsListeners = new Set<PrefsListener>();

function publishPrefs(filePath: string, prefs: BookAIPrefs): void {
  for (const l of Array.from(prefsListeners)) l(filePath, prefs);
}

function onPrefs(listener: PrefsListener): () => void {
  prefsListeners.add(listener);
  return () => {
    prefsListeners.delete(listener);
  };
}

/** Coalesce bursts of events into one refresh. */
function useCoalesced(fn: () => void, delayMs = 120): () => void {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      fnRef.current();
    }, delayMs);
  }, [delayMs]);
}

/** State tagged with the key it belongs to: switching key reads as `null` with no reset effect. */
function useKeyedState<T>(key: string | null): [T | null, (v: T | null | ((prev: T | null) => T | null)) => void] {
  const [state, setState] = useState<{ key: string | null; value: T | null }>({ key, value: null });
  const value = state.key === key ? state.value : null;
  const set = useCallback((v: T | null | ((prev: T | null) => T | null)) => {
    setState((cur) => {
      const prev = cur.key === key ? cur.value : null;
      return { key, value: typeof v === "function" ? (v as (p: T | null) => T | null)(prev) : v };
    });
  }, [key]);
  return [value, set];
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Prefs ───────────────────────────────────────────────────────────────────

export interface BookAIPrefsState {
  prefs: BookAIPrefs | null;
  /** Saves in main (atomic) and updates every hook in this window. */
  setPrefs: (patch: Partial<BookAIPrefs>) => Promise<BookAIPrefs | null>;
  error: string | null;
}

export function useBookAIPrefs(filePath: string | null | undefined): BookAIPrefsState {
  const [prefs, setState] = useKeyedState<BookAIPrefs>(filePath ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath || !hasRpc()) return;
    let alive = true;
    chaptersRpc.getPrefs(filePath).then(
      (p) => alive && setState(p),
      (err) => alive && setError(errorMessage(err)),
    );
    const off = onPrefs((fp, p) => {
      if (fp === filePath) setState(p);
    });
    return () => {
      alive = false;
      off();
    };
  }, [filePath, setState]);

  const setPrefs = useCallback(async (patch: Partial<BookAIPrefs>) => {
    if (!filePath) return null;
    // Optimistic: the switch moves now, main confirms.
    setState((p) => (p ? { ...p, ...patch } : p));
    try {
      const next = await chaptersRpc.setPrefs(filePath, patch);
      publishPrefs(filePath, next);
      setError(null);
      return next;
    } catch (err) {
      setError(errorMessage(err));
      chaptersRpc.getPrefs(filePath).then((p) => publishPrefs(filePath, p), () => {});
      return null;
    }
  }, [filePath, setState]);

  return { prefs, setPrefs, error };
}

// ── One chapter ─────────────────────────────────────────────────────────────

export interface UseChapterArtifactsOptions {
  /**
   * Queue missing/stale kinds for this chapter at `Visible` priority whenever the chapter or the
   * book's prefs change, and (when `prefs.prefetchNext`) the next chapter at `Prefetch`. The reader
   * passes true; panels that only display status leave it off.
   */
  ensure?: boolean;
  /** Guards the prefetch of `chapterIndex + 1`. */
  totalChapters?: number;
}

export interface ChapterArtifactsState {
  /** Valid layers for the current prefs (stale/disabled layers omitted). Null until loaded. */
  artifacts: ChapterArtifacts | null;
  /** Per-kind state of this chapter. Null until loaded. */
  status: ChapterStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** ↻ — re-run one kind for THIS chapter only (bypasses the AI cache read). */
  retry: (kind: ChapterKind) => Promise<void>;
  /** Clear one kind for THIS chapter only (knowledge → `knowledge:clear` for the chapter). */
  clear: (kind: ChapterKind) => Promise<void>;
}

export function useChapterArtifacts(
  filePath: string | null | undefined,
  chapterIndex: number,
  opts: UseChapterArtifactsOptions = {},
): ChapterArtifactsState {
  const { ensure = false, totalChapters } = opts;
  const chapterKey = filePath ? `${filePath}\u0000${chapterIndex}` : null;
  const [artifacts, setArtifacts] = useKeyedState<ChapterArtifacts>(chapterKey);
  const [status, setStatus] = useKeyedState<ChapterStatus>(chapterKey);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = !!chapterKey && loadedKey !== chapterKey;
  const [error, setError] = useState<string | null>(null);
  const { prefs } = useBookAIPrefs(filePath);
  const seq = useRef(0);

  // `artifacts`: the layers only. With `ensure`, the queueing ensure below returns the status, so
  // a separate status-only ensure (O(book) in main) is not needed on load (QA-P2-11).
  const load = useCallback(async (what: "both" | "status" | "artifacts" = "both") => {
    if (!filePath || chapterIndex < 0 || !hasRpc()) return;
    const mine = ++seq.current;
    try {
      const [a, s] = await Promise.all([
        what !== "status" ? chaptersRpc.artifacts(filePath, chapterIndex) : Promise.resolve(null),
        what !== "artifacts" ? chaptersRpc.ensure({ filePath, chapterIndex, priority: Priority.Visible, kinds: [] }) : Promise.resolve(null),
      ]);
      if (mine !== seq.current) return; // a newer load (or chapter change) won
      if (a) setArtifacts(a);
      if (s) setStatus(s);
      setError(null);
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err));
    } finally {
      if (mine === seq.current) setLoadedKey(`${filePath}\u0000${chapterIndex}`);
    }
  }, [filePath, chapterIndex, setArtifacts, setStatus]);

  // Initial load and chapter change (the keyed state already reads null for the new chapter).
  useEffect(() => {
    void load(ensure ? "artifacts" : "both");
  }, [load, ensure]);

  // Read through a ref: the book's chapter count resolving must not re-run the ensure (QA-P2-11).
  const totalRef = useRef(totalChapters);
  useEffect(() => {
    totalRef.current = totalChapters;
  }, [totalChapters]);

  // Navigation ensure (+ prefetch), re-run when prefs change. Deduped in main (one job per kind).
  const prefsKey = prefs ? JSON.stringify(prefs) : "";
  useEffect(() => {
    if (!ensure || !filePath || !prefs || !hasRpc()) return;
    let alive = true;
    chaptersRpc.ensure({ filePath, chapterIndex, priority: Priority.Visible }).then(
      (s) => alive && setStatus(s),
      () => {},
    );
    const next = chapterIndex + 1;
    const total = totalRef.current;
    if (prefs.prefetchNext && (total === undefined || next < total)) {
      chaptersRpc.ensure({ filePath, chapterIndex: next, priority: Priority.Prefetch, group: `prefetch:${filePath}` }).catch(() => {});
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensure, filePath, chapterIndex, prefsKey, setStatus]);

  // Prefs changed (e.g. formatting toggled): the set of served layers changed. Only a real change:
  // the first prefs load and chapter changes are covered by the load above.
  const prevPrefsKey = useRef(prefsKey);
  useEffect(() => {
    const prev = prevPrefsKey.current;
    prevPrefsKey.current = prefsKey;
    if (prev && prefsKey && prev !== prefsKey) void load(ensure ? "artifacts" : "both");
  }, [prefsKey, load, ensure]);

  const refreshBoth = useCoalesced(() => void load("both"));
  const refreshStatus = useCoalesced(() => void load("status"));

  useEffect(() => {
    if (!filePath) return;
    const offs = [
      onAIEvent("artifact", (e) => {
        if (e.filePath === filePath && e.chapterIndex === chapterIndex) refreshBoth();
      }),
      onAIEvent("job", (e) => {
        if (e.scope?.filePath === filePath && e.scope.chapterIndex === chapterIndex) refreshStatus();
      }),
      onAIEvent("knowledge", (e) => {
        if (e.filePath === filePath && e.chapters.includes(chapterIndex)) refreshStatus();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [filePath, chapterIndex, refreshBoth, refreshStatus]);

  const retry = useCallback(async (kind: ChapterKind) => {
    if (!filePath) return;
    try {
      setStatus(await chaptersRpc.ensure({ filePath, chapterIndex, priority: Priority.Visible, kinds: [kind], refresh: true }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [filePath, chapterIndex, setStatus]);

  const clear = useCallback(async (kind: ChapterKind) => {
    if (!filePath) return;
    try {
      if (kind === "knowledge") await rpc("knowledge:clear", filePath, chapterIndex);
      else await chaptersRpc.clear(filePath, kind, chapterIndex);
      await load("both");
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [filePath, chapterIndex, load]);

  return { artifacts, status, loading, error, refresh: refreshBoth, retry, clear };
}

// ── Book totals ─────────────────────────────────────────────────────────────

export interface BookAIStatusState {
  status: BookAIStatus | null;
  error: string | null;
  refresh: () => void;
}

export function useBookAIStatus(filePath: string | null | undefined): BookAIStatusState {
  const [status, setStatus] = useKeyedState<BookAIStatus>(filePath ?? null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!filePath || !hasRpc()) return;
    const mine = ++seq.current;
    try {
      const s = await chaptersRpc.status(filePath);
      if (mine === seq.current) {
        setStatus(s);
        setError(null);
      }
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err));
    }
  }, [filePath, setStatus]);

  const refresh = useCoalesced(() => void load(), 400);

  useEffect(() => {
    if (!filePath) return;
    if (hasRpc()) {
      const mine = ++seq.current;
      chaptersRpc.status(filePath).then(
        (st) => mine === seq.current && setStatus(st),
        (err) => mine === seq.current && setError(errorMessage(err)),
      );
    }
    const offs = [
      onAIEvent("artifact", (e) => e.filePath === filePath && refresh()),
      onAIEvent("job", (e) => e.scope?.filePath === filePath && (e.state === "running" || e.state === "done" || e.state === "error" || e.state === "cancelled") && refresh()),
      onAIEvent("knowledge", (e) => e.filePath === filePath && refresh()),
      onPrefs((fp) => fp === filePath && refresh()),
    ];
    return () => offs.forEach((off) => off());
  }, [filePath, setStatus, refresh]);

  return { status, error, refresh };
}

// ── Titles (TOC) ────────────────────────────────────────────────────────────

/** Ready AI chapter titles by 0-based index (empty while the book's `titles` pref is off). */
export function useChapterTitles(filePath: string | null | undefined): Record<number, string> {
  const [titles, setTitles] = useKeyedState<Record<number, string>>(filePath ?? null);
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!filePath || !hasRpc()) return;
    const mine = ++seq.current;
    rpc("chapters:titles", filePath).then((t) => mine === seq.current && setTitles(t), () => {});
  }, [filePath, setTitles]);
  const refresh = useCoalesced(load, 400);
  useEffect(() => {
    if (!filePath) return;
    load();
    const offs = [
      onAIEvent("artifact", (e) => e.filePath === filePath && e.kind === "title" && refresh()),
      onPrefs((fp) => fp === filePath && refresh()),
    ];
    return () => offs.forEach((off) => off());
  }, [filePath, load, refresh]);
  return titles ?? EMPTY_TITLES;
}

const EMPTY_TITLES: Record<number, string> = {};

// ── Bulk ────────────────────────────────────────────────────────────────────

export interface BulkRunState {
  /** The book's current or most recent run (null when none, or dismissed). */
  status: BulkStatus | null;
  running: boolean;
  error: string | null;
  start: (req: Omit<BulkRequest, "filePath">) => Promise<string | null>;
  /** Stop: cancels only this run's group in main. */
  cancel: () => Promise<void>;
  /** Hide a finished run (it stays available via `bulk:status`). */
  dismiss: () => void;
}

export function useBulkRun(filePath: string | null | undefined): BulkRunState {
  const [status, setStatus] = useKeyedState<BulkStatus>(filePath ?? null);
  const [dismissedRun, setDismissedRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath || !hasRpc()) return;
    let alive = true;
    bulkRpc.status(filePath).then((s) => alive && setStatus(s), () => {});
    const off = onAIEvent("bulk", (e) => {
      if (e.status.filePath === filePath) setStatus(e.status);
    });
    return () => {
      alive = false;
      off();
    };
  }, [filePath, setStatus]);

  const start = useCallback(async (req: Omit<BulkRequest, "filePath">) => {
    if (!filePath) return null;
    try {
      const { runId } = await bulkRpc.start({ ...req, filePath });
      setDismissedRun(null);
      setError(null);
      bulkRpc.status(filePath).then((s) => s && s.runId === runId && setStatus((cur) => (cur?.runId === runId ? cur : s)), () => {});
      return runId;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    }
  }, [filePath, setStatus]);

  const cancel = useCallback(async () => {
    if (!status || status.state !== "running") return;
    try {
      await bulkRpc.cancel(status.runId);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [status]);

  const dismiss = useCallback(() => {
    if (status && status.state !== "running") setDismissedRun(status.runId);
  }, [status]);

  const visible = status && status.runId !== dismissedRun ? status : null;
  return { status: visible, running: visible?.state === "running", error, start, cancel, dismiss };
}

// ── Derived helpers (shared by the AI Tools UI) ─────────────────────────────

/** Overall 0..1 progress of a bulk run across kinds (done + failed + skipped count as settled). */
export function bulkProgress(s: BulkStatus): number {
  let settled = 0;
  let total = 0;
  for (const k of Object.values(s.perKind)) {
    total += k.total;
    settled += Math.min(k.total, k.done + k.failed);
  }
  if (s.state !== "running") return 1;
  return total > 0 ? settled / total : 0;
}

/** Kinds that take part in a run (total > 0 or skipped > 0), in display order. */
export function bulkKinds(s: BulkStatus): ChapterKind[] {
  return (Object.keys(s.perKind) as ChapterKind[]).filter((k) => s.perKind[k].total > 0);
}
