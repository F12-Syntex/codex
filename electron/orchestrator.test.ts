/**
 * WS-D: chapter orchestrator against WS-A's manual fake scheduler and sql.js stores.
 * ensure dedupes; format waits for rewrite; stale baseHash re-queues; prefetch cancelled on jump;
 * bulk progress/done; Stop cancels only the bulk group; ↻ redoes one chapter; clear is per chapter.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations } from "./db/migrate";
import { chaptersMigrations } from "./ai/artifacts-schema";
import { SqlArtifactStore, SqlPrefsStore } from "./ai/artifacts";
import { SqlStyleStore } from "./ai/style";
import { ChapterOrchestrator, formatVariant } from "./ai/orchestrator";
import { createFakeScheduler, fakeBooks, flush, makeSourceChapter, Priority, type FakeScheduler } from "./ai/testing";
import type { AIEvent, BookAIPrefs, BulkStatus, JobSpec } from "./shared/ai/types";
import type { RewriteInput, RewriteOutput } from "./ai/tasks/condense";
import type { FormatInput, FormatOutput } from "./ai/tasks/format";
import type { TitleInput, TitleOutput } from "./ai/tasks/title";
import type { RewriteLayer, FormatLayer } from "./shared/pipeline/types";

const BOOK = "/books/test.epub";

const rewriteOut = (input: RewriteInput, tag = "r"): RewriteOutput => ({
  paras: Object.fromEntries(input.paras.map((p) => [p.id, { html: `<p>${tag}:${p.text}</p>` }])),
  stats: { sent: input.paras.length, rewritten: input.paras.length, kept: 0, dropped: 0, rejectedChunks: 0, splits: 0 },
});
const formatOut = (input: FormatInput): FormatOutput => ({
  paras: input.paras.length ? { [input.paras[0].id]: { html: `<div class="ai-fmt-system-msg">${input.paras[0].html}</div>` } } : {},
  stats: { sent: input.paras.length, changed: 1, merged: 0, rejected: 0, splits: 0 },
});
const titleOut = (input: TitleInput): TitleOutput => ({ titles: Object.fromEntries(input.chapters.map((c) => [c.id, `Title ${c.id}`])) });

async function setup(opts: { prefs?: Partial<BookAIPrefs>; scheduler?: FakeScheduler; chapters?: number; titles?: string[] } = {}) {
  const db = await openSqlJsDb();
  runMigrations(db, [{ area: "chapters", migrations: chaptersMigrations }], () => {});
  const events: AIEvent[] = [];
  const fs = opts.scheduler ?? createFakeScheduler();
  const chapters = Array.from({ length: opts.chapters ?? 8 }, (_, i) =>
    makeSourceChapter(i, [`Chapter ${i} opens on a grey morning.`, `Something happens in chapter ${i}.`], opts.titles?.[i] ?? `Chapter ${i + 1}`),
  );
  const artifacts = new SqlArtifactStore(db, (e) => events.push(e));
  const prefs = new SqlPrefsStore(db);
  if (opts.prefs) prefs.set(BOOK, opts.prefs);
  const orch = new ChapterOrchestrator({
    scheduler: fs,
    books: fakeBooks({ [BOOK]: chapters }),
    artifacts,
    prefs,
    style: new SqlStyleStore(db),
    emit: (e) => events.push(e),
    options: { bookTitle: () => "Test Book", bulkWindow: 4 },
  });
  return { db, fs, orch, artifacts, prefs, events, chapters };
}

const jobsOf = (fs: FakeScheduler, task: JobSpec["task"], chapterIndex?: number) =>
  fs.jobs({ task }).filter((j) => chapterIndex === undefined || j.scope?.chapterIndex === chapterIndex);

test("ensure: concurrent and repeated ensures for one chapter make one job per kind", async () => {
  const { fs, orch } = await setup({ prefs: { rewrite: "concise", titles: true } });
  const [a, b] = await Promise.all([
    orch.ensure({ filePath: BOOK, chapterIndex: 2, priority: Priority.Visible }),
    orch.ensure({ filePath: BOOK, chapterIndex: 2, priority: Priority.Visible }),
  ]);
  await orch.ensure({ filePath: BOOK, chapterIndex: 2, priority: Priority.Prefetch, group: `prefetch:${BOOK}` });
  await flush();
  assert.equal(jobsOf(fs, "chapter.condense").length, 1);
  assert.equal(jobsOf(fs, "chapter.title").length, 1);
  assert.equal(fs.submissions.length, 2, "no duplicate submissions either");
  assert.equal(a.kinds.rewrite, "queued");
  assert.equal(b.kinds.rewrite, "queued");
  assert.equal(a.kinds.format, "off");

  // Prefetch then navigation: the navigation ensure joins and raises the priority.
  await orch.ensure({ filePath: BOOK, chapterIndex: 3, priority: Priority.Prefetch, group: `prefetch:${BOOK}` });
  await flush();
  const job = jobsOf(fs, "chapter.condense", 3)[0];
  assert.equal(job.priority, Priority.Prefetch);
  await orch.ensure({ filePath: BOOK, chapterIndex: 3, priority: Priority.Visible });
  assert.equal(fs.job(job.jobId)!.priority, Priority.Visible, "joined and bumped");
  assert.equal(jobsOf(fs, "chapter.condense", 3).length, 1);
});

test("ensure: `kinds: []` is a pure status read", async () => {
  const { fs, orch } = await setup({ prefs: { rewrite: "polish", comments: true } });
  const s = await orch.ensure({ filePath: BOOK, chapterIndex: 0, priority: Priority.Visible, kinds: [] });
  await flush();
  assert.equal(fs.submissions.length, 0);
  assert.equal(s.kinds.rewrite, "missing");
  assert.equal(s.kinds.comments, "missing");
  assert.equal(s.kinds.title, "off");
});

test("format waits for rewrite and records the rewrite artifactHash as baseHash", async () => {
  const { fs, orch, artifacts, chapters } = await setup({ prefs: { rewrite: "concise", formatting: true } });
  const s = await orch.ensure({ filePath: BOOK, chapterIndex: 1, priority: Priority.Visible });
  assert.equal(s.kinds.rewrite, "queued");
  assert.equal(s.kinds.format, "queued");
  await flush();
  assert.equal(jobsOf(fs, "chapter.condense").length, 1);
  assert.equal(jobsOf(fs, "chapter.format").length, 0, "format is not submitted before the rewrite lands");

  fs.completeAll("chapter.condense", (spec) => rewriteOut(spec.input as RewriteInput));
  await flush();
  const fmt = jobsOf(fs, "chapter.format");
  assert.equal(fmt.length, 1);
  const input = fmt[0].spec.input as FormatInput;
  const rw = artifacts.get<RewriteLayer>(BOOK, chapters[1].id, "rewrite", "concise")!;
  assert.equal(input.base, "rewrite");
  assert.equal(input.baseHash, rw.data.artifactHash);
  assert.match(input.paras[0].html, /^<p>r:/, "format runs on the rewritten html");

  fs.completeAll("chapter.format", (spec) => formatOut(spec.input as FormatInput));
  await flush();
  const done = await orch.ensure({ filePath: BOOK, chapterIndex: 1, priority: Priority.Visible, kinds: [] });
  assert.equal(done.kinds.rewrite, "ready");
  assert.equal(done.kinds.format, "ready");
  const arts = await orch.chapterArtifacts(BOOK, 1);
  assert.equal(arts.rewrite?.mode, "concise");
  assert.equal(arts.format?.baseHash, rw.data.artifactHash);
});

test("a stale baseHash makes format stale (omitted from artifacts) and the next ensure re-queues it", async () => {
  const { fs, orch, artifacts, chapters } = await setup({ prefs: { rewrite: "concise", formatting: true } });
  await orch.ensure({ filePath: BOOK, chapterIndex: 0, priority: Priority.Visible });
  await flush();
  fs.completeAll("chapter.condense", (spec) => rewriteOut(spec.input as RewriteInput));
  await flush();
  fs.completeAll("chapter.format", (spec) => formatOut(spec.input as FormatInput));
  await flush();

  // The rewrite layer changes underneath (e.g. another window re-ran it).
  const old = artifacts.get<RewriteLayer>(BOOK, chapters[0].id, "rewrite", "concise")!;
  const changed: RewriteLayer = { ...old.data, artifactHash: "different", paras: { ...old.data.paras } };
  artifacts.put({ ...old, data: changed, artifactHash: changed.artifactHash });

  const s = await orch.ensure({ filePath: BOOK, chapterIndex: 0, priority: Priority.Visible, kinds: [] });
  assert.equal(s.kinds.format, "stale");
  assert.equal((await orch.chapterArtifacts(BOOK, 0)).format, undefined, "stale layers are never served");

  await orch.ensure({ filePath: BOOK, chapterIndex: 0, priority: Priority.Visible });
  await flush();
  const fmt = jobsOf(fs, "chapter.format");
  assert.equal(fmt.length, 2, "re-queued");
  assert.equal((fmt[1].spec.input as FormatInput).baseHash, "different");
  assert.equal(jobsOf(fs, "chapter.condense").length, 1, "the valid rewrite is not redone");
});

test("↻ on a rewrite re-runs only that chapter (cache refresh) and re-queues its format", async () => {
  const { fs, orch } = await setup({ prefs: { rewrite: "concise", formatting: true } });
  for (const i of [0, 1]) await orch.ensure({ filePath: BOOK, chapterIndex: i, priority: Priority.Visible });
  await flush();
  fs.completeAll("chapter.condense", (spec) => rewriteOut(spec.input as RewriteInput));
  await flush();
  fs.completeAll("chapter.format", (spec) => formatOut(spec.input as FormatInput));
  await flush();
  const before = fs.submissions.length;

  await orch.ensure({ filePath: BOOK, chapterIndex: 1, priority: Priority.Visible, kinds: ["rewrite"], refresh: true });
  await flush();
  const added = fs.submissions.slice(before);
  assert.equal(added.length, 1);
  assert.equal(added[0].spec.task, "chapter.condense");
  assert.equal(added[0].spec.scope?.chapterIndex, 1);
  assert.equal(added[0].spec.cache, "refresh");

  fs.completeAll("chapter.condense", (spec) => rewriteOut(spec.input as RewriteInput, "again"));
  await flush();
  const fmt = fs.submissions.slice(before).filter((s) => s.spec.task === "chapter.format");
  assert.equal(fmt.length, 1, "format rebuilt on the new rewrite");
  assert.equal(fmt[0].spec.scope?.chapterIndex, 1);
  const status0 = await orch.ensure({ filePath: BOOK, chapterIndex: 0, priority: Priority.Visible, kinds: [] });
  assert.equal(status0.kinds.rewrite, "ready", "chapter 0 untouched");
  assert.equal(status0.kinds.format, "ready");
});

test("prefetch group is cancelled when navigation jumps more than one chapter away", async () => {
  const { fs, orch } = await setup({ prefs: { rewrite: "concise" } });
  await orch.ensure({ filePath: BOOK, chapterIndex: 1, priority: Priority.Visible });
  await orch.ensure({ filePath: BOOK, chapterIndex: 2, priority: Priority.Prefetch, group: `prefetch:${BOOK}` });
  await flush();
  const visible = jobsOf(fs, "chapter.condense", 1)[0];
  const prefetch = jobsOf(fs, "chapter.condense", 2)[0];

  // Turning the page to the prefetched chapter keeps it (and joins it).
  await orch.ensure({ filePath: BOOK, chapterIndex: 2, priority: Priority.Visible });
  await orch.ensure({ filePath: BOOK, chapterIndex: 3, priority: Priority.Prefetch, group: `prefetch:${BOOK}` });
  await flush();
  assert.equal(fs.job(prefetch.jobId)!.state, "running");
  const prefetch3 = jobsOf(fs, "chapter.condense", 3)[0];

  // Jump via the TOC to chapter 6: the chapter-3 prefetch is dropped; pinned work is kept.
  await orch.ensure({ filePath: BOOK, chapterIndex: 6, priority: Priority.Visible });
  await flush();
  assert.equal(fs.job(prefetch3.jobId)!.state, "cancelled");
  assert.equal(fs.job(prefetch.jobId)!.state, "running", "chapter 2 was joined by navigation (pinned)");
  assert.equal(fs.job(visible.jobId)!.state, "running");
  const s3 = await orch.ensure({ filePath: BOOK, chapterIndex: 3, priority: Priority.Visible, kinds: [] });
  assert.equal(s3.kinds.rewrite, "missing");
});

test("bulk: batched titles, per-kind progress, skipped structural chapters, and a final 'done'", async () => {
  const titles = ["Copyright", "Chapter 1", "Chapter 2", "The Already Named", "Chapter 4", "Chapter 5"];
  const fs = createFakeScheduler({
    handlers: {
      "chapter.condense": (input: RewriteInput) => rewriteOut(input),
      "chapter.title": (input: TitleInput) => titleOut(input),
    },
  });
  const { orch, events, artifacts, chapters } = await setup({ prefs: { rewrite: "polish", titles: true }, scheduler: fs, chapters: 6, titles });
  // Chapter 2's rewrite already exists → counted as done without a job.
  const pre = await orch.ensure({ filePath: BOOK, chapterIndex: 2, priority: Priority.Visible, kinds: ["rewrite"] });
  assert.equal(pre.kinds.rewrite, "queued");
  await flush();
  const before = fs.submissions.length;

  const { runId } = await orch.startBulk({ filePath: BOOK, kinds: ["title", "rewrite", "format"], from: 0, to: 5 });
  const final = (await orch.waitForRun(runId))!;
  assert.equal(final.state, "done");
  assert.deepEqual(final.perKind.rewrite, { done: 5, total: 5, failed: 0, skipped: 1 });
  assert.deepEqual(final.perKind.title, { done: 4, total: 4, failed: 0, skipped: 2 });
  assert.deepEqual(final.perKind.format, { done: 0, total: 0, failed: 0, skipped: 0 }, "kinds off in prefs never run");
  assert.ok(final.endedAt! >= final.startedAt);
  assert.deepEqual(final.active, []);

  const added = fs.submissions.slice(before);
  assert.equal(added.filter((s) => s.spec.task === "chapter.title").length, 1, "titles batched into one job");
  assert.equal(added.filter((s) => s.spec.task === "chapter.condense").length, 4);
  assert.ok(added.every((s) => s.spec.priority === Priority.Background && s.spec.group === `bulk:${runId}`));
  assert.equal(artifacts.get<{ title: string }>(BOOK, chapters[1].id, "title")?.data.title, "Chapter 1 Title c1");

  const bulkEvents = events.filter((e): e is Extract<AIEvent, { type: "bulk" }> => e.type === "bulk").map((e) => e.status);
  assert.equal(bulkEvents.at(-1)!.state, "done");
  assert.ok(bulkEvents.some((s) => s.state === "running" && s.perKind.rewrite.done < 5), "progress was reported along the way");
  assert.deepEqual(orch.bulkStatus(BOOK)?.runId, runId);
});

test("bulk Stop cancels only the bulk group; navigation work keeps running", async () => {
  const { fs, orch, artifacts, chapters } = await setup({ prefs: { rewrite: "concise" } });
  await orch.ensure({ filePath: BOOK, chapterIndex: 0, priority: Priority.Visible });
  await flush();
  const nav = jobsOf(fs, "chapter.condense", 0)[0];

  const { runId } = await orch.startBulk({ filePath: BOOK, kinds: ["rewrite"], from: 0, to: 5 });
  await flush();
  const bulkJobs = fs.jobs({ group: `bulk:${runId}` });
  assert.equal(bulkJobs.length, 3, "window of 4: chapter 0 joined, chapters 1–3 submitted");
  const running: BulkStatus = orch.bulkStatus(BOOK)!;
  assert.equal(running.state, "running");
  assert.equal(running.perKind.rewrite.total, 6);
  assert.deepEqual(running.active.map((a) => a.chapterIndex), [0, 1, 2, 3]);

  orch.cancelBulk(runId);
  await flush();
  assert.equal(orch.bulkStatus(BOOK)!.state, "cancelled");
  for (const j of bulkJobs) assert.equal(fs.job(j.jobId)!.state, "cancelled");
  assert.equal(fs.job(nav.jobId)!.state, "running", "the reader's own chapter is not cancelled");
  assert.equal(fs.jobs({ task: "chapter.condense" }).length, 4, "no new bulk work after Stop");

  fs.complete(nav.jobId, rewriteOut(fs.job(nav.jobId)!.spec.input as RewriteInput));
  await flush();
  assert.ok(artifacts.get(BOOK, chapters[0].id, "rewrite", "concise"));

  // A new run can start once the old one stopped.
  const again = await orch.startBulk({ filePath: BOOK, kinds: ["rewrite"], from: 4, to: 4 });
  assert.notEqual(again.runId, runId);
});

test("errors: a failed job reports 'error' with info, prefetch does not retry it, navigation does", async () => {
  const { fs, orch } = await setup({ prefs: { comments: true } });
  await orch.ensure({ filePath: BOOK, chapterIndex: 0, priority: Priority.Visible });
  await flush();
  fs.fail(jobsOf(fs, "chapter.comments")[0].jobId, "server");
  await flush();
  const s = await orch.ensure({ filePath: BOOK, chapterIndex: 0, priority: Priority.Prefetch, group: `prefetch:${BOOK}` });
  await flush();
  assert.equal(s.kinds.comments, "error");
  assert.equal(s.errors?.comments?.code, "server");
  assert.equal(jobsOf(fs, "chapter.comments").length, 1);
  await orch.ensure({ filePath: BOOK, chapterIndex: 0, priority: Priority.Visible });
  await flush();
  assert.equal(jobsOf(fs, "chapter.comments").length, 2);
});

test("clear is per chapter and per kind; turning a kind off cancels its queued work", async () => {
  const fs = createFakeScheduler({ handlers: { "chapter.condense": (i: RewriteInput) => rewriteOut(i), "chapter.format": (i: FormatInput) => formatOut(i) } });
  const { orch, artifacts, chapters, events } = await setup({ prefs: { rewrite: "concise", formatting: true }, scheduler: fs });
  for (const i of [0, 1]) await orch.ensure({ filePath: BOOK, chapterIndex: i, priority: Priority.Visible });
  await flush(10);
  assert.ok(artifacts.get<FormatLayer>(BOOK, chapters[0].id, "format", formatVariant("concise")));

  const n = orch.clear(BOOK, "rewrite", 0);
  assert.equal(n, 1);
  assert.equal(artifacts.get(BOOK, chapters[0].id, "rewrite", "concise"), null);
  assert.ok(artifacts.get(BOOK, chapters[1].id, "rewrite", "concise"), "other chapters untouched");
  assert.ok(artifacts.get(BOOK, chapters[0].id, "format", formatVariant("concise")), "other kinds untouched");
  assert.ok(events.some((e) => e.type === "artifact" && e.chapterIndex === 0 && e.kind === "rewrite"));
  const s = await orch.ensure({ filePath: BOOK, chapterIndex: 0, priority: Priority.Visible, kinds: [] });
  assert.equal(s.kinds.format, "stale", "its base is gone");

  const manual = await setup({ prefs: { comments: true } });
  await manual.orch.ensure({ filePath: BOOK, chapterIndex: 4, priority: Priority.Visible });
  await flush();
  const job = jobsOf(manual.fs, "chapter.comments")[0];
  manual.orch.setPrefs(BOOK, { comments: false });
  await flush();
  assert.equal(manual.fs.job(job.jobId)!.state, "cancelled");
  assert.equal((await manual.orch.ensure({ filePath: BOOK, chapterIndex: 4, priority: Priority.Visible, kinds: [] })).kinds.comments, "off");
});

test("integration: real WS-A scheduler + fake provider + WS-D tasks; registerChapters wires every channel", async () => {
  const { createTestRuntime } = await import("./ai/testing");
  const { CHAPTER_TASKS, registerChapters } = await import("./ai/chapters-ipc");
  const { createAreaContext } = await import("./ipc/registry");
  const chapters = [makeSourceChapter(0, ["One two three four five six seven eight nine ten."], "Chapter 1")];
  const rt = createTestRuntime({ tasks: [...CHAPTER_TASKS], services: { books: fakeBooks({ [BOOK]: chapters }) } });
  rt.provider.respondTo("chapter.title", () => JSON.stringify({ titles: { a: "Grey Morning" } }));

  const db = await openSqlJsDb();
  runMigrations(db, [{ area: "chapters", migrations: chaptersMigrations }], () => {});
  const handlers = new Map<string, (...a: unknown[]) => unknown>();
  const sent: unknown[] = [];
  const ctx = createAreaContext({
    db,
    ipcMain: { handle: (c, fn) => void handlers.set(c, fn as never), removeHandler: () => {} },
    getWindows: () => [{ isDestroyed: () => false, webContents: { id: 1, send: (_c: string, e: unknown) => void sent.push(e) } }],
  });
  const orch = registerChapters(ctx, { scheduler: rt.scheduler, books: fakeBooks({ [BOOK]: chapters }) })!;
  assert.deepEqual([...handlers.keys()].sort(), [
    "bulk:cancel", "bulk:start", "bulk:status", "chapters:artifacts", "chapters:clear", "chapters:ensure",
    "chapters:prefs:get", "chapters:prefs:set", "chapters:status", "chapters:titles", "style:get", "style:regenerate",
  ]);
  const meta = { sender: { id: 1 } };
  await handlers.get("chapters:prefs:set")!(meta, BOOK, { titles: true });
  await handlers.get("chapters:ensure")!(meta, { filePath: BOOK, chapterIndex: 0, priority: Priority.Visible });
  for (let i = 0; i < 20 && !(await orch.chapterArtifacts(BOOK, 0)).title; i++) await flush();
  assert.equal((await orch.chapterArtifacts(BOOK, 0)).title, "Chapter 1 Grey Morning");
  assert.ok(sent.some((e) => (e as AIEvent).type === "artifact"), "artifact events are broadcast");
  const status = (await handlers.get("chapters:status")!(meta, BOOK)) as { totals: Record<string, { ready: number; total: number }> };
  assert.deepEqual(status.totals.title, { ready: 1, total: 1 });
  orch.dispose();
  db.close();
});
