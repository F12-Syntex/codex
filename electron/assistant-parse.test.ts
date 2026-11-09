/**
 * WS-E: assistant answer protocol — citation and entity markers (validated against the frontier),
 * streaming previews, the Markdown subset, and the thread/branch stores.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAssistantText, streamingPreview, stripPartialMarker, normalizeChapterLabel, STREAM_RESET, type MarkerResolver,
} from "./shared/assistant/markers";
import { parseMarkdown, parseInline, markdownToPlainText } from "./shared/assistant/markdown";
import { chapterVisibility, visibleParaCount } from "./shared/assistant/frontier";
import { BookView } from "./assistant/book-view";
import { FILE, FRONTIER, fakeBooks, makeBook } from "./assistant/fixtures";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations } from "./db/migrate";
import { assistantMigrations } from "./assistant/schema";
import { BranchStore, ThreadStore, DEFAULT_THREAD_TITLE, titleFromText } from "./assistant/store";
import { parseBranchResponse, extractVoiceLines } from "./ai/tasks/simulate";
import { toSafeParagraphs } from "./assistant/text";
import { normalizeDefine } from "./ai/tasks/define";
import { resolveSpeaker } from "./ai/tasks/quote";

/** Chapters "1".."3" readable; paragraph ordinal ≤ 5 except chapter "3" (≤ 2). */
const simpleResolver: MarkerResolver = {
  resolveCite(label, ord) {
    const ch = Number(label);
    if (!(ch >= 1 && ch <= 3) || ord > (ch === 3 ? 2 : 5)) return null;
    return { ref: { filePath: FILE, chapterId: `c${ch}`, paraId: `p${ch}_${ord}` }, chapterIndex: ch - 1 };
  },
  isEntityVisible: (id) => id === "mira",
};

test("cite markers become numbered chips; repeats share a number; past-frontier cites are dropped", () => {
  const r = parseAssistantText("A [[cite:1:2]]. B [[cite:2:3]][[cite:1:2]]. C [[cite:3:4]]. D [[cite:9:1]].", simpleResolver);
  assert.equal(r.markdown, "A [^1]. B [^2][^1]. C. D.");
  assert.deepEqual(r.citations.map((c) => c.label), ["Ch 1 ¶2", "Ch 2 ¶3"]);
  assert.deepEqual(r.citations[0].ref, { filePath: FILE, chapterId: "c1", paraId: "p1_2" });
  assert.equal(r.dropped.cites, 2);
});

test("entity markers: visible → link, hidden → plain name", () => {
  const r = parseAssistantText("[[entity:mira|Mira]] met [[entity:orren|Orren]] and [[entity:mira|the thief]].", simpleResolver);
  assert.equal(r.markdown, "[Mira](entity:mira) met Orren and [the thief](entity:mira).");
  assert.deepEqual(r.entityLinks, ["mira"]);
  assert.equal(r.dropped.entities, 1);
});

test("marker syntax is tolerant of spacing and case, and malformed markers never leak", () => {
  const r = parseAssistantText("x [[ Cite : 2 : 1 ]] y [[cite:oops]] z [[entity:]] w", simpleResolver);
  assert.equal(r.markdown, "x [^1] y z w");
  assert.equal(r.citations.length, 1);
});

test("streaming preview hides cites, unwraps entities, cuts partial markers and honours resets", () => {
  assert.equal(streamingPreview("Hi [[entity:mira|Mira]] [[cite:1:2]]. More [[ci"), "Hi Mira. More ");
  assert.equal(streamingPreview(`thinking…${STREAM_RESET}Answer`), "Answer");
  assert.equal(stripPartialMarker("abc ["), "abc ");
  assert.equal(stripPartialMarker("abc [[cite:1:2]] d"), "abc [[cite:1:2]] d");
});

test("chapter labels normalise", () => {
  assert.equal(normalizeChapterLabel("Chapter 12"), "12");
  assert.equal(normalizeChapterLabel("ch.7"), "7");
  assert.equal(normalizeChapterLabel(3), "3");
  assert.equal(normalizeChapterLabel("Prologue"), "Prologue");
});

