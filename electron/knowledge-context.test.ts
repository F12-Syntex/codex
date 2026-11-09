/**
 * WS-B: frontier gating of every knowledge read, the budgeted mention-ranked context, the
 * frontier rules, recap triggers, edits with undo, and the recap task (sql.js).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openSqlJsDb } from "./db/sqljs";
import type { SqlDb } from "./db/sql";
import { runMigrations } from "./db/migrate";
import { knowledgeMigrations } from "./knowledge/schema";
import { applyChapterData } from "./knowledge/ingest";
import type { AIWikiChapterData } from "./knowledge/parse";
import { countMentions } from "./knowledge/context";
import { createKnowledgeService } from "./knowledge/service";
import { getFrontier, recordPosition, recapStatus, markRecapSeen, recapWindow, SESSION_GAP_MS } from "./knowledge/frontier";
import { createRecapTask } from "./ai/tasks/recap";
import { createTaskContext, createMemoryArtifactStore, fakeBooks, makeSourceChapter } from "./ai/testing";
import * as store from "./knowledge/store";
import type { Frontier } from "./shared/knowledge/types";
import type { AIEvent } from "./shared/ai/types";

const FP = "/books/ctx.epub";
const silent = () => {};

async function openDb(): Promise<SqlDb> {
  const db = await openSqlJsDb();
  assert.deepEqual(runMigrations(db, [{ area: "knowledge", migrations: knowledgeMigrations }], silent).errors, []);
  return db;
}

const at = (chapterIndex: number, paraId?: string): Frontier => (paraId ? { chapterIndex, paraId, mode: "frontier" } : { chapterIndex, mode: "frontier" });
const OFF: Frontier = { chapterIndex: -1, mode: "off" };

const data = (ch: number, d: Partial<AIWikiChapterData>): AIWikiChapterData => ({ chapter_index: ch, new_entries: [], updates: [], ...d });

/** Four chapters of knowledge with a spoiler in chapter 2 and a twist in chapter 3. */
function seed(db: SqlDb): void {
  const apply = (ch: number, d: AIWikiChapterData) => db.transaction(() => applyChapterData(db, { filePath: FP, chapterIndex: ch, chapterId: `c${ch}`, bookTitle: "Ctx Book", data: d }));
  apply(0, data(0, {
    chapter_summary: { summary: "Aria arrives in Duskport.", mood: "calm", key_events: [] },
    new_entries: [
      { id: "aria", name: "Aria", type: "character", shortDescription: "A courier.", description: "", significance: 3, aliases: [{ alias: "Courier", relevance: 4 }] },
      { id: "duskport", name: "Duskport", type: "location", shortDescription: "A harbour town.", description: "" },
      { id: "bren", name: "Bren", type: "character", shortDescription: "A dock worker.", description: "", significance: 1 },
    ],
    new_arcs: [{ id: "delivery", name: "The Delivery", arc_type: "plot", description: "Aria's job", initial_beat: { beat_type: "setup", description: "A letter" } }],
  }));
  apply(1, data(1, {
    chapter_summary: { summary: "Aria meets Captain Holt.", mood: "tension", key_events: [] },
    new_entries: [{ id: "holt", name: "Captain Holt", type: "character", shortDescription: "A smuggler captain.", description: "", significance: 2, relationships: [{ targetId: "aria", relation: "ally", since: 1 }] }],
    updates: [{ id: "aria", details: [{ chapterIndex: 1, content: "Fears the sea", category: "trait" }] }],
  }));
  apply(2, data(2, {
    chapter_summary: { summary: "Holt betrays Aria.", mood: "revelation", key_events: [] },
    updates: [
      { id: "holt", status: "traitor", significance: 4, newAliases: [{ alias: "Viper", relevance: 4 }], relationships: [{ targetId: "aria", relation: "enemy", since: 2 }] },
      { id: "aria", supersede: [{ category: "trait" }], details: [{ chapterIndex: 2, content: "Overcomes her fear", category: "trait" }] },
    ],
    new_entries: [{ id: "the-viper-guild", name: "Viper Guild", type: "concept", shortDescription: "Holt's real employers.", description: "" }],
    arc_updates: [{ arc_id: "delivery", status: "climax", beat: { beat_type: "twist", description: "The letter is a trap" } }],
  }));
  apply(3, data(3, {
    chapter_summary: { summary: "The delivery ends.", mood: "calm", key_events: [] },
    arc_updates: [{ arc_id: "delivery", status: "resolved", beat: { beat_type: "resolution", description: "Delivered" } }],
  }));
}

