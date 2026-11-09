/**
 * WS-C Phase 2c: user anchors (annotations, para_anchors) and the one-time per-book legacy
 * migration (index anchors → ParaRef, re-anchoring by quote text; legacy AI blobs → artifacts).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations, AREA_MIGRATIONS } from "./db/migrate";
import type { SqlDb } from "./db/sql";
import { toBookContentV2 } from "./shared/pipeline/source";
import { buildChapter, resolveAnchor } from "./shared/pipeline/build";
import { EMPTY_LEXICON } from "./shared/pipeline/lexicon";
import type { BookContentV2, FormatLayer, RewriteLayer } from "./shared/pipeline/types";
import {
  legacyFormatLayer, legacyRewriteLayer, migrateBookLegacy, normalizeForMatch, paraAtIndex, reanchorByQuote,
  LEGACY_MIGRATION_FLAG,
} from "./book/legacy-migrate";
import { addAnnotation, deleteAnnotation, listAnchors, listAnnotations, setAnchor, deleteAnchor } from "./book/anchors";
import { getReadMarks } from "./book/read-marks";
import { SqlArtifactStore, SqlPrefsStore } from "./ai/artifacts";
import { SqlStyleStore } from "./ai/style";

const FP = "/books/novel.epub";

function makeBook(): BookContentV2 {
  return toBookContentV2(FP, {
    isImageBook: false,
    toc: [],
    chapters: [
      {
        title: "Chapter 1",
        paragraphs: [],
        htmlParagraphs: [
          "<p>Chapter 1</p>",
          "<p>Mira stepped into the hall.</p>",
          "<p></p>",
          "<p>“We leave at dawn,” said Kael, not looking up from the map.</p>",
          "<p>The candles guttered as the wind rose.</p>",
          "<p>She thought about the god of war and his broken spear.</p>",
        ],
      },
      {
        title: "Chapter 2",
        paragraphs: [],
        htmlParagraphs: ["<p>Morning came grey and cold.</p>", "<p>Kael was already gone.</p>"],
      },
    ],
  });
}

async function makeDb(): Promise<SqlDb> {
  const db = await openSqlJsDb();
  db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  runMigrations(db, AREA_MIGRATIONS, () => {});
  // Legacy tables owned by electron/database.ts.
  db.exec(`
    CREATE TABLE quotes (id INTEGER PRIMARY KEY AUTOINCREMENT, filePath TEXT NOT NULL, chapterIndex INTEGER NOT NULL,
      paragraphIndex INTEGER NOT NULL, text TEXT NOT NULL, chapterTitle TEXT NOT NULL DEFAULT '', bookTitle TEXT NOT NULL DEFAULT '',
      speaker TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'quote', note TEXT NOT NULL DEFAULT '',
      aiEnhanced INTEGER NOT NULL DEFAULT 0, createdAt TEXT);
    CREATE TABLE bookmarks (id INTEGER PRIMARY KEY AUTOINCREMENT, filePath TEXT NOT NULL, chapterIndex INTEGER NOT NULL,
      paragraphIndex INTEGER NOT NULL, label TEXT NOT NULL, createdAt TEXT);
    CREATE TABLE sim_branches (id TEXT NOT NULL, file_path TEXT NOT NULL, entity_id TEXT NOT NULL, entity_name TEXT NOT NULL,
      chapter_index INTEGER NOT NULL, truncate_after_para INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT '2025-01-02 03:04:05',
      PRIMARY KEY (file_path, id));
    CREATE TABLE sim_segments (id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT NOT NULL, branch_id TEXT NOT NULL,
      segment_index INTEGER NOT NULL, user_input TEXT NOT NULL, html_paragraphs TEXT NOT NULL, created_at TEXT);
  `);
  return db;
}

const setKey = (db: SqlDb, key: string, value: unknown) =>
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, JSON.stringify(value)]);

test("re-anchoring helpers: normalize, index fallback, quote text beats a stale index", () => {
  const ch = makeBook().chapters[0];
  assert.equal(normalizeForMatch("“We leave — at DAWN,”"), "we leave at dawn");
  // Index 2 is an empty paragraph → the next text paragraph.
  assert.equal(paraAtIndex(ch, 2)?.id, ch.paras[3].id);
  // Out of range clamps to the last text paragraph.
  assert.equal(paraAtIndex(ch, 99)?.id, ch.paras[5].id);
  // A quote saved while a condensed variant (no empty paras) was showing: index 2 is stale.
  assert.equal(reanchorByQuote(ch, "the candles guttered", 2)?.id, ch.paras[4].id);
  // Smart quotes / punctuation differences don't matter.
  assert.equal(reanchorByQuote(ch, '"We leave at dawn," said Kael', 0)?.id, ch.paras[3].id);
  // A quote from a polished variant: word overlap still finds it.
  assert.equal(reanchorByQuote(ch, "she was thinking about the god of war and his spear", 0)?.id, ch.paras[5].id);
  assert.equal(reanchorByQuote(ch, "nothing like this exists", 1), null);
});

test("annotations + anchors CRUD", async () => {
  const db = await makeDb();
  const ch = makeBook().chapters[0];
  const a = addAnnotation(db, { filePath: FP, chapterId: ch.id, paraId: ch.paras[1].id, kind: "comment", text: "Nice", quote: "Mira" }, 5);
  assert.deepEqual(listAnnotations(db, FP).map((x) => [x.id, x.text, x.paraId, x.createdAt]), [[a.id, "Nice", ch.paras[1].id, 5]]);
  assert.throws(() => addAnnotation(db, { filePath: FP, chapterId: ch.id, paraId: ch.paras[1].id, kind: "comment", text: " " }));
  deleteAnnotation(db, a.id);
  assert.equal(listAnnotations(db, FP).length, 0);

  setAnchor(db, { kind: "quote", refId: "7", filePath: FP, chapterId: ch.id, paraId: ch.paras[4].id, quote: "candles" });
  setAnchor(db, { kind: "quote", refId: "7", filePath: FP, chapterId: ch.id, paraId: ch.paras[5].id, quote: "god" });
  assert.deepEqual(listAnchors(db, FP), [{ kind: "quote", refId: "7", filePath: FP, chapterId: ch.id, paraId: ch.paras[5].id, quote: "god" }]);
  deleteAnchor(db, "quote", "7");
  assert.equal(listAnchors(db, FP).length, 0);
});

test("legacy migration: user data → ParaRef anchors that survive rewrite/format layers (matrix #5)", async () => {
  const db = await makeDb();
  const book = makeBook();
  const [c0, c1] = book.chapters;

  // Comments: one user, one AI on legacy index 4 ("candles").
  setKey(db, `chapterComments:${FP}`, {
    0: [
      { paraIndex: 4, text: "Ominous!", author: "user" },
      { paraIndex: 4, text: "lol the wind again", author: "ai" },
    ],
  });
  // Quote saved from a condensed variant at a stale index.
  db.run("INSERT INTO quotes (filePath, chapterIndex, paragraphIndex, text) VALUES (?, 0, 2, 'The candles guttered as the wind rose.')", [FP]);
  // Bookmark (legacy always paragraphIndex 0, a title paragraph here → kept at para 0's chapter).
  db.run("INSERT INTO bookmarks (filePath, chapterIndex, paragraphIndex, label) VALUES (?, 1, 0, 'Ch2')", [FP]);
  setKey(db, `ttsReadMarks:${FP}`, { 0: 3, 1: 99 });
  db.run("INSERT INTO sim_branches (id, file_path, entity_id, entity_name, chapter_index, truncate_after_para) VALUES ('sim_1', ?, 'kael', 'Kael', 0, 3)", [FP]);
  db.run("INSERT INTO sim_segments (file_path, branch_id, segment_index, user_input, html_paragraphs) VALUES (?, 'sim_1', 0, 'Refuse', ?)", [
    FP, JSON.stringify(['<p onclick="x()">He refused.</p>', "<script>bad()</script>"]),
  ]);

  const r = migrateBookLegacy(db, FP, book, { now: () => 1000 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.userComments, 1);
  assert.equal(r.aiComments, 1);
  assert.equal(r.quotes, 1);
  assert.equal(r.bookmarks, 1);
  assert.equal(r.readMarks, 2);
  assert.equal(r.branches, 1);

  const [ann] = listAnnotations(db, FP);
  assert.equal(ann.paraId, c0.paras[4].id);
  assert.equal(ann.text, "Ominous!");
  const arts = new SqlArtifactStore(db);
  assert.deepEqual(arts.get<{ comments: unknown[] }>(FP, c0.id, "comments")?.data.comments, [{ paraId: c0.paras[4].id, text: "lol the wind again" }]);

  const anchors = listAnchors(db, FP);
  const quote = anchors.find((a) => a.kind === "quote")!;
  assert.equal(quote.paraId, c0.paras[4].id, "quote re-anchored by its text, not the stale index");
  assert.equal(anchors.find((a) => a.kind === "bookmark")!.chapterId, c1.id);

  const marks = getReadMarks(db, FP);
  assert.equal(marks[c0.id], c0.paras[3].id);
  assert.equal(marks[c1.id], c1.paras[1].id, "out-of-range read mark clamps to the chapter's last paragraph");

  const br = db.get<{ para_id: string; chapter_id: string; title: string }>("SELECT * FROM assistant_branches WHERE id = 'sim_1'")!;
  assert.equal(br.para_id, c0.paras[3].id);
  const seg = db.get<{ paragraphs: string }>("SELECT paragraphs FROM assistant_branch_segments WHERE branch_id = 'sim_1'")!;
  assert.deepEqual(JSON.parse(seg.paragraphs), ["<p>He refused.</p>"], "segments sanitized");

  // The anchors stay on paragraph X when layers drop/merge it.
  const rewrite: RewriteLayer = {
    mode: "concise", artifactHash: "rw", sourceHash: c0.sourceHash,
    paras: Object.fromEntries(c0.paras.map((p, i) => [p.id, i === 4 ? { dropped: true as const } : { html: p.html }])),
  };
  const dropped = buildChapter(c0, { lexicon: EMPTY_LEXICON, rewrite });
  assert.equal(dropped.paras[resolveAnchor(dropped, quote.paraId)].id, c0.paras[5].id, "dropped → next visible");
  const format: FormatLayer = {
    artifactHash: "f", base: "source", baseHash: c0.sourceHash,
    paras: { [c0.paras[3].id]: { html: c0.paras[3].html.replace("</p>", " " + c0.paras[4].text + "</p>") }, [c0.paras[4].id]: { mergedInto: c0.paras[3].id } },
  };
  const merged = buildChapter(c0, { lexicon: EMPTY_LEXICON, format });
  assert.equal(merged.paras[resolveAnchor(merged, ann.paraId)].id, c0.paras[3].id, "merged → merge host");

  // Idempotent: a second run is skipped and adds nothing.
  assert.equal(migrateBookLegacy(db, FP, book).skipped, true);
  db.run("DELETE FROM settings WHERE key = ?", [LEGACY_MIGRATION_FLAG + FP]);
  const again = migrateBookLegacy(db, FP, book);
  assert.equal(again.userComments + again.quotes + again.bookmarks + again.readMarks + again.branches, 0, "no duplicates on re-run");
  assert.equal(listAnnotations(db, FP).length, 1);
});

test("legacy migration: AI blobs → artifacts + prefs + style, validated like fresh output", async () => {
  const db = await makeDb();
  const book = makeBook();
  const c0 = book.chapters[0];

  setKey(db, `enrichedChapters:${FP}`, { 0: "Chapter 1: The Hall", 7: "out of range" });
  setKey(db, `enrichEnabled:${FP}`, true);
  setKey(db, `condenseEnabled:${FP}`, true);
  setKey(db, `formattingEnabled:${FP}`, false);
  setKey(db, `wikiEnabled:${FP}`, true);
  // Condensed: one string per non-empty text paragraph (5), the 4th dropped.
  setKey(db, `condensedChapters:${FP}`, { 0: ["Chapter 1", "Mira entered.", "“We leave at dawn,” said Kael.", "", "She thought of the war god."], 1: ["only one"] });
  // Formatted original: 1:1 with source paras; one para rewrites prose (rejected), one is markup only.
  const fmt = c0.paras.map((p) => p.html);
  fmt[3] = '<p><span class="ai-fmt-dialogue-blue">Kael</span> “We leave at dawn,” said Kael, not looking up from the map.</p>';
  fmt[4] = "<p>Totally different words here now.</p>";
  fmt[5] = '<p onmouseover="x()">She thought about the <em>god of war</em> and his broken spear.</p>';
  setKey(db, `formattedChapters:${FP}`, { 0: fmt });
  setKey(db, `styleDictionary:${FP}`, { rules: [{ id: "r", pattern: "p", component: "ai-fmt-x", exampleHtml: "<img src=x onerror=alert(1)>", category: "c" }], bookTitle: "B", updatedAt: "t" });

  const r = migrateBookLegacy(db, FP, book, { now: () => 1 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.titles, 1);
  assert.equal(r.rewrites, 1, "chapter 1 condensed count doesn't line up → skipped");
  assert.equal(r.formats, 1);
  assert.equal(r.prefs, true);
  assert.equal(r.style, true);

  const arts = new SqlArtifactStore(db);
  assert.equal(arts.get<{ title: string }>(FP, c0.id, "title")?.data.title, "Chapter 1: The Hall");
  const rw = arts.get<RewriteLayer>(FP, c0.id, "rewrite", "concise")!.data;
  assert.deepEqual(rw.paras[c0.paras[4].id], { dropped: true });
  assert.deepEqual(rw.paras[c0.paras[1].id], { html: "<p>Mira entered.</p>" });
  assert.deepEqual(rw.paras[c0.paras[2].id], { html: c0.paras[2].html }, "empty paragraph kept as is");
  assert.deepEqual(legacyRewriteLayer(c0, ["Chapter 1", "Mira entered.", "“We leave at dawn,” said Kael.", "", "She thought of the war god."]), rw);

  const f = arts.get<FormatLayer>(FP, c0.id, "format", "")!.data;
  assert.equal(f.baseHash, c0.sourceHash);
  assert.ok(!(c0.paras[4].id in f.paras), "prose rewrite rejected (text preservation)");
  const p3 = f.paras[c0.paras[3].id];
  assert.ok(p3 && "html" in p3 && p3.html.includes("data-tts-skip"), "speaker badge normalised for TTS");
  const p5 = f.paras[c0.paras[5].id];
  assert.ok(p5 && "html" in p5 && !p5.html.includes("onmouseover"), "sanitized");
  assert.equal(legacyFormatLayer(c0, fmt.slice(1), null), null, "length mismatch → skipped");

  const prefs = new SqlPrefsStore(db).get(FP);
  assert.equal(prefs.titles, true);
  assert.equal(prefs.rewrite, "concise");
  assert.equal(prefs.formatting, false);
  assert.equal(prefs.knowledge, true);
  const style = new SqlStyleStore(db).get(FP);
  assert.equal(style.rules[0].exampleHtml.includes("onerror"), false);
});
