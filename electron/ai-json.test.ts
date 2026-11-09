/**
 * WS-A: loose JSON parsing (shared/ai/json.ts), the validator (shared/ai/validate.ts),
 * completeJson's re-ask and the hash helpers.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonLoose, repairJson, JsonParseError } from "./shared/ai/json";
import { s, validate, formatIssues, type Infer } from "./shared/ai/validate";
import { fnv1a64, fnv1a64Base36, hashOf, stableStringify } from "./shared/ai/hash";
import { createTaskContext } from "./ai/testing";
import { AIError } from "./ai/errors";

// ── Extraction ──────────────────────────────────────────────────────────────

test("json: plain, fenced and unterminated fences", () => {
  assert.deepEqual(parseJsonLoose('{"a":1}').value, { a: 1 });
  const fenced = parseJsonLoose('Here you go:\n```json\n{"a": [1, 2]}\n```\nHope that helps!');
  assert.deepEqual(fenced.value, { a: [1, 2] });
  assert.ok(fenced.notes.includes("fence"));
  assert.deepEqual(parseJsonLoose("```\n[1,2,3]\n```").value, [1, 2, 3]);
  const open = parseJsonLoose('```json\n{"titles": {"c1": "The Gate"}}');
  assert.deepEqual(open.value, { titles: { c1: "The Gate" } });
});

test("json: preamble, trailing commentary and <think> blocks", () => {
  const r = parseJsonLoose('Sure! The JSON is {"ok": true} — let me know if you need more {braces}.');
  assert.deepEqual(r.value, { ok: true });
  assert.ok(r.notes.includes("preamble"));
  assert.deepEqual(parseJsonLoose('<think>maybe {"x": 0}?</think>{"x": 1}').value, { x: 1 });
  assert.throws(() => parseJsonLoose("no json here at all"), JsonParseError);
});

// ── Repair ──────────────────────────────────────────────────────────────────

test("json: unescaped inner quotes", () => {
  const r = parseJsonLoose('{"text": "He said "no" twice", "n": 2}');
  assert.deepEqual(r.value, { text: 'He said "no" twice', n: 2 });
  assert.ok(r.notes.includes("inner-quotes"));
  // a quoted phrase followed by a comma inside prose
  const r2 = parseJsonLoose('{"text": "She whispered "wait," then ran.", "ok": true}');
  assert.deepEqual(r2.value, { text: 'She whispered "wait," then ran.', ok: true });
  // inner quotes in arrays of strings
  assert.deepEqual(parseJsonLoose('["a "b" c", "d"]').value, ['a "b" c', "d"]);
});

test("json: raw control characters and bad escapes inside strings", () => {
  const r = parseJsonLoose('{"html": "<p>line one\nline\ttwo</p>", "path": "C:\\q"}');
  assert.deepEqual(r.value, { html: "<p>line one\nline\ttwo</p>", path: "C:\\q" });
  assert.ok(r.notes.includes("control-chars"));
  assert.ok(r.notes.includes("bad-escape"));
});

test("json: trailing commas, missing commas, comments, unquoted keys, python literals", () => {
  assert.deepEqual(parseJsonLoose('{"a": [1, 2, ], "b": 3, }').value, { a: [1, 2], b: 3 });
  assert.deepEqual(parseJsonLoose('[{"a":1}{"a":2}]').value, [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parseJsonLoose('{"a": 1 // one\n, /* two */ "b": 2}').value, { a: 1, b: 2 });
  assert.deepEqual(parseJsonLoose("{a: 1, b: True, c: None}").value, { a: 1, b: true, c: null });
});

test("json: truncated object keeps complete pairs only", () => {
  const r = parseJsonLoose('{"p1": "First.", "p2": "Second.", "p3": "Thi');
  assert.equal(r.truncated, true);
  assert.deepEqual(r.value, { p1: "First.", p2: "Second." });
  // cut mid-key and mid-colon
  assert.deepEqual(parseJsonLoose('{"a": 1, "b').value, { a: 1 });
  assert.deepEqual(parseJsonLoose('{"a": 1, "b":').value, { a: 1 });
  // a number cut at the end is dropped (it may be incomplete)
  assert.deepEqual(parseJsonLoose('{"a": 1, "b": 12').value, { a: 1 });
});

