/**
 * Phase 2c reader cutover (WS-C): matrix scenarios that can be checked without a window.
 *   #6  one lexicon for page, speed reader, TTS and entity names
 *   #4  word highlights: speech tokens map to DOM words with speaker badges skipped
 *   #11 the last reader window of a book closes → its chapter work stops, nothing is written
 *   TOC titles come from the orchestrator (no renderer state)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations } from "./db/migrate";
import { chaptersMigrations } from "./ai/artifacts-schema";
import { SqlArtifactStore, SqlPrefsStore } from "./ai/artifacts";
import { SqlStyleStore } from "./ai/style";
import { ChapterOrchestrator } from "./ai/orchestrator";
import { createFakeScheduler, fakeBooks, flush, makeSourceChapter, Priority } from "./ai/testing";
import type { BookAIPrefs } from "./shared/ai/types";
import type { RewriteOutput } from "./ai/tasks/condense";
import type { TitleInput, TitleOutput } from "./ai/tasks/title";
import { buildChapter } from "./shared/pipeline/build";
import { applyLexiconText, makeLexicon } from "./shared/pipeline/lexicon";
import { tokenizeVisible, wordRangesInNodes } from "./shared/pipeline/speech";
import { toBookContentV2 } from "./shared/pipeline/source";
import type { FormatLayer } from "./shared/pipeline/types";
import { trackReaderWindow, onBookLastWindowClosed, _resetReaderWindowsForTests } from "./book/windows";

const BOOK = "/books/cutover.epub";

async function setup(prefs: Partial<BookAIPrefs>) {
  const db = await openSqlJsDb();
  runMigrations(db, [{ area: "chapters", migrations: chaptersMigrations }], () => {});
  const fs = createFakeScheduler();
  const chapters = Array.from({ length: 6 }, (_, i) => makeSourceChapter(i, [`Chapter ${i} opens.`, `Then ${i}.`], `Chapter ${i + 1}`));
  const artifacts = new SqlArtifactStore(db);
  const prefStore = new SqlPrefsStore(db);
  prefStore.set(BOOK, prefs);
  const orch = new ChapterOrchestrator({
    scheduler: fs, books: fakeBooks({ [BOOK]: chapters }), artifacts, prefs: prefStore, style: new SqlStyleStore(db),
    emit: () => {}, options: { bookTitle: () => "T", bulkWindow: 4 },
  });
  return { fs, orch, artifacts, chapters };
}

test("#6 one lexicon: page html, visible text (speed reader), speech and entity names agree", () => {
  const book = toBookContentV2(BOOK, {
    isImageBook: false, toc: [],
    chapters: [{ title: "C", paragraphs: [], htmlParagraphs: ["<p>The God of War laughed. The god was old.</p>"] }],
  });
  const lexicon = makeLexicon([{ from: "god", to: "Ascendant" }]);
  const ch = buildChapter(book.chapters[0], {
    lexicon,
    entities: [{ id: "gow", names: ["God of War"], color: "rose", type: "character" }],
  });
  const p = ch.paras[0];
  assert.match(p.html, /<span class="wiki-entity wiki-entity-rose" data-wiki-id="gow">Ascendant of War<\/span>/, "entity still highlighted after replacement");
  assert.equal(p.text, "The Ascendant of War laughed. The ascendant was old.", "speed reader / matching text");
  assert.equal(p.speech?.text, "The Ascendant of War laughed. The ascendant was old.", "TTS reads what the page shows");
  assert.equal(applyLexiconText("God of War", lexicon, "display"), "Ascendant of War", "entity cards / assistant text");
});

test("#4 speech tokens → DOM words: speaker badges are skipped on both sides", () => {
  const src = toBookContentV2(BOOK, {
    isImageBook: false, toc: [],
    chapters: [{ title: "C", paragraphs: [], htmlParagraphs: ["<p>“We leave at dawn,” said Kael.</p>"] }],
  }).chapters[0];
  const pid = src.paras[0].id;
  const format: FormatLayer = {
    artifactHash: "f", base: "source", baseHash: src.sourceHash,
    paras: { [pid]: { html: '<p><span class="ai-fmt-dialogue-blue" data-tts-skip>Kael</span> “We leave at dawn,” said <em>Ka</em>el.</p>' } },
  };
  const ch = buildChapter(src, { lexicon: makeLexicon([]), format, entities: [{ id: "k", names: ["Kael"], color: "blue", type: "character" }] });
  const p = ch.paras[0];
  assert.equal(p.speech?.text, "“We leave at dawn,” said Kael.", "the badge is not spoken");
  // The DOM walker (TextContent.wordRangeIn) sees these text nodes, skip subtrees excluded.
  const visible = tokenizeVisible(p.html);
  const lastTok = p.speech!.tokens[p.speech!.tokens.length - 1];
  assert.equal(visible.text.slice(visible.words[lastTok.domWord].start, visible.words[lastTok.domWord].end), "Kael.");
  // "Ka" + "el." split across an <em> is still one word for the DOM highlighter.
  const nodes = [" ", "“We leave at dawn,” said ", "Ka", "el."];
  assert.deepEqual(wordRangesInNodes(nodes, lastTok.domWord), [{ node: 2, start: 0, end: 2 }, { node: 3, start: 0, end: 3 }]);
});

test("#11 last reader window closed → the book's bulk run and queued work stop; nothing is written", async () => {
  _resetReaderWindowsForTests();
  const { fs, orch, artifacts, chapters } = await setup({ rewrite: "concise" });
  const closed: string[] = [];
  onBookLastWindowClosed((fp) => {
    closed.push(fp);
    orch.cancelBook(fp);
  });
  const make = (id: number) => {
    let destroyed = false;
    let onClosed: (() => void) | null = null;
    return {
      win: { isDestroyed: () => destroyed, webContents: { id }, once: (_e: "closed", cb: () => void) => { onClosed = cb; } },
      close: () => { destroyed = true; onClosed?.(); },
    };
  };
  const a = make(1);
  const b = make(2);
  trackReaderWindow(a.win, BOOK);
  trackReaderWindow(b.win, BOOK);

  await orch.ensure({ filePath: BOOK, chapterIndex: 0, priority: Priority.Visible });
  const { runId } = await orch.startBulk({ filePath: BOOK, kinds: ["rewrite"], from: 1, to: 5 });
  await flush();
  const jobs = fs.jobs({ task: "chapter.condense" });
  assert.ok(jobs.length >= 2);

  a.close();
  assert.deepEqual(closed, [], "another window still shows the book: keep working");
  b.close();
  assert.deepEqual(closed, [BOOK]);
  await flush();
  assert.equal(orch.bulkStatus(BOOK)?.runId, runId);
  assert.equal(orch.bulkStatus(BOOK)?.state, "cancelled");
  for (const j of jobs) assert.equal(fs.job(j.jobId)!.state, "cancelled");

  // A late result for a cancelled job must not land as an artifact.
  for (const j of jobs) fs.complete(j.jobId, { paras: {}, stats: {} } as unknown as RewriteOutput);
  await flush();
  for (const c of chapters) assert.equal(artifacts.get(BOOK, c.id, "rewrite", "concise"), null);
  _resetReaderWindowsForTests();
});

test("TOC titles come from ready title artifacts (only while the titles pref is on)", async () => {
  const { fs, orch, chapters } = await setup({ titles: true });
  await orch.ensure({ filePath: BOOK, chapterIndex: 2, priority: Priority.Visible });
  await flush();
  fs.completeAll("chapter.title", (spec) => ({
    titles: Object.fromEntries((spec.input as TitleInput).chapters.map((c) => [c.id, "The Grey Morning"])),
  }) satisfies TitleOutput);
  await flush();
  const titles = await orch.chapterTitles(BOOK);
  assert.ok(titles[2] && titles[2].includes("The Grey Morning"), JSON.stringify(titles));
  assert.equal(Object.keys(titles).every((k) => chapters[Number(k)]), true);
  orch.setPrefs(BOOK, { titles: false });
  assert.deepEqual(await orch.chapterTitles(BOOK), {});
});