test("gating: entities, versions, aliases, details, relationships, arcs and summaries stop at the frontier", async () => {
  const db = await openDb();
  seed(db);
  const svc = createKnowledgeService({ db, spoilerMode: () => "frontier" });

  // Frontier 1: no Viper Guild, Holt is still an ally with his chapter-1 description.
  const idx1 = svc.getEntityIndex(FP, at(1));
  assert.deepEqual(idx1.map((e) => e.id).sort(), ["aria", "bren", "duskport", "holt"]);
  assert.deepEqual(idx1.find((e) => e.id === "holt")!.aliases, []);
  const holt1 = svc.getEntity(FP, "holt", at(1))!;
  assert.equal(holt1.status, "active");
  assert.equal(holt1.significance, 2);
  assert.deepEqual(holt1.relationships.map((r) => r.relation), ["ally"]);
  assert.equal(svc.getEntity(FP, "the-viper-guild", at(1)), null);
  const aria1 = svc.getEntity(FP, "aria", at(1))!;
  assert.deepEqual(aria1.details.map((d) => [d.content, d.superseded]), [["Fears the sea", false]]);
  assert.deepEqual(aria1.relationships.map((r) => `${r.relation}:${r.targetId}`), ["ally:holt"]); // symmetric relation shown on both ends

  // Frontier 2: the betrayal is known.
  const holt2 = svc.getEntity(FP, "holt", at(2))!;
  assert.equal(holt2.status, "traitor");
  assert.deepEqual(holt2.aliases, ["Viper"]);
  assert.deepEqual(holt2.relationships.map((r) => r.relation).sort(), ["ally", "enemy"]);
  assert.deepEqual(svc.getEntity(FP, "aria", at(2))!.details.map((d) => d.superseded), [true, false]);

  // Arcs: at frontier 2 the arc is still unfolding; the resolution (chapter 3) is hidden.
  const wiki2 = svc.wiki(FP, at(2));
  assert.equal(wiki2.arcs[0].status, "active");
  assert.equal(wiki2.arcs[0].endChapter, null);
  assert.deepEqual(wiki2.arcs[0].beats.map((b) => b.chapter), [0, 2]);
  assert.deepEqual(wiki2.summaries.map((s) => s.label), ["1", "2", "3"]);
  assert.equal(wiki2.relationships.length, 2);
  assert.deepEqual(wiki2.processedChapters, [0, 1, 2, 3]);
  const wiki3 = svc.wiki(FP, OFF);
  assert.equal(wiki3.arcs[0].status, "resolved");
  assert.equal(wiki3.arcs[0].endChapter, 3);
  assert.equal(wiki3.bookTitle, "Ctx Book");

  // Nothing read yet: nothing visible.
  assert.deepEqual(svc.getEntityIndex(FP, at(-1)), []);
  assert.equal(svc.wiki(FP, at(-1)).summaries.length, 0);
  db.close();
});

test("gating: legacy rows without versions or alias chapters fall back to the entry row", async () => {
  const db = await openDb();
  store.upsertWikiEntry(db, { id: "old", filePath: FP, name: "Old Timer", type: "character", shortDescription: "Legacy desc", firstAppearance: 2, significance: 2 });
  store.addWikiAliases(db, FP, "old", [{ alias: "Gramps", relevance: 4 }]);
  db.run("UPDATE wiki_aliases SET first_chapter = NULL");
  const svc = createKnowledgeService({ db, spoilerMode: () => "frontier" });
  assert.equal(svc.getEntity(FP, "old", at(1)), null);
  const e = svc.getEntity(FP, "old", at(2))!;
  assert.equal(e.shortDescription, "Legacy desc");
  assert.deepEqual(e.aliases, ["Gramps"]);
  db.close();
});

