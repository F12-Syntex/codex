/**
 * WS-C: main-side content cache (BookContentReader) and the book:* / lexicon:* RPC handlers.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { BookContentCache, formatFromExtension } from "./book/content-cache";
import { registerBook, getLexiconStore } from "./book/ipc";
import { createAreaContext } from "./ipc/registry";
import type { IpcMainLike, WindowLike } from "./ipc/context";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations } from "./db/migrate";
import { bookMigrations } from "./book/schema";
import { toBookContentV2 } from "./shared/pipeline/source";
import { parseBookContentV2 } from "./book-parser";
import { makeEpub } from "./book/test-fixtures";
import type { BookContentV2 } from "./shared/pipeline/types";
import type { BookContentReader } from "./ai/registry";

const fakeBook = (fp: string, n = 2): BookContentV2 =>
  toBookContentV2(fp, {
    isImageBook: false,
    toc: [],
    chapters: Array.from({ length: n }, (_, i) => ({ title: `C${i}`, paragraphs: [`p${i}`], htmlParagraphs: [`<p>p${i}</p>`] })),
  });

function makeCache(opts: { formats?: Record<string, string>; maxEntries?: number } = {}) {
  const mtimes: Record<string, number> = {};
  const parses: { fp: string; fmt: string }[] = [];
  const cache = new BookContentCache({
    parse: async (fp, fmt) => { parses.push({ fp, fmt }); return fakeBook(fp); },
    lookupFormat: (fp) => opts.formats?.[fp] ?? null,
    stat: (fp) => (fp.includes("missing") ? null : { mtimeMs: mtimes[fp] ?? 1, size: 10 }),
    maxEntries: opts.maxEntries,
  });
  return { cache, parses, mtimes };
}

test("content cache: implements BookContentReader; caches, dedupes, re-parses on mtime change", async () => {
  const { cache, parses, mtimes } = makeCache();
  const reader: BookContentReader = cache;
  const [a, b] = await Promise.all([reader.getBook("/x.epub"), reader.getBook("/x.epub")]);
  assert.equal(a, b);
  assert.equal(parses.length, 1, "concurrent requests share one parse");
  assert.equal(await reader.getBook("/x.epub"), a);
  assert.equal(parses.length, 1);
  mtimes["/x.epub"] = 2;
  assert.notEqual(await reader.getBook("/x.epub"), a);
  assert.equal(parses.length, 2);

  const ch = await reader.getChapter("/x.epub", 1);
  assert.equal(ch.index, 1);
  assert.equal("paragraphs" in ch, false, "getChapter strips legacy mirrors");
  await assert.rejects(reader.getChapter("/x.epub", 5), RangeError);
  await assert.rejects(reader.getBook("/missing.epub"), /not found/);
});

test("content cache: format from the library row first, then the extension", async () => {
  const { cache, parses } = makeCache({ formats: { "/lib/book.bin": "PDF" } });
  await cache.getBook("/lib/book.bin");
  await cache.getBook("/lib/comic.cbz");
  assert.deepEqual(parses.map((p) => p.fmt), ["PDF", "CBZ"]);
  assert.equal(formatFromExtension("/a/b.Epub"), "EPUB");
});

test("content cache: LRU eviction keeps the most recent books", async () => {
  const { cache, parses } = makeCache({ maxEntries: 2 });
  await cache.getBook("/1.epub");
  await cache.getBook("/2.epub");
  await cache.getBook("/1.epub"); // refresh 1
  await cache.getBook("/3.epub"); // evicts 2
  assert.equal(cache.size, 2);
  await cache.getBook("/1.epub");
  assert.equal(parses.length, 3);
  await cache.getBook("/2.epub");
  assert.equal(parses.length, 4);
  cache.invalidate();
  assert.equal(cache.size, 0);
});

function fakeIpc() {
  const handlers = new Map<string, (event: { sender: { id: number } }, ...args: unknown[]) => unknown>();
  const ipc: IpcMainLike = { handle: (c, fn) => { handlers.set(c, fn); }, removeHandler: (c) => { handlers.delete(c); } };
  const call = (c: string, ...args: unknown[]) => new Promise((resolve) => resolve(handlers.get(c)!({ sender: { id: 7 } }, ...args)));
  return { ipc, handlers, call };
}

test("registerBook: book:content (real EPUB), read marks and lexicon RPC with broadcast", async () => {
  const db = await openSqlJsDb();
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.exec("CREATE TABLE items (filePath TEXT, format TEXT)");
  runMigrations(db, [{ area: "book", migrations: bookMigrations }], () => {});
  const sent: unknown[] = [];
  const win: WindowLike = { isDestroyed: () => false, webContents: { id: 1, send: (_c, p) => sent.push(p) } };
  const { ipc, handlers, call } = fakeIpc();
  const ctx = createAreaContext({ db, ipcMain: ipc, getWindows: () => [win] });
  registerBook(ctx, { parse: parseBookContentV2 });
  assert.deepEqual([...handlers.keys()].sort(), [
    "book:anchors:delete", "book:anchors:list", "book:anchors:set",
    "book:annotations:add", "book:annotations:delete", "book:annotations:list",
    "book:content", "book:readMarks:get", "book:readMarks:set", "book:reveal", "lexicon:get", "lexicon:set",
  ]);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-bc-"));
  const file = makeEpub(path.join(dir, "named-weird.bin"), [`<p>Hello.</p>`]);
  db.run("INSERT INTO items (filePath, format) VALUES (?, ?)", [file, "EPUB"]);
  const content = (await call("book:content", file)) as BookContentV2;
  assert.equal(content.chapters[1].paras[0].text, "Hello.", "format resolved from the library row, not the extension");

  const ch = content.chapters[1];
  await call("book:readMarks:set", file, ch.id, ch.paras[0].id);
  await call("book:readMarks:set", file, ch.id, ch.paras[0].id);
  assert.deepEqual(await call("book:readMarks:get", file), { [ch.id]: ch.paras[0].id });

  const empty = (await call("lexicon:get")) as { entries: unknown[]; version: string };
  assert.deepEqual(empty.entries, []);
  const lex = (await call("lexicon:set", [{ from: "god", to: "Ascendant", scope: "both", match: "smart" }])) as { version: string };
  assert.deepEqual(sent, [{ type: "lexicon", version: lex.version }]);
  assert.equal(getLexiconStore()?.get().version, lex.version);
  await assert.rejects(call("lexicon:set", "nope"));
  db.close();
});
