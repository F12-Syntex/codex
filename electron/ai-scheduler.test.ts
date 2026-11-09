/**
 * WS-A: scheduler — priority order, caps, reserved Interactive slot, lanes, dedupe-join + bump,
 * cancellation by job/group/file/owner, 429 global pause with Retry-After (fake clock), backoff,
 * the auth circuit breaker, no listener leaks, and `ai:*` IPC with owner-window cancellation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { AIError, createFakeClock, createFakeScheduler, createTestRuntime, flush, FakeProvider, Priority, type FakeClock } from "./ai/testing";
import type { TaskDefinition } from "./ai/registry";
import type { AIEvent, JobResult, TaskId } from "./shared/ai/types";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations } from "./db/migrate";
import { aiMigrations } from "./ai/schema";
import { createAreaContext } from "./ipc/registry";
import type { IpcMainLike } from "./ipc/context";
import { cancelForOwner, registerAI, type WebContentsLike } from "./ai/ipc";
import { getAIRuntime, setAIRuntimeForTests } from "./ai/runtime";

interface In { name: string; file?: string }

/** A task that records its start order and makes one model call. */
function recTask(id: TaskId, order: string[], extra: Partial<TaskDefinition<In, string>> = {}): TaskDefinition<In, string> {
  return {
    id, version: 1, role: "fast", cacheable: false,
    key: (i) => i.name,
    async run(i, ctx) {
      order.push(i.name);
      const c = await ctx.complete({ messages: [{ role: "user", content: i.name }] });
      return c.text;
    },
    ...extra,
  };
}

const spec = (task: TaskId, name: string, priority: Priority, more: object = {}) => ({ task, input: { name }, priority, ...more });

async function settle<T>(p: Promise<T>, clock?: FakeClock, maxSteps = 200): Promise<T> {
  let done = false;
  let value!: T;
  void p.then((v) => { done = true; value = v; });
  for (let i = 0; i < maxSteps && !done; i++) {
    await flush(3);
    if (!done && clock) await clock.next();
  }
  assert.ok(done, "promise did not settle");
  return value;
}

test("priority order: Interactive < Visible < Prefetch < Background, FIFO within a priority", async () => {
  const order: string[] = [];
  const provider = new FakeProvider().hold();
  const rt = createTestRuntime({ provider, tasks: [recTask("chapter.title", order)], settings: { concurrency: 1 } });
  const first = rt.scheduler.submit(spec("chapter.title", "first", Priority.Background));
  await flush();
  const ids = [
    rt.scheduler.submit(spec("chapter.title", "bg", Priority.Background)),
    rt.scheduler.submit(spec("chapter.title", "pre", Priority.Prefetch)),
    rt.scheduler.submit(spec("chapter.title", "vis1", Priority.Visible)),
    rt.scheduler.submit(spec("chapter.title", "inter", Priority.Interactive)),
    rt.scheduler.submit(spec("chapter.title", "vis2", Priority.Visible)),
  ];
  assert.deepEqual(rt.scheduler.snapshot().queued.map((q) => q.task && (q.priority)), [0, 1, 1, 2, 3]);
  provider.release();
  await Promise.all([first, ...ids].map((t) => rt.scheduler.result(t.jobId)));
  assert.deepEqual(order, ["first", "inter", "vis1", "vis2", "pre", "bg"]);
});

test("per-task cap and global concurrency are respected", async () => {
  const order: string[] = [];
  const provider = new FakeProvider().hold();
  const rt = createTestRuntime({
    provider,
    tasks: [recTask("chapter.format", order, { maxConcurrency: 2 }), recTask("chapter.title", order)],
    settings: { concurrency: 4 },
  });
  const tickets = [1, 2, 3, 4, 5].map((n) => rt.scheduler.submit(spec("chapter.format", `f${n}`, Priority.Visible)));
  tickets.push(...[1, 2, 3].map((n) => rt.scheduler.submit(spec("chapter.title", `t${n}`, Priority.Visible))));
  await flush();
  const running = rt.scheduler.snapshot().running;
  assert.equal(running.filter((j) => j.task === "chapter.format").length, 2);
  assert.equal(running.length, 3); // 4 slots, 1 reserved for Interactive → 3 non-interactive
  assert.equal(provider.inFlight, 3);
  provider.release();
  const results = await Promise.all(tickets.map((t) => rt.scheduler.result(t.jobId)));
  assert.ok(results.every((r) => r.state === "done"));
  assert.ok(provider.maxInFlight <= 3);
});

