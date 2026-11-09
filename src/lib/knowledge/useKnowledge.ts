"use client";

/**
 * React hooks over `knowledge:*` (owner WS-B). Every hook re-fetches when the book's knowledge
 * changes (`knowledge` event: ingest, edit, clear, merge) or its frontier moves (`frontier`
 * event), so all windows stay in sync. Stale responses are dropped.
 *
 *   const frontier = useFrontier(filePath);
 *   const { data: index } = useEntityIndex(filePath);
 *   const { data: entity, loading } = useEntity(filePath, entityId, frontier ?? undefined);
 *   const recap = useRecap(filePath);   // F1
 *   const lookup = useEntityLookup(filePath);  // F2, names not in the wiki
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AIErrorInfo } from "@shared/ai/types";
import type {
  EntityIndexItem, EntityLookupOutput, EntitySnapshot, Frontier, KnowledgeContext, KnowledgeContextRequest, RecapOutput,
  RecapStatus, SearchHit, WikiSnapshot,
} from "@shared/knowledge/types";
import { onAnyAIEvent } from "@/lib/ai/events";
import { hasRpc } from "@/lib/ai/rpc";
import { knowledge } from "./bridge";

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Stable key for an optional frontier (object identity changes every render). */
export function frontierKey(f?: Frontier | null): string {
  return f ? `${f.mode}:${f.chapterIndex}:${f.paraId ?? ""}` : "default";
}

/**
 * Fetch `fetcher()` for `filePath`, re-running when `deps` change or when a knowledge/frontier
 * event for the book arrives. `enabled: false` (or no filePath) leaves `data` null.
 */
function queryKey(filePath: string | null | undefined, deps: readonly unknown[]): string {
  try {
    return JSON.stringify([filePath ?? null, ...deps]);
  } catch {
    return `${filePath ?? ""}\u0000${deps.map(String).join("\u0000")}`;
  }
}

export function useKnowledgeQuery<T>(
  filePath: string | null | undefined,
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  opts: { enabled?: boolean; onFrontier?: boolean } = {},
): QueryState<T> {
  const enabled = opts.enabled !== false && !!filePath && hasRpc();
  // Data is keyed by (filePath, deps): a new key reads null at once instead of showing the previous
  // entity/book until the new fetch resolves (QA-P2-12). A refresh (events) keeps the data.
  const key = queryKey(filePath, deps);
  const [state, setState] = useState<{ key: string; value: T | null }>({ key, value: null });
  const data = state.key === key ? state.value : null;
  const setData = useCallback((v: T | null) => setState({ key, value: v }), [key]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    fetchRef.current()
      .then((v) => {
        if (!live) return;
        setData(v);
        setError(null);
      })
      .catch((e) => {
        if (live) setError(errMsg(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filePath, tick, setData, ...deps]);

  useEffect(() => {
    if (!enabled) return;
    const listenFrontier = opts.onFrontier !== false;
    return onAnyAIEvent((e) => {
      if (e.type === "knowledge" && e.filePath === filePath) refresh();
      else if (listenFrontier && e.type === "frontier" && e.filePath === filePath) refresh();
    });
  }, [enabled, filePath, opts.onFrontier, refresh]);

  return { data, loading, error, refresh };
}

/** The book's current frontier (global spoiler mode applied in main). */
export function useFrontier(filePath: string | null | undefined): Frontier | null {
  return useKnowledgeQuery(filePath, () => knowledge.frontier(filePath!), []).data;
}

/** Entities to highlight, as known at `frontier` (default: the book's). */
export function useEntityIndex(filePath: string | null | undefined, frontier?: Frontier | null): QueryState<EntityIndexItem[]> {
  return useKnowledgeQuery(filePath, () => knowledge.entityIndex(filePath!, frontier ?? undefined), [frontierKey(frontier)]);
}

/** One entity as known at `frontier`; null when not introduced yet. No AI call. */
export function useEntity(
  filePath: string | null | undefined,
  entityId: string | null | undefined,
  frontier?: Frontier | null,
): QueryState<EntitySnapshot | null> {
  return useKnowledgeQuery(filePath, () => knowledge.entity(filePath!, entityId!, frontier ?? undefined), [entityId, frontierKey(frontier)], {
    enabled: !!entityId,
  });
}

/** Wiki window bulk read. Pass `{chapterIndex: -1, mode: "off"}` for "Show everything". */
export function useWikiSnapshot(filePath: string | null | undefined, frontier?: Frontier | null): QueryState<WikiSnapshot> {
  return useKnowledgeQuery(filePath, () => knowledge.wiki(filePath!, frontier ?? undefined), [frontierKey(frontier)]);
}

export function useKnowledgeContext(req: KnowledgeContextRequest | null): QueryState<KnowledgeContext> {
  const key = req ? JSON.stringify(req) : "";
  return useKnowledgeQuery(req?.filePath, () => knowledge.context(req!), [key], { enabled: !!req });
}

/** Debounced full-text search clamped to the frontier. */
export function useKnowledgeSearch(
  filePath: string | null | undefined,
  query: string,
  opts: { frontier?: Frontier | null; limit?: number; debounceMs?: number } = {},
): QueryState<SearchHit[]> {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), opts.debounceMs ?? 200);
    return () => clearTimeout(t);
  }, [query, opts.debounceMs]);
  return useKnowledgeQuery(
    filePath,
    () => knowledge.search(filePath!, debounced, { frontier: opts.frontier ?? undefined, limit: opts.limit }),
    [debounced, frontierKey(opts.frontier), opts.limit],
    { enabled: debounced.trim().length > 0 },
  );
}