test("context: budget respected, numbering by label, mentions ranked first", async () => {
  const db = await openDb();
  seed(db);
  const svc = createKnowledgeService({ db, spoilerMode: () => "frontier", labelsFor: () => (i) => `L${i + 1}` });
  const full = svc.getContext({ filePath: FP, frontier: at(2), purpose: "assistant", budgetChars: 4000 });
  assert.ok(full.text.length <= 4000);
  assert.match(full.text, /Chapter L3: Holt betrays Aria\./);
  assert.doesNotMatch(full.text, /The delivery ends/); // chapter 3 > frontier
  assert.doesNotMatch(full.text, /Ch\. \d/);

  // Bren is minor; a passage mentioning him lifts him to the top.
  const ranked = svc.getContext({ filePath: FP, frontier: at(2), purpose: "explain", budgetChars: 3000, focusText: "Bren hauled crates while bren sang." });
  assert.equal(ranked.entities[0].id, "bren");
  const byAlias = svc.getContext({ filePath: FP, frontier: at(2), purpose: "explain", budgetChars: 3000, focusText: "Viper smiled." });
  assert.equal(byAlias.entities[0].id, "holt");
  // The alias isn't known at frontier 1, so it doesn't count there.
  const early = svc.getContext({ filePath: FP, frontier: at(1), purpose: "explain", budgetChars: 3000, focusText: "Viper smiled." });
  assert.notEqual(early.entities[0]?.id, "holt");

  for (const budget of [0, 120, 400, 900]) {
    const c = svc.getContext({ filePath: FP, frontier: OFF, purpose: "ingest", budgetChars: budget });
    assert.ok(c.text.length <= budget, `budget ${budget}: ${c.text.length}`);
  }
  // Recap purpose with an explicit window.
  const recap = svc.getContext({ filePath: FP, frontier: at(2), purpose: "recap", budgetChars: 6000, summaryFrom: 1 });
  assert.deepEqual(recap.summaries.map((s) => s.chapter), [1, 2]);
  // Format purpose: characters only.
  const fmt = svc.getContext({ filePath: FP, frontier: OFF, purpose: "format", budgetChars: 2000 });
  assert.ok(fmt.entities.every((e) => e.type === "character"));

  assert.deepEqual([...countMentions("Kim met kim; Kimberly no.", new Map([["k", ["Kim"]]]))], [["k", 2]]);
  db.close();
});

test("frontier: finishing advances it, jumps never do; position mode; legacy seed", async () => {
  const db = await openDb();
  assert.deepEqual(getFrontier(db, FP), { chapterIndex: -1, mode: "frontier" });
  recordPosition(db, FP, { chapterIndex: 0, paraId: "p1", atChapterEnd: false, via: "page" }, 1000);
  assert.deepEqual(getFrontier(db, FP), { chapterIndex: -1, paraId: "p1", mode: "frontier" });
  let r = recordPosition(db, FP, { chapterIndex: 0, atChapterEnd: true, via: "page" }, 1001);
  assert.equal(r.changed, true);
  assert.deepEqual(r.frontier, { chapterIndex: 0, mode: "frontier" });
  // Jump far ahead and "finish" it: no advance.
  r = recordPosition(db, FP, { chapterIndex: 40, atChapterEnd: true, via: "jump" }, 1002);
  assert.equal(r.changed, false);
  assert.equal(getFrontier(db, FP).chapterIndex, 0);
  assert.deepEqual(getFrontier(db, FP, "position"), { chapterIndex: 39, mode: "position" });
  // TTS finishing chapter 1.
  recordPosition(db, FP, { chapterIndex: 1, atChapterEnd: true, via: "tts" }, 1003);
  assert.equal(getFrontier(db, FP).chapterIndex, 1);
  // Going back never lowers it.
  recordPosition(db, FP, { chapterIndex: 0, atChapterEnd: true, via: "page" }, 1004);
  assert.equal(getFrontier(db, FP).chapterIndex, 1);

  // Legacy readProgress seeds chapter − 1.
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)");
  db.run("INSERT INTO settings VALUES (?, ?)", ["readProgress:/legacy.epub", JSON.stringify({ chapter: 7, page: 3, totalChapters: 20 })]);
  assert.deepEqual(getFrontier(db, "/legacy.epub"), { chapterIndex: 6, mode: "frontier" });
  db.close();
});

