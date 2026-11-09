/**
 * WS-B: transactional, idempotent knowledge ingestion (sql.js).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openSqlJsDb } from "./db/sqljs";
import type { SqlDb } from "./db/sql";
import { runMigrations } from "./db/migrate";
import { knowledgeMigrations } from "./knowledge/schema";
import { clearChapterKnowledge, getRun, ingestChapter, KnowledgeLane, type IngestDeps } from "./knowledge/ingest";
import { createKnowledgeService } from "./knowledge/service";
import { createKnowledgeTask } from "./ai/tasks/knowledge";
import { createTaskContext, fakeBooks, makeSourceChapter } from "./ai/testing";
import * as store from "./knowledge/store";
import type { AIEvent } from "./shared/ai/types";

const FP = "/books/test.epub";
const silent = () => {};

async function openDb(): Promise<SqlDb> {
  const db = await openSqlJsDb();
  const r = runMigrations(db, [{ area: "knowledge", migrations: knowledgeMigrations }], silent);
  assert.deepEqual(r.errors, []);
  return db;
}

const chapters = [
  makeSourceChapter(0, ["Kim Soyoung met Kael Ironforge at the Silver Gate.", "The stranger smiled."]),
  makeSourceChapter(1, ["Soyoung drew the Moonblade.", "Kael watched from the wall."]),
  makeSourceChapter(2, ["A quiet chapter."]),
];
const books = fakeBooks({ [FP]: chapters });

function ch0Response(): string {
  return JSON.stringify({
    mc_entity_id: "kim-soyoung",
    batch: [{
      chapter_index: 0,
      chapter_summary: { summary: "Soyoung meets Kael.", mood: "calm", key_events: ["meeting"] },
      new_entries: [
        {
          id: "kim-soyoung", name: "Kim Soyoung", type: "character",
          aliases: [{ alias: "Soyoung", type: "name", relevance: 5 }, { alias: "the stranger", type: "epithet", relevance: 3 }],
          shortDescription: "A young swordswoman.", description: "Arrives at the gate.", significance: 3,
          details: [{ chapterIndex: 7, content: "Carries a sword", category: "possession", relevance: 3, source: "drew" }],
          relationships: [{ targetId: "kael-ironforge", relation: "ally", since: 0 }],
        },
        { id: "kael-ironforge", name: "Kael Ironforge", type: "character", shortDescription: "A guard.", description: "", significance: 2 },
        { id: "silver-gate", name: "Silver Gate", type: "location", shortDescription: "The city gate.", description: "" },
      ],
      updates: [],
      new_arcs: [{ id: "the-meeting", name: "The Meeting", arc_type: "plot", description: "How they met", entities: [{ entry_id: "kim-soyoung", role: "protagonist" }], initial_beat: { beat_type: "setup", description: "They meet" } }],
      mc_stats: [{ key: "level", category: "attributes", name: "Level", value: "1", is_active: true }],
    }],
  });
}

function ch1Response(variant: "a" | "b" = "a"): string {
  return JSON.stringify({
    batch: [{
      chapter_index: 1,
      chapter_summary: { summary: variant === "a" ? "Soyoung draws the Moonblade." : "Kael keeps watch.", mood: "action", key_events: [] },
      new_entries: [
        // "Kael" resolves to the existing entry (substring, same type) instead of a duplicate.
        { id: "kael", name: "Kael", type: "character", shortDescription: "dup", description: "Watches from the wall.", aliases: ["Iron Prince"] },
        ...(variant === "a" ? [{ id: "moonblade", name: "Moonblade", type: "item", shortDescription: "A cursed sword.", description: "" }] : []),
      ],
      updates: [
        { id: "kim-soyoung", status: "wounded", significance: 4, descriptionAppend: "Draws the Moonblade.", details: [{ chapterIndex: 1, content: "Wields the Moonblade", category: "ability" }], supersede: [{ category: "possession" }] },
      ],
      arc_updates: [{ arc_id: "the-meeting", status: "active", beat: { beat_type: "escalation", description: "Blade drawn" } }],
      mc_stats: [{ key: "level", category: "attributes", name: "Level", value: "2", is_active: true }],
    }],
  });
}

function deps(db: SqlDb, replies: string[], extra: Partial<IngestDeps> = {}): IngestDeps & { calls: number } {
  const d = {
    calls: 0,
    db,
    lane: new KnowledgeLane(),
    getChapter: (fp: string, i: number) => books.getChapter(fp, i),
    async complete() {
      d.calls++;
      const r = replies.shift();
      if (r === undefined) throw new Error("no reply scripted");
      return r;
    },
    ...extra,
  };
  return d;
}

const signal = () => new AbortController().signal;
const count = (db: SqlDb, table: string) => Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE file_path = ?`, [FP])!.n);
const snapshotCounts = (db: SqlDb) => Object.fromEntries(
  ["wiki_entries", "wiki_aliases", "wiki_details", "wiki_relationships", "wiki_appearances", "wiki_chapter_summaries", "wiki_arcs", "wiki_arc_beats", "wiki_arc_entities", "wiki_entry_versions", "wiki_mc_stats", "knowledge_runs", "wiki_processed"].map((t) => [t, count(db, t)]),
);

test("ingest: a fixture response creates the expected rows in one run", async () => {
  const db = await openDb();
  const events: AIEvent[] = [];
  const d = deps(db, [ch0Response()], { emit: (e) => events.push(e) });
  const r = await ingestChapter(d, { filePath: FP, chapterIndex: 0, bookTitle: "Test Book", signal: signal() });
  assert.equal(r.status, "done");
  assert.equal(r.createdEntries, 3);
  assert.deepEqual(store.getWikiEntries(db, FP).map((e) => e.id).sort(), ["kael-ironforge", "kim-soyoung", "silver-gate"]);
  assert.equal(store.getWikiEntry(db, FP, "silver-gate")!.color, "emerald");
  // Aliases are gated and carry first_chapter.
  const aliases = db.all<{ alias: string; relevance: number; first_chapter: number }>("SELECT alias, relevance, first_chapter FROM wiki_aliases WHERE file_path = ? ORDER BY alias", [FP]);
  assert.deepEqual(aliases, [{ alias: "Soyoung", relevance: 5, first_chapter: 0 }, { alias: "the stranger", relevance: 1, first_chapter: 0 }]);
  // Details belong to the ingested chapter even when the model says otherwise.
  assert.equal(store.getWikiDetailsForEntry(db, FP, "kim-soyoung")[0].chapter_index, 0);
  assert.equal(store.getAllWikiRelationships(db, FP).length, 1);
  assert.equal(count(db, "wiki_appearances"), 3);
  assert.equal(store.getAllChapterSummaries(db, FP)[0].summary, "Soyoung meets Kael.");
  assert.equal(count(db, "wiki_entry_versions"), 3);
  assert.equal(store.getArcBeats(db, FP, "the-meeting").length, 1);
  assert.equal(store.getMCEntityId(db, FP), "kim-soyoung");
  assert.equal(store.getWikiMeta(db, FP)!.book_title, "Test Book");
  assert.deepEqual(store.getProcessedChapters(db, FP), [0]); // legacy mirror
  assert.equal(getRun(db, FP, "c0")!.status, "done");
  assert.deepEqual(events, [{ type: "knowledge", filePath: FP, chapters: [0], reason: "ingest" }]);
  db.close();
});

test("ingest: re-ingest is a no-op; the resolver merges duplicates into existing entries", async () => {
  const db = await openDb();
  const d = deps(db, [ch0Response(), ch1Response()]);
  await ingestChapter(d, { filePath: FP, chapterIndex: 0, signal: signal() });
  const before = snapshotCounts(db);
  const again = await ingestChapter(d, { filePath: FP, chapterIndex: 0, signal: signal() });
  assert.equal(again.status, "unchanged");
  assert.equal(d.calls, 1);
  assert.deepEqual(snapshotCounts(db), before);

  const r1 = await ingestChapter(d, { filePath: FP, chapterIndex: 1, signal: signal() });
  assert.equal(r1.status, "done");
  assert.equal(store.getWikiEntry(db, FP, "kael"), null, "no duplicate for 'Kael'");
  const kael = store.getWikiEntry(db, FP, "kael-ironforge")!;
  assert.match(kael.description, /Watches from the wall/);
  assert.ok(store.getWikiAliases(db, FP, "kael-ironforge").some((a) => a.alias === "Kael"));
  // Status/significance change → a new version at chapter 1; old one kept at chapter 0.
  const versions = db.all<{ chapter_index: number; status: string }>("SELECT chapter_index, status FROM wiki_entry_versions WHERE file_path = ? AND entry_id = 'kim-soyoung' ORDER BY chapter_index", [FP]);
  assert.deepEqual(versions, [{ chapter_index: 0, status: "active" }, { chapter_index: 1, status: "wounded" }]);
  assert.equal(store.getWikiDetailsForEntry(db, FP, "kim-soyoung").find((x) => x.category === "possession")!.is_superseded, 1);
  db.close();
});

test("ingest: a forced retry removes exactly what the previous run created", async () => {
  const db = await openDb();
  const d = deps(db, [ch0Response(), ch1Response("a"), ch1Response("b")]);
  await ingestChapter(d, { filePath: FP, chapterIndex: 0, signal: signal() });
  const afterCh0 = snapshotCounts(db);
  const soyoungAfterCh0 = store.getWikiEntry(db, FP, "kim-soyoung");
  await ingestChapter(d, { filePath: FP, chapterIndex: 1, signal: signal() });
  assert.ok(store.getWikiEntry(db, FP, "moonblade"));

  const retry = await ingestChapter(d, { filePath: FP, chapterIndex: 1, force: true, signal: signal() });
  assert.equal(retry.status, "done");
  assert.equal(store.getWikiEntry(db, FP, "moonblade"), null, "entity created only by the old run is gone");
  assert.equal(store.getChapterSummaries(db, FP, 1, 1)[0].summary, "Kael keeps watch.");
  const kael = store.getWikiEntry(db, FP, "kael-ironforge")!;
  assert.equal(kael.description.match(/Watches from the wall/g)!.length, 1, "description append is not duplicated");
  assert.equal(store.getArcBeats(db, FP, "the-meeting").length, 2);

  // Clearing the chapter restores the state after chapter 0 exactly.
  assert.equal(clearChapterKnowledge(db, FP, 1), true);
  assert.deepEqual(snapshotCounts(db), afterCh0);
  assert.deepEqual(store.getWikiEntry(db, FP, "kim-soyoung"), soyoungAfterCh0);
  assert.equal(store.getWikiDetailsForEntry(db, FP, "kim-soyoung").find((x) => x.category === "possession")!.is_superseded, 0);
  assert.equal(store.getMCStats(db, FP)[0].value, "1");
  assert.equal(store.getAllArcs(db, FP)[0].status, "setup");
  db.close();
});

test("ingest: concurrent requests for the same chapter through the lane yield one set", async () => {
  const db = await openDb();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const d = deps(db, []);
  d.complete = async () => {
    d.calls++;
    await gate;
    return ch0Response();
  };
  const a = ingestChapter(d, { filePath: FP, chapterIndex: 0, signal: signal() });
  const b = ingestChapter(d, { filePath: FP, chapterIndex: 0, signal: signal() });
  const c = ingestChapter(d, { filePath: FP, chapterIndex: 0, force: false, signal: signal() });
  release();
  const results = await Promise.all([a, b, c]);
  assert.equal(d.calls, 1);
  assert.ok(results.every((r) => r.status === "done"));
  assert.equal(count(db, "wiki_entries"), 3);
  assert.equal(count(db, "wiki_details"), 1);
  // A different chapter queued behind it runs after, serially.
  const order: number[] = [];
  const d2 = deps(db, []);
  d2.lane = d.lane;
  d2.complete = async () => {
    order.push(d2.calls++);
    return d2.calls === 1 ? ch1Response() : JSON.stringify({ batch: [{ chapter_index: 2, new_entries: [], updates: [] }] });
  };
  await Promise.all([
    ingestChapter(d2, { filePath: FP, chapterIndex: 1, signal: signal() }),
    ingestChapter(d2, { filePath: FP, chapterIndex: 2, signal: signal() }),
  ]);
  assert.deepEqual(order, [0, 1]);
  db.close();
});

test("ingest: an abort mid-run leaves nothing behind", async () => {
  const db = await openDb();
  const ctrl = new AbortController();
  const d = deps(db, []);
  d.complete = async () => {
    ctrl.abort();
    return ch0Response();
  };
  await assert.rejects(ingestChapter(d, { filePath: FP, chapterIndex: 0, signal: ctrl.signal }), (e: { code?: string }) => e.code === "cancelled");
  assert.equal(count(db, "wiki_entries"), 0);
  assert.equal(count(db, "knowledge_runs"), 0);
  assert.equal(count(db, "wiki_chapter_summaries"), 0);

  // An unparseable reply fails with "parse" and writes nothing either.
  const bad = deps(db, ["this is not json"]);
  await assert.rejects(ingestChapter(bad, { filePath: FP, chapterIndex: 0, signal: signal() }), (e: { code?: string }) => e.code === "parse");
  assert.equal(count(db, "wiki_entries"), 0);
  db.close();
});

test("ingest: a failure while applying rolls the whole chapter back", async () => {
  const db = await openDb();
  db.exec(`CREATE TRIGGER boom BEFORE INSERT ON wiki_arcs BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
  const d = deps(db, [ch0Response()]);
  await assert.rejects(ingestChapter(d, { filePath: FP, chapterIndex: 0, signal: signal() }), /boom/);
  assert.equal(count(db, "wiki_entries"), 0);
  assert.equal(count(db, "wiki_aliases"), 0);
  assert.equal(count(db, "knowledge_runs"), 0);
  db.close();
});

test("chapter.knowledge task: runs ingest through TaskContext and salvages truncated output", async () => {
  const db = await openDb();
  const svc = createKnowledgeService({ db, spoilerMode: () => "frontier" });
  const task = createKnowledgeTask(svc, { lane: new KnowledgeLane() });
  assert.equal(task.lane!({ task: "chapter.knowledge", input: { filePath: FP, chapterIndex: 0 }, priority: 3 }), `knowledge:${FP}`);
  const { ctx, provider } = createTaskContext({ task: "chapter.knowledge", services: { books } });
  // Truncated mid-way through a second (never requested) batch item: the first is complete.
  const full = JSON.parse(ch0Response());
  const truncated = JSON.stringify(full).replace(/\]\}$/, ',{"chapter_index": 9, "new_entr');
  provider.enqueue({ fail: { kind: "length", text: truncated } });
  const out = await task.run({ filePath: FP, chapterIndex: 0 }, ctx);
  assert.equal(out.status, "done");
  assert.equal(out.createdEntries, 3);
  assert.equal(task.fakeResponse!({ model: "m", signal: signal(), messages: [{ role: "user", content: "x (chapter_index: 4)" }] })!.includes('"chapter_index":4'), true);
  db.close();
});
