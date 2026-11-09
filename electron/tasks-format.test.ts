/**
 * WS-D: `chapter.format` (markup-only layer) — mergedInto mapping, text-preservation reject,
 * speaker-badge normalisation (`data-tts-skip`), sanitizer, truncation split.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTaskContext } from "./ai/testing";
import {
  sanitizeFormatted, mapFormatReply, normalizeSpeakerBadges, preservesText, runFormat, type FormatInput,
  type FormatParaInput, type FormatStats,
} from "./ai/tasks/format";
import { visibleText } from "./ai/prompts/util";
import type { CompletionRequest } from "./ai/client";

const para = (id: string, text: string): FormatParaInput => ({ id, html: `<p>${text}</p>` });
const stats = (): FormatStats => ({ sent: 0, changed: 0, merged: 0, rejected: 0, splits: 0 });

test("format: {mergedInto} maps aliases back to ParaIds; host keeps the combined html", () => {
  const chunk = [para("pA.0", "HP 450"), para("pB.0", "ATK 82"), para("pC.0", "He looked at the screen.")];
  const out = mapFormatReply(chunk, {
    "1": '<div class="ai-fmt-stat-block"><div class="ai-fmt-stat-row">HP 450</div><div class="ai-fmt-stat-row">ATK 82</div></div>',
    "2": { mergedInto: "1" },
  });
  assert.deepEqual(Object.keys(out).sort(), ["pA.0", "pB.0"]);
  assert.match((out["pA.0"] as { html: string }).html, /^<div class="ai-fmt-stat-block">/);
  assert.deepEqual(out["pB.0"], { mergedInto: "pA.0" });
  assert.equal(out["pC.0"], undefined, "unchanged paragraphs are omitted (sparse layer)");
});

test("format: legacy '' marker merges into the nearest earlier host; invalid merges are ignored", () => {
  const chunk = [para("p1", "HP 1"), para("p2", "MP 2"), para("p3", "SP 3"), para("p4", "Narration here.")];
  const legacy = mapFormatReply(chunk, { "1": "<div class=\"ai-fmt-stat-block\">HP 1 MP 2 SP 3</div>", "2": "", "3": "" });
  assert.deepEqual(legacy.p2, { mergedInto: "p1" });
  assert.deepEqual(legacy.p3, { mergedInto: "p1" });

  // Forward merge, merge into a non-host, merge into an unknown key: all ignored.
  const bad = mapFormatReply(chunk, { "2": { mergedInto: "3" }, "3": { mergedInto: "9" }, "4": { mergedInto: "1" } });
  assert.deepEqual(bad, {});
});

test("format: text-preservation check rejects reworded paragraphs (and their merges)", () => {
  const chunk = [para("p1", "The old man walked slowly to the gate and stopped."), para("p2", "Level 5")];
  const s = stats();
  const out = mapFormatReply(chunk, {
    "1": "<p>The elderly gentleman strolled to the gate.</p>",
    "2": '<span class="ai-fmt-xp-badge">Level 5</span>',
  }, undefined, s);
  assert.equal(out.p1, undefined, "prose edits are not allowed in the format layer");
  assert.deepEqual(out.p2, { html: '<span class="ai-fmt-xp-badge">Level 5</span>' });
  assert.equal(s.rejected, 1);

  const merged = mapFormatReply([para("a", "STR 10"), para("b", "DEX 12")], { "1": "<div>STR 10</div>", "2": { mergedInto: "1" } });
  assert.deepEqual(merged, {}, "a host that loses a merged paragraph's text is rejected with its merges");
  assert.ok(preservesText(["<p>STR 10</p>", "<p>DEX 12</p>"], '<div class="ai-fmt-stat-block">STR 10 DEX 12</div>'));
});

test("format: a speaker badge before a quote gets data-tts-skip and does not count as added text", () => {
  const chunk = [para("p1", "“Hello there,” she said.")];
  const out = mapFormatReply(chunk, { "1": '<p><span class="ai-fmt-dialogue-hero">Kim</span> “Hello there,” she said.</p>' });
  const html = (out.p1 as { html: string }).html;
  assert.equal(html, '<p><span class="ai-fmt-dialogue-hero" data-tts-skip>Kim</span> “Hello there,” she said.</p>');
  assert.equal(visibleText(html), "“Hello there,” she said.");
});

test("format: badges not followed by a quote are unwrapped; badges that swallowed the quote are split", () => {
  assert.equal(
    normalizeSpeakerBadges('<p><span class="ai-fmt-dialogue-hero">Kim</span> walked in.</p>'),
    "<p>Kim walked in.</p>",
  );
  assert.equal(
    normalizeSpeakerBadges('<p><span class="ai-fmt-dialogue-villain">Vorn “Kneel.”</span></p>'),
    '<p><span class="ai-fmt-dialogue-villain" data-tts-skip>Vorn</span> “Kneel.”</p>',
  );
  // Narration mention, already in the source text: unwrapping keeps the text identical → omitted.
  const out = mapFormatReply([para("p1", "Kim walked in.")], { "1": '<p><span class="ai-fmt-dialogue-hero">Kim</span> walked in.</p>' });
  assert.deepEqual(out, {});
});

test("format: sanitizer keeps only allowlisted tags, ai-fmt-* classes and data:image sources", () => {
  assert.equal(
    sanitizeFormatted('<p onclick="x()" class="ai-fmt-thought evil" style="color:red">Hi<script>alert(1)</script></p>'),
    '<p class="ai-fmt-thought">Hi</p>',
  );
  assert.equal(sanitizeFormatted('<img src="x" onerror="alert(1)"><a href="javascript:x">link</a>'), "link");
  assert.equal(sanitizeFormatted('<iframe src="//evil"><p>in</p></iframe><svg onload=x><circle/></svg>ok'), "ok");
  assert.equal(sanitizeFormatted('<img src="data:image/png;base64,AAAA" alt="a">'), '<img src="data:image/png;base64,AAAA" alt="a">');
  const out = mapFormatReply([para("p1", "Danger")], { "1": '<div class="ai-fmt-system-msg" onmouseover="steal()">Danger</div>' });
  assert.deepEqual(out.p1, { html: '<div class="ai-fmt-system-msg">Danger</div>' });
});

function sentParas(req: CompletionRequest): Record<string, string> {
  const user = req.messages.filter((m) => m.role === "user").pop()!.content;
  return (JSON.parse(user.slice(user.lastIndexOf('{"paras"'))) as { paras: Record<string, string> }).paras;
}

test("format: runFormat chunks, splits on truncation and returns a sparse ParaId-keyed layer", async () => {
  const paras = Array.from({ length: 4 }, (_, i) => para(`p${i}`, `System notice ${i}`));
  const input: FormatInput = { book: "B", base: "source", baseHash: "h", paras, speakers: [{ name: "Kim", class: "ai-fmt-dialogue-hero" }], styleRules: "" };
  const { ctx, provider } = createTaskContext({ task: "chapter.format", role: "format" });
  const wrap = (req: CompletionRequest) =>
    JSON.stringify({ paras: Object.fromEntries(Object.entries(sentParas(req)).map(([k, h]) => [k, `<div class="ai-fmt-system-msg">${visibleText(h)}</div>`])) });
  provider.enqueue({ fail: { kind: "length" } }, wrap, wrap);
  const out = await runFormat(input, ctx);
  assert.equal(provider.calls.length, 3);
  assert.equal(out.stats.splits, 1);
  assert.deepEqual(Object.keys(out.paras).sort(), ["p0", "p1", "p2", "p3"]);
  assert.match(provider.calls[0].messages[0].content, /Kim: ALWAYS use `ai-fmt-dialogue-hero`/, "speakers reach the prompt");
});