test("frontier events and recap triggers", async () => {
  const db = await openDb();
  const events: AIEvent[] = [];
  let now = 1_000_000;
  const svc = createKnowledgeService({ db, emit: (e) => events.push(e), spoilerMode: () => "frontier", now: () => now });
  for (let i = 0; i <= 4; i++) svc.recordPosition(FP, { chapterIndex: i, atChapterEnd: true, via: "page" });
  assert.equal(events.filter((e) => e.type === "frontier").length, 5);
  assert.equal(svc.recapStatus(FP).due, false, "same session");

  // Back after 10 hours: due ("away"), window of 3 chapters ending at the frontier.
  now += 10 * 3_600_000;
  const st = svc.recapStatus(FP);
  assert.equal(st.due, true);
  assert.equal(st.reason, "away");
  assert.deepEqual([st.fromChapter, st.toChapter, st.fromLabel, st.toLabel], [2, 4, "3", "5"]);
  svc.recapSeen(FP, 4);
  assert.equal(svc.recapStatus(FP).due, false, "shown this session");

  // Short break but 3 more chapters finished since the last recap: due ("progress").
  for (let i = 5; i <= 7; i++) svc.recordPosition(FP, { chapterIndex: i, atChapterEnd: true, via: "page" });
  now += SESSION_GAP_MS + 1;
  const p = recapStatus(db, FP, now);
  assert.equal(p.reason, "progress");
  assert.equal(p.fromChapter, 5);
  markRecapSeen(db, FP, 7, now);
  assert.equal(recapStatus(db, FP, now).due, false);
  assert.deepEqual(recapWindow(20, 40 * 86_400_000), { from: 13, to: 20 });
  db.close();
});

test("edits: create, update (versioned), alias, relate, merge, delete — each undoable", async () => {
  const db = await openDb();
  seed(db);
  const events: AIEvent[] = [];
  const svc = createKnowledgeService({ db, emit: (e) => events.push(e), spoilerMode: () => "frontier" });
  const before = JSON.stringify(svc.wiki(FP, OFF));
  const res = svc.applyEdits(FP, [
    { op: "create", entry: { name: "Old Mara", type: "character", shortDescription: "A fortune teller.", firstAppearance: 1, aliases: ["Mara"] } },
    { op: "update", id: "bren", fields: { shortDescription: "Secretly a spy.", status: "spy" }, asOfChapter: 3 },
    { op: "alias", id: "aria", aliases: ["Ari"], asOfChapter: 2 },
    { op: "relate", sourceId: "bren", targetId: "holt", relation: "serves", sinceChapter: 3 },
    { op: "merge", sourceId: "duskport", targetId: "duskport" },
    { op: "update", id: "nobody", fields: { status: "x" }, asOfChapter: 0 },
  ]);
  assert.equal(res.applied, 4);
  assert.deepEqual(res.failed.map((f) => f.reason), ["cannot merge an entry into itself", 'unknown entry "nobody"']);
  assert.equal(res.undoIds!.length, 4);
  assert.equal(events.at(-1)!.type, "knowledge");
  // The update is versioned: still a dock worker at frontier 2.
  assert.equal(svc.getEntity(FP, "bren", at(2))!.shortDescription, "A dock worker.");
  assert.equal(svc.getEntity(FP, "bren", at(3))!.shortDescription, "Secretly a spy.");
  assert.deepEqual(svc.getEntity(FP, "aria", at(1))!.aliases, ["Courier"]);
  assert.deepEqual(svc.getEntity(FP, "aria", at(2))!.aliases.sort(), ["Ari", "Courier"]);
  assert.ok(svc.getEntity(FP, "old-mara", at(1)));

  const m = svc.applyEdits(FP, [{ op: "merge", sourceId: "bren", targetId: "holt" }]);
  assert.equal(m.mergeLogIds.length, 1);
  assert.equal(store.getWikiEntry(db, FP, "bren"), null);

  // Undo everything in reverse order → identical wiki.
  for (const id of [...m.undoIds!, ...res.undoIds!].sort((a, b) => b - a)) assert.equal(svc.undoEdit(FP, id), true);
  assert.equal(svc.undoEdit(FP, res.undoIds![0]), false, "already undone");
  assert.equal(JSON.stringify(svc.wiki(FP, OFF)), before);

  // Delete + undo restores details and relationships.
  const d = svc.applyEdits(FP, [{ op: "delete", id: "holt" }]);
  assert.equal(svc.getEntity(FP, "holt", OFF), null);
  svc.undoEdit(FP, d.undoIds![0]);
  assert.equal(JSON.stringify(svc.wiki(FP, OFF)), before);
  db.close();
});

