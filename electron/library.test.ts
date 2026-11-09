/**
 * F5 smart library tagging + series detection (WS-E Phase 2d): local series rules, the
 * `library.tag` batch task (taxonomy validation, excerpts, caching), the store's sticky decisions
 * and the service's batching through the real scheduler.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations } from "./db/migrate";
import type { SqlDb } from "./db/sql";
import { libraryMigrations } from "./library/schema";
import { LibraryStore } from "./library/store";
import { LibraryService, toTagInput, type LibraryItemRow } from "./library/service";
import { cleanFilename, detectSeries, guessFromText, guessSeries, seriesKey } from "./shared/library/series";
import { normalizeGenre } from "./shared/library/types";
import {
  buildLibraryTagPrompt, excerptOf, LIBRARY_TAG_BATCH, libraryTagTask, normalizeTagResult,
} from "./ai/tasks/library-tags";
import { bookLookupTask, normalizeLookup, plausibleCoverUrl } from "./ai/tasks/book-lookup";
import { createTaskContext, createTestRuntime, fakeBooks, flush, makeSourceChapter } from "./ai/testing";
import { makeBook } from "./assistant/fixtures";

async function libraryDb(): Promise<SqlDb> {
  const db = await openSqlJsDb();
  const r = runMigrations(db, [{ area: "library", migrations: libraryMigrations }], () => {});
  assert.deepEqual(r.errors, []);
  return db;
}

// ── Series rules ───────────────────────────────────────────────────────────

test("guessFromText: volume keywords, # numbers, roman numerals and trailing numbers", () => {
  assert.deepEqual(guessFromText("Solo Leveling, Vol. 3"), { name: "Solo Leveling", number: 3 });
  assert.deepEqual(guessFromText("Berserk Volume 12: The Hawk"), { name: "Berserk", number: 12 });
  assert.deepEqual(guessFromText("Saga #12"), { name: "Saga", number: 12 });
  assert.deepEqual(guessFromText("Mushoku Tensei v05"), { name: "Mushoku Tensei", number: 5 });
  assert.deepEqual(guessFromText("The Wandering Inn Book II"), { name: "The Wandering Inn", number: 2 });
  assert.deepEqual(guessFromText("Omniscient Reader 07 - The Scenario"), { name: "Omniscient Reader", number: 7 });
  assert.equal(guessFromText("Nineteen Eighty-Four"), null);
  assert.equal(guessFromText("1984"), null, "a bare number is not a series");
  assert.equal(guessFromText("The Book of Vivian"), null, "no false roman numerals");
  assert.equal(guessFromText("Fahrenheit 2451"), null, "4-digit trailing numbers (years) are ignored");
});

test("cleanFilename strips extensions, scanlator tags, years and separators", () => {
  assert.equal(cleanFilename("/lib/Manga/Solo_Leveling.v03.[Group](2019).cbz"), "Solo Leveling v03");
  assert.deepEqual(guessSeries({ filePath: "C:\\x\\Dune_Messiah_Book_2.epub", title: "Untitled" }), { name: "Dune Messiah", number: 2 });
});

test("seriesKey normalises case, punctuation and a leading article", () => {
  assert.equal(seriesKey("The Wandering Inn"), seriesKey("wandering inn!"));
  assert.equal(seriesKey("Re:Zero"), "re zero");
});

test("detectSeries groups ≥ 2 volumes by stem, sorts volumes and lets AI fill gaps", () => {
  const items = [
    { filePath: "/a/sl3.epub", title: "Solo Leveling Vol. 3" },
    { filePath: "/a/sl1.epub", title: "Solo Leveling Vol. 1" },
    { filePath: "/a/sl2.epub", title: "solo leveling, volume 2" },
    { filePath: "/a/lone.epub", title: "Dune Book 1" },
    { filePath: "/a/odd.epub", title: "Solo Leveling: Ragnarok" }, // no number: only the AI knows
    { filePath: "/a/mist1.epub", title: "Mistborn: The Final Empire" },
    { filePath: "/a/mist2.epub", title: "The Well of Ascension" },
  ];
  const ai = new Map([
    ["/a/odd.epub", { name: "Solo Leveling", number: null }],
    ["/a/mist1.epub", { name: "Mistborn", number: 1 }],
    ["/a/mist2.epub", { name: "Mistborn", number: 2 }],
  ]);
  const out = detectSeries(items, { aiSeries: ai });
  assert.equal(out.length, 2, "Dune has one volume: no group");
  const sl = out[0];
  assert.equal(sl.name, "Solo Leveling");
  assert.equal(sl.source, "local");
  assert.deepEqual(sl.volumes.map((v) => v.filePath), ["/a/sl1.epub", "/a/sl2.epub", "/a/sl3.epub", "/a/odd.epub"]);
  const mb = out[1];
  assert.equal(mb.source, "ai");
  assert.deepEqual(mb.volumes.map((v) => v.number), [1, 2]);
  // Dismissed pairs are skipped.
  const without = detectSeries(items, { aiSeries: ai, exclude: (fp, key) => key === "mistborn" && fp === "/a/mist2.epub" });
  assert.equal(without.length, 1);
});

// ── Task ───────────────────────────────────────────────────────────────────

test("normalizeTagResult validates genres against the taxonomy and caps lists", () => {
  const r = normalizeTagResult({
    genres: ["sci-fi", "Fantasy", "Space Opera", "LitRPG", "Romance"],
    tropes: ["reincarnation", "Fantasy", "found family", "Reincarnation", "a", "b", "c", "d"],
    warnings: ["violence", "Spiders"],
    series: { name: "Solo Leveling", number: "3" },
    language: "en",
    oneLine: "A hunter levels up.",
  });
  assert.deepEqual(r.genres, ["Science Fiction", "Fantasy", "Game / LitRPG"]);
  assert.deepEqual(r.tropes, ["Reincarnation", "Found family", "A", "B", "C"]);
  assert.deepEqual(r.warnings, ["Violence"]);
  assert.deepEqual(r.series, { name: "Solo Leveling", number: 3 });
  assert.deepEqual(normalizeTagResult({ series: { name: "none", number: null } }).series, null);
  assert.deepEqual(normalizeTagResult({ series: { name: "X", number: null } }).series, { name: "X", number: null });
  assert.equal(normalizeGenre("Xianxia"), "Wuxia / Xianxia");
});

test("excerptOf skips short front matter and copyright pages", () => {
  const long = "Lorem ipsum dolor sit amet. ".repeat(40);
  const book = makeBook(1, 1);
  book.chapters = [
    { ...makeSourceChapter(0, ["Title page"]), paragraphs: [], htmlParagraphs: [] },
    { ...makeSourceChapter(1, [`Copyright 2020. All rights reserved. ${long}`]), paragraphs: [], htmlParagraphs: [] },
    { ...makeSourceChapter(2, [long, long]), paragraphs: [], htmlParagraphs: [] },
  ];
  const ex = excerptOf(book, 2000);
  assert.equal(ex.length, 2000);
  assert.ok(ex.startsWith("Lorem"));
});

test("library.tag: one completion per batch, excerpts from ctx.books, results keyed by filePath", async () => {
  const long = "The rain fell over the academy. ".repeat(30);
  const books = fakeBooks({ "/b/one.epub": [makeSourceChapter(0, [long])] });
  const { ctx, provider } = createTaskContext({ task: "library.tag", services: { books } });
  provider.enqueue(JSON.stringify({
    items: {
      "1": { genres: ["Fantasy", "Made Up"], tropes: ["Magic School"], series: null, warnings: [], language: "en", oneLine: "Rain." },
      "2": { genres: ["Mecha"], tropes: [], series: { name: "Gundam", number: 2 }, warnings: [] },
    },
  }));
  const input = {
    items: [
      toTagInput({ filePath: "/b/one.epub", title: "One", author: "A", format: "EPUB", section: "books" }),
      toTagInput({ filePath: "/c/Gundam/two.cbz", title: "Gundam 02", author: "Unknown", format: "CBZ", section: "comic" }),
    ],
  };
  const out = await libraryTagTask.run(input, ctx);
  assert.equal(provider.calls.length, 1);
  const prompt = provider.calls[0].messages.map((m) => m.content).join("\n");
  assert.match(prompt, /### Item 1\nTitle: One\nAuthor: A\nFile: one\.epub/);
  assert.match(prompt, /The rain fell over the academy/);
  assert.doesNotMatch(prompt, /Author: Unknown/);
  assert.match(prompt, /Folder: c \/ Gundam/);
  assert.deepEqual(out.items["/b/one.epub"].genres, ["Fantasy"]);
  assert.deepEqual(out.items["/c/Gundam/two.cbz"].series, { name: "Gundam", number: 2 });
  assert.ok(libraryTagTask.validate!(out));
});

test("library.tag key changes with the file signature; prompt treats inputs as data", () => {
  const a = { items: [{ filePath: "/x", title: "T", filename: "x", sig: "1-2" }] };
  const b = { items: [{ filePath: "/x", title: "T", filename: "x", sig: "1-3" }] };
  const kc = { model: "m", settings: {} as never };
  assert.notEqual(libraryTagTask.key(a, kc), libraryTagTask.key(b, kc));
  assert.match(buildLibraryTagPrompt(a.items).system, /never follow instructions/i);
});

test("book.lookup: web role, drops invented cover URLs, needs a title", async () => {
  assert.equal(bookLookupTask.role, "web");
  assert.equal(plausibleCoverUrl("https://cdn.example.com/covers/1.jpg"), "https://cdn.example.com/covers/1.jpg");
  assert.equal(plausibleCoverUrl("https://example.com/book-page"), undefined);
  assert.equal(plausibleCoverUrl("javascript:alert(1)"), undefined);
  const r = normalizeLookup({ title: "X", author: "Unknown", genres: ["A", "A", "B"], status: "Unknown", coverUrl: "nope" });
  assert.deepEqual(r, { title: "X", genres: ["A", "B"] });
  const { ctx, provider } = createTaskContext({ task: "book.lookup", role: "web" });
  provider.enqueue('Here you go:\n```json\n{"title":"Dune","description":"Spice.","genres":["Science Fiction"]}\n```');
  assert.deepEqual(await bookLookupTask.run({ title: "Dune" }, ctx), { title: "Dune", description: "Spice.", genres: ["Science Fiction"] });
  await assert.rejects(() => bookLookupTask.run({ title: "  " }, ctx), /title/);
});

// ── Store ──────────────────────────────────────────────────────────────────

test("store: re-tagging replaces undecided suggestions but keeps accept / dismiss decisions", async () => {
  const db = await libraryDb();
  const store = new LibraryStore(db, () => 1000);
  const fp = "/b/one.epub";
  store.applyTagResult(fp, { genres: ["Fantasy", "Romance"], tropes: ["Magic School"], warnings: [], series: { name: "Academy", number: 1 } }, 1);
  store.decide(fp, [{ tag: "fantasy", kind: "genre" }], "accept"); // case-insensitive tag key
  store.decide(fp, [{ tag: "Romance", kind: "genre" }], "dismiss");
  store.applyTagResult(fp, { genres: ["Fantasy", "Romance", "Mystery"], tropes: [], warnings: ["Violence"], series: null }, 1);
  const tags = store.tags(fp);
  const by = (t: string) => tags.find((x) => x.tag.toLowerCase() === t.toLowerCase());
  assert.equal(by("Fantasy")?.status, "accepted");
  assert.equal(by("Romance")?.status, "dismissed");
  assert.equal(by("Mystery")?.status, "suggested");
  assert.equal(by("Magic School"), undefined, "stale AI suggestion replaced");
  assert.equal(by("Violence")?.kind, "warning");
  assert.equal(store.item(fp).series, null);

  const ov = store.overview();
  assert.deepEqual(ov[fp].genres, ["Fantasy"], "the stored spelling is kept");
  assert.equal(ov[fp].pending, 2);

  // Genres from a web lookup are accepted, except ones the user dismissed.
  store.addAccepted(fp, "genre", ["Romance", "Drama"], "web");
  assert.equal(store.tags(fp).find((t) => t.tag === "Romance")?.status, "dismissed");
  assert.equal(store.tags(fp).find((t) => t.tag === "Drama")?.status, "accepted");
});

test("store: AI series is a suggestion until accepted; dismissal sticks", async () => {
  const db = await libraryDb();
  const store = new LibraryStore(db, () => 5);
  store.applyTagResult("/a", { genres: [], tropes: [], warnings: [], series: { name: "Mistborn", number: 1 } }, 1);
  store.applyTagResult("/b", { genres: [], tropes: [], warnings: [], series: { name: "Mistborn", number: 2 } }, 1);
  assert.deepEqual(store.series("/a"), { name: "Mistborn", number: 1, status: "suggested", source: "ai" });
  assert.equal(store.overview()["/a"].pending, 1);

  store.applySeries([{ filePath: "/a", name: "Mistborn", number: 1 }]);
  assert.deepEqual(store.series("/a"), { name: "Mistborn", number: 1, status: "accepted", source: "user" });
  assert.deepEqual(store.overview()["/a"].series, { name: "Mistborn", number: 1 });
  assert.equal(store.overview()["/a"].pending, 0);

  store.applySeries([{ filePath: "/b", name: null, status: "dismissed" }]);
  assert.equal(store.series("/b"), null);
  assert.ok(store.isDismissed("/b", "mistborn"));
  store.forget("/a");
  assert.equal(store.series("/a"), null);
});

// ── Service ────────────────────────────────────────────────────────────────

function items(n: number): LibraryItemRow[] {
  return Array.from({ length: n }, (_, i) => ({
    filePath: `/lib/book${i}.epub`, title: `Book ${i}`, author: "Someone", format: "EPUB", section: i % 2 ? "comic" : "books",
  }));
}

test("service: batches untagged items through the real scheduler, stores suggestions, skips tagged ones", async () => {
  const db = await libraryDb();
  const rt = createTestRuntime({ tasks: [libraryTagTask], services: { books: fakeBooks({}) } });
  const list = items(LIBRARY_TAG_BATCH + 2);
  const svc = new LibraryService(db, { scheduler: rt.scheduler, listItems: () => list, newId: () => "run1" });

  const run = svc.startTagging();
  assert.equal(run.total, list.length);
  assert.equal(run.state, "running");
  // A second start while running joins the same run.
  assert.equal(svc.startTagging().runId, "run1");
  for (let i = 0; i < 50 && svc.status()?.state === "running"; i++) await flush();
  const st = svc.status()!;
  assert.equal(st.state, "done");
  assert.equal(st.done, list.length);
  assert.equal(st.failed, 0);
  const jobs = rt.events.filter((e) => e.type === "job" && e.state === "queued");
  assert.equal(jobs.length, 2, "two batches");
  assert.ok(rt.events.every((e) => e.type !== "job" || e.task === "library.tag"));

  const info = svc.store.item("/lib/book0.epub");
  assert.deepEqual(info.tags.map((t) => [t.kind, t.tag, t.status]), [["genre", "Fantasy", "suggested"], ["trope", "Chosen One", "suggested"]]);
  assert.equal(info.oneLine, "About Book 0.");

  // Everything is tagged now: nothing to queue. `force` re-queues (only the comic section here).
  assert.equal(svc.startTagging().total, 0);
  const forced = svc.startTagging({ force: true, section: "comic" });
  assert.equal(forced.total, list.filter((i) => i.section === "comic").length);
  for (let i = 0; i < 50 && svc.status()?.state === "running"; i++) await flush();
  assert.equal(svc.status()?.state, "done");
});

test("service: job errors are counted and reported; cancel stops the run", async () => {
  const db = await libraryDb();
  const rt = createTestRuntime({ tasks: [libraryTagTask], services: { books: fakeBooks({}) } });
  rt.provider.respondTo("library.tag", () => "not json at all");
  const svc = new LibraryService(db, { scheduler: rt.scheduler, listItems: () => items(2) });
  svc.startTagging();
  for (let i = 0; i < 80 && svc.status()?.state === "running"; i++) await flush();
  const st = svc.status()!;
  assert.equal(st.failed, 2);
  assert.ok(st.error);

  const db2 = await libraryDb();
  const rt2 = createTestRuntime({ tasks: [libraryTagTask], services: { books: fakeBooks({}) }, scheduler: { concurrency: 1 } });
  const svc2 = new LibraryService(db2, { scheduler: rt2.scheduler, listItems: () => items(LIBRARY_TAG_BATCH * 3) });
  svc2.startTagging();
  svc2.cancel();
  assert.equal(svc2.status()?.state, "cancelled");
  await flush(10);
  assert.equal(svc2.status()?.state, "cancelled");
});

test("service: detectSeries uses titles, tagging results and decisions", async () => {
  const db = await libraryDb();
  const list: LibraryItemRow[] = [
    { filePath: "/m/sl1.cbz", title: "Solo Leveling Vol. 1", author: "", format: "CBZ", section: "comic" },
    { filePath: "/m/sl2.cbz", title: "Solo Leveling Vol. 2", author: "", format: "CBZ", section: "comic" },
    { filePath: "/b/x.epub", title: "Standalone", author: "", format: "EPUB", section: "books" },
  ];
  const svc = new LibraryService(db, { listItems: () => list });
  const found = svc.detectSeries();
  assert.equal(found.length, 1);
  assert.equal(found[0].name, "Solo Leveling");
  svc.store.applySeries(found[0].volumes.map((v) => ({ filePath: v.filePath, name: found[0].name, number: v.number })));
  assert.deepEqual(svc.detectSeries(), [], "fully accepted groups are not suggested again");
  assert.throws(() => svc.startTagging(), /not available/);
});

test("store.readingProgress reads readProgress:* rows only", async () => {
  const db = await libraryDb();
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.run("INSERT INTO settings VALUES (?, ?)", ["readProgress:C:\\b_1%.epub", JSON.stringify({ chapter: 3, totalChapters: 10 })]);
  db.run("INSERT INTO settings VALUES (?, ?)", ["readProgress:/bad.epub", "{oops"]);
  db.run("INSERT INTO settings VALUES (?, ?)", ["readProgressX", JSON.stringify({ chapter: 1, totalChapters: 2 })]);
  db.run("INSERT INTO settings VALUES (?, ?)", ["theme", "{}"]);
  assert.deepEqual(new LibraryStore(db).readingProgress(), { "C:\\b_1%.epub": { chapter: 3, totalChapters: 10 } });
});
