/**
 * Test kit for every stream (owner: WS-A). Import from `electron/*.test.ts` only, never from
 * production code. No `electron` import; everything is in-memory and deterministic.
 *
 *   // 1. Unit-test a task's run() directly:
 *   const { ctx, provider, progress } = createTaskContext({ task: "chapter.title" });
 *   provider.enqueue('{"titles":{"c1":"The Gate"}}');
 *   const out = await titleTask.run(input, ctx);
 *
 *   // 2. Drive the REAL scheduler with the fake provider (dedupe, cache, retries, lanes…):
 *   const rt = createTestRuntime({ tasks: [titleTask], services: { books: fakeBooks([...]) } });
 *   const t = rt.scheduler.submit({ task: "chapter.title", input, priority: Priority.Visible });
 *   const r = await rt.scheduler.result(t.jobId);
 *
 *   // 3. Test code that SUBMITS jobs (orchestrator, assistant…) with a manual fake scheduler:
 *   const fs = createFakeScheduler();
 *   orchestrator = createOrchestrator({ scheduler: fs, ... });
 *   fs.jobs({ task: "chapter.condense" });         // what was submitted
 *   fs.complete(jobId, output) / fs.fail(jobId, "server") / fs.completeAll("chapter.title", fn)
 */

import type {
  AIErrorCode, AIErrorInfo, AIEvent, AISettings, ArtifactKind, ArtifactStore, CancelSelector, ChapterArtifact,
  JobResult, JobSpec, JobState, JobTicket, JobView, TaskId,
} from "../shared/ai/types";
import { Priority } from "../shared/ai/types";
import type { EntityIndexItem, Frontier, KnowledgeContext, KnowledgeReader } from "../shared/knowledge/types";
import type { BookContentV2, ChapterId, SourceChapter, SourcePara } from "../shared/pipeline/types";
import { fnv1a64, stableStringify } from "../shared/ai/hash";
import { createMemoryAICache, type AICache } from "./cache";
import type { Completion, ModelCapabilities } from "./client";
import { AIError, cancelledError, toAIError } from "./errors";
import { createEventBus } from "./events";
import { FakeProvider, type FakeProviderOptions } from "./fake-provider";
import { createJsonCompleter } from "./json-completion";
import { createUnlimitedLimiter, type Sleep } from "./rate-limit";
import {
  createTaskRegistry, missingServices, type BookContentReader, type TaskCompletionRequest, type TaskContext, type TaskDefinition,
  type TaskRegistry, type TaskServices,
} from "./registry";
import { createScheduler, type OwnerSelector, type Scheduler, type SchedulerOptions, type SchedulerSnapshot, type UsageRecord } from "./scheduler";
import { defaultAISettings, mergeSettings } from "./settings";

export { FakeProvider, type FakeFailure, type FakeReply, type FakeProviderOptions } from "./fake-provider";
export { createMemoryAICache } from "./cache";
export { createTaskRegistry } from "./registry";
export { AIError } from "./errors";
export { Priority };

/** Default settings for tests (English, default models, concurrency 4). */
export function testSettings(patch: Partial<AISettings> = {}): AISettings {
  return mergeSettings(defaultAISettings("en-US"), patch);
}

/** Let pending promise callbacks run (several macrotask turns). */
export async function flush(turns = 5): Promise<void> {
  for (let i = 0; i < turns; i++) await new Promise<void>((r) => setImmediate(r));
}

// ── Fake clock ──────────────────────────────────────────────────────────────

export interface FakeClock {
  now(): number;
  sleep: Sleep;
  /** Advance time, firing due sleepers in order (with promise turns in between). */
  advance(ms: number): Promise<void>;
  /** Number of pending sleepers. */
  pending(): number;
  /** Advance to the next pending sleeper (if any). */
  next(): Promise<boolean>;
}