test("reserved slot: background work can never take the last slot", async () => {
  const order: string[] = [];
  const provider = new FakeProvider().hold();
  const rt = createTestRuntime({ provider, tasks: [recTask("chapter.title", order), recTask("selection.define", order)], settings: { concurrency: 2 } });
  for (const n of ["b1", "b2", "b3"]) rt.scheduler.submit(spec("chapter.title", n, Priority.Background));
  for (const n of ["v1", "v2"]) rt.scheduler.submit(spec("chapter.title", n, Priority.Visible));
  await flush();
  assert.deepEqual(order, ["b1"]); // b1 took the only non-interactive slot; the rest wait
  const t = rt.scheduler.submit(spec("selection.define", "ask", Priority.Interactive));
  await flush();
  assert.deepEqual(order, ["b1", "ask"]); // Interactive uses the reserved slot at once
  assert.equal(rt.scheduler.snapshot().running.length, 2);
  provider.release();
  assert.equal((await rt.scheduler.result(t.jobId)).state, "done");
});

test("concurrency 1 has no reserved slot (background still runs)", async () => {
  const order: string[] = [];
  const rt = createTestRuntime({ tasks: [recTask("chapter.title", order)], settings: { concurrency: 1 } });
  const r = await rt.run(spec("chapter.title", "only", Priority.Background));
  assert.equal(r.state, "done");
});

test("lanes run serially; other lanes and tasks proceed", async () => {
  const order: string[] = [];
  const provider = new FakeProvider().hold();
  const lane = (s: { input: In }) => `knowledge:${s.input.file}`;
  const rt = createTestRuntime({ provider, tasks: [recTask("chapter.knowledge", order, { lane })], settings: { concurrency: 5 } });
  const a = ["a1", "a2", "a3"].map((n) => rt.scheduler.submit({ task: "chapter.knowledge", input: { name: n, file: "/a" }, priority: Priority.Background }));
  const b = rt.scheduler.submit({ task: "chapter.knowledge", input: { name: "b1", file: "/b" }, priority: Priority.Background });
  await flush();
  assert.deepEqual(order, ["a1", "b1"]);
  assert.deepEqual(rt.scheduler.snapshot().running.map((j) => j.lane).sort(), ["knowledge:/a", "knowledge:/b"]);
  provider.release();
  await Promise.all([...a, b].map((t) => rt.scheduler.result(t.jobId)));
  assert.deepEqual(order, ["a1", "b1", "a2", "a3"]);
});

test("dedupe: identical submits join the in-flight job and a more urgent join bumps it", async () => {
  const order: string[] = [];
  const provider = new FakeProvider().hold();
  const rt = createTestRuntime({ provider, tasks: [recTask("chapter.title", order)], settings: { concurrency: 1 } });
  const head = rt.scheduler.submit(spec("chapter.title", "head", Priority.Visible));
  const x = rt.scheduler.submit(spec("chapter.title", "x", Priority.Background));
  const y = rt.scheduler.submit(spec("chapter.title", "y", Priority.Prefetch));
  const x2 = rt.scheduler.submit(spec("chapter.title", "x", Priority.Interactive));
  assert.deepEqual(x2, { jobId: x.jobId, joined: true, cached: false });
  assert.equal(rt.scheduler.snapshot().queued[0].jobId, x.jobId);
  assert.equal(rt.scheduler.snapshot().queued[0].priority, Priority.Interactive);
  provider.release();
  await Promise.all([head, x, y].map((t) => rt.scheduler.result(t.jobId)));
  assert.deepEqual(order, ["head", "x", "y"]);
  assert.equal(rt.provider.calls.length, 3); // x ran once for both callers
});

