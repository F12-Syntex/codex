/**
 * WS-E: assistant tools are clamped to the frontier; the `assistant.turn` tool loop
 * (≤ 4 tool rounds, streaming, markers validated, terminal proposals) and the service flow.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { BookView } from "./assistant/book-view";
import { AssistantTools, NOT_YET_READ, ASSISTANT_TOOL_NAMES } from "./assistant/tools";
import { FILE, FRONTIER, fakeBooks, fakeKnowledge, makeBook, scriptedContext, scriptedResponder, toolCall } from "./assistant/fixtures";
import { createTestRuntime, FakeProvider } from "./ai/testing";
import { createAssistantTurnTask, MAX_TOOL_ROUNDS } from "./ai/tasks/assistant";
import { STREAM_RESET } from "./shared/assistant/markers";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations } from "./db/migrate";
import { assistantMigrations } from "./assistant/schema";
import { ThreadStore } from "./assistant/store";
import { AssistantService } from "./assistant/service";
import type { Frontier, KnowledgeReader, WikiEdit } from "./shared/knowledge/types";

async function tools(frontier: Frontier = FRONTIER, knowledge: KnowledgeReader | null = fakeKnowledge(frontier)) {
  const view = await new BookView(FILE, frontier, fakeBooks(makeBook())).load();
  return { view, tools: new AssistantTools({ filePath: FILE, view, knowledge }) };
}

const call = (name: string, args: unknown) => toolCall(name, args);

test("tool list matches the contract", () => {
  assert.deepEqual([...ASSISTANT_TOOL_NAMES].sort(), ["get_entity", "list_summaries", "propose_wiki_edits", "read_passage", "search_book"]);
});

// ── read_passage ───────────────────────────────────────────────────────────

test("read_passage: finished chapter is fully readable with cite markers", async () => {
  const { tools: t } = await tools();
  const out = await t.execute(call("read_passage", { chapter: "2", fromPara: 1, toPara: 5 }));
  assert.match(out.content, /\[\[cite:2:1\]\] c1p0/);
  assert.match(out.content, /\[\[cite:2:5\]\] c1p4/);
  assert.doesNotMatch(out.content, /Not yet read/);
});

test("read_passage beyond the frontier returns 'not yet read' and no text", async () => {
  const { tools: t } = await tools();
  const out = await t.execute(call("read_passage", { chapter: "4", fromPara: 1, toPara: 3 }));
  assert.match(out.content, new RegExp(`^${NOT_YET_READ}`));
  assert.doesNotMatch(out.content, /c3p/);
  const out5 = await t.execute(call("read_passage", { chapter: "Chapter 5", fromPara: 1, toPara: 1 }));
  assert.match(out5.content, new RegExp(`^${NOT_YET_READ}`));
});

test("read_passage in the current chapter is clamped to the frontier paragraph", async () => {
  const { tools: t } = await tools();
  const out = await t.execute(call("read_passage", { chapter: "3", fromPara: 1, toPara: 5 }));
  assert.match(out.content, /c2p2/);
  assert.doesNotMatch(out.content, /c2p3|c2p4|traitor/);
  assert.match(out.content, /not yet read/i);
  const past = await t.execute(call("read_passage", { chapter: "3", fromPara: 4, toPara: 5 }));
  assert.match(past.content, new RegExp(`^${NOT_YET_READ}`));
  assert.doesNotMatch(past.content, /traitor/);
});

test("mode 'off' (show everything) disables clamping", async () => {
  const { tools: t } = await tools({ chapterIndex: -1, mode: "off" });
  const out = await t.execute(call("read_passage", { chapter: "4", fromPara: 2, toPara: 2 }));
  assert.match(out.content, /forged by Orren/);
});

// ── search_book ────────────────────────────────────────────────────────────

test("search_book drops knowledge hits past the frontier and never expands into unread paragraphs", async () => {
  const leakyHits = [
    { chapterIndex: 3, paraId: "p3_1", snippet: "silver key", score: 9 }, // future chapter
    { chapterIndex: 2, paraId: "p2_4", snippet: "silver key", score: 8 }, // current chapter, past para
    { chapterIndex: 2, paraId: "p2_2", snippet: "silver key", score: 7 }, // at the frontier paragraph
    { chapterIndex: 1, paraId: "p1_2", snippet: "silver key", score: 6 },
  ];
  const { tools: t } = await tools(FRONTIER, fakeKnowledge(FRONTIER, { hits: leakyHits }));
  const out = await t.execute(call("search_book", { query: "silver key", limit: 5 }));
  assert.doesNotMatch(out.content, /Orren|traitor|c3p|c2p3|c2p4/);
  assert.match(out.content, /\[\[cite:2:3\]\] c1p2 Mira found the silver key/);
  assert.match(out.content, /\[\[cite:3:3\]\] c2p2/);
});

test("search_book falls back to a scan of readable text only", async () => {
  const { tools: t } = await tools(FRONTIER, null);
  const out = await t.execute(call("search_book", { query: "silver key" }));
  assert.match(out.content, /Mira found the silver key/);
  assert.doesNotMatch(out.content, /traitor|Orren/);
  const none = await t.execute(call("search_book", { query: "Orren" }));
  assert.match(none.content, /No passages/);
});

// ── get_entity / list_summaries ────────────────────────────────────────────

test("get_entity resolves names and aliases, and hides entities introduced past the frontier", async () => {
  const { tools: t } = await tools();
  const mira = await t.execute(call("get_entity", { nameOrId: "the thief" }));
  assert.match(mira.content, /\[\[entity:mira\|Mira\]\]/);
  const orren = await t.execute(call("get_entity", { nameOrId: "Orren" }));
  assert.match(orren.content, /No wiki entry/);
  assert.doesNotMatch(orren.content, /smith/);
});

test("get_entity re-clamps an ungated knowledge reader", async () => {
  const { tools: t } = await tools(FRONTIER, fakeKnowledge(FRONTIER, { leaky: true }));
  const orren = await t.execute(call("get_entity", { nameOrId: "orren" }));
  assert.match(orren.content, /No wiki entry/);
});

test("list_summaries only returns finished chapters", async () => {
  const { tools: t } = await tools(FRONTIER, fakeKnowledge(FRONTIER, { leaky: true }));
  const out = await t.execute(call("list_summaries", { fromChapter: "1", toChapter: "5" }));
  assert.match(out.content, /Chapter 1: Summary/);
  assert.match(out.content, /Chapter 2: Summary/);
  assert.doesNotMatch(out.content, /Chapter 3|Chapter 4/);
  const future = await t.execute(call("list_summaries", { fromChapter: "4", toChapter: "5" }));
  assert.match(future.content, new RegExp(NOT_YET_READ));
});

// ── propose_wiki_edits ─────────────────────────────────────────────────────

test("propose_wiki_edits is terminal, validates ids against the frontier and clamps chapters", async () => {
  const { tools: t } = await tools();
  const out = await t.execute(call("propose_wiki_edits", {
    summary: "Add Mira's alias and fix her status.",
    edits: [
      { op: "alias", id: "mira", aliases: ["Silver Hand"], asOfChapter: "5" },
      { op: "update", id: "mira", fields: { status: "wanted", significance: 9 }, asOfChapter: "2" },
      { op: "relate", sourceId: "mira", targetId: "orren", relation: "ally", sinceChapter: "4" }, // orren not yet introduced
      { op: "teleport" },
    ],
  }));
  assert.equal(out.terminal, true);
  assert.equal(out.proposal!.edits.length, 2);
  const alias = out.proposal!.edits[0] as Extract<WikiEdit, { op: "alias" }>;
  assert.ok(alias.asOfChapter <= 2, "chapter clamped to what the reader can see");
  const upd = out.proposal!.edits[1] as Extract<WikiEdit, { op: "update" }>;
  assert.equal(upd.fields.significance, 5);
  assert.equal(out.proposal!.rejected.length, 2);
});

test("propose_wiki_edits with no valid edits is not terminal", async () => {
  const { tools: t } = await tools();
  const out = await t.execute(call("propose_wiki_edits", { summary: "x", edits: [{ op: "delete", id: "orren" }] }));
  assert.equal(out.terminal, undefined);
  assert.equal(out.error, true);
});

// ── selection window ───────────────────────────────────────────────────────

test("a selection after a TOC jump opens only that chapter up to the selection", async () => {
  const { view, tools: t } = await tools();
  view.openWindow({ filePath: FILE, chapterId: "c4", paraId: "p4_1" });
  const sel = await t.execute(call("read_passage", { chapter: "5", fromPara: 1, toPara: 5 }));
  assert.match(sel.content, /c4p1/);
  assert.doesNotMatch(sel.content, /c4p2|c4p3/);
  const between = await t.execute(call("read_passage", { chapter: "4", fromPara: 1, toPara: 2 }));
  assert.match(between.content, new RegExp(`^${NOT_YET_READ}`));
});

// ── assistant.turn ─────────────────────────────────────────────────────────

async function threadFixture() {
  const db = await openSqlJsDb();
  runMigrations(db, [{ area: "assistant", migrations: assistantMigrations }], () => {});
  let n = 0;
  const store = new ThreadStore(db, { now: () => 1000 + n, newId: () => `id${++n}` });
  const thread = store.createThread({ filePath: FILE, mode: "chat" });
  store.appendMessage(thread.id, { role: "user", blocks: [{ type: "markdown", text: "Where did Mira find the key?" }], citations: [], entityLinks: [], status: "done" });
  const ph = store.appendMessage(thread.id, { role: "assistant", blocks: [], citations: [], entityLinks: [], status: "streaming" });
  return { db, store, thread, ph };
}

test("assistant.turn: tool round, streamed final answer, markers validated against the frontier", async () => {
  const { store, thread, ph } = await threadFixture();
  const task = createAssistantTurnTask({ store });
  const { ctx, requests, deltas } = scriptedContext([
    { text: "Let me check.", toolCalls: [toolCall("search_book", { query: "silver key" })] },
    { text: "Under the stairs [[cite:2:3]] — [[entity:mira|Mira]] kept it. Later it opens a vault [[cite:3:5]][[cite:4:2]]. [[entity:orren|Orren]] made it." },
  ]);
  const out = await task.run({ threadId: thread.id, messageId: ph.id, filePath: FILE }, ctx);
  assert.equal(out.toolRounds, 1);
  assert.equal(requests.length, 2);
  assert.ok(requests[0].tools?.length, "tools offered");
  assert.equal(requests[1].messages.filter((m) => m.role === "tool").length, 1);
  assert.match(requests[1].messages.find((m) => m.role === "tool")!.content, /silver key/);
  // The streamed tool-round preamble is discarded with a reset sentinel.
  assert.ok(deltas.includes(STREAM_RESET));
  assert.ok(deltas.indexOf(STREAM_RESET) < deltas.length - 1);

  const msg = store.getMessage(ph.id)!;
  assert.equal(msg.status, "done");
  assert.deepEqual(msg.citations.map((c) => c.label), ["Ch 2 ¶3"]);
  assert.equal(msg.citations[0].ref.paraId, "p1_2");
  assert.match(msg.citations[0].snippet ?? "", /silver key/);
  assert.deepEqual(msg.entityLinks, ["mira"]);
  const md = msg.blocks[0].type === "markdown" ? msg.blocks[0].text : "";
  assert.match(md, /stairs \[\^1\]/);
  assert.match(md, /\[Mira\]\(entity:mira\)/);
  assert.doesNotMatch(md, /\[\[|entity:orren/);
  assert.match(md, /Orren made it/);
  // The system prompt states the boundary and carries the frontier-gated context.
  assert.match(requests[0].messages[0].content, /finished Chapter 2/);
  assert.doesNotMatch(requests[0].messages[0].content, /smith/);
});

test("assistant.turn: at most 4 tool rounds, then a forced final answer", async () => {
  const { store, thread, ph } = await threadFixture();
  const task = createAssistantTurnTask({ store });
  const { ctx, requests } = scriptedContext([
    (req) => (req.toolChoice === "none"
      ? { text: "Final answer [[cite:1:1]]." }
      : { toolCalls: [toolCall("read_passage", { chapter: "1", fromPara: 1, toPara: 2 })] }),
  ]);
  const out = await task.run({ threadId: thread.id, messageId: ph.id, filePath: FILE }, ctx);
  assert.equal(out.toolRounds, MAX_TOOL_ROUNDS);
  assert.equal(requests.length, MAX_TOOL_ROUNDS + 1);
  assert.equal(requests[MAX_TOOL_ROUNDS].toolChoice, "none");
  assert.equal(store.getMessage(ph.id)!.citations.length, 1);
});

test("assistant.turn: propose_wiki_edits ends the loop with a pending proposal", async () => {
  const { store, thread, ph } = await threadFixture();
  const task = createAssistantTurnTask({ store });
  const { ctx, requests } = scriptedContext([
    { toolCalls: [toolCall("propose_wiki_edits", { summary: "Mira is also called the Silver Hand.", edits: [{ op: "alias", id: "mira", aliases: ["Silver Hand"], asOfChapter: "2" }] })] },
    { text: "should never be requested" },
  ]);
  const out = await task.run({ threadId: thread.id, messageId: ph.id, filePath: FILE }, ctx);
  assert.equal(out.proposal, true);
  assert.equal(requests.length, 1);
  const msg = store.getMessage(ph.id)!;
  assert.equal(msg.proposal?.status, "pending");
  assert.equal(msg.proposal?.edits.length, 1);
  assert.match(msg.blocks[0].type === "markdown" ? msg.blocks[0].text : "", /Silver Hand/);
});

test("assistant.turn: models without tool support answer from context", async () => {
  const { store, thread, ph } = await threadFixture();
  const task = createAssistantTurnTask({ store });
  const { AIError } = await import("./ai/errors");
  let first = true;
  const { ctx, requests } = scriptedContext([
    () => {
      if (first) {
        first = false;
        throw new AIError("bad_request", "Model does not support tools", { retryable: false });
      }
      return { text: "From memory." };
    },
  ]);
  await task.run({ threadId: thread.id, messageId: ph.id, filePath: FILE }, ctx);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].tools, undefined);
  assert.equal(store.getMessage(ph.id)!.status, "done");
});

test("assistant.turn: a non-retryable failure marks the message as an error", async () => {
  const { store, thread, ph } = await threadFixture();
  const task = createAssistantTurnTask({ store });
  const { AIError } = await import("./ai/errors");
  const { ctx } = scriptedContext([() => { throw new AIError("auth", "Invalid key"); }]);
  await assert.rejects(task.run({ threadId: thread.id, messageId: ph.id, filePath: FILE }, ctx));
  const msg = store.getMessage(ph.id)!;
  assert.equal(msg.status, "error");
  assert.equal(msg.error?.code, "auth");
});

// ── Service: send → turn → proposal apply ──────────────────────────────────

test("service: send runs a turn in group thread:<id>; proposals apply only on confirmation", async () => {
  const db = await openSqlJsDb();
  runMigrations(db, [{ area: "assistant", migrations: assistantMigrations }], () => {});
  const svc = new AssistantService(db);
  const applied: WikiEdit[][] = [];
  const script = [
    { toolCalls: [toolCall("propose_wiki_edits", { summary: "Rename.", edits: [{ op: "update", id: "mira", fields: { name: "Mira Vale" }, asOfChapter: "2" }] })] },
  ];
  // WS-A's real scheduler + fake provider.
  const rt = createTestRuntime({
    tasks: svc.taskDefinitions(),
    // Queued replies take precedence over the tasks' offline `fakeResponse` hooks.
    provider: new FakeProvider().enqueue(scriptedResponder(script)),
    services: { books: fakeBooks(makeBook()), knowledge: fakeKnowledge(FRONTIER) },
  });
  const submitted: { group?: string; priority: number; stream?: boolean }[] = [];
  const sched = {
    submit: ((spec, owner) => { submitted.push({ group: spec.group, priority: spec.priority, stream: spec.stream }); return rt.scheduler.submit(spec, owner); }) as typeof rt.scheduler.submit,
    result: rt.scheduler.result.bind(rt.scheduler),
    cancel: rt.scheduler.cancel.bind(rt.scheduler),
  };
  svc.configure({ scheduler: sched, applyEdits: (_f, edits) => { applied.push(edits); return { applied: edits.length, failed: [], mergeLogIds: [] }; } });

  const thread = svc.createThread({ filePath: FILE, mode: "chat", seed: { selection: { ref: { filePath: FILE, chapterId: "c1", paraId: "p1_2" }, text: "the silver key" } } });
  const ticket = svc.send({ threadId: thread.id, text: "Her surname is Vale, fix the wiki." }, 7);
  assert.equal(submitted[0].group, `thread:${thread.id}`);
  assert.equal(submitted[0].priority, 0);
  assert.equal(submitted[0].stream, true);
  const result = await sched.result(ticket.jobId);
  assert.equal(result.state, "done", JSON.stringify(result.error));

  const { messages } = svc.getThread(thread.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].blocks[0].type, "passage", "thread seed becomes a passage block on the first message");
  const answer = messages[1];
  assert.equal(answer.proposal?.status, "pending");
  assert.equal(applied.length, 0, "nothing applied before the user confirms");

  const res = await svc.decideProposal(answer.id, "apply");
  assert.equal(res.applied, 1);
  assert.equal(applied.length, 1);
  assert.equal(svc.threads.getMessage(answer.id)!.proposal?.status, "applied");
  // Deciding again is a no-op.
  assert.equal((await svc.decideProposal(answer.id, "apply")).applied, 0);
  assert.equal(applied.length, 1);
});

test("service: AI channels reject until the scheduler is configured", async () => {
  const db = await openSqlJsDb();
  runMigrations(db, [{ area: "assistant", migrations: assistantMigrations }], () => {});
  const svc = new AssistantService(db);
  const t = svc.createThread({ filePath: FILE, mode: "chat" });
  assert.throws(() => svc.send({ threadId: t.id, text: "hi" }), /not available yet/);
  assert.equal(svc.listThreads(FILE).length, 1);
});