// ── F1: "Previously on…" ────────────────────────────────────────────────────

export interface RecapState {
  /** Whether a recap is due now (null until checked). */
  status: RecapStatus | null;
  recap: RecapOutput | null;
  loading: boolean;
  error: AIErrorInfo | null;
  /** Generate (or fetch the cached) recap for the current frontier. */
  generate: () => Promise<void>;
  /** Record that the recap was seen/dismissed for this frontier. */
  markSeen: () => void;
}

/**
 * Checks `knowledge:recapStatus` once per book open and generates the recap on demand.
 * `autoGenerate`: start generating as soon as the status says it is due.
 */
export function useRecap(
  filePath: string | null | undefined,
  opts: { enabled?: boolean; autoGenerate?: boolean; bookTitle?: string } = {},
): RecapState {
  const enabled = opts.enabled !== false && !!filePath && hasRpc();
  const [status, setStatus] = useState<RecapStatus | null>(null);
  const [recap, setRecap] = useState<RecapOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AIErrorInfo | null>(null);
  const run = useRef(0);

  useEffect(() => {
    setStatus(null);
    setRecap(null);
    setError(null);
    if (!enabled) return;
    let live = true;
    knowledge
      .recapStatus(filePath!)
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus(null));
    return () => {
      live = false;
    };
  }, [enabled, filePath]);

  const generate = useCallback(async () => {
    if (!filePath || !hasRpc()) return;
    const id = ++run.current;
    setLoading(true);
    setError(null);
    try {
      const res = await knowledge.recap({ filePath, bookTitle: opts.bookTitle, awayMs: status?.awayMs ?? undefined }, `recap:${filePath}`);
      if (id !== run.current) return;
      if (res.state === "done" && res.output) setRecap(res.output);
      else setError(res.error ?? { code: "unknown", message: "The recap could not be generated.", retryable: true });
    } catch (e) {
      if (id === run.current) setError({ code: "unknown", message: errMsg(e), retryable: true });
    } finally {
      if (id === run.current) setLoading(false);
    }
  }, [filePath, opts.bookTitle, status?.awayMs]);

  useEffect(() => {
    if (opts.autoGenerate && status?.due && !recap && !loading && !error) void generate();
  }, [opts.autoGenerate, status?.due, recap, loading, error, generate]);

  // Cancel an in-flight recap when the book/component goes away.
  useEffect(() => {
    if (!filePath) return;
    return () => {
      run.current++;
      if (hasRpc()) void knowledge.cancelGroup(`recap:${filePath}`).catch(() => {});
    };
  }, [filePath]);

  const markSeen = useCallback(() => {
    if (!filePath || !hasRpc()) return;
    const ch = recap?.toChapter ?? status?.toChapter;
    if (ch == null || ch < 0) return;
    void knowledge.recapSeen(filePath, ch).catch(() => {});
  }, [filePath, recap?.toChapter, status?.toChapter]);

  return { status, recap, loading, error, generate, markSeen };
}

// ── F2: "Who's this?" for names not in the wiki ─────────────────────────────

export interface EntityLookupState {
  result: EntityLookupOutput | null;
  loading: boolean;
  error: AIErrorInfo | null;
  lookup: (name: string, frontier?: Frontier) => Promise<EntityLookupOutput | null>;
  reset: () => void;
}

export function useEntityLookup(filePath: string | null | undefined): EntityLookupState {
  const [result, setResult] = useState<EntityLookupOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AIErrorInfo | null>(null);
  const run = useRef(0);

  const lookup = useCallback(
    async (name: string, frontier?: Frontier) => {
      if (!filePath || !hasRpc() || !name.trim()) return null;
      const id = ++run.current;
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await knowledge.lookup({ filePath, name: name.trim(), frontier }, `lookup:${filePath}`);
        if (id !== run.current) return null;
        if (res.state === "done" && res.output) {
          setResult(res.output);
          return res.output;
        }
        setError(res.error ?? { code: "unknown", message: "Lookup failed.", retryable: true });
        return null;
      } catch (e) {
        if (id === run.current) setError({ code: "unknown", message: errMsg(e), retryable: true });
        return null;
      } finally {
        if (id === run.current) setLoading(false);
      }
    },
    [filePath],
  );

  const reset = useCallback(() => {
    run.current++;
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { result, loading, error, lookup, reset };
}
