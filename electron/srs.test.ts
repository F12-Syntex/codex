/** WS-E: SM-2 scheduling (`shared/srs.ts`) and the vocabulary deck store. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, MIN_EASE, formatInterval, isDue, newSrsState, previewIntervals, reviewSrs, type SrsState } from "./shared/srs";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations } from "./db/migrate";
import { assistantMigrations } from "./assistant/schema";
import { VocabStore } from "./assistant/vocab";

const T0 = Date.UTC(2026, 0, 1);

test("new card: due immediately with ease 2.5", () => {
  const s = newSrsState(T0);
  assert.deepEqual(s, { intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, dueAt: T0 });
  assert.equal(isDue(s, T0), true);
});

test("SM-2 intervals: 1 day, 6 days, then previous × ease", () => {
  let s = newSrsState(T0);
  s = reviewSrs(s, "good", T0); // q4: ease unchanged (0.1 − 1·(0.08+0.02) = 0)
  assert.equal(s.intervalDays, 1);
  assert.equal(s.ease, 2.5);
  assert.equal(s.dueAt, T0 + DAY_MS);
  s = reviewSrs(s, "good", T0);
  assert.equal(s.intervalDays, 6);
  s = reviewSrs(s, "good", T0);
  assert.equal(s.intervalDays, 15); // round(6 × 2.5)
  s = reviewSrs(s, "good", T0);
  assert.equal(s.intervalDays, 38); // round(15 × 2.5)
  assert.equal(s.reps, 4);
});

test("ease changes per the SM-2 formula: easy +0.1, hard −0.14, floor 1.3", () => {
  const easy = reviewSrs(newSrsState(T0), "easy", T0);
  assert.equal(easy.ease, 2.6);
  const hard = reviewSrs(newSrsState(T0), "hard", T0);
  assert.equal(hard.ease, 2.36);
  let s: SrsState = newSrsState(T0);
  for (let i = 0; i < 20; i++) s = reviewSrs(s, 3, T0);
  assert.equal(s.ease, MIN_EASE);
});

test("a lapse resets the run to 1 day, keeps the ease and counts the lapse", () => {
  let s = newSrsState(T0);
  s = reviewSrs(s, "easy", T0);
  s = reviewSrs(s, "easy", T0);
  const before = s.ease;
  s = reviewSrs(s, "again", T0);
  assert.deepEqual([s.intervalDays, s.reps, s.lapses, s.ease], [1, 0, 1, before]);
  // Failing a never-learned card is not a lapse.
  assert.equal(reviewSrs(newSrsState(T0), "again", T0).lapses, 0);
  // After a lapse the ladder restarts at 1, 6.
  s = reviewSrs(s, "good", T0);
  assert.equal(s.intervalDays, 1);
  s = reviewSrs(s, "good", T0);
  assert.equal(s.intervalDays, 6);
});

test("invalid quality is rejected; reviews are pure", () => {
  const s = newSrsState(T0);
  assert.throws(() => reviewSrs(s, 6 as 5, T0), RangeError);
  reviewSrs(s, "easy", T0);
  assert.equal(s.reps, 0);
});

test("previews and formatting", () => {
  let s = newSrsState(T0);
  s = reviewSrs(reviewSrs(s, "good", T0), "good", T0);
  assert.deepEqual(previewIntervals(s, T0), { again: 1, hard: 15, good: 15, easy: 15 });
  assert.equal(formatInterval(6), "6 d");
  assert.equal(formatInterval(45), "1.5 mo");
  assert.equal(formatInterval(800), "2.2 yr");
});

test("vocab store: add (deduped per book), review schedules, due filter and stats", async () => {
  const db = await openSqlJsDb();
  runMigrations(db, [{ area: "assistant", migrations: assistantMigrations }], () => {});
  let now = T0;
  const v = new VocabStore(db, () => now);
  const ref = { filePath: "/b.epub", chapterId: "c1", paraId: "p1" };
  const a = v.add({ ref, term: "Gilded", context: "the gilded cage", definition: "covered in gold" });
  const again = v.add({ ref, term: "gilded", translation: "doré" });
  assert.equal(again.id, a.id, "same term + book updates the card");
  assert.equal(again.translation, "doré");
  assert.equal(again.definition, "covered in gold");
  v.add({ filePath: "/b.epub", term: "ephemeral" });
  v.add({ term: "liminal" }); // no book
  assert.deepEqual(v.stats(), { total: 3, due: 3, learned: 0, fresh: 3 });
  assert.equal(v.stats("/b.epub").total, 2);

  const r = v.review(a.id, "good");
  assert.equal(r.srs.intervalDays, 1);
  assert.deepEqual(v.get(a.id)!.ref, ref);
  assert.equal(v.list({ dueOnly: true }).length, 2);
  now = T0 + DAY_MS;
  assert.equal(v.list({ dueOnly: true }).length, 3);
  assert.deepEqual(v.stats(), { total: 3, due: 3, learned: 1, fresh: 2 });
  assert.equal(v.remove(a.id), true);
  assert.equal(v.stats().total, 2);
  assert.throws(() => v.add({ term: "  " }));
});