test("cancel: by job, group (interest-aware), file + priorityAtLeast, and owner with keep", async () => {
  const order: string[] = [];
  const provider = new FakeProvider().hold();
  const rt = createTestRuntime({ provider, tasks: [recTask("chapter.title", order)], settings: { concurrency: 1 } });
  const blocker = rt.scheduler.submit(spec("chapter.title", "blocker", Priority.Visible));
  await flush();

  // group: a job also wanted by owner 8 survives the group cancel, then dies with owner 8
  const shared = rt.scheduler.submit(spec("chapter.title", "shared", Priority.Background, { group: "bulk:1" }), 7);
  rt.scheduler.submit(spec("chapter.title", "shared", Priority.Visible), 8);
  const bulkOnly = rt.scheduler.submit(spec("chapter.title", "bulkOnly", Priority.Background, { group: "bulk:1" }), 7);
  assert.equal(rt.scheduler.cancel({ group: "bulk:1" }), 1);
  assert.equal((await rt.scheduler.result(bulkOnly.jobId)).state, "cancelled");
  assert.equal(rt.scheduler.snapshot().queued.find((q) => q.jobId === shared.jobId)?.priority, Priority.Visible);
  assert.equal(rt.scheduler.cancel({ owner: 8 }), 1);
  assert.equal((await rt.scheduler.result(shared.jobId)).state, "cancelled");

  // file + priorityAtLeast: prefetch goes, visible stays
  const pre = rt.scheduler.submit(spec("chapter.title", "pre", Priority.Prefetch, { scope: { filePath: "/a" } }));
  const vis = rt.scheduler.submit(spec("chapter.title", "vis", Priority.Visible, { scope: { filePath: "/a" } }));
  const other = rt.scheduler.submit(spec("chapter.title", "other", Priority.Prefetch, { scope: { filePath: "/b" } }));
  assert.equal(rt.scheduler.cancel({ filePath: "/a", priorityAtLeast: Priority.Prefetch }), 1);
  assert.equal((await rt.scheduler.result(pre.jobId)).state, "cancelled");

  // owner with keep: Background bulk jobs of a book still open elsewhere survive the window
  const bg = rt.scheduler.submit(spec("chapter.title", "bg", Priority.Background, { scope: { filePath: "/open" } }), 9);
  const fg = rt.scheduler.submit(spec("chapter.title", "fg", Priority.Visible, { scope: { filePath: "/open" } }), 9);
  assert.equal(cancelForOwner(rt, 9, (f, except) => f === "/open" && except === 9), 1);
  assert.equal((await rt.scheduler.result(fg.jobId)).state, "cancelled");

  // running job: cancelled at once, its call is aborted
  assert.equal(rt.scheduler.cancel({ jobId: blocker.jobId }), 1);
  const rb = await rt.scheduler.result(blocker.jobId);
  assert.equal(rb.state, "cancelled");
  assert.equal(rb.error?.code, "cancelled");
  provider.release();
  const rest = await Promise.all([vis, other, bg].map((t) => rt.scheduler.result(t.jobId)));
  assert.deepEqual(rest.map((r) => r.state), ["done", "done", "done"]);
  assert.ok(!order.includes("pre") && !order.includes("bulkOnly") && !order.includes("fg"));
  assert.equal(rt.scheduler.cancel({ jobId: "nope" }), 0);
});

