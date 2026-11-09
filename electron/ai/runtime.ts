/**
 * The AI core singleton in main (owner: WS-A): settings, model catalog, client (OpenRouter or
 * fake), rate limiter, cache, usage, task registry, scheduler and event bus, wired together.
 *
 * Created by `registerAI(ctx)` (electron/ai/ipc.ts), which runs FIRST in `registerAll`, so other
 * areas can use it from their own `register*()`:
 *
 *   const ai = getAIRuntime();
 *   ai.registry.register(myTask);
 *   ai.provideServices({ knowledge: myKnowledgeReader });
 *   const ticket = ai.scheduler.submit(spec, meta.senderId);
 *   ai.events.emit({ type: "knowledge", ... });      // broadcast to every window
 *
 * No top-level `electron` import: the cipher (safeStorage) and locale are injected.
 */

import type { AIEvent, ModelRole } from "../shared/ai/types";
import type { SqlDb } from "../db/sql";
import { createSqlAICache, DEFAULT_CACHE_MAX_BYTES, type AICache } from "./cache";
import { createOpenRouterClient, type LLMClient } from "./client";
import { AIError } from "./errors";
import { createEventBus, type AIEventBus } from "./events";
import { fakeProviderFromEnv, type FakeProvider } from "./fake-provider";
import { createModelCatalog, type ModelCatalog } from "./models";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { createTaskRegistry, missingServices, type TaskRegistry, type TaskServices } from "./registry";
import { createScheduler, type Scheduler } from "./scheduler";
import { AISettingsStore, sqlKeyValueStore, type SecretCipher } from "./settings";
import { createUsageStore, startOfDay, type UsageStore } from "./usage";

export interface AIRuntimeDeps {
  db: SqlDb;
  /** Broadcast to every window (`ctx.broadcast("ai:event", e)`). */
  broadcast?: (e: AIEvent) => void;
  cipher?: SecretCipher;
  locale?: string;
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  now?: () => number;
  log?: (level: "debug" | "info" | "warn" | "error", msg: string, data?: unknown) => void;
  /** Prune the cache to this size on start and periodically. */
  cacheMaxBytes?: number;
}

export interface AIRuntime {
  readonly provider: "openrouter" | "fake";
  /** Set when `CODEX_AI_PROVIDER=fake`. */
  readonly fake: FakeProvider | null;
  readonly registry: TaskRegistry;
  readonly scheduler: Scheduler;
  readonly cache: AICache;
  readonly usage: UsageStore;
  readonly settings: AISettingsStore;
  readonly models: ModelCatalog;
  readonly events: AIEventBus;
  readonly client: LLMClient;
  readonly limiter: RateLimiter;
  /** Provide (or replace) TaskContext services; call from your area's register*(). */
  provideServices(services: Partial<TaskServices>): void;
  /** Write-only key update; resets the breaker and key health. */
  setApiKey(key: string): { ok: boolean };
  /** Minimal request with the `fast` model. Updates `keyHealth`. */
  testKey(): Promise<{ ok: boolean; error?: string }>;
  dispose(): void;
}

let current: AIRuntime | null = null;

/** The runtime created by `registerAI`. Throws before that (programming error). */
export function getAIRuntime(): AIRuntime {
  if (!current) throw new Error("getAIRuntime() called before registerAI()");
  return current;
}

/** Null-safe variant for optional integrations. */
export function peekAIRuntime(): AIRuntime | null {
  return current;
}

export function setAIRuntimeForTests(rt: AIRuntime | null): void {
  current = rt;
}

