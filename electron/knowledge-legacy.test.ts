/**
 * WS-B Phase 2b: legacy wiki adoption (wiki_processed → knowledge_runs, legacy merges → undo log)
 * and the wiki window reads (merge history, article extras) — sql.js.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openSqlJsDb } from "./db/sqljs";
import type { SqlDb } from "./db/sql";
import { runMigrations } from "./db/migrate";
import { knowledgeMigrations } from "./knowledge/schema";
import { clearChapterKnowledge, getRun, ingestChapter, KNOWLEDGE_TASK_VERSION, KnowledgeLane } from "./knowledge/ingest";
import { adoptLegacyMerges, adoptLegacyProcessed, LEGACY_LEDGER, mergeLogAt } from "./knowledge/legacy";
import { createKnowledgeService } from "./knowledge/service";
import { createKnowledgeTask } from "./ai/tasks/knowledge";
import { createTaskContext, fakeBooks, makeSourceChapter } from "./ai/testing";
import * as store from "./knowledge/store";

const FP = "/books/legacy.epub";
const silent = () => {};
const OFF = { chapterIndex: -1, mode: "off" as const };
const at = (chapterIndex: number) => ({ chapterIndex, mode: "frontier" as const });

async function openDb(): Promise<SqlDb> {
  const db = await openSqlJsDb();
  const r = runMigrations(db, [{ area: "knowledge", migrations: knowledgeMigrations }], silent);
  assert.deepEqual(r.errors, []);
  return db;
}

const chapters = [
  makeSourceChapter(0, ["Aria met Bren at the harbour."]),
  makeSourceChapter(1, ["Cover page."]),
  makeSourceChapter(2, ["Bren sailed away."]),
];
const books = fakeBooks({ [FP]: chapters });

/** What the old renderer pipeline left behind: rows + wiki_processed marks, no runs. */
function seedLegacy(db: SqlDb): void {
  store.upsertWikiMeta(db, FP, "Legacy Book");
  store.upsertWikiEntry(db, { id: "aria", filePath: FP, name: "Aria", type: "character", shortDescription: "A sailor.", description: "Meets Bren. Later becomes queen.", color: "blue", firstAppearance: 0, significance: 3, status: "active" });
  store.upsertWikiEntry(db, { id: "bren", filePath: FP, name: "Bren", type: "character", shortDescription: "A captain.", description: "", color: "blue", firstAppearance: 0, significance: 2, status: "active" });
  store.upsertWikiEntry(db, { id: "the-captain", filePath: FP, name: "The Captain", type: "character", shortDescription: "Someone.", description: "", color: "blue", firstAppearance: 2, significance: 1, status: "active" });
  store.addWikiAppearance(db, FP, "aria", 0);
  store.addWikiAppearance(db, FP, "aria", 2);
  store.addWikiAppearance(db, FP, "bren", 0);
  store.addWikiDetails(db, FP, "aria", [{ chapterIndex: 0, category: "trait", content: "Brave", relevance: 4 }]);
  store.upsertChapterSummary(db, FP, { chapterIndex: 0, summary: "They meet." });
  store.upsertChapterSummary(db, FP, { chapterIndex: 2, summary: "Bren leaves." });
  for (const ch of [0, 1, 2]) store.markChapterProcessed(db, FP, ch);
}

test("legacy: wiki_processed marks become runs once chapter ids are known", async () => {
  const db = await openDb();
  seedLegacy(db);
  const n = adoptLegacyProcessed(db, FP, chapters, KNOWLEDGE_TASK_VERSION, 1000);
  assert.equal(n, 3);
  assert.equal(getRun(db, FP, "c0")!.status, "done");
  assert.equal(getRun(db, FP, "c1")!.status, "skipped", "a mark without rows was a skip");
  assert.equal(getRun(db, FP, "c2")!.created_ids, LEGACY_LEDGER);
  assert.equal(getRun(db, FP, "c2")!.task_version, KNOWLEDGE_TASK_VERSION);
  // Idempotent; chapters the parse does not know are left alone.
  assert.equal(adoptLegacyProcessed(db, FP, chapters, KNOWLEDGE_TASK_VERSION), 0);
  store.markChapterProcessed(db, FP, 9);
  assert.equal(adoptLegacyProcessed(db, FP, chapters, KNOWLEDGE_TASK_VERSION), 0);
  db.close();
});

test("legacy: an adopted chapter is not re-run, a forced re-run and a clear fall back to the per-chapter clear", async () => {
  const db = await openDb();
  seedLegacy(db);
  adoptLegacyProcessed(db, FP, chapters, KNOWLEDGE_TASK_VERSION);
  let calls = 0;
  const deps = {
    db,
    lane: new KnowledgeLane(),
    getChapter: (fp: string, i: number) => books.getChapter(fp, i),
    async complete() {
      calls++;
      return JSON.stringify({ batch: [{ chapter_index: 2, chapter_summary: { summary: "Rewritten.", mood: "sad", key_events: [] }, new_entries: [], updates: [] }] });
    },
  };
  const same = await ingestChapter(deps, { filePath: FP, chapterIndex: 2, signal: new AbortController().signal });
  assert.equal(same.status, "unchanged");
  assert.equal(calls, 0);

  const forced = await ingestChapter(deps, { filePath: FP, chapterIndex: 2, force: true, signal: new AbortController().signal });
  assert.equal(forced.status, "done");
  assert.equal(calls, 1);
  assert.equal(store.getChapterSummaries(db, FP, 2, 2)[0].summary, "Rewritten.");
  assert.deepEqual(store.getAppearancesForEntry(db, FP, "aria"), [0], "the legacy chapter-2 rows were cleared first");
  assert.notEqual(getRun(db, FP, "c2")!.created_ids, LEGACY_LEDGER);

  // Clearing an adopted chapter removes its legacy rows and the run.
  assert.equal(clearChapterKnowledge(db, FP, 0), true);
  assert.equal(getRun(db, FP, "c0"), null);
  assert.equal(store.getChapterSummaries(db, FP, 0, 0).length, 0);
  assert.ok(!store.getProcessedChapters(db, FP).includes(0));
  db.close();
});