test("429: pauses the limiter globally until Retry-After, retries without using an attempt", async () => {
  const clock = createFakeClock();
  const order: string[] = [];
  const provider = new FakeProvider({ now: clock.now });
  provider.failNext({ status: 429, retryAfterSec: 10 }, 4); // more than the 3 Interactive attempts
  const rt = createTestRuntime({ provider, clock, tasks: [recTask("selection.define", order)], settings: { concurrency: 3 } });
  const t0 = clock.now();
  const a = rt.scheduler.submit(spec("selection.define", "a", Priority.Interactive));
  await flush();
  assert.equal(provider.calls.length, 1);
  assert.equal(rt.scheduler.snapshot().pausedUntil, t0 + 10_000);
  const health = rt.events.filter((e): e is Extract<AIEvent, { type: "health" }> => e.type === "health");
  assert.deepEqual(health.at(-1), { type: "health", state: "rate_limited", retryAt: t0 + 10_000 });

  // a new job submitted during the pause does not reach the provider
  const b = rt.scheduler.submit(spec("selection.define", "b", Priority.Interactive));
  await clock.advance(9_999);
  assert.equal(provider.calls.length, 1);
  assert.deepEqual(order, ["a"]); // b not even started while paused
  const results = await settle(Promise.all([a, b].map((t) => rt.scheduler.result(t.jobId))), clock);
  assert.deepEqual(results.map((r: JobResult) => r.state), ["done", "done"]);
  assert.equal(provider.calls.length, 6); // 4×429 + a + b
  assert.ok(clock.now() >= t0 + 40_000);
  assert.equal(rt.scheduler.health, "ok");
});

test("429 without Retry-After defaults to 15 s", async () => {
  const clock = createFakeClock();
  const provider = new FakeProvider({ now: clock.now }).failNext({ status: 429 });
  const rt = createTestRuntime({ provider, clock, tasks: [recTask("chapter.title", [])] });
  const t = rt.scheduler.submit(spec("chapter.title", "x", Priority.Visible));
  await flush();
  assert.equal(rt.scheduler.snapshot().pausedUntil, clock.now() + 15_000);
  assert.equal((await settle(rt.scheduler.result(t.jobId), clock)).state, "done");
});

test("backoff: server/network errors retry with jittered expo; 3 attempts Interactive, 5 Background", async () => {
  const clock = createFakeClock();
  const provider = new FakeProvider({ now: clock.now });
  const rt = createTestRuntime({ provider, clock, tasks: [recTask("chapter.title", []), recTask("selection.define", [])] });

  provider.failNext({ status: 503 }, 2);
  const ok = await settle(rt.run(spec("selection.define", "ok", Priority.Interactive)), clock);
  assert.equal(ok.state, "done");
  assert.equal(provider.calls.length, 3);

  provider.reset().failNext({ status: 500 }, 3);
  const bad = await settle(rt.run(spec("selection.define", "bad", Priority.Interactive)), clock);
  assert.equal(bad.state, "error");
  assert.equal(bad.error?.code, "server");
  assert.equal(provider.calls.length, 3);

  provider.reset().failNext({ kind: "network" }, 4);
  const t0 = clock.now();
  const bg = await settle(rt.run(spec("chapter.title", "bg", Priority.Background)), clock);
  assert.equal(bg.state, "done");
  assert.equal(provider.calls.length, 5);
  // delays 1s,2s,4s,8s × jitter 0.75 (random() = 0.5) = 11.25 s
  assert.equal(clock.now() - t0, 11_250);

  provider.reset().failNext({ status: 400 });
  const br = await settle(rt.run(spec("chapter.title", "badreq", Priority.Background)), clock);
  assert.equal(br.error?.code, "bad_request");
  assert.equal(provider.calls.length, 1); // never retried
});

test("auth trips the circuit breaker: queued jobs fail, new jobs refused until reset", async () => {
  const order: string[] = [];
  const provider = new FakeProvider();
  provider.enqueue(async () => {
    await flush(2);
    return { fail: { status: 401 } } as never;
  });
  const rt = createTestRuntime({ provider, tasks: [recTask("chapter.title", order)], settings: { concurrency: 1 } });
  const a = rt.scheduler.submit(spec("chapter.title", "a", Priority.Visible));
  const b = rt.scheduler.submit(spec("chapter.title", "b", Priority.Visible));
  const c = rt.scheduler.submit(spec("chapter.title", "c", Priority.Background));
  const [ra, rb, rc] = await Promise.all([a, b, c].map((t) => rt.scheduler.result(t.jobId)));
  assert.equal(ra.error?.code, "auth");
  assert.equal(rb.error?.code, "auth");
  assert.equal(rc.error?.code, "auth");
  assert.deepEqual(order, ["a"]);
  assert.equal(provider.calls.length, 1);
  assert.ok(rt.events.some((e) => e.type === "health" && e.state === "auth_failed"));
  assert.equal(rt.scheduler.health, "auth_failed");

  const refused = await rt.run(spec("chapter.title", "d", Priority.Interactive));
  assert.equal(refused.error?.code, "auth");
  assert.equal(provider.calls.length, 1);

  rt.scheduler.resetBreaker();
  const after = await rt.run(spec("chapter.title", "e", Priority.Interactive));
  assert.equal(after.state, "done");
});

