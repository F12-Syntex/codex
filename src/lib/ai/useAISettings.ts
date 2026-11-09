"use client";

/**
 * `useAISettings` — the renderer's view of the AI settings (owner: WS-A).
 *
 *   const { settings, health, update, setKey, testKey } = useAISettings();
 *
 * - One shared store per window (`useSyncExternalStore`): every component sees the same
 *   `PublicAISettings`, refreshed by `settings` events from main (any window's change lands here).
 * - `update(patch)` is optimistic; main validates/clamps and the returned settings win.
 * - The API key is write-only: `setKey(key)`; the renderer only sees `hasKey` / `keyHealth`.
 * - `health` is loaded with `ai:health` and then follows `health` events (no_key / auth_failed /
 *   rate_limited / offline / ok). `useAIHealth()` is the same state for a single app-wide banner;
 *   a rate-limit pause clears itself when its `retryAt` passes.
 *
 * Companion hooks for the Settings pane: `useAIModels()`, `useAIUsage(sel)`, `useAICacheStats()`.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type {
  AIHealthState, AIHealthStatus, AISettings, CacheSelector, CacheStats, ModelInfo, PublicAISettings, UsageSummary,
} from "@shared/ai/types";
import { ai, hasRpc } from "./bridge";
import { onAIEvent } from "./events";

interface SettingsSnapshot {
  settings: PublicAISettings | null;
  loading: boolean;
  error: string | null;
  health: AIHealthState;
  retryAt?: number;
  /** Why the breaker tripped (auth_failed / no_key), when known. */
  healthMessage?: string;
}

let snap: SettingsSnapshot = { settings: null, loading: true, error: null, health: "ok" };
const subscribers = new Set<() => void>();
let detach: (() => void) | null = null;
let loadPromise: Promise<void> | null = null;

let healthTimer: ReturnType<typeof setTimeout> | null = null;

function set(patch: Partial<SettingsSnapshot>) {
  snap = { ...snap, ...patch };
  for (const s of Array.from(subscribers)) s();
}

/** Apply a health state; a rate-limit pause re-checks with main once `retryAt` has passed. */
function setHealth(h: AIHealthStatus) {
  if (healthTimer) {
    clearTimeout(healthTimer);
    healthTimer = null;
  }
  set({ health: h.state, retryAt: h.retryAt, healthMessage: h.message });
  if (h.state === "rate_limited" && h.retryAt) {
    healthTimer = setTimeout(() => {
      healthTimer = null;
      void loadHealth();
    }, Math.max(1000, h.retryAt - Date.now() + 250));
  }
}

function loadHealth(): Promise<void> {
  if (!hasRpc()) return Promise.resolve();
  return ai
    .health()
    .then(setHealth)
    .catch(() => {});
}

function load(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (!hasRpc()) {
    set({ loading: false, error: "AI settings are only available in the desktop app" });
    return Promise.resolve();
  }
  loadPromise = ai
    .getSettings()
    .then((settings) => set({ settings, loading: false, error: null }))
    .catch((err) => set({ loading: false, error: err instanceof Error ? err.message : String(err) }))
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  if (!detach) {
    const offSettings = onAIEvent("settings", (e) => set({ settings: e.settings, error: null }));
    const offHealth = onAIEvent("health", (e) => setHealth({ state: e.state, retryAt: e.retryAt }));
    detach = () => {
      offSettings();
      offHealth();
      if (healthTimer) {
        clearTimeout(healthTimer);
        healthTimer = null;
      }
    };
    if (!snap.settings) void load();
    void loadHealth();
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && detach) {
      detach();
      detach = null;
    }
  };
}

const getSnapshot = () => snap;
const SERVER_SNAPSHOT: SettingsSnapshot = { settings: null, loading: true, error: null, health: "ok" };
const getServerSnapshot = () => SERVER_SNAPSHOT;

export interface UseAISettings extends SettingsSnapshot {
  /** Optimistic; resolves to the validated settings from main. */
  update(patch: Partial<AISettings>): Promise<PublicAISettings | null>;
  /** Write-only. "" removes the stored key. */
  setKey(key: string): Promise<boolean>;
  testKey(): Promise<{ ok: boolean; error?: string }>;
  refresh(): Promise<void>;
}

