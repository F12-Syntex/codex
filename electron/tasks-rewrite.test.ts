/**
 * WS-D: `chapter.condense` (rewrite layer) — key-preserving chunks, truncation split, retention
 * guard, dialogue guard, pass-through. Runs the task against WS-A's fake TaskContext.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTaskContext, makeSourceChapter } from "./ai/testing";
import { runRewrite, type RewriteInput } from "./ai/tasks/condense";
import type { CompletionRequest } from "./ai/client";

/** `n` distinct words: "w0 w1 … w(n-1)". */
const words = (n: number, prefix = "w") => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");

function inputOf(paragraphs: string[], mode: RewriteInput["mode"] = "concise"): RewriteInput {
  const ch = makeSourceChapter(0, paragraphs);
  return {
    mode,
    book: "Test Book",
    sourceHash: ch.sourceHash,
    paras: ch.paras.map((p) => ({ id: p.id, kind: p.kind, text: p.text, html: p.html })),
  };
}

/** The `{alias: text}` payload the task sent in this request. */
function sent(req: CompletionRequest): Record<string, string> {
  const user = [...req.messages].reverse().find((m) => m.role === "user" && m.content.includes('{"paras"'))!.content;
  return (JSON.parse(user.slice(user.lastIndexOf('{"paras"'))) as { paras: Record<string, string> }).paras;
}

/** Reply that maps every sent paragraph through `fn` (keys preserved). */
const mapReply = (fn: (text: string, key: string) => string | null) => (req: CompletionRequest) =>
  JSON.stringify({ paras: Object.fromEntries(Object.entries(sent(req)).map(([k, t]) => [k, fn(t, k)])) });

/** Drop the last `pct` of each paragraph's words. */
const trim = (pct: number) => (t: string) => {
  const w = t.split(" ");
  return w.slice(0, Math.max(1, Math.round(w.length * (1 - pct)))).join(" ");
};

test("rewrite: reply keys differ from input (even after the one re-ask) → originals kept for the chunk", async () => {
  const input = inputOf([words(30, "a"), words(30, "b")]);
  const { ctx, provider } = createTaskContext({ task: "chapter.condense" });
  const wrongKeys = JSON.stringify({ paras: { "1": trim(0.15)(words(30, "a")), "7": "invented" } });
  provider.enqueue(wrongKeys, wrongKeys);
  const out = await runRewrite(input, ctx);
  assert.equal(provider.calls.length, 2, "one call plus exactly one re-ask");
  for (const p of input.paras) assert.deepEqual(out.paras[p.id], { html: p.html });
  assert.equal(out.stats.rejectedChunks, 1);
  assert.equal(out.stats.rewritten, 0);
});

test("rewrite: a key mismatch fixed by the re-ask is accepted", async () => {
  const input = inputOf([words(30, "a"), words(30, "b")]);
  const { ctx, provider } = createTaskContext({ task: "chapter.condense" });
  provider.enqueue(JSON.stringify({ paras: { "1": "x" } }), mapReply(trim(0.15)));
  const out = await runRewrite(input, ctx);
  assert.equal(out.stats.rewritten, 2);
  assert.match((out.paras[input.paras[0].id] as { html: string }).html, /^<p>a0 a1/);
});

test("rewrite: every source paragraph gets exactly one entry (1:1, keyed by ParaId)", async () => {
  const input = inputOf([words(30, "a"), "“Hi.”", words(30, "b")]);
  const { ctx, provider } = createTaskContext({ task: "chapter.condense" });
  provider.enqueue(mapReply(trim(0.15)));
  const out = await runRewrite(input, ctx);
  assert.deepEqual(Object.keys(out.paras).sort(), input.paras.map((p) => p.id).sort());
});

test("rewrite: truncated → chunk split in half and each half retried", async () => {
  const input = inputOf([words(30, "a"), words(30, "b"), words(30, "c"), words(30, "d")]);
  const { ctx, provider } = createTaskContext({ task: "chapter.condense" });
  provider.enqueue({ fail: { kind: "length" } }, mapReply(trim(0.15)), mapReply(trim(0.15)));
  const out = await runRewrite(input, ctx);
  assert.equal(provider.calls.length, 3);
  assert.deepEqual(Object.keys(sent(provider.calls[1])), ["1", "2"], "first half, re-keyed");
  assert.deepEqual(Object.keys(sent(provider.calls[2])), ["1", "2"], "second half, re-keyed");
  assert.equal(out.stats.splits, 1);
  assert.equal(out.stats.rewritten, 4);
  for (const p of input.paras) assert.notDeepEqual(out.paras[p.id], { html: p.html });
});

test("rewrite: a single paragraph that still truncates keeps its original", async () => {
  const input = inputOf([words(50)]);
  const { ctx, provider } = createTaskContext({ task: "chapter.condense" });
  provider.enqueue({ fail: { kind: "length" } });
  const out = await runRewrite(input, ctx);
  assert.deepEqual(out.paras[input.paras[0].id], { html: input.paras[0].html });
});