test("no_api_key trips the breaker with health no_key", async () => {
  const provider = new FakeProvider();
  const rt = createTestRuntime({ tasks: [recTask("chapter.title", [])], provider });
  // simulate the real client: no key → no_api_key
  provider.enqueue(() => {
    throw new AIError("no_api_key", "No key");
  });
  const r = await rt.run(spec("chapter.title", "x", Priority.Visible));
  assert.equal(r.error?.code, "no_api_key");
  assert.equal(rt.scheduler.health, "no_key");
});

test("events: queued → running → progress → done; task errors and validate failures surface", async () => {
  const task: TaskDefinition<In, number> = {
    id: "chapter.comments", version: 1, role: "analysis", cacheable: false,
    key: (i) => i.name,
    async run(i, ctx) {
      ctx.progress(1, 2);
      if (i.name === "throw") throw new Error("boom");
      return i.name === "invalid" ? -1 : 1;
    },
    validate: (o): o is number => typeof o === "number" && o >= 0,
  };
  const rt = createTestRuntime({ tasks: [task] });
  const r = await rt.run(spec("chapter.comments", "ok", Priority.Visible, { scope: { filePath: "/a", chapterIndex: 2 }, group: "g" }));
  const states = rt.events.filter((e) => e.type === "job" && e.jobId === r.jobId).map((e) => {
    const j = e as { state: string; progress?: unknown };
    return j.state === "running" && j.progress ? "progress" : j.state;
  });
  assert.deepEqual(states, ["queued", "running", "progress", "done"]);
  const done = rt.events.find((e) => e.type === "job" && e.jobId === r.jobId && e.state === "done") as Extract<AIEvent, { type: "job" }>;
  assert.deepEqual(done.scope, { filePath: "/a", chapterIndex: 2 });
  assert.equal(done.group, "g");
  assert.equal((await rt.run(spec("chapter.comments", "throw", Priority.Visible))).error?.code, "unknown");
  assert.equal((await rt.run(spec("chapter.comments", "invalid", Priority.Visible))).error?.code, "validation");
  assert.equal((await rt.run({ task: "book.lookup", input: {}, priority: Priority.Visible })).error?.code, "bad_request");
  assert.equal((await rt.scheduler.result("missing")).error?.code, "unknown");
});

test("streaming: delta events only for jobs submitted with stream", async () => {
  const task: TaskDefinition<In, string> = {
    id: "assistant.turn", version: 1, role: "chat", cacheable: false,
    key: (i) => i.name,
    async run(i, ctx) {
      const c = await ctx.complete({ messages: [{ role: "user", content: i.name }], stream: (d) => ctx.delta(d) });
      return c.text;
    },
  };
  const rt = createTestRuntime({ tasks: [task], provider: new FakeProvider({ streamChunk: 4 }) });
  const r = await rt.run<string>(spec("assistant.turn", "hello there", Priority.Interactive, { stream: true }));
  const text = rt.events.filter((e) => e.type === "delta" && e.jobId === r.jobId).map((e) => (e as { text: string }).text).join("");
  assert.equal(text, r.output);
  const quiet = await rt.run(spec("assistant.turn", "quiet", Priority.Interactive));
  assert.equal(rt.events.filter((e) => e.type === "delta" && e.jobId === quiet.jobId).length, 0);
});