test("legacy: ingest adopts a single legacy chapter; the task adopts the whole book first", async () => {
  const db = await openDb();
  seedLegacy(db);
  const deps = {
    db,
    lane: new KnowledgeLane(),
    getChapter: (fp: string, i: number) => books.getChapter(fp, i),
    complete: async () => assert.fail("must not call the model"),
  };
  const r = await ingestChapter(deps, { filePath: FP, chapterIndex: 1, signal: new AbortController().signal });
  assert.equal(r.status, "unchanged");
  assert.equal(getRun(db, FP, "c1")!.status, "skipped");
  assert.equal(getRun(db, FP, "c0"), null);

  const svc = createKnowledgeService({ db });
  const task = createKnowledgeTask(svc, { lane: new KnowledgeLane() });
  const { ctx } = createTaskContext({ task: "chapter.knowledge", services: { books } });
  const out = await task.run({ filePath: FP, chapterIndex: 0 }, ctx);
  assert.equal(out.status, "unchanged");
  assert.equal(getRun(db, FP, "c0")!.status, "done");
  assert.equal(getRun(db, FP, "c2")!.status, "done");
  db.close();
});

test("legacy: merges made in the old wiki window get an undo entry and show in the gated merge history", async () => {
  const db = await openDb();
  seedLegacy(db);
  const svc = createKnowledgeService({ db, spoilerMode: () => "frontier" });
  const logId = store.mergeWikiEntries(db, FP, "the-captain", "bren")!;
  assert.ok(logId > 0);

  // The source was introduced in chapter 2: hidden at frontier 0, visible when ungated.
  assert.equal(adoptLegacyMerges(db, FP), 1);
  assert.equal(adoptLegacyMerges(db, FP), 0, "idempotent");
  assert.deepEqual(mergeLogAt(db, FP, at(0)), []);
  const snap = svc.wiki(FP, OFF);
  assert.equal(snap.mergeLog!.length, 1);
  const m = snap.mergeLog![0];
  assert.deepEqual([m.id, m.sourceName, m.targetName], [logId, "The Captain", "Bren"]);

  assert.equal(svc.undoEdit(FP, m.undoId), true);
  assert.ok(store.getWikiEntry(db, FP, "the-captain"), "unmerged");
  assert.deepEqual(svc.wiki(FP, OFF).mergeLog, []);

  // A merge through knowledge:edits:apply is listed without adoption.
  const res = svc.applyEdits(FP, [{ op: "merge", sourceId: "the-captain", targetId: "bren" }]);
  assert.equal(res.applied, 1);
  assert.equal(adoptLegacyMerges(db, FP), 0);
  assert.equal(svc.wiki(FP, OFF).mergeLog![0].undoId, res.undoIds![0]);
  db.close();
});

test("wiki article: description only when nothing happens after the frontier; aliases and appearances are gated", async () => {
  const db = await openDb();
  seedLegacy(db);
  store.addWikiAliases(db, FP, "aria", [{ alias: "Ari", alias_type: "nickname", relevance: 4 }]);
  db.run("UPDATE wiki_aliases SET first_chapter = 2 WHERE file_path = ? AND alias = 'Ari'", [FP]);
  const svc = createKnowledgeService({ db });

  const early = svc.getEntity(FP, "aria", at(0))!;
  assert.equal(early.description, undefined, "Aria appears again in chapter 2: the long description could spoil it");
  assert.deepEqual(early.appearances, [0]);
  assert.deepEqual(early.aliasDetails, []);
  assert.equal(early.details[0].relevance, 4);

  const all = svc.getEntity(FP, "aria", at(2))!;
  assert.equal(all.description, "Meets Bren. Later becomes queen.");
  assert.deepEqual(all.appearances, [0, 2]);
  assert.deepEqual(all.aliasDetails, [{ alias: "Ari", type: "nickname", relevance: 4 }]);
  assert.equal(svc.getEntity(FP, "aria", OFF)!.description, "Meets Bren. Later becomes queen.");
  db.close();
});

test("legacy: the old retry path (unmark, then force) clears the chapter's legacy rows before re-applying", async () => {
  const db = await openDb();
  seedLegacy(db);
  store.unmarkChapterProcessed(db, FP, 2); // useWiki.retryWikiChapter unmarks before forcing
  const deps = {
    db,
    lane: new KnowledgeLane(),
    getChapter: (fp: string, i: number) => books.getChapter(fp, i),
    complete: async () => JSON.stringify({ batch: [{ chapter_index: 2, chapter_summary: { summary: "Again.", mood: "calm", key_events: [] }, new_entries: [], updates: [] }] }),
  };
  const r = await ingestChapter(deps, { filePath: FP, chapterIndex: 2, force: true, signal: new AbortController().signal });
  assert.equal(r.status, "done");
  assert.deepEqual(store.getAppearancesForEntry(db, FP, "aria"), [0]);
  assert.equal(store.getChapterSummaries(db, FP, 2, 2)[0].summary, "Again.");
  assert.ok(store.getProcessedChapters(db, FP).includes(2));
  db.close();
});
