/**
 * WS-B: book search — LIKE fallback on sql.js (no FTS5), the FTS5 query path against a recording
 * SqlDb, frontier clamping (including the paragraph inside the next chapter), lazy (re)indexing,
 * and the entity.lookup task built on it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openSqlJsDb } from "./db/sqljs";
import { hasFts5, type SqlDb, type SqlParams } from "./db/sql";
import { runMigrations } from "./db/migrate";
import { knowledgeMigrations } from "./knowledge/schema";
import { ensureIndexed, isIndexed, readIndexedParas, searchBackend, searchBook, tokenize } from "./knowledge/search";
import { createKnowledgeService } from "./knowledge/service";
import { createEntityLookupTask } from "./ai/tasks/entity-lookup";
import { createTaskContext, fakeBooks, makeSourceChapter } from "./ai/testing";
import type { Frontier } from "./shared/knowledge/types";

const FP = "/books/search.epub";
const silent = () => {};
const noYield = { yieldEvery: async () => {} };

async function openDb(): Promise<SqlDb> {
  const db = await openSqlJsDb();
  assert.deepEqual(runMigrations(db, [{ area: "knowledge", migrations: knowledgeMigrations }], silent).errors, []);
  return db;
}

const chapters = [
  makeSourceChapter(0, ["The lighthouse keeper lit the lamp.", "Mara watched the harbour."]),
  makeSourceChapter(1, ["A storm rolled in over the harbour.", "The keeper's daughter, Mara, ran to the lighthouse."]),
  makeSourceChapter(2, ["Mara found the hidden letter.", "It named the traitor: the harbour master.", "Nobody slept."]),
  makeSourceChapter(3, ["The harbour master fled at dawn."]),
];
const at = (chapterIndex: number, paraId?: string): Frontier => (paraId ? { chapterIndex, paraId, mode: "frontier" } : { chapterIndex, mode: "frontier" });

test("search: sql.js uses the LIKE fallback behind the same interface", async () => {
  const db = await openDb();
  assert.equal(hasFts5(db), false);
  assert.equal(searchBackend(db), "like");
  assert.equal(await ensureIndexed(db, FP, fakeBooks({ [FP]: chapters }), noYield), true);
  assert.equal(isIndexed(db, FP), true);

  const hits = searchBook(db, FP, "harbour", { chapterIndex: 0, mode: "off" }, 10);
  assert.equal(hits.length, 4);
  // Phrase + both terms rank above a single-term hit.
  const ranked = searchBook(db, FP, "harbour master", { chapterIndex: 0, mode: "off" }, 10);
  assert.ok(ranked[0].snippet.includes("harbour master"));
  assert.ok(ranked[0].score > ranked[ranked.length - 1].score);
  assert.deepEqual(searchBook(db, FP, "   ", at(5), 5), []);
  assert.deepEqual(searchBook(db, FP, "100%_match", at(5), 5), [], "LIKE wildcards are escaped");
  assert.deepEqual(tokenize("Mara's harbour, Mara!"), ["mara", "harbour"]);
  db.close();
});

test("search: results are clamped to the frontier, including the paragraph in the next chapter", async () => {
  const db = await openDb();
  await ensureIndexed(db, FP, fakeBooks({ [FP]: chapters }), noYield);
  // Finished chapter 1 only: the traitor reveal (chapter 2) is not searchable.
  assert.deepEqual(searchBook(db, FP, "traitor", at(1), 10), []);
  assert.deepEqual(searchBook(db, FP, "mara", at(1), 10).map((h) => h.chapterIndex).sort(), [0, 1]);
  // Reading chapter 2 up to its first paragraph: the letter is visible, the traitor line is not.
  const mid = at(1, chapters[2].paras[0].id);
  assert.deepEqual(searchBook(db, FP, "letter", mid, 10).map((h) => h.paraId), [chapters[2].paras[0].id]);
  assert.deepEqual(searchBook(db, FP, "traitor", mid, 10), []);
  // Ungated (wiki "Show everything").
  assert.equal(searchBook(db, FP, "traitor", { chapterIndex: -1, mode: "off" }, 10).length, 1);
  // Nothing read yet.
  assert.deepEqual(searchBook(db, FP, "harbour", at(-1), 10), []);
  // Passages are clamped too.
  assert.deepEqual(readIndexedParas(db, FP, 2, 0, 10, mid).map((p) => p.ord), [0]);
  db.close();
});

test("search: the index is rebuilt only when the book's content changes", async () => {
  const db = await openDb();
  let calls = 0;
  const books = fakeBooks({ [FP]: chapters });
  const counting = { getBook: (fp: string) => (calls++, books.getBook(fp)) };
  const [a, b] = await Promise.all([ensureIndexed(db, FP, counting, noYield), ensureIndexed(db, FP, counting, noYield)]);
  assert.deepEqual([a, b], [true, true]); // concurrent calls share one build
  assert.equal(calls, 1);
  assert.equal(await ensureIndexed(db, FP, counting, noYield), false);
  const changed = [...chapters.slice(0, 3), makeSourceChapter(3, ["The harbour master returned with a fleet."])];
  assert.equal(await ensureIndexed(db, FP, fakeBooks({ [FP]: changed }), noYield), true);
  assert.equal(searchBook(db, FP, "fleet", { chapterIndex: 0, mode: "off" }, 5).length, 1);
  assert.equal(searchBook(db, FP, "dawn", { chapterIndex: 0, mode: "off" }, 5).length, 0);
  db.close();
});

/** A SqlDb that claims the FTS5 table exists and records what the FTS path sends. */
function recordingFtsDb(): { db: SqlDb; calls: { sql: string; params?: SqlParams }[] } {
  const calls: { sql: string; params?: SqlParams }[] = [];
  const db: SqlDb = {
    driver: "better-sqlite3",
    exec() {},
    run: () => ({ changes: 0, lastInsertRowid: 0 }),
    get<T>(sql: string) {
      if (sql.includes("sqlite_master")) return { 1: 1 } as T; // book_fts exists
      if (sql.includes("SELECT ord FROM book_fts")) return { ord: 4 } as T;
      return undefined;
    },
    all<T>(sql: string, params?: SqlParams) {
      calls.push({ sql, params });
      return [{ chapter_index: 1, para_id: "p1.0", snippet: "…the harbour…", score: 3.5 }] as T[];
    },
    transaction: <T>(fn: () => T) => fn(),
    close() {},
  };
  return { db, calls };
}