test("no listener leaks on a long-lived signal across many jobs, retries and cancels", async () => {
  const root = new AbortController();
  const provider = new FakeProvider({ seed: 3, latencyMs: 1 }).setRates({ server: 0.2 });
  const rt = createTestRuntime({ provider, tasks: [recTask("chapter.title", [])], settings: { concurrency: 4 }, scheduler: { signal: root.signal } });
  const baseline = getEventListeners(root.signal, "abort").length;
  assert.equal(baseline, 1); // the scheduler's own shutdown hook
  const tickets = Array.from({ length: 60 }, (_, i) => rt.scheduler.submit(spec("chapter.title", `j${i}`, i % 2 ? Priority.Background : Priority.Visible)));
  await flush(2);
  assert.ok(getEventListeners(root.signal, "abort").length > baseline); // running jobs are linked
  for (const t of tickets.filter((_, i) => i % 7 === 0)) rt.scheduler.cancel({ jobId: t.jobId });
  await Promise.all(tickets.map((t) => rt.scheduler.result(t.jobId)));
  await flush(5);
  assert.equal(getEventListeners(root.signal, "abort").length, baseline);
  // aborting the root signal disposes the scheduler
  root.abort();
  assert.equal((await rt.run(spec("chapter.title", "late", Priority.Visible))).error?.code, "cancelled");
});

test("budget guard: jobs fail with budget_exceeded before calling the provider", async () => {
  const rt = createTestRuntime({ tasks: [recTask("chapter.title", [])], scheduler: { guard: () => new AIError("budget_exceeded", "Daily budget reached", { retryable: false }) } });
  const r = await rt.run(spec("chapter.title", "x", Priority.Visible));
  assert.equal(r.error?.code, "budget_exceeded");
  assert.equal(rt.provider.calls.length, 0);
});

test("fake scheduler (for other streams): manual completion, dedupe, cancel, seeded cache", async () => {
  const fs = createFakeScheduler();
  const a = fs.submit({ task: "chapter.title", input: { c: 1 }, priority: Priority.Visible, group: "g" }, 3);
  const a2 = fs.submit({ task: "chapter.title", input: { c: 1 }, priority: Priority.Interactive });
  assert.equal(a2.joined, true);
  assert.equal(fs.jobs({ task: "chapter.title" })[0].priority, Priority.Interactive);
  const b = fs.submit({ task: "chapter.format", input: { c: 2 }, priority: Priority.Background, group: "bulk:1" });
  assert.equal(fs.cancel({ group: "bulk:1" }), 1);
  fs.complete(a.jobId, { titles: {} });
  assert.deepEqual((await fs.result(a.jobId)).output, { titles: {} });
  assert.equal((await fs.result(b.jobId)).state, "cancelled");
  const again = fs.submit({ task: "chapter.title", input: { c: 1 }, priority: Priority.Visible });
  assert.equal(again.cached, true);
  const auto = createFakeScheduler({ handlers: { "selection.define": (input: { term: string }) => ({ lemma: input.term }) } });
  const t = auto.submit({ task: "selection.define", input: { term: "ward" }, priority: Priority.Interactive });
  assert.deepEqual((await auto.result(t.jobId)).output, { lemma: "ward" });
  assert.deepEqual(auto.events.filter((e) => e.type === "job").map((e) => (e as { state: string }).state), ["queued", "running", "done"]);
});

// ── IPC ─────────────────────────────────────────────────────────────────────

function fakeIpc() {
  const handlers = new Map<string, (event: { sender: { id: number } }, ...args: unknown[]) => unknown>();
  const ipc: IpcMainLike = { handle: (ch, fn) => void handlers.set(ch, fn), removeHandler: (ch) => void handlers.delete(ch) };
  const call = (ch: string, sender: number, ...args: unknown[]) => Promise.resolve(handlers.get(ch)!({ sender: { id: sender } }, ...args));
  return { ipc, handlers, call };
}