test("json: truncated array keeps complete items", () => {
  const r = parseJsonLoose('[{"id": 1}, {"id": 2}, {"id": 3, "na');
  assert.equal(r.truncated, true);
  assert.deepEqual(r.value, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(parseJsonLoose('["a", "b", "c').value, ["a", "b"]);
  assert.deepEqual(parseJsonLoose("[").value, []);
});

test("json: truncated nested batch salvages complete items at every level", () => {
  const text = '```json\n{"comments": [{"paraId": "p1", "text": "Nice."}, {"paraId": "p2", "text": "Om';
  const r = parseJsonLoose(text);
  assert.equal(r.truncated, true);
  assert.deepEqual(r.value, { comments: [{ paraId: "p1", text: "Nice." }] });
  const deep = parseJsonLoose('{"book": {"chapters": [{"id": "c1", "paras": {"p1": "x"}}, {"id": "c2", "paras": {"p1": "y", "p2"');
  // array items are atomic: the half-written chapter c2 is dropped, c1 survives
  assert.deepEqual(deep.value, { book: { chapters: [{ id: "c1", paras: { p1: "x" } }] } });
  // a top-level object keeps its complete pairs, even nested in objects
  assert.deepEqual(parseJsonLoose('{"paras": {"p1": "a", "p2": "b", "p3": "c').value, { paras: { p1: "a", p2: "b" } });
  // an array opened right before the cut stays as an empty array
  assert.deepEqual(parseJsonLoose('{"meta": {"n": 1}, "items": [').value, { meta: { n: 1 }, items: [] });
});

test("json: [[…]] flattening at the top level (opt-out) and through the schema", () => {
  assert.deepEqual(parseJsonLoose('[[{"a":1},{"a":2}],[{"a":3}]]').value, [{ a: 1 }, { a: 2 }, { a: 3 }]);
  assert.deepEqual(parseJsonLoose("[[1,2]]", { flatten: false }).value, [[1, 2]]);
  const Sch = s.object({ items: s.array(s.object({ a: s.number() }), { flatten: true }) });
  const r = Sch.parse({ items: [[{ a: 1 }], [{ a: 2 }]] });
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.value, { items: [{ a: 1 }, { a: 2 }] });
});

test("json: repairJson reports where the value ended", () => {
  const r = repairJson('{"a": 1} trailing');
  assert.equal(r.text, '{"a":1}');
  assert.equal(r.end, 8);
});

// ── Validator ───────────────────────────────────────────────────────────────

const Comments = s.object({
  comments: s.array(s.object({ paraId: s.string({ min: 1 }), text: s.string({ min: 1, max: 200 }) }), { salvage: true }),
  mood: s.optional(s.enum(["calm", "tense"] as const)),
});
type Comments = Infer<typeof Comments>;

test("validate: issues carry paths; objects strip unknown keys", () => {
  const r = validate(s.object({ a: s.number(), b: s.array(s.string()) }), { a: "x", b: ["ok", 3], extra: 1 });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.issues.some((i) => i.path === "$.a"));
  const ok = validate(s.object({ a: s.number() }), { a: 1, chatter: "hi" });
  assert.deepEqual(ok.ok && ok.value, { a: 1 });
  assert.match(formatIssues([{ path: "$.a", message: "expected number" }]), /\$\.a: expected number/);
});

test("validate: salvage drops invalid items and records them; enums are case-insensitive", () => {
  const r = Comments.parse({ comments: [{ paraId: "p1", text: "Good" }, { paraId: "", text: "bad" }, { text: "no id" }], mood: "TENSE" });
  assert.ok(r.ok);
  const v = (r.ok && r.value) as Comments;
  assert.deepEqual(v.comments, [{ paraId: "p1", text: "Good" }]);
  assert.equal(v.mood, "tense");
  assert.equal(r.issues.length, 2);
  assert.ok(r.issues.every((i) => /dropped/.test(i.message)));
});

test("validate: record with an exact key set (rewrite chunks) and coercion", () => {
  const Paras = s.record(s.nullable(s.string()), { keys: ["p1", "p2"] });
  assert.equal(Paras.parse({ p1: "a" }).ok, false); // missing key
  assert.equal(Paras.parse({ p1: "a", p2: null, p3: "x" }).ok, false); // extra key
  assert.ok(Paras.parse({ p1: "a", p2: null }).ok);
  const Drop = s.record(s.string(), { keys: ["p1"], dropExtra: true });
  assert.deepEqual(Drop.parse({ p1: "a", zz: "b" }).ok && Drop.parse({ p1: "a", zz: "b" }), { ok: true, value: { p1: "a" }, issues: [{ path: '$["zz"]', message: "unexpected key (dropped)" }] });
  assert.deepEqual(s.number({ coerce: true, int: true }).parse("4"), { ok: true, value: 4, issues: [] });
  assert.equal(s.number().parse("4").ok, false);
  assert.deepEqual(s.object({ x: s.withDefault(s.number(), 7) }).parse({}), { ok: true, value: { x: 7 }, issues: [] });
});