test("book.recap task: summaries ≤ frontier, missing chapters ingested inline, ids validated", async () => {
  const db = await openDb();
  seed(db);
  // A chapter that was never ingested: a gap to fill inline.
  db.run("DELETE FROM wiki_chapter_summaries WHERE chapter_index = 1");
  db.run("DELETE FROM wiki_processed WHERE chapter_index = 1");
  const chapters = [0, 1, 2, 3].map((i) => makeSourceChapter(i, [`Chapter ${i} opening.`, `Chapter ${i} middle.`, `Chapter ${i} end.`]));
  const books = fakeBooks({ [FP]: chapters });
  const svc = createKnowledgeService({ db, spoilerMode: () => "frontier" });
  const artifacts = createMemoryArtifactStore();
  const task = createRecapTask(svc);
  const { ctx, provider } = createTaskContext({ task: "book.recap", services: { books, artifacts, knowledge: svc } });
  const frontier = { chapterIndex: 2, paraId: chapters[3].paras[1].id, mode: "frontier" } as const;
  provider.enqueue(
    JSON.stringify({ batch: [{ chapter_index: 1, chapter_summary: { summary: "Aria meets Holt again.", mood: "calm", key_events: [] }, new_entries: [], updates: [] }] }),
    (req) => {
      const user = req.messages[req.messages.length - 1].content;
      assert.match(user, /Chapter 2: Aria meets Holt again\./);
      assert.match(user, /Chapter 3: Holt betrays Aria\./);
      assert.doesNotMatch(user, /The delivery ends/);
      assert.match(user, /Chapter 3 middle\./); // last paragraphs read, up to the frontier para
      assert.doesNotMatch(user, /Chapter 3 end\./);
      return JSON.stringify({ bullets: ["Aria arrives.", "Holt betrays her.", " "], leftOff: "Mid-chapter.", entityIds: ["holt", "made-up"] });
    },
  );
  const out = await task.run({ filePath: FP, frontier, bookTitle: "Ctx Book" }, ctx);
  assert.deepEqual(out.bullets, ["Aria arrives.", "Holt betrays her."]);
  assert.deepEqual(out.entityIds, ["holt"]);
  assert.equal(out.leftOffQuote, "Chapter 3 middle.");
  assert.deepEqual([out.fromChapter, out.toChapter, out.source], [0, 2, "summaries"]);
  assert.equal(artifacts.rows.size, 1);
  assert.equal([...artifacts.rows.values()][0].variant, "upTo:2");
  // The key changes with the frontier.
  assert.notEqual(task.key({ filePath: FP, frontier }, { model: "m", settings: ctx.settings }), task.key({ filePath: FP, frontier: at(1) }, { model: "m", settings: ctx.settings }));
  db.close();
});