test("rewrite: retention ratio guard (concise 0.75–0.95)", async () => {
  const input = inputOf([words(60, "a"), words(60, "b")]);

  const ok = createTaskContext({ task: "chapter.condense" });
  ok.provider.enqueue(mapReply(trim(0.15))); // ratio 0.85
  assert.equal((await runRewrite(input, ok.ctx)).stats.rewritten, 2);

  const tooShort = createTaskContext({ task: "chapter.condense" });
  tooShort.provider.enqueue(mapReply(trim(0.5))); // ratio 0.5 → summarised, not condensed
  const r1 = await runRewrite(input, tooShort.ctx);
  assert.equal(r1.stats.rewritten, 0);
  assert.equal(r1.stats.rejectedChunks, 1);
  for (const p of input.paras) assert.deepEqual(r1.paras[p.id], { html: p.html });

  const unchanged = createTaskContext({ task: "chapter.condense" });
  unchanged.provider.enqueue(mapReply((t) => `${t} extra`)); // ratio > 0.95
  assert.equal((await runRewrite(input, unchanged.ctx)).stats.rejectedChunks, 1);
});

test("rewrite: polish requires ≥ 0.97 retention", async () => {
  const input = inputOf([words(60, "a"), words(60, "b")], "polish");
  const cut = createTaskContext({ task: "chapter.condense" });
  cut.provider.enqueue(mapReply(trim(0.1)));
  assert.equal((await runRewrite(input, cut.ctx)).stats.rejectedChunks, 1);

  const fix = createTaskContext({ task: "chapter.condense" });
  fix.provider.enqueue(mapReply((t) => t.replace("a3 ", "A3 ").replace("b3 ", "B3 ")));
  const out = await runRewrite(input, fix.ctx);
  assert.equal(out.stats.rewritten, 2);
  assert.equal(out.stats.rejectedChunks, 0);
});

test("rewrite: dialogue-only paragraphs are never sent; changed dialogue keeps the original paragraph", async () => {
  const said = `“We leave at dawn,” Mara said, ${words(30, "m")}`;
  const input = inputOf(["“No.”", said, words(30, "n")]);
  const { ctx, provider } = createTaskContext({ task: "chapter.condense" });
  provider.enqueue(mapReply((t) => (t.startsWith("“") ? `“We go at dawn,” Mara said, ${trim(0.15)(words(30, "m"))}` : trim(0.15)(t))));
  const out = await runRewrite(input, ctx);
  const payload = sent(provider.calls[0]);
  assert.equal(Object.keys(payload).length, 2, "the dialogue-only paragraph was passed through");
  assert.ok(!Object.values(payload).includes("“No.”"));
  assert.deepEqual(out.paras[input.paras[0].id], { html: input.paras[0].html });
  assert.deepEqual(out.paras[input.paras[1].id], { html: input.paras[1].html }, "dialogue changed → original kept");
  assert.notDeepEqual(out.paras[input.paras[2].id], { html: input.paras[2].html });
});

test("rewrite: null drops a paragraph only in concise mode and never one with dialogue", async () => {
  const input = inputOf([words(40, "a"), words(10, "b"), `“Stay.” ${words(10, "c")}`]);
  const { ctx, provider } = createTaskContext({ task: "chapter.condense" });
  provider.enqueue(mapReply((t, k) => (k === "1" ? t : null)));
  const out = await runRewrite(input, ctx);
  assert.deepEqual(out.paras[input.paras[1].id], { dropped: true });
  assert.deepEqual(out.paras[input.paras[2].id], { html: input.paras[2].html }, "dialogue paragraph is never dropped");

  const polish = inputOf([words(20, "a"), words(5, "b")], "polish");
  const p = createTaskContext({ task: "chapter.condense" });
  p.provider.enqueue(mapReply((t, k) => (k === "1" ? t : null)));
  const pout = await runRewrite(polish, p.ctx);
  assert.deepEqual(pout.paras[polish.paras[1].id], { html: polish.paras[1].html }, "polish never drops");
});

test("rewrite: rewritten text is html-escaped; chunks are resumable through memo", async () => {
  const input = inputOf([`${words(30)} <b>`]);
  const memo = new Map<string, unknown>();
  const a = createTaskContext({ task: "chapter.condense", memo });
  a.provider.enqueue(mapReply((t) => trim(0.1)(t.replace(" <b>", "")) + " <i>"));
  const out = await runRewrite(input, a.ctx);
  assert.match((out.paras[input.paras[0].id] as { html: string }).html, /&lt;i&gt;<\/p>$/);

  const b = createTaskContext({ task: "chapter.condense", memo });
  const again = await runRewrite(input, b.ctx);
  assert.equal(b.provider.calls.length, 0, "served from the chunk memo");
  assert.deepEqual(again.paras, out.paras);
});