test("validate: jsonSchema renders a usable schema", () => {
  const js = Comments.jsonSchema() as { type: string; required: string[]; properties: Record<string, { type?: string }> };
  assert.equal(js.type, "object");
  assert.deepEqual(js.required, ["comments"]);
  assert.equal(js.properties.comments.type, "array");
});

// ── completeJson (re-ask) ───────────────────────────────────────────────────

test("completeJson: one re-ask with issues fed back, then success", async () => {
  const { ctx, provider } = createTaskContext({ task: "chapter.comments" });
  provider.enqueue('{"comments": "not an array"}', '{"comments": [{"paraId": "p1", "text": "Fine."}]}');
  const r = await ctx.completeJson({ messages: [{ role: "user", content: "comment" }], schema: Comments });
  assert.deepEqual(r.value.comments, [{ paraId: "p1", text: "Fine." }]);
  assert.equal(provider.calls.length, 2);
  const reask = provider.calls[1].messages.at(-1)!.content;
  assert.match(reask, /\$\.comments: expected array/);
  assert.deepEqual(provider.calls[0].json, { mode: "object" });
});

test("completeJson: fails with validation after the single re-ask; parse errors map to parse", async () => {
  const { ctx, provider } = createTaskContext();
  provider.enqueue('{"comments": 1}', '{"comments": 2}', "{}");
  await assert.rejects(ctx.completeJson({ messages: [{ role: "user", content: "x" }], schema: Comments }), (e: unknown) => e instanceof AIError && e.code === "validation");
  assert.equal(provider.calls.length, 2);

  const t2 = createTaskContext();
  t2.provider.enqueue("I cannot do that.", "Still no JSON.");
  await assert.rejects(t2.ctx.completeJson({ messages: [{ role: "user", content: "x" }] }), (e: unknown) => e instanceof AIError && e.code === "parse");
});

test("completeJson: semantic check triggers the re-ask; truncation propagates without re-ask", async () => {
  const { ctx, provider } = createTaskContext();
  provider.enqueue('{"comments": []}', '{"comments": [{"paraId":"p1","text":"ok"}]}');
  const r = await ctx.completeJson({
    messages: [{ role: "user", content: "x" }],
    schema: Comments,
    check: (v) => (v.comments.length ? undefined : ["at least one comment is required"]),
  });
  assert.equal(r.value.comments.length, 1);

  const t = createTaskContext();
  t.provider.failNext({ kind: "length", text: '{"comments": [{"paraId":"p1","text":"ok"}, {"pa' });
  await assert.rejects(t.ctx.completeJson({ messages: [{ role: "user", content: "x" }], schema: Comments }), (e: unknown) => {
    assert.ok(e instanceof AIError && e.code === "truncated");
    // the partial completion is attached so the task can salvage or split
    assert.deepEqual(parseJsonLoose(e.partial!.text).value, { comments: [{ paraId: "p1", text: "ok" }] });
    return true;
  });
  assert.equal(t.provider.calls.length, 1);
});

// ── Hash ────────────────────────────────────────────────────────────────────

test("hash: fnv1a64 reference vectors, unicode and stable key order", () => {
  assert.equal(fnv1a64(""), "cbf29ce484222325");
  assert.equal(fnv1a64("a"), "af63dc4c8601ec8c");
  assert.equal(fnv1a64("foobar"), "85944171f73967e8");
  assert.notEqual(fnv1a64("é"), fnv1a64("e"));
  assert.equal(fnv1a64("😀").length, 16);
  assert.equal(BigInt(`0x${fnv1a64("a")}`).toString(36), fnv1a64Base36("a"));
  assert.equal(stableStringify({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } }), '{"a":{"d":[1,{"y":2,"z":1}]},"b":1}');
  assert.equal(hashOf("x", { b: 1, a: 2 }), hashOf("x", { a: 2, b: 1 }));
  assert.notEqual(hashOf("ab", "c"), hashOf("a", "bc"));
});