test("BookView resolver: cites into the current chapter stop at the frontier paragraph", async () => {
  const view = await new BookView(FILE, FRONTIER, fakeBooks(makeBook())).load();
  const r = parseAssistantText("ok [[cite:3:3]] no [[cite:3:4]] no [[cite:4:1]] ok [[cite:1:5]]", view.resolver(() => true));
  assert.deepEqual(r.citations.map((c) => c.ref.paraId), ["p2_2", "p0_4"]);
  assert.match(r.citations[0].snippet!, /^c2p2/);
  assert.equal(r.dropped.cites, 2);
});

test("frontier helpers", () => {
  const ch = makeBook().chapters[2];
  assert.equal(chapterVisibility(FRONTIER, 1), "full");
  assert.equal(chapterVisibility(FRONTIER, 2), "partial");
  assert.equal(chapterVisibility(FRONTIER, 3), "none");
  assert.equal(visibleParaCount(FRONTIER, ch), 3);
  assert.equal(visibleParaCount({ ...FRONTIER, paraId: "missing" }, ch), 0, "unknown paraId fails closed");
  assert.equal(visibleParaCount({ chapterIndex: -1, mode: "off" }, ch), 5);
});

// ── Markdown subset ─────────────────────────────────────────────────────────

test("markdown: blocks, inline emphasis, entity links and cite chips", () => {
  const blocks = parseMarkdown("### Who\n\n**Mira** is *clever* [^1].\nNext line\n\n- one [Mira](entity:mira)\n- two `code`\n\n1. a\n2. b\n\n> quoted\n\n```\nraw *x*\n```");
  assert.deepEqual(blocks.map((b) => b.t), ["h", "p", "list", "list", "quote", "code"]);
  const p = blocks[1] as Extract<(typeof blocks)[number], { t: "p" }>;
  assert.deepEqual(p.c.map((n) => n.t), ["strong", "text", "em", "text", "cite", "text", "br", "text"]);
  const ul = blocks[2] as Extract<(typeof blocks)[number], { t: "list" }>;
  assert.equal(ul.ordered, false);
  assert.deepEqual(ul.items[0][1], { t: "entity", id: "mira", name: "Mira" });
  assert.equal((blocks[3] as { ordered: boolean }).ordered, true);
  assert.equal((blocks[5] as { v: string }).v, "raw *x*");
});

test("markdown: non-entity links render as text; snake_case is not emphasis", () => {
  assert.deepEqual(parseInline("[site](https://evil.example) snake_case_name"), [{ t: "text", v: "site snake_case_name" }]);
  assert.equal(markdownToPlainText("**A** [B](entity:b) [^2]\n\n- c"), "A B\n\n• c");
});

// ── Stores ──────────────────────────────────────────────────────────────────

async function db() {
  const d = await openSqlJsDb();
  const rep = runMigrations(d, [{ area: "assistant", migrations: assistantMigrations }], () => {});
  assert.equal(rep.errors.length, 0);
  return d;
}

test("thread store: create, auto-title from first question, ordered messages, update, cascade delete", async () => {
  const d = await db();
  let n = 0;
  const s = new ThreadStore(d, { now: () => ++n * 10, newId: () => `id${n}` });
  const t = s.createThread({ filePath: FILE, mode: "chat" });
  assert.equal(t.title, DEFAULT_THREAD_TITLE);
  s.appendMessage(t.id, { role: "user", blocks: [{ type: "markdown", text: "Who is the masked figure in the tower?" }], citations: [], entityLinks: [], status: "done" });
  const a = s.appendMessage(t.id, { role: "assistant", blocks: [], citations: [], entityLinks: [], status: "streaming" });
  assert.equal(s.getThread(t.id)!.title, "Who is the masked figure in the tower?");
  s.updateMessage(a.id, { status: "done", blocks: [{ type: "markdown", text: "Unknown so far." }] });
  assert.deepEqual(s.messages(t.id).map((m) => m.role), ["user", "assistant"]);
  assert.equal(s.messages(t.id)[1].status, "done");
  const t2 = s.createThread({ filePath: FILE, mode: "explain", seed: { selection: { ref: { filePath: FILE, chapterId: "c1", paraId: "p" }, text: "a selected sentence" } } });
  assert.equal(t2.title, "a selected sentence");
  assert.equal(s.getSeed(t2.id)?.selection?.text, "a selected sentence");
  assert.equal(s.listThreads(FILE)[0].id, t2.id, "most recent first");
  assert.equal(s.deleteThread(t.id), true);
  assert.equal(s.messages(t.id).length, 0);
  assert.equal(s.listThreads(FILE).length, 1);
});

