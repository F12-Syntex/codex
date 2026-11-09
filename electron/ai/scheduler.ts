/**
 * The AI job scheduler (owner: WS-A). One per app, in main. AI_AUDIT §4.4.3.
 *
 * - Priorities: Interactive < Visible < Prefetch < Background (lower runs first), FIFO within one.
 * - Concurrency: at most `concurrency` jobs run; `reservedInteractive` of those slots are only
 *   ever used by Interactive jobs, so a bulk run can never starve the user.
 * - Per-task caps (`TaskDefinition.maxConcurrency`) and lanes (`TaskDefinition.lane`: one running
 *   job per lane, e.g. `knowledge:<filePath>`).
 * - Dedupe-join: a submit whose cache key matches a queued/running job joins it (ticket.joined)
 *   and raises its priority if the newcomer is more urgent.
 * - Cache: `spec.cache` "use" (default) answers from cache immediately; "refresh" skips the read;
 *   "bypass" neither reads nor writes. `ctx.memo` caches sub-calls so cancelled jobs resume.
 * - Cancellation by job, group, file (+priorityAtLeast) or owner window. A job joined by several
 *   callers is only aborted when the LAST interested caller cancels.
 * - Retry policy (only here; tasks never retry transport errors):
 *     rate_limited → pause the limiter globally until Retry-After (default 15 s), requeue the call,
 *                    not counted as an attempt;
 *     server/network/timeout → jittered exponential backoff (base → max), 3 attempts Interactive,
 *                    5 otherwise;
 *     auth/no_api_key → circuit breaker: fail queued jobs, emit `health`, refuse new jobs until
 *                    `resetBreaker()` (called when the key changes);
 *     truncated / parse / validation / cancelled → not retried here (completeJson re-asks once).
 * - No listener leaks: every abort listener added to a long-lived signal is removed on settle.
 */

import type {
  AIErrorInfo, AIEvent, AIHealthState, AISettings, CancelSelector, JobResult, JobScope, JobSpec, JobState,
  JobTicket, JobView, ModelRole, TaskId, Usage,
} from "../shared/ai/types";
import { Priority } from "../shared/ai/types";
import { fnv1a64 } from "../shared/ai/hash";
import type { AICache } from "./cache";
import { cacheKey } from "./cache";
import type { Completion, LLMClient, ModelCapabilities } from "./client";
import { AIError, BACKOFF_CODES, BREAKER_CODES, cancelledError, toAIError } from "./errors";
import { createJsonCompleter } from "./json-completion";
import { realSleep, type RateLimiter, type Sleep } from "./rate-limit";
import { missingServices, type TaskContext, type TaskDefinition, type TaskRegistry, type TaskServices, type TaskCompletionRequest } from "./registry";

// ── Public types ────────────────────────────────────────────────────────────

