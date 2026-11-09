/**
 * WS-A: AI cache (sql.js) — versioned keys, invalidation by file/task/version, LRU prune by bytes,
 * stats; plus the scheduler's use of it (version bump misses, memo resume) and usage summaries.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations } from "./db/migrate";
import { aiMigrations } from "./ai/schema";
import { cacheKey, createMemoryAICache, createSqlAICache, type AICache } from "./ai/cache";
import { createUsageStore } from "./ai/usage";
import { createTestRuntime, Priority } from "./ai/testing";
import type { TaskDefinition } from "./ai/registry";

async function sqlCache(now: () => number) {
  const db = await openSqlJsDb();
  const report = runMigrations(db, [{ area: "ai", migrations: aiMigrations }], () => {});
  assert.deepEqual(report.errors, []);
  return { db, cache: createSqlAICache(db, now) };
}

function forBoth(name: string, fn: (cache: AICache, tick: () => void) => void | Promise<void>) {
  test(`${name} (sql.js)`, async () => {
    let t = 1000;
    const { db, cache } = await sqlCache(() => t);
    await fn(cache, () => void (t += 10));
    db.close();
  });
  test(`${name} (memory)`, async () => {
    let t = 1000;
    await fn(createMemoryAICache(() => t), () => void (t += 10));
  });
}

forBoth("cache: get/set round-trip and version/model are part of the key", (cache) => {
  const k1 = cacheKey("chapter.title", 1, "m/a", "input-hash");
  const k2 = cacheKey("chapter.title", 2, "m/a", "input-hash");
  const k3 = cacheKey("chapter.title", 1, "m/b", "input-hash");
  assert.notEqual(k1, k2);
  assert.notEqual(k1, k3);
  assert.match(k1, /^[0-9a-f]{16}$/);
  cache.set(k1, { titles: { c1: "Ash" } }, { task: "chapter.title", taskVersion: 1, model: "m/a", filePath: "/a.epub" });
  assert.deepEqual(cache.get(k1), { titles: { c1: "Ash" } });
  assert.equal(cache.get(k2), undefined);
  assert.equal(cache.get(k3), undefined);
});

forBoth("cache: invalidate by file, by task and below a version", (cache) => {
  const put = (i: number, task: "chapter.title" | "chapter.format", v: number, filePath?: string) =>
    cache.set(`k${i}`, i, { task, taskVersion: v, model: "m", filePath });
  put(1, "chapter.title", 1, "/a");
  put(2, "chapter.title", 2, "/a");
  put(3, "chapter.format", 1, "/a");
  put(4, "chapter.format", 1, "/b");
  put(5, "chapter.title", 1);
  assert.equal(cache.invalidate({ filePath: "/b" }), 1);
  assert.equal(cache.get("k4"), undefined);
  assert.equal(cache.invalidate({ task: "chapter.title", belowVersion: 2 }), 2); // k1, k5
  assert.deepEqual([cache.get("k1"), cache.get("k2"), cache.get("k5")], [undefined, 2, undefined]);
  assert.equal(cache.invalidate({ task: "chapter.format", filePath: "/a" }), 1);
  assert.equal(cache.stats().rows, 1);
  assert.equal(cache.invalidate({}), 1);
  assert.equal(cache.stats().rows, 0);
});

forBoth("cache: stats group by task and file", (cache) => {
  cache.set("a", "x".repeat(98), { task: "chapter.title", taskVersion: 1, model: "m", filePath: "/a", bytes: 100 });
  cache.set("b", "y", { task: "chapter.title", taskVersion: 1, model: "m", filePath: "/b", bytes: 50 });
  cache.set("c", "z", { task: "chapter.format", taskVersion: 1, model: "m", filePath: "/a", bytes: 25 });
  const st = cache.stats();
  assert.equal(st.rows, 3);
  assert.equal(st.bytes, 175);
  assert.deepEqual(st.byTask, [{ task: "chapter.title", rows: 2, bytes: 150 }, { task: "chapter.format", rows: 1, bytes: 25 }]);
  assert.deepEqual(st.byFile, [{ filePath: "/a", rows: 2, bytes: 125 }, { filePath: "/b", rows: 1, bytes: 50 }]);
});

forBoth("cache: prune evicts least-recently-used rows until under the byte cap", (cache, tick) => {
  for (const k of ["a", "b", "c", "d"]) {
    cache.set(k, k, { task: "chapter.title", taskVersion: 1, model: "m", bytes: 100 });
    tick();
  }
  cache.get("a"); // a becomes most recently used
  tick();
  assert.equal(cache.prune(1000), 0);
  assert.equal(cache.prune(250), 2); // evicts b, c
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), undefined);
  assert.equal(cache.get("a"), "a");
  assert.equal(cache.get("d"), "d");
  assert.equal(cache.stats().bytes, 200);
  // default byte count is the UTF-8 JSON size
  cache.set("u", "é", { task: "chapter.title", taskVersion: 1, model: "m" });
  assert.equal(cache.stats().byTask[0].bytes, 200 + 4); // "\"é\"" = 1 + 2 + 1
});

test("cache (sql.js): corrupt rows are dropped instead of throwing", async () => {
  const { db, cache } = await sqlCache(() => 1);
  db.run("INSERT INTO ai_cache (key, task, task_version, model, value, bytes, created_at, last_used_at) VALUES ('bad','chapter.title',1,'m','{not json',9,1,1)");
  assert.equal(cache.get("bad"), undefined);
  assert.equal(cache.stats().rows, 0);
  db.close();
});

// ── Scheduler × cache ──────────────────────────────────────────────────────

function echoTask(version: number, calls: { n: number }): TaskDefinition<{ text: string }, string> {
  return {
    id: "chapter.title", version, role: "fast", cacheable: true,
    key: (i) => i.text,
    async run(i, ctx) {
      calls.n++;
      const c = await ctx.complete({ messages: [{ role: "user", content: i.text }] });
      return c.text;
    },
  };
}

test("scheduler cache: hit answers immediately; a task version bump misses; refresh/bypass skip reads", async () => {
  const calls = { n: 0 };
  const rt = createTestRuntime({ tasks: [echoTask(1, calls)] });
  const spec = { task: "chapter.title" as const, input: { text: "hello" }, priority: Priority.Visible, scope: { filePath: "/a" } };
  const r1 = await rt.run<string>(spec);
  assert.equal(r1.state, "done");
  const t2 = rt.scheduler.submit(spec);
  assert.equal(t2.cached, true);
  const r2 = await rt.scheduler.result<string>(t2.jobId);
  assert.equal(r2.output, r1.output);
  assert.equal(r2.cached, true);
  assert.equal(calls.n, 1);
  assert.ok(rt.usage.some((u) => u.outcome === "cache"));

  await rt.run({ ...spec, cache: "refresh" });
  assert.equal(calls.n, 2);
  await rt.run({ ...spec, cache: "bypass" });
  assert.equal(calls.n, 3);

  rt.registry.replace(echoTask(2, calls));
  const t3 = rt.scheduler.submit(spec);
  assert.equal(t3.cached, false);
  await rt.scheduler.result(t3.jobId);
  assert.equal(calls.n, 4);
  assert.equal(rt.cache.invalidate({ task: "chapter.title", belowVersion: 2 }), 1);
});

test("scheduler memo: a cancelled job resumes from cached chunks", async () => {
  const done: string[] = [];
  const task: TaskDefinition<{ chunks: string[] }, string[]> = {
    id: "chapter.condense", version: 1, role: "rewrite", cacheable: true,
    key: (i) => i.chunks.join("|"),
    async run(i, ctx) {
      const out: string[] = [];
      for (const [n, chunk] of i.chunks.entries()) {
        out.push(await ctx.memo(`chunk:${n}`, async () => {
          const c = await ctx.complete({ messages: [{ role: "user", content: chunk }] });
          done.push(chunk);
          return c.text;
        }));
        ctx.progress(n + 1, i.chunks.length);
      }
      return out;
    },
  };
  const rt = createTestRuntime({ tasks: [task] });
  const spec = { task: "chapter.condense" as const, input: { chunks: ["one", "two", "three"] }, priority: Priority.Background };
  const t = rt.scheduler.submit(spec);
  // cancel once the first chunk finished
  await new Promise<void>((resolve) => {
    const off = rt.scheduler.onEvent((e) => {
      if (e.type === "job" && e.jobId === t.jobId && e.progress?.done === 1) {
        off();
        rt.scheduler.cancel({ jobId: t.jobId });
        resolve();
      }
    });
  });
  const r = await rt.scheduler.result(t.jobId);
  assert.equal(r.state, "cancelled");
  const before = done.length;
  assert.ok(before >= 1 && before < 3);
  const r2 = await rt.run<string[]>(spec);
  assert.equal(r2.state, "done");
  assert.equal(r2.output!.length, 3);
  assert.deepEqual(done.slice(before), ["one", "two", "three"].slice(before)); // nothing redone
});

// ── Usage ───────────────────────────────────────────────────────────────────

test("usage store: summary by task/model, cache hits, errors and spend window", async () => {
  const db = await openSqlJsDb();
  runMigrations(db, [{ area: "ai", migrations: aiMigrations }], () => {});
  const usage = createUsageStore(db);
  const rec = (ts: number, task: "chapter.title" | "chapter.format", outcome: "ok" | "error" | "cache", cost: number, filePath = "/a") =>
    usage.record({ ts, jobId: "j", task, filePath, outcome, usage: { model: task === "chapter.title" ? "m/fast" : "m/fmt", promptTokens: 10, completionTokens: 5, costUsd: cost, cached: outcome === "cache" } });
  rec(100, "chapter.title", "ok", 0.01);
  rec(200, "chapter.title", "ok", 0.02);
  rec(300, "chapter.format", "ok", 0.1, "/b");
  rec(400, "chapter.title", "cache", 0);
  rec(500, "chapter.format", "error", 0);
  const all = usage.summary();
  assert.equal(all.requests, 3);
  assert.equal(all.cacheHits, 1);
  assert.equal(all.errors, 1);
  assert.ok(Math.abs(all.costUsd - 0.13) < 1e-9);
  assert.deepEqual(all.byTask.map((t) => [t.task, t.requests]), [["chapter.format", 1], ["chapter.title", 2]]);
  assert.equal(usage.summary({ filePath: "/a" }).requests, 2);
  assert.equal(usage.summary({ sinceMs: 250 }).requests, 1);
  assert.ok(Math.abs(usage.spentSince(150) - 0.12) < 1e-9);
  assert.equal(usage.prune(250), 2);
  db.close();
});