test("thread store: dangling streams become errors", async () => {
  const d = await db();
  const s = new ThreadStore(d);
  const t = s.createThread({ filePath: FILE, mode: "chat" });
  const a = s.appendMessage(t.id, { role: "assistant", blocks: [], citations: [], entityLinks: [], status: "streaming" });
  assert.equal(s.failDanglingStreams(), 1);
  assert.equal(s.getMessage(a.id)!.status, "error");
});

test("titleFromText clips on a word boundary", () => {
  assert.equal(titleFromText("a ".repeat(40)), `${"a ".repeat(24).trim()}…`);
});

test("branch store: ParaRef anchors, ordered segments, delete", async () => {
  const d = await db();
  const b = new BranchStore(d);
  const br = b.create({ filePath: FILE, ref: { filePath: FILE, chapterId: "c1", paraId: "p1_2" }, chapterIndex: 1, entityId: "mira", entityName: "Mira" });
  assert.equal(br.title, "What if… Mira");
  assert.deepEqual(br.ref, { filePath: FILE, chapterId: "c1", paraId: "p1_2" });
  b.append(br.id, { userInput: "She runs", paragraphs: ["<p>She ran.</p>"], choices: [{ label: "Hide", description: "d" }] });
  b.append(br.id, { userInput: "She hides", paragraphs: ["<p>She hid.</p>"], choices: [] });
  assert.deepEqual(b.segments(br.id).map((s) => s.index), [0, 1]);
  assert.equal(b.list(FILE)[0].segmentCount, 2);
  assert.equal(b.remove(br.id), true);
  assert.equal(b.segments(br.id).length, 0);
});

// ── Task output parsing ─────────────────────────────────────────────────────

test("simulate: story/choices parsed into safe paragraphs", () => {
  const r = parseBranchResponse(`<story>\nShe *ran*.\n\n<img src=x onerror=alert(1)>The door <b>slammed</b> & stuck.\n</story>\n<choices>\n<choice label="Hide">She hides.</choice>\n<choice label="Fight <x>">She fights.</choice>\n</choices>`);
  assert.deepEqual(r.paragraphs, ["<p>She <em>ran</em>.</p>", "<p>The door <strong>slammed</strong> &amp; stuck.</p>"]);
  assert.deepEqual(r.choices.map((c) => c.label), ["Hide", "Fight"], "tags stripped from labels");
  assert.equal(toSafeParagraphs("<script>x</script>ok")[0], "<p>xok</p>");
});

test("simulate: voice lines come from paragraphs mentioning the character", () => {
  const lines = extractVoiceLines(['Mira said, "Stay behind me, all of you."', 'Orren said, "Never again."'], ["Mira"]);
  assert.deepEqual(lines, ["Stay behind me, all of you."]);
});

test("define: proper nouns route to Who's-this; translation only for non-English targets", () => {
  assert.equal(normalizeDefine({ properNoun: true, lemma: "Mira" }, { term: "Mira", sentence: "" }, "en").properNoun, true);
  const d = normalizeDefine({ lemma: "gild", pos: "verb", ipa: "ɡɪld", inContext: "cover thinly in gold", general: "to coat with gold", translation: { lang: "fr", text: "dorer" } }, { term: "gilded", sentence: "s" }, "fr");
  assert.equal(d.ipa, "/ɡɪld/");
  assert.deepEqual(d.translation, { lang: "fr", text: "dorer" });
  assert.equal(normalizeDefine({ lemma: "x", inContext: "y", general: "z", translation: { text: "t" } }, { term: "x", sentence: "" }, "en").translation, undefined);
});

test("quote: speakers resolve only to known (frontier-gated) entities", () => {
  const idx = [{ id: "mira", name: "Mira", aliases: ["the thief"], type: "character" as const, color: "" }];
  assert.deepEqual(resolveSpeaker("The Thief", idx), { speaker: "mira", speakerName: "Mira" });
  assert.deepEqual(resolveSpeaker("Orren", idx), { speaker: "unknown" });
  assert.deepEqual(resolveSpeaker("narrator", idx), { speaker: "narrator" });
});