export interface RetryPolicy {
  /** Max attempts for server/network/timeout errors. */
  interactive: number;
  background: number;
  baseMs: number;
  maxMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { interactive: 3, background: 5, baseMs: 1_000, maxMs: 30_000 };

export interface UsageRecord {
  ts: number;
  jobId: string;
  task: TaskId;
  filePath?: string;
  usage: Usage;
  outcome: "ok" | "error" | "cache" | "cancelled";
}

export interface SchedulerOptions {
  concurrency: number;
  /** Slots only Interactive jobs may use. Default 1 (clamped to concurrency − 1). */
  reservedInteractive?: number;
  limiter: RateLimiter;
  client: LLMClient;
  cache: AICache;
  registry: TaskRegistry;
  getSettings(): AISettings;
  /** Known model capabilities (models.ts); undefined = unknown. */
  capabilities?(model: string): ModelCapabilities | undefined;
  /** Lazily resolved so other areas can provide services after the scheduler exists. */
  services?(): TaskServices;
  now?(): number;
  sleep?: Sleep;
  /** [0, 1) jitter source. */
  random?(): number;
  retry?: Partial<RetryPolicy>;
  /** Used when a 429 carries no Retry-After. Default 15 s. */
  defaultRetryAfterMs?: number;
  /** Max 429 waits per call before giving up. Default 20. */
  maxRateLimitWaits?: number;
  /** Per model call (and per cache hit). */
  onUsage?(rec: UsageRecord): void;
  /** Checked before every model call, e.g. the daily budget → AIError("budget_exceeded"). */
  guard?(job: { task: TaskId; scope?: JobScope }): AIError | null;
  /** Shutdown signal: aborting it cancels everything. */
  signal?: AbortSignal;
  log?(level: "debug" | "info" | "warn" | "error", msg: string, data?: unknown): void;
  /** How many finished results `result()` can still return. Default 1000. */
  keepResults?: number;
}

export type OwnerSelector = {
  owner: number;
  /** Keep the owner's interest in jobs for which this returns true (e.g. Background bulk jobs
   *  while another window of the same book is open). */
  keep?: (job: JobView) => boolean;
};

export interface SchedulerSnapshot {
  queued: JobView[];
  running: JobView[];
  pausedUntil: number;
  health: AIHealthState;
  breaker: AIErrorInfo | null;
}

export interface Scheduler {
  submit<I>(spec: JobSpec<I>, owner?: number): JobTicket;
  /** Resolves when the job finishes; never rejects. Unknown ids resolve to an `unknown` error. */
  result<O>(jobId: string): Promise<JobResult<O>>;
  /** Returns the number of jobs actually cancelled (interest removal alone doesn't count). */
  cancel(sel: CancelSelector | OwnerSelector): number;
  bump(jobId: string, priority: Priority): void;
  /** True if `owner` is one of the callers interested in an active job. */
  ownsInterest?(jobId: string, owner: number): boolean;
  /**
   * Withdraw ONE of `owner`'s interests in a job (each submit/join adds one), so two callers in
   * one window that share a deduplicated job don't cancel each other (QA-P2-14). The job is
   * cancelled when no interest is left. Returns 1 if that cancelled the job, else 0.
   */
  withdraw?(jobId: string, owner: number): number;
  snapshot(): SchedulerSnapshot;
  onEvent(cb: (e: AIEvent) => void): () => void;
  setConcurrency(n: number): void;
  /** Close the circuit breaker (after the API key changed). */
  resetBreaker(): void;
  readonly health: AIHealthState;
  dispose(): void;
}

// ── Internals ───────────────────────────────────────────────────────────────

interface Interest {
  owner?: number;
  group?: string;
  priority: Priority;
}

interface Job {
  id: string;
  task: TaskId;
  def: TaskDefinition | null;
  spec: JobSpec<unknown>;
  key: string;
  model: string;
  settings: AISettings;
  priority: Priority;
  seq: number;
  state: JobState;
  lane?: string;
  interests: Interest[];
  stream: boolean;
  controller: AbortController;
  detachRoot: (() => void) | null;
  attempts: number;
  queuedAt: number;
  startedAt?: number;
  progress?: { done: number; total: number };
  usage: Usage[];
  cached: boolean;
  waiters: ((r: JobResult<unknown>) => void)[];
  result?: JobResult<unknown>;
  /** The slot is held until `run` settles, even if the job was already cancelled. */
  holdsSlot: boolean;
}

let jobCounter = 0;
function newJobId(): string {
  jobCounter = (jobCounter + 1) % 0x7fffffff;
  return `j${Date.now().toString(36)}${jobCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function createScheduler(opts: SchedulerOptions): Scheduler {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const random = opts.random ?? Math.random;
  const retry: RetryPolicy = { ...DEFAULT_RETRY, ...opts.retry };
  const defaultRetryAfterMs = opts.defaultRetryAfterMs ?? 15_000;
  const maxRateLimitWaits = opts.maxRateLimitWaits ?? 20;
  const keepResults = opts.keepResults ?? 1000;
  const log = opts.log ?? (() => {});
  const getServices = opts.services ?? missingServices;

  let concurrency = Math.max(1, Math.floor(opts.concurrency));
  const reservedWanted = opts.reservedInteractive ?? 1;

  const queued: Job[] = []; // sorted by (priority, seq)
  const running = new Set<Job>();
  const active = new Map<string, Job>(); // jobId → queued/running job
  const inflight = new Map<string, Job>(); // cache key → queued/running job (dedupe)
  const results = new Map<string, JobResult<unknown>>(); // finished, insertion-ordered (LRU-ish)
  const laneBusy = new Set<string>();
  const taskRunning = new Map<TaskId, number>();
  const listeners = new Set<(e: AIEvent) => void>();

  let seq = 0;
  let breaker: AIErrorInfo | null = null;
  let health: AIHealthState = "ok";
  let disposed = false;
  let wake: AbortController | null = null;

  const rootSignal = opts.signal;
  const onRootAbort = () => dispose();
  rootSignal?.addEventListener("abort", onRootAbort, { once: true });

  // ── events ──

  function emit(e: AIEvent) {
    for (const l of Array.from(listeners)) {
      try {
        l(e);
      } catch (err) {
        log("error", "scheduler listener failed", err);
      }
    }
  }

  function jobEvent(job: Job, error?: AIErrorInfo) {
    const e: AIEvent = { type: "job", jobId: job.id, task: job.task, state: job.state };
    if (job.spec.scope) e.scope = job.spec.scope;
    const group = job.interests.find((i) => i.group)?.group ?? job.spec.group;
    if (group) e.group = group;
    if (job.progress) e.progress = job.progress;
    if (error) e.error = error;
    emit(e);
  }

  function setHealth(state: AIHealthState, retryAt?: number) {
    if (state === health && state !== "rate_limited") return;
    health = state;
    emit(retryAt ? { type: "health", state, retryAt } : { type: "health", state });
  }

  // ── views ──

  function view(job: Job): JobView {
    const v: JobView = {
      jobId: job.id, task: job.task, priority: job.priority, state: job.state, attempts: job.attempts, queuedAt: job.queuedAt,
    };
    if (job.spec.scope) v.scope = job.spec.scope;
    const group = job.interests.find((i) => i.group)?.group ?? job.spec.group;
    if (group) v.group = group;
    const owner = job.interests.find((i) => i.owner !== undefined)?.owner;
    if (owner !== undefined) v.owner = owner;
    if (job.lane) v.lane = job.lane;
    if (job.startedAt !== undefined) v.startedAt = job.startedAt;
    if (job.progress) v.progress = job.progress;
    return v;
  }

  // ── queue helpers ──

  function insertQueued(job: Job) {
    let lo = 0;
    let hi = queued.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const q = queued[mid];
      if (q.priority < job.priority || (q.priority === job.priority && q.seq < job.seq)) lo = mid + 1;
      else hi = mid;
    }
    queued.splice(lo, 0, job);
  }

  function removeQueued(job: Job) {
    const i = queued.indexOf(job);
    if (i >= 0) queued.splice(i, 1);
  }

  function rememberResult(r: JobResult<unknown>) {
    results.set(r.jobId, r);
    while (results.size > keepResults) results.delete(results.keys().next().value as string);
  }

  // ── job lifecycle ──

  function makeJob(spec: JobSpec<unknown>, def: TaskDefinition | null, key: string, model: string, settings: AISettings, owner?: number): Job {
    const interest: Interest = { priority: spec.priority };
    if (owner !== undefined) interest.owner = owner;
    if (spec.group) interest.group = spec.group;
    return {
      id: newJobId(), task: spec.task, def, spec, key, model, settings, priority: spec.priority, seq: ++seq, state: "queued",
      lane: undefined, interests: [interest], stream: !!spec.stream, controller: new AbortController(), detachRoot: null,
      attempts: 0, queuedAt: now(), usage: [], cached: false, waiters: [], holdsSlot: false,
    };
  }

  function finish(job: Job, state: "done" | "error" | "cancelled", output?: unknown, error?: AIErrorInfo) {
    if (job.result) return; // already final (e.g. cancelled while running)
    job.state = state;
    const r: JobResult<unknown> = {
      jobId: job.id, state, usage: job.usage, cached: job.cached, durationMs: Math.max(0, now() - (job.startedAt ?? job.queuedAt)),
    };
    if (state === "done") r.output = output;
    if (error) r.error = error;
    job.result = r;
    active.delete(job.id);
    if (inflight.get(job.key) === job) inflight.delete(job.key);
    removeQueued(job);
    job.detachRoot?.();
    job.detachRoot = null;
    rememberResult(r);
    const waiters = job.waiters.splice(0);
    for (const w of waiters) w(r);
    jobEvent(job, error);
  }

  /** A job that failed before it could be queued (unknown task, bad key, breaker open…). */
  function failedTicket(spec: JobSpec<unknown>, err: AIError, owner?: number): JobTicket {
    const job = makeJob(spec, null, `failed:${seq + 1}:${now()}`, "", opts.getSettings(), owner);
    finish(job, "error", undefined, err.toInfo());
    return { jobId: job.id, joined: false, cached: false };
  }

  function submit<I>(spec: JobSpec<I>, owner?: number): JobTicket {
    const s = spec as JobSpec<unknown>;
    if (disposed) return failedTicket(s, cancelledError("Scheduler disposed"), owner);
    if (breaker) return failedTicket(s, new AIError(breaker.code, breaker.message, { retryable: false, status: breaker.status }), owner);

    let def: TaskDefinition;
    try {
      def = opts.registry.get(s.task);
    } catch (err) {
      return failedTicket(s, new AIError("bad_request", (err as Error).message, { retryable: false }), owner);
    }
    const settings = opts.getSettings();
    const model = settings.models[def.role];
    let key: string;
    try {
      key = cacheKey(def.id, def.version, model, def.key(s.input as never, { model, settings, scope: s.scope }));
    } catch (err) {
      return failedTicket(s, new AIError("bad_request", `Task key failed: ${(err as Error).message}`, { retryable: false }), owner);
    }

    // Dedupe-join onto an in-flight job.
    const existing = inflight.get(key);
    if (existing && !existing.result) {
      const interest: Interest = { priority: s.priority };
      if (owner !== undefined) interest.owner = owner;
      if (s.group) interest.group = s.group;
      existing.interests.push(interest);
      if (s.stream) existing.stream = true;
      if (s.priority < existing.priority) bump(existing.id, s.priority);
      return { jobId: existing.id, joined: true, cached: false };
    }

    // Cache hit.
    if ((s.cache ?? "use") === "use" && def.cacheable) {
      let hit: { v: unknown } | undefined;
      try {
        const v = opts.cache.get<{ v: unknown }>(key);
        if (v && typeof v === "object" && "v" in v) hit = v;
      } catch (err) {
        log("warn", "cache read failed", err);
      }
      if (hit) {
        const job = makeJob(s, def, key, model, settings, owner);
        job.cached = true;
        job.startedAt = job.queuedAt;
        const usage: Usage = { model, promptTokens: 0, completionTokens: 0, cached: true };
        job.usage.push(usage);
        opts.onUsage?.({ ts: now(), jobId: job.id, task: job.task, filePath: s.scope?.filePath, usage, outcome: "cache" });
        finish(job, "done", hit.v);
        return { jobId: job.id, joined: false, cached: true };
      }
    }

    const job = makeJob(s, def, key, model, settings, owner);
    try {
      job.lane = def.lane?.(s);
    } catch (err) {
      log("warn", `lane() failed for ${def.id}`, err);
    }
    active.set(job.id, job);
    inflight.set(key, job);
    insertQueued(job);
    jobEvent(job);
    pump();
    return { jobId: job.id, joined: false, cached: false };
  }

  function result<O>(jobId: string): Promise<JobResult<O>> {
    const done = results.get(jobId);
    if (done) return Promise.resolve(done as JobResult<O>);
    const job = active.get(jobId);
    if (!job) {
      return Promise.resolve({
        jobId, state: "error", usage: [], cached: false, durationMs: 0,
        error: { code: "unknown", message: `Unknown job ${jobId}`, retryable: false },
      } as JobResult<O>);
    }
    return new Promise((resolve) => job.waiters.push(resolve as (r: JobResult<unknown>) => void));
  }

  function cancelJob(job: Job, reason = "Cancelled"): boolean {
    if (job.result) return false;
    const err = cancelledError(reason);
    if (job.state === "queued") {
      removeQueued(job);
      finish(job, "cancelled", undefined, err.toInfo());
      return true;
    }
    // running: abort, report cancelled now; the slot frees when `run` settles.
    job.controller.abort(err);
    finish(job, "cancelled", undefined, err.toInfo());
    return true;
  }

  function dropInterests(job: Job, pred: (i: Interest) => boolean): boolean {
    const before = job.interests.length;
    job.interests = job.interests.filter((i) => !pred(i));
    if (job.interests.length === before) return false;
    if (job.interests.length === 0) return cancelJob(job);
    const p = Math.min(...job.interests.map((i) => i.priority)) as Priority;
    if (p !== job.priority) {
      if (job.state === "queued") {
        removeQueued(job);
        job.priority = p;
        insertQueued(job);
      } else job.priority = p;
    }
    return false;
  }

  function cancel(sel: CancelSelector | OwnerSelector): number {
    let n = 0;
    const jobs = [...active.values()];
    if ("jobId" in sel) {
      const job = active.get(sel.jobId);
      return job && cancelJob(job) ? 1 : 0;
    }
    if ("group" in sel) {
      for (const job of jobs) if (dropInterests(job, (i) => i.group === sel.group)) n++;
    } else if ("owner" in sel) {
      for (const job of jobs) {
        if (sel.keep && sel.keep(view(job))) continue;
        if (dropInterests(job, (i) => i.owner === sel.owner)) n++;
      }
    } else if ("filePath" in sel) {
      const min = sel.priorityAtLeast ?? Priority.Interactive;
      for (const job of jobs) {
        if (job.spec.scope?.filePath !== sel.filePath) continue;
        if (dropInterests(job, (i) => i.priority >= min)) n++;
      }
    }
    if (n) pump();
    return n;
  }

  function bump(jobId: string, priority: Priority) {
    const job = active.get(jobId);
    if (!job || priority >= job.priority) return;
    if (job.state === "queued") {
      removeQueued(job);
      job.priority = priority;
      insertQueued(job);
      pump();
    } else {
      job.priority = priority;
    }
  }

  // ── pumping ──

  function reserved(): number {
    return Math.max(0, Math.min(reservedWanted, concurrency - 1));
  }

  function runningNonInteractive(): number {
    let n = 0;
    for (const j of running) if (j.priority !== Priority.Interactive) n++;
    return n;
  }

  function scheduleWake(at: number) {
    if (wake) return;
    wake = new AbortController();
    const signal = wake.signal;
    sleep(Math.max(0, at - now()), signal).then(
      () => {
        if (wake?.signal === signal) wake = null;
        pump();
      },
      () => {
        if (wake?.signal === signal) wake = null;
      },
    );
  }

  function pump() {
    if (disposed) return;
    const pausedUntil = opts.limiter.pausedUntil;
    if (pausedUntil > now()) {
      scheduleWake(pausedUntil);
      return;
    }
    while (running.size < concurrency && queued.length) {
      const nonInteractiveCap = concurrency - reserved();
      let nonInteractive = runningNonInteractive();
      let picked: Job | null = null;
      for (const job of queued) {
        if (job.priority !== Priority.Interactive && nonInteractive >= nonInteractiveCap) continue;
        if (job.lane && laneBusy.has(job.lane)) continue;
        const cap = job.def?.maxConcurrency;
        if (cap !== undefined && (taskRunning.get(job.task) ?? 0) >= cap) continue;
        picked = job;
        break;
      }
      if (!picked) break;
      if (picked.priority !== Priority.Interactive) nonInteractive++;
      start(picked);
    }
  }

  function start(job: Job) {
    removeQueued(job);
    job.state = "running";
    job.startedAt = now();
    job.holdsSlot = true;
    running.add(job);
    if (job.lane) laneBusy.add(job.lane);
    taskRunning.set(job.task, (taskRunning.get(job.task) ?? 0) + 1);

    if (rootSignal) {
      const onAbort = () => cancelJob(job, "Shutting down");
      rootSignal.addEventListener("abort", onAbort, { once: true });
      job.detachRoot = () => rootSignal.removeEventListener("abort", onAbort);
    }
    jobEvent(job);

    const def = job.def!;
    const ctx = buildContext(job, def);
    let settled = false;
    const release = () => {
      if (settled) return;
      settled = true;
      job.holdsSlot = false;
      running.delete(job);
      if (job.lane) laneBusy.delete(job.lane);
      const n = (taskRunning.get(job.task) ?? 1) - 1;
      if (n > 0) taskRunning.set(job.task, n);
      else taskRunning.delete(job.task);
      job.detachRoot?.();
      job.detachRoot = null;
      pump();
    };

    Promise.resolve()
      .then(() => def.run(job.spec.input, ctx))
      .then(
        (output) => {
          if (job.result) return; // cancelled meanwhile
          if (job.controller.signal.aborted) return finish(job, "cancelled", undefined, cancelledError().toInfo());
          if (def.validate && !def.validate(output)) {
            return finish(job, "error", undefined, new AIError("validation", `Output of ${def.id} failed validation`, { retryable: false }).toInfo());
          }
          if (def.cacheable && (job.spec.cache ?? "use") !== "bypass") {
            try {
              opts.cache.set(job.key, { v: output }, { task: def.id, taskVersion: def.version, model: job.model, filePath: job.spec.scope?.filePath });
            } catch (err) {
              log("warn", "cache write failed", err);
            }
          }
          finish(job, "done", output);
        },
        (err) => {
          const e = toAIError(err, job.controller.signal);
          if (job.controller.signal.aborted || e.code === "cancelled") finish(job, "cancelled", undefined, cancelledError().toInfo());
          else {
            if (e.code === "unknown") log("warn", `task ${def.id} threw`, err);
            finish(job, "error", undefined, e.toInfo());
          }
        },
      )
      .finally(release);
  }

  // ── breaker ──

  function tripBreaker(err: AIError) {
    if (breaker) return;
    breaker = err.toInfo();
    setHealth(err.code === "no_api_key" ? "no_key" : "auth_failed");
    for (const job of [...queued]) finish(job, "error", undefined, { ...breaker, retryable: false });
  }

  function resetBreaker() {
    breaker = null;
    setHealth("ok");
    pump();
  }

  // ── task context ──

  function buildContext(job: Job, def: TaskDefinition): TaskContext {
    const signal = job.controller.signal;
    const modelFor = (role: ModelRole) => job.settings.models[role] ?? job.model;
    const capabilities = (role?: ModelRole) => opts.capabilities?.(role ? modelFor(role) : job.model);

    const complete = async (req: TaskCompletionRequest): Promise<Completion> => {
      const { role, ...rest } = req;
      const model = role ? modelFor(role) : job.model;
      const maxAttempts = Math.max(1, job.priority === Priority.Interactive ? retry.interactive : retry.background);
      let attempt = 0;
      let rateWaits = 0;
      for (;;) {
        if (signal.aborted) throw cancelledError();
        if (breaker) throw new AIError(breaker.code, breaker.message, { retryable: false });
        const blocked = opts.guard?.({ task: job.task, scope: job.spec.scope });
        if (blocked) throw blocked;
        await opts.limiter.acquire(signal);
        job.attempts++;
        try {
          const c = await opts.client.complete({
            temperature: def.temperature,
            maxTokens: def.maxTokens,
            ...rest,
            model,
            signal,
            meta: { task: job.task, jobId: job.id },
          });
          job.usage.push(c.usage);
          opts.onUsage?.({ ts: now(), jobId: job.id, task: job.task, filePath: job.spec.scope?.filePath, usage: c.usage, outcome: "ok" });
          if (health !== "ok" && !breaker) setHealth("ok");
          return c;
        } catch (raw) {
          const err = toAIError(raw, signal);
          if (err.code === "cancelled" || signal.aborted) throw cancelledError();
          const spent = err.partial?.usage ?? { model, promptTokens: 0, completionTokens: 0 };
          if (err.partial) job.usage.push(spent);
          opts.onUsage?.({ ts: now(), jobId: job.id, task: job.task, filePath: job.spec.scope?.filePath, usage: spent, outcome: "error" });

          if (err.code === "rate_limited") {
            const retryAt = err.retryAt ?? now() + defaultRetryAfterMs;
            opts.limiter.pauseUntil(retryAt);
            setHealth("rate_limited", opts.limiter.pausedUntil);
            if (++rateWaits > maxRateLimitWaits) throw err;
            log("info", `429 on ${job.task}; pausing until ${new Date(opts.limiter.pausedUntil).toISOString()}`);
            continue; // limiter.acquire waits out the pause
          }
          if (BREAKER_CODES.has(err.code)) {
            tripBreaker(err);
            throw err;
          }
          if (BACKOFF_CODES.has(err.code)) {
            attempt++;
            if (attempt >= maxAttempts) {
              if (err.code === "network") setHealth("offline");
              throw err;
            }
            const base = Math.min(retry.maxMs, retry.baseMs * 2 ** (attempt - 1));
            const delay = Math.round(base * (0.5 + random() * 0.5));
            log("debug", `retrying ${job.task} after ${err.code} in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
            await sleep(delay, signal);
            continue;
          }
          throw err;
        }
      }
    };

    const memo = async <T>(subKey: string, fn: () => Promise<T>): Promise<T> => {
      const mode = job.spec.cache ?? "use";
      const k = fnv1a64(`${job.key}|memo|${subKey}`);
      if (mode === "use") {
        try {
          const hit = opts.cache.get<{ v: T }>(k);
          if (hit && typeof hit === "object" && "v" in hit) return hit.v;
        } catch (err) {
          log("warn", "memo read failed", err);
        }
      }
      const v = await fn();
      if (mode !== "bypass" && !signal.aborted) {
        try {
          opts.cache.set(k, { v }, { task: def.id, taskVersion: def.version, model: job.model, filePath: job.spec.scope?.filePath });
        } catch (err) {
          log("warn", "memo write failed", err);
        }
      }
      return v;
    };

    return {
      jobId: job.id,
      task: job.task,
      signal,
      settings: job.settings,
      model: job.model,
      scope: job.spec.scope,
      priority: job.priority,
      group: job.spec.group,
      complete,
      completeJson: createJsonCompleter(complete, capabilities),
      capabilities,
      modelFor,
      memo,
      progress(done, total) {
        if (job.result) return;
        job.progress = { done, total };
        jobEvent(job);
      },
      delta(text) {
        if (job.stream && !job.result && text) emit({ type: "delta", jobId: job.id, text });
      },
      get books() {
        return getServices().books;
      },
      get knowledge() {
        return getServices().knowledge;
      },
      get artifacts() {
        return getServices().artifacts;
      },
      log(level, msg, data) {
        log(level, `[${job.task} ${job.id}] ${msg}`, data);
      },
    };
  }

  // ── lifecycle ──

  function dispose() {
    if (disposed) return;
    disposed = true;
    wake?.abort();
    wake = null;
    for (const job of [...active.values()]) cancelJob(job, "Shutting down");
    rootSignal?.removeEventListener("abort", onRootAbort);
  }

  return {
    submit,
    result,
    cancel,
    bump,
    ownsInterest(jobId, owner) {
      return !!active.get(jobId)?.interests.some((i) => i.owner === owner);
    },
    withdraw(jobId, owner) {
      const job = active.get(jobId);
      if (!job || job.result) return 0;
      const at = job.interests.map((i) => i.owner).lastIndexOf(owner);
      if (at < 0) return 0;
      const target = job.interests[at];
      const cancelled = dropInterests(job, (i) => i === target);
      pump();
      return cancelled ? 1 : 0;
    },
    snapshot() {
      return {
        queued: queued.map(view),
        running: [...running].filter((j) => !j.result).map(view),
        pausedUntil: opts.limiter.pausedUntil,
        health,
        breaker,
      };
    },
    onEvent(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    setConcurrency(n) {
      concurrency = Math.max(1, Math.floor(n));
      pump();
    },
    resetBreaker,
    get health() {
      return health;
    },
    dispose,
  };
}