export function createAIRuntime(deps: AIRuntimeDeps): AIRuntime {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((level, msg, data) => (level === "error" || level === "warn" ? console.warn(`[ai] ${msg}`, data ?? "") : undefined));
  // Same DDL as the legacy table in database.ts (a no-op in production; lets bare test DBs work).
  deps.db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const kv = sqlKeyValueStore(deps.db);
  const events = createEventBus((m, e) => log("error", m, e));
  if (deps.broadcast) events.on(deps.broadcast);

  let scheduler: Scheduler | null = null;
  let limiter: RateLimiter | null = null;

  const settings = new AISettingsStore({
    kv,
    cipher: deps.cipher,
    locale: deps.locale,
    log: (m, e) => log("warn", m, e),
    onChange: (pub) => {
      limiter?.setRate(pub.requestsPerMinute);
      scheduler?.setConcurrency(pub.concurrency);
      events.emit({ type: "settings", settings: pub });
    },
  });

  const models = createModelCatalog({ fetch: deps.fetch, now, store: kv, log: (m, e) => log("warn", m, e) });
  const registry = createTaskRegistry();

  // Fake replies route through each task's `fakeResponse` hook (resolved at call time, so tasks
  // registered later by other areas are covered).
  const fake = fakeProviderFromEnv(deps.env ?? process.env, {
    respond: (req) => {
      const task = req.meta?.task;
      return task && registry.has(task) ? registry.get(task).fakeResponse?.(req) : undefined;
    },
  });
  const client: LLMClient =
    fake ??
    createOpenRouterClient({
      getApiKey: () => settings.getApiKey(),
      fetch: deps.fetch,
      capabilities: (m) => models.capabilities(m),
      pricing: (m) => models.pricing(m),
      now,
    });

  const s0 = settings.get();
  limiter = createRateLimiter({ requestsPerMinute: s0.requestsPerMinute, now });

  const sqlCache = createSqlAICache(deps.db, now);
  const maxBytes = deps.cacheMaxBytes ?? DEFAULT_CACHE_MAX_BYTES;
  let writes = 0;
  const cache: AICache = {
    ...sqlCache,
    set(key, value, meta) {
      sqlCache.set(key, value, meta);
      if (++writes % 500 === 0) {
        try {
          sqlCache.prune(maxBytes);
        } catch (err) {
          log("warn", "cache prune failed", err);
        }
      }
    },
  };
  try {
    cache.prune(maxBytes);
  } catch (err) {
    log("warn", "cache prune failed", err);
  }

  const usage = createUsageStore(deps.db);
  let services: TaskServices = missingServices();
  let catalogRequested = false;

  scheduler = createScheduler({
    concurrency: s0.concurrency,
    reservedInteractive: 1,
    limiter,
    client,
    cache,
    registry,
    getSettings: () => settings.get(),
    capabilities: (m) => (fake ? { json: true, jsonSchema: false, tools: true, reasoning: false } : models.capabilities(m)),
    services: () => services,
    now,
    onUsage: (rec) => {
      try {
        usage.record(rec);
      } catch (err) {
        log("warn", "usage record failed", err);
      }
    },
    guard: () => {
      if (!catalogRequested && !fake) {
        catalogRequested = true;
        void models.list(); // learn capabilities/pricing lazily, on the first real call
      }
      const budget = settings.get().dailyBudgetUsd;
      if (budget && usage.spentSince(startOfDay(now())) >= budget) {
        return new AIError("budget_exceeded", `Daily AI budget of $${budget.toFixed(2)} reached`, { retryable: false });
      }
      return null;
    },
    log,
  });
  scheduler.onEvent((e) => events.emit(e));

  const rt: AIRuntime = {
    provider: fake ? "fake" : "openrouter",
    fake,
    registry,
    scheduler,
    cache,
    usage,
    settings,
    models,
    events,
    client,
    limiter,
    provideServices(partial) {
      services = { ...services, ...partial } as TaskServices;
      // keep unprovided services as the throwing proxies
      for (const k of ["books", "knowledge", "artifacts"] as const) if (!services[k]) services[k] = missingServices()[k] as never;
    },
    setApiKey(key) {
      const r = settings.setApiKey(key);
      scheduler!.resetBreaker();
      return r;
    },
    async testKey() {
      if (fake) {
        settings.setKeyHealth("ok");
        return { ok: true };
      }
      if (!settings.getApiKey()) return { ok: false, error: "No API key set" };
      const ctrl = new AbortController();
      const role: ModelRole = "fast";
      try {
        await client.complete({
          model: settings.get().models[role],
          messages: [{ role: "user", content: "Reply with OK." }],
          maxTokens: 5,
          allowTruncated: true,
          signal: ctrl.signal,
          timeoutMs: 30_000,
        });
        settings.setKeyHealth("ok");
        scheduler!.resetBreaker();
        return { ok: true };
      } catch (err) {
        const e = err instanceof AIError ? err : new AIError("unknown", String(err));
        if (e.code === "auth" || e.code === "no_api_key") settings.setKeyHealth("invalid");
        // Truncated/filtered replies still prove the key works.
        if (e.code === "truncated" || e.code === "content_filtered") {
          settings.setKeyHealth("ok");
          return { ok: true };
        }
        return { ok: false, error: e.message };
      }
    },
    dispose() {
      scheduler!.dispose();
      if (current === rt) current = null;
    },
  };
  return rt;
}

/** Create the singleton (idempotent). Used by `registerAI`. */
export function initAIRuntime(deps: AIRuntimeDeps): AIRuntime {
  if (!current) current = createAIRuntime(deps);
  return current;
}