export function createFakeClock(start = 1_700_000_000_000): FakeClock {
  let t = start;
  let seq = 0;
  const timers: { at: number; seq: number; resolve: () => void }[] = [];
  const clock: FakeClock = {
    now: () => t,
    sleep(ms, signal) {
      return new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(new AIError("cancelled", "Cancelled"));
        const entry = {
          at: t + Math.max(0, ms),
          seq: ++seq,
          resolve: () => {
            signal.removeEventListener("abort", onAbort);
            resolve();
          },
        };
        const onAbort = () => {
          const i = timers.indexOf(entry);
          if (i >= 0) timers.splice(i, 1);
          reject(new AIError("cancelled", "Cancelled"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        timers.push(entry);
      });
    },
    async advance(ms) {
      const target = t + ms;
      await flush(2);
      for (;;) {
        timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const due = timers[0];
        if (!due || due.at > target) break;
        timers.shift();
        t = Math.max(t, due.at);
        due.resolve();
        await flush(3);
      }
      t = target;
      await flush(2);
    },
    pending: () => timers.length,
    async next() {
      timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const due = timers[0];
      if (!due) return false;
      await clock.advance(due.at - t);
      return true;
    },
  };
  return clock;
}

// ── Fixtures and fake services ──────────────────────────────────────────────

/** Build a `SourceChapter` from plain paragraphs (ids `p<index>.0`, chapter id `c<index>`). */
export function makeSourceChapter(index: number, paragraphs: string[], title = `Chapter ${index + 1}`): SourceChapter {
  const paras: SourcePara[] = paragraphs.map((text, i) => ({
    id: `p${fnv1a64(`${text}|text`).slice(0, 8)}.${paragraphs.slice(0, i).filter((x) => x === text).length}`,
    index: i,
    kind: "text",
    html: `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
    text,
  }));
  return { id: `c${index}`, index, title, sourceHash: fnv1a64(paras.map((p) => p.id + p.html).join("|")), paras };
}

export function fakeBooks(books: Record<string, SourceChapter[]>): BookContentReader {
  const get = (filePath: string) => {
    const chapters = books[filePath];
    if (!chapters) throw new Error(`fakeBooks: unknown book ${filePath}`);
    return chapters;
  };
  return {
    async getChapter(filePath, idx) {
      const ch = get(filePath)[idx];
      if (!ch) throw new Error(`fakeBooks: ${filePath} has no chapter ${idx}`);
      return ch;
    },
    async getBook(filePath): Promise<BookContentV2> {
      const chapters = get(filePath);
      return {
        bookId: fnv1a64(filePath),
        parserVersion: 1,
        isImageBook: false,
        toc: chapters.map((c) => ({ label: c.title, chapterIndex: c.index, chapterId: c.id })),
        chapters: chapters.map((c) => ({ ...c, paragraphs: c.paras.map((p) => p.text), htmlParagraphs: c.paras.map((p) => p.html) })),
      };
    },
  };
}

/** Knowledge reader with empty answers; override any method. */
export function fakeKnowledge(over: Partial<KnowledgeReader> = {}): KnowledgeReader {
  const frontier: Frontier = { chapterIndex: Number.MAX_SAFE_INTEGER, mode: "off" };
  return {
    getFrontier: () => frontier,
    getContext: (req): KnowledgeContext => ({ frontier: req.frontier ?? frontier, entities: [], summaries: [], arcs: [], text: "" }),
    getEntityIndex: (): EntityIndexItem[] => [],
    getEntity: () => null,
    search: () => [],
    ...over,
  };
}

/** In-memory `ArtifactStore` (emits nothing). */
export function createMemoryArtifactStore(): ArtifactStore & { rows: Map<string, ChapterArtifact<unknown>> } {
  const rows = new Map<string, ChapterArtifact<unknown>>();
  const k = (f: string, c: ChapterId, kind: ArtifactKind, v: string) => `${f}\u0000${c}\u0000${kind}\u0000${v}`;
  return {
    rows,
    get<T>(filePath: string, chapterId: ChapterId, kind: ArtifactKind, variant = "") {
      return (rows.get(k(filePath, chapterId, kind, variant)) as ChapterArtifact<T> | undefined) ?? null;
    },
    put<T>(a: ChapterArtifact<T>) {
      rows.set(k(a.filePath, a.chapterId, a.kind, a.variant), a as ChapterArtifact<unknown>);
    },
    clear(filePath, kind, chapterId) {
      let n = 0;
      for (const [key, a] of rows) {
        if (a.filePath === filePath && (kind === "all" || a.kind === kind) && (chapterId === undefined || a.chapterId === chapterId)) {
          rows.delete(key);
          n++;
        }
      }
      return n;
    },
  };
}

function withServices(partial: Partial<TaskServices> = {}): TaskServices {
  const missing = missingServices();
  return {
    books: partial.books ?? missing.books,
    knowledge: partial.knowledge ?? fakeKnowledge(),
    artifacts: partial.artifacts ?? createMemoryArtifactStore(),
  };
}

// ── 1. Direct TaskContext ───────────────────────────────────────────────────

export interface TestTaskContextOptions {
  task?: TaskId;
  jobId?: string;
  settings?: Partial<AISettings>;
  provider?: FakeProvider;
  providerOptions?: FakeProviderOptions;
  services?: Partial<TaskServices>;
  signal?: AbortSignal;
  priority?: Priority;
  scope?: TaskContext["scope"];
  /** Capabilities reported for every model (default: json yes, schema no, tools yes). */
  capabilities?: ModelCapabilities;
  /** The role whose model `ctx.model` is (default "fast"). */
  role?: keyof AISettings["models"];
  /** Shared memo store (to test resume-after-cancel). */
  memo?: Map<string, unknown>;
  stream?: boolean;
}

export interface TestTaskContext {
  ctx: TaskContext;
  provider: FakeProvider;
  progress: { done: number; total: number }[];
  deltas: string[];
  logs: { level: string; msg: string; data?: unknown }[];
  memo: Map<string, unknown>;
  /** Every completion returned to the task. */
  completions: Completion[];
}

/**
 * A `TaskContext` wired straight to a `FakeProvider` (no scheduler, no retries, no limiter).
 * `completeJson` is the production implementation (one re-ask on parse/validation failure).
 */
export function createTaskContext(opts: TestTaskContextOptions = {}): TestTaskContext {
  const settings = testSettings(opts.settings);
  const provider = opts.provider ?? new FakeProvider(opts.providerOptions);
  const role = opts.role ?? "fast";
  const model = settings.models[role];
  const caps: ModelCapabilities = opts.capabilities ?? { json: true, jsonSchema: false, tools: true, reasoning: false };
  const signal = opts.signal ?? new AbortController().signal;
  const progress: TestTaskContext["progress"] = [];
  const deltas: string[] = [];
  const logs: TestTaskContext["logs"] = [];
  const memoStore = opts.memo ?? new Map<string, unknown>();
  const completions: Completion[] = [];
  const services = withServices(opts.services);
  const jobId = opts.jobId ?? "test-job";
  const task = opts.task ?? "chapter.title";

  const complete = async (req: TaskCompletionRequest): Promise<Completion> => {
    if (signal.aborted) throw cancelledError();
    const { role: r, ...rest } = req;
    try {
      const c = await provider.complete({ ...rest, model: r ? settings.models[r] : model, signal, meta: { task, jobId } });
      completions.push(c);
      return c;
    } catch (err) {
      throw toAIError(err, signal);
    }
  };

  const ctx: TaskContext = {
    jobId,
    task,
    signal,
    settings,
    model,
    scope: opts.scope,
    priority: opts.priority ?? Priority.Visible,
    complete,
    completeJson: createJsonCompleter(complete, () => caps),
    capabilities: () => caps,
    modelFor: (r) => settings.models[r],
    async memo<T>(subKey: string, fn: () => Promise<T>) {
      if (memoStore.has(subKey)) return memoStore.get(subKey) as T;
      const v = await fn();
      if (!signal.aborted) memoStore.set(subKey, v);
      return v;
    },
    progress: (done, total) => void progress.push({ done, total }),
    delta: (text) => {
      if (opts.stream !== false) deltas.push(text);
    },
    books: services.books,
    knowledge: services.knowledge,
    artifacts: services.artifacts,
    log: (level, msg, data) => void logs.push({ level, msg, data }),
  };
  return { ctx, provider, progress, deltas, logs, memo: memoStore, completions };
}

// ── 2. Real scheduler + fake provider ───────────────────────────────────────

export interface TestRuntimeOptions {
  tasks?: TaskDefinition[];
  registry?: TaskRegistry;
  provider?: FakeProvider;
  cache?: AICache;
  services?: Partial<TaskServices>;
  settings?: Partial<AISettings>;
  /** Fake clock for sleeps/backoff/429 pauses. Default: real time with tiny backoff. */
  clock?: FakeClock;
  scheduler?: Partial<Omit<SchedulerOptions, "client" | "cache" | "registry" | "getSettings">>;
}

export interface TestRuntime {
  scheduler: Scheduler;
  provider: FakeProvider;
  cache: AICache;
  registry: TaskRegistry;
  services: TaskServices;
  settings: AISettings;
  /** Every scheduler event, in order. */
  events: AIEvent[];
  usage: UsageRecord[];
  /** Submit + await result. */
  run<O = unknown>(spec: JobSpec, owner?: number): Promise<JobResult<O>>;
}

export function createTestRuntime(opts: TestRuntimeOptions = {}): TestRuntime {
  const registry = opts.registry ?? createTaskRegistry();
  for (const t of opts.tasks ?? []) registry.replace(t);
  const provider = opts.provider ?? new FakeProvider();
  for (const t of registry.list()) if (t.fakeResponse) provider.respondTo(t.id, (req) => t.fakeResponse!(req));
  const clock = opts.clock;
  const cache = opts.cache ?? createMemoryAICache(clock?.now);
  const settings = testSettings(opts.settings);
  const services = withServices(opts.services);
  const events: AIEvent[] = [];
  const usage: UsageRecord[] = [];
  const scheduler = createScheduler({
    concurrency: settings.concurrency,
    limiter: createUnlimitedLimiter(clock?.now, clock?.sleep),
    client: provider,
    cache,
    registry,
    getSettings: () => settings,
    capabilities: () => ({ json: true, jsonSchema: false, tools: true, reasoning: false }),
    services: () => services,
    now: clock?.now,
    sleep: clock?.sleep,
    random: () => 0.5,
    retry: clock ? undefined : { baseMs: 1, maxMs: 5 },
    onUsage: (r) => void usage.push(r),
    ...opts.scheduler,
  });
  scheduler.onEvent((e) => void events.push(e));
  return {
    scheduler, provider, cache, registry, services, settings, events, usage,
    async run<O>(spec: JobSpec, owner?: number) {
      const t = scheduler.submit(spec, owner);
      return scheduler.result<O>(t.jobId);
    },
  };
}

// ── 3. Manual fake scheduler ────────────────────────────────────────────────

export interface FakeJob extends JobView {
  spec: JobSpec;
  owners: number[];
  groups: string[];
  output?: unknown;
  error?: AIErrorInfo;
}

export interface FakeSchedulerOptions {
  /** Used for dedupe keys when the task is registered; otherwise `stableStringify(task, input)`. */
  registry?: TaskRegistry;
  settings?: Partial<AISettings>;
  /** Auto-complete jobs of these tasks (async, after submit returns). Throw an AIError to fail. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lets tests type the input param freely
  handlers?: Partial<Record<TaskId, (input: any, spec: JobSpec) => unknown | Promise<unknown>>>;
  /** Jobs start "running" right away (default true); false keeps them "queued" until `start()`. */
  autoStart?: boolean;
}

export interface FakeScheduler extends Scheduler {
  readonly submissions: { spec: JobSpec; owner?: number; ticket: JobTicket }[];
  readonly events: AIEvent[];
  jobs(filter?: { task?: TaskId; state?: JobState; group?: string; filePath?: string }): FakeJob[];
  job(jobId: string): FakeJob | undefined;
  start(jobId: string): void;
  complete(jobId: string, output?: unknown): void;
  fail(jobId: string, error: AIErrorCode | AIErrorInfo): void;
  /** Complete every unfinished job (optionally of one task); `fn` maps the spec to an output. */
  completeAll(task?: TaskId, fn?: (spec: JobSpec) => unknown): number;
  progress(jobId: string, done: number, total: number): void;
  delta(jobId: string, text: string): void;
  /** Pre-seed the "cache": submits matching this key answer `cached: true` immediately. */
  seedCache(spec: Pick<JobSpec, "task" | "input">, output: unknown): void;
}

interface FakeJobInternal {
  view: FakeJob;
  key: string;
  interests: { owner?: number; group?: string; priority: Priority }[];
  waiters: ((r: JobResult<unknown>) => void)[];
  result?: JobResult<unknown>;
  startedAt: number;
}

export function createFakeScheduler(opts: FakeSchedulerOptions = {}): FakeScheduler {
  const settings = testSettings(opts.settings);
  const autoStart = opts.autoStart ?? true;
  const bus = createEventBus();
  const all = new Map<string, FakeJobInternal>();
  const inflight = new Map<string, FakeJobInternal>();
  const cache = new Map<string, unknown>();
  const submissions: FakeScheduler["submissions"] = [];
  const events: AIEvent[] = [];
  bus.on((e) => void events.push(e));
  let n = 0;

  const keyOf = (spec: Pick<JobSpec, "task" | "input" | "scope">) => {
    if (opts.registry?.has(spec.task)) {
      const def = opts.registry.get(spec.task);
      const model = settings.models[def.role];
      return `${spec.task}|${def.key(spec.input, { model, settings, scope: spec.scope })}`;
    }
    return `${spec.task}|${stableStringify(spec.input ?? null)}`;
  };

  const emitJob = (j: FakeJobInternal) => {
    const e: AIEvent = { type: "job", jobId: j.view.jobId, task: j.view.task, state: j.view.state };
    if (j.view.scope) e.scope = j.view.scope;
    if (j.view.group) e.group = j.view.group;
    if (j.view.progress) e.progress = j.view.progress;
    if (j.view.error) e.error = j.view.error;
    bus.emit(e);
  };

  const finish = (j: FakeJobInternal, state: "done" | "error" | "cancelled", output?: unknown, error?: AIErrorInfo) => {
    if (j.result) return;
    j.view.state = state;
    if (state === "done") j.view.output = output;
    if (error) j.view.error = error;
    j.result = { jobId: j.view.jobId, state, usage: [], cached: false, durationMs: 0, ...(state === "done" ? { output } : {}), ...(error ? { error } : {}) };
    if (inflight.get(j.key) === j) inflight.delete(j.key);
    if (state === "done") cache.set(j.key, output);
    for (const w of j.waiters.splice(0)) w(j.result);
    emitJob(j);
  };

  const refresh = (j: FakeJobInternal) => {
    j.view.owners = [...new Set(j.interests.filter((i) => i.owner !== undefined).map((i) => i.owner!))];
    j.view.groups = [...new Set(j.interests.filter((i) => i.group).map((i) => i.group!))];
    j.view.group = j.view.groups[0];
    j.view.owner = j.view.owners[0];
    if (j.interests.length) j.view.priority = Math.min(...j.interests.map((i) => i.priority)) as Priority;
  };

  const runHandler = (j: FakeJobInternal) => {
    const h = opts.handlers?.[j.view.task];
    if (!h) return;
    Promise.resolve()
      .then(() => h(j.view.spec.input, j.view.spec))
      .then(
        (out) => finish(j, "done", out),
        (err) => {
          const e = toAIError(err);
          finish(j, e.code === "cancelled" ? "cancelled" : "error", undefined, e.toInfo());
        },
      );
  };

  const drop = (j: FakeJobInternal, pred: (i: FakeJobInternal["interests"][number]) => boolean): boolean => {
    if (j.result) return false;
    const before = j.interests.length;
    j.interests = j.interests.filter((i) => !pred(i));
    if (j.interests.length === before) return false;
    if (j.interests.length === 0) {
      finish(j, "cancelled", undefined, cancelledError().toInfo());
      return true;
    }
    refresh(j);
    return false;
  };

  const fs: FakeScheduler = {
    submissions,
    events,
    submit(spec, owner) {
      const s = spec as JobSpec;
      const key = keyOf(s);
      const interest = { priority: s.priority, ...(owner !== undefined && { owner }), ...(s.group && { group: s.group }) };
      const existing = inflight.get(key);
      if (existing && !existing.result) {
        existing.interests.push(interest);
        refresh(existing);
        const ticket = { jobId: existing.view.jobId, joined: true, cached: false };
        submissions.push({ spec: s, owner, ticket });
        return ticket;
      }
      const jobId = `fake-${++n}`;
      const j: FakeJobInternal = {
        key,
        interests: [interest],
        waiters: [],
        startedAt: Date.now(),
        view: {
          jobId, task: s.task, priority: s.priority, state: "queued", attempts: 0, queuedAt: Date.now(),
          spec: s, owners: [], groups: [], ...(s.scope && { scope: s.scope }),
        },
      };
      refresh(j);
      all.set(jobId, j);
      if ((s.cache ?? "use") === "use" && cache.has(key)) {
        finish(j, "done", cache.get(key));
        j.result!.cached = true;
        const ticket = { jobId, joined: false, cached: true };
        submissions.push({ spec: s, owner, ticket });
        return ticket;
      }
      inflight.set(key, j);
      emitJob(j);
      if (autoStart) {
        j.view.state = "running";
        emitJob(j);
      }
      runHandler(j);
      const ticket = { jobId, joined: false, cached: false };
      submissions.push({ spec: s, owner, ticket });
      return ticket;
    },
    result<O>(jobId: string) {
      const j = all.get(jobId);
      if (!j) {
        return Promise.resolve({ jobId, state: "error", usage: [], cached: false, durationMs: 0, error: { code: "unknown", message: `Unknown job ${jobId}`, retryable: false } } as JobResult<O>);
      }
      if (j.result) return Promise.resolve(j.result as JobResult<O>);
      return new Promise<JobResult<O>>((resolve) => j.waiters.push(resolve as (r: JobResult<unknown>) => void));
    },
    cancel(sel: CancelSelector | OwnerSelector) {
      let count = 0;
      for (const j of all.values()) {
        if (j.result) continue;
        if ("jobId" in sel) {
          if (j.view.jobId === sel.jobId && drop(j, () => true)) count++;
        } else if ("group" in sel) {
          if (drop(j, (i) => i.group === sel.group)) count++;
        } else if ("owner" in sel) {
          if (sel.keep?.(j.view)) continue;
          if (drop(j, (i) => i.owner === sel.owner)) count++;
        } else if ("filePath" in sel) {
          if (j.view.scope?.filePath !== sel.filePath) continue;
          const min = sel.priorityAtLeast ?? Priority.Interactive;
          if (drop(j, (i) => i.priority >= min)) count++;
        }
      }
      return count;
    },
    ownsInterest(jobId, owner) {
      const j = all.get(jobId);
      return !!j && !j.result && j.interests.some((i) => i.owner === owner);
    },
    bump(jobId, priority) {
      const j = all.get(jobId);
      if (j && !j.result && priority < j.view.priority) j.view.priority = priority;
    },
    snapshot(): SchedulerSnapshot {
      const live = [...all.values()].filter((j) => !j.result).map((j) => j.view);
      return { queued: live.filter((v) => v.state === "queued"), running: live.filter((v) => v.state === "running"), pausedUntil: 0, health: "ok", breaker: null };
    },
    onEvent: (cb) => bus.on(cb),
    setConcurrency() {},
    resetBreaker() {},
    health: "ok",
    dispose() {
      for (const j of all.values()) finish(j, "cancelled", undefined, cancelledError().toInfo());
    },
    jobs(filter = {}) {
      return [...all.values()]
        .map((j) => j.view)
        .filter((v) =>
          (!filter.task || v.task === filter.task) &&
          (!filter.state || v.state === filter.state) &&
          (!filter.group || v.groups.includes(filter.group)) &&
          (!filter.filePath || v.scope?.filePath === filter.filePath));
    },
    job: (jobId) => all.get(jobId)?.view,
    start(jobId) {
      const j = all.get(jobId);
      if (j && !j.result && j.view.state === "queued") {
        j.view.state = "running";
        emitJob(j);
      }
    },
    complete(jobId, output) {
      const j = all.get(jobId);
      if (!j) throw new Error(`fake scheduler: unknown job ${jobId}`);
      finish(j, "done", output);
    },
    fail(jobId, error) {
      const j = all.get(jobId);
      if (!j) throw new Error(`fake scheduler: unknown job ${jobId}`);
      const info = typeof error === "string" ? new AIError(error, `fake ${error}`).toInfo() : error;
      finish(j, info.code === "cancelled" ? "cancelled" : "error", undefined, info);
    },
    completeAll(task, fn) {
      let c = 0;
      for (const j of all.values()) {
        if (j.result || (task && j.view.task !== task)) continue;
        finish(j, "done", fn ? fn(j.view.spec) : undefined);
        c++;
      }
      return c;
    },
    progress(jobId, done, total) {
      const j = all.get(jobId);
      if (!j || j.result) return;
      j.view.progress = { done, total };
      emitJob(j);
    },
    delta(jobId, text) {
      bus.emit({ type: "delta", jobId, text });
    },
    seedCache(spec, output) {
      cache.set(keyOf(spec as JobSpec), output);
    },
  };
  return fs;
}