export function useAISettings(): UseAISettings {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback(async (patch: Partial<AISettings>) => {
    const prev = snap.settings;
    if (prev) set({ settings: mergeOptimistic(prev, patch) });
    try {
      const next = await ai.updateSettings(patch);
      set({ settings: next, error: null });
      return next;
    } catch (err) {
      set({ settings: prev, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }, []);

  const setKey = useCallback(async (key: string) => {
    try {
      const r = await ai.setKey(key);
      await Promise.all([load(), loadHealth()]); // hasKey / keyHealth / health changed
      return r.ok;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }, []);

  const testKey = useCallback(async () => {
    try {
      const r = await ai.testKey();
      await Promise.all([load(), loadHealth()]);
      return r;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  return { ...state, update, setKey, testKey, refresh: load };
}

/**
 * The app-wide AI health for one banner (matrix scenario 9): `ok`, `no_key`, `auth_failed`,
 * `rate_limited` (with `retryAt`) or `offline`. Shares the settings store, so it costs nothing extra.
 */
export function useAIHealth(): { state: AIHealthState; retryAt?: number; message?: string; hasKey: boolean | null } {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { state: state.health, retryAt: state.retryAt, message: state.healthMessage, hasKey: state.settings ? state.settings.hasKey : null };
}

function mergeOptimistic(prev: PublicAISettings, patch: Partial<AISettings>): PublicAISettings {
  const next: PublicAISettings = { ...prev, ...patch };
  if (patch.models) next.models = { ...prev.models, ...patch.models };
  if (patch.defaults) next.defaults = { ...prev.defaults, ...patch.defaults };
  return next;
}

// ── Companion hooks ─────────────────────────────────────────────────────────

let modelsCache: { at: number; models: ModelInfo[] } | null = null;

/** OpenRouter catalog via main (`ai:models`, cached 24 h there; 10 min here). */
export function useAIModels(enabled = true): { models: ModelInfo[]; loading: boolean; error: string | null; refresh(): void } {
  const [models, setModels] = useState<ModelInfo[]>(modelsCache?.models ?? []);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // Which request generation has settled; loading = the current one hasn't.
  const [settled, setSettled] = useState(() => (modelsCache && Date.now() - modelsCache.at < 10 * 60_000 ? 0 : -1));

  useEffect(() => {
    if (!enabled || !hasRpc() || settled === nonce) return;
    let live = true;
    ai.models()
      .then((list) => {
        modelsCache = { at: Date.now(), models: list };
        if (live) {
          setModels(list);
          setError(null);
        }
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => live && setSettled(nonce));
    return () => {
      live = false;
    };
  }, [enabled, nonce, settled]);

  const loading = enabled && typeof window !== "undefined" && hasRpc() && settled !== nonce;
  return { models, loading, error, refresh: () => setNonce((n) => n + 1) };
}

/** Usage summary; refreshes when jobs finish (debounced). */
export function useAIUsage(sel: { filePath?: string; sinceMs?: number } = {}): { usage: UsageSummary | null; refresh(): void } {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [nonce, setNonce] = useState(0);
  const { filePath, sinceMs } = sel;

  useEffect(() => {
    if (!hasRpc()) return;
    let live = true;
    ai.usage({ filePath, sinceMs })
      .then((u) => live && setUsage(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [filePath, sinceMs, nonce]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onAIEvent("job", (e) => {
      if (e.state !== "done" && e.state !== "error") return;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setNonce((n) => n + 1);
      }, 2000);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { usage, refresh: () => setNonce((n) => n + 1) };
}

/** Cache sizes per task/book, with a clear action. */
export function useAICacheStats(): { stats: CacheStats | null; clear(sel: CacheSelector): Promise<number>; refresh(): void } {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!hasRpc()) return;
    let live = true;
    ai.cacheStats()
      .then((s) => live && setStats(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [nonce]);

  const clear = useCallback(async (sel: CacheSelector) => {
    const n = await ai.clearCache(sel);
    setNonce((x) => x + 1);
    return n;
  }, []);

  return { stats, clear, refresh: () => setNonce((n) => n + 1) };
}