test("ai:* IPC: channels, legacy read-only settings, submit/result and owner-window cancellation", async () => {
  setAIRuntimeForTests(null);
  const db = await openSqlJsDb();
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.run("INSERT INTO settings VALUES ('openrouterApiKey', 'sk-or-legacy')");
  db.run(`INSERT INTO settings VALUES ('ai-preset-overrides', '{"quick":{"model":"openai/gpt-x"}}')`);
  runMigrations(db, [{ area: "ai", migrations: aiMigrations }], () => {});
  const { ipc, handlers, call } = fakeIpc();
  const sent: unknown[] = [];
  const ctx = createAreaContext({ db, ipcMain: ipc, getWindows: () => [{ isDestroyed: () => false, webContents: { id: 1, send: (_c: string, p: unknown) => void sent.push(p) } }] });

  let created: ((e: unknown, wc: WebContentsLike) => void) | null = null;
  const destroyers = new Map<number, () => void>();
  const wc = (id: number): WebContentsLike => ({ id, once: (_e, cb) => void destroyers.set(id, cb) });
  registerAI(ctx, {
    env: { CODEX_AI_PROVIDER: "fake", CODEX_AI_FAKE: "latency:0" },
    electron: { app: { on: (_e, cb) => void (created = cb) }, webContents: { getAllWebContents: () => [wc(1)] } },
  });
  try {
    assert.deepEqual([...handlers.keys()].sort(), [
      "ai:cache:clear", "ai:cache:stats", "ai:cancel", "ai:key:get-legacy", "ai:key:set", "ai:key:test", "ai:models",
      "ai:result", "ai:settings:get", "ai:settings:update", "ai:submit", "ai:usage",
    ]);
    const rt = getAIRuntime();
    assert.equal(rt.provider, "fake");

    // legacy settings are read, never written
    const pub = (await call("ai:settings:get", 1)) as { hasKey: boolean; models: Record<string, string> };
    assert.equal(pub.hasKey, true);
    assert.equal(pub.models.fast, "openai/gpt-x");
    assert.equal(pub.models.chat, "openai/gpt-x");
    assert.equal(db.get("SELECT value FROM settings WHERE key = 'ai:settings:v1'"), undefined);
    assert.equal(db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'openrouterApiKey'")?.value, "sk-or-legacy");

    // jobs: a slow task, owned by window 2 (attached via web-contents-created)
    created!(null, wc(2));
    const fake = rt.fake!.hold();
    rt.registry.register(recTask("chapter.title", []));
    const t1 = (await call("ai:submit", 2, { task: "chapter.title", input: { name: "x" }, priority: 1, junk: "ignored" })) as { jobId: string };
    const t2 = (await call("ai:submit", 1, { task: "chapter.title", input: { name: "y" }, priority: 1 })) as { jobId: string };
    await flush();
    destroyers.get(2)!(); // window 2 closes
    assert.equal(((await call("ai:result", 1, t1.jobId)) as JobResult).state, "cancelled");
    fake.release();
    assert.equal(((await call("ai:result", 1, t2.jobId)) as JobResult).state, "done");
    assert.ok(sent.some((e) => (e as AIEvent).type === "job"), "events are broadcast on ai:event");

    assert.equal(await call("ai:cancel", 1, { owner: 1 }), 0); // owner selectors are main-only
    const usage = (await call("ai:usage", 1, {})) as { requests: number };
    assert.ok(usage.requests >= 1);
    assert.equal(((await call("ai:cache:stats", 1)) as { rows: number }).rows, 0); // task not cacheable
    assert.deepEqual(await call("ai:key:test", 1), { ok: true });

    // settings update writes ai:settings:v1 and broadcasts
    const upd = (await call("ai:settings:update", 1, { concurrency: 99, spoilerMode: "off", models: { web: "x/y" } })) as { concurrency: number; spoilerMode: string };
    assert.equal(upd.concurrency, 12);
    assert.equal(upd.spoilerMode, "off");
    assert.ok(sent.some((e) => (e as AIEvent).type === "settings"));
    assert.ok(db.get("SELECT value FROM settings WHERE key = 'ai:settings:v1'"));
  } finally {
    getAIRuntime().dispose();
    setAIRuntimeForTests(null);
    db.close();
  }
});