test("search: FTS5 path uses MATCH with a phrase-first OR query, BM25 order and the frontier clamp", () => {
  const { db, calls } = recordingFtsDb();
  assert.equal(searchBackend(db), "fts5");
  const hits = searchBook(db, FP, 'harbour "master', at(1, "p9.0"), 7);
  assert.deepEqual(hits, [{ chapterIndex: 1, paraId: "p1.0", snippet: "…the harbour…", score: 3.5 }]);
  const q = calls[0];
  assert.match(q.sql, /book_fts MATCH \?/);
  assert.match(q.sql, /ORDER BY bm25\(book_fts\)/);
  assert.match(q.sql, /chapter_index <= \? OR \(chapter_index = \? AND ord <= \?\)/);
  assert.deepEqual(q.params, ['"harbour master" OR "harbour" OR "master"', FP, 1, 2, 4, 7]);
});

test("entity.lookup task: identifies a name from passages ≤ frontier and validates refs", async () => {
  const db = await openDb();
  const books = fakeBooks({ [FP]: chapters });
  const svc = createKnowledgeService({ db, spoilerMode: () => "frontier", books });
  const task = createEntityLookupTask(svc);
  const { ctx, provider } = createTaskContext({ task: "entity.lookup", services: { books, knowledge: svc } });
  provider.enqueue((req) => {
    const user = req.messages[req.messages.length - 1].content;
    assert.match(user, /\[P1\]/);
    assert.doesNotMatch(user, /traitor/); // chapter 2 is past the frontier
    return JSON.stringify({ name: "Mara", type: "character", description: "The lighthouse keeper's daughter.", confidence: 1.7, refs: ["P2", "P9", "p1"] });
  });
  const out = await task.run({ filePath: FP, name: "Mara", frontier: at(1) }, ctx);
  assert.equal(out.type, "character");
  assert.equal(out.confidence, 1); // clamped
  assert.equal(out.refs.length, 2); // P9 dropped (never sent)
  assert.ok(out.refChapters.every((c) => c <= 1));

  // Unknown name: no model call.
  const none = await task.run({ filePath: FP, name: "Zebulon", frontier: at(1) }, ctx);
  assert.equal(none.confidence, 0);
  assert.equal(provider.calls.length, 1);
  db.close();
});
