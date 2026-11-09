/**
 * WS-C: stable ids. ParaIds survive re-parse and unrelated edits; duplicate text gets `.n`
 * occurrence ids; the legacy mirrors stay index-aligned with `paras`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import { makeEpub } from "./book/test-fixtures";
import { assignParaIds, bookIdOf, chapterIdOf, normalizeForId, paraIdBase, parseParaId, PARSER_VERSION } from "./shared/pipeline/ids";
import { buildSourceChapter, toBookContentV2 } from "./shared/pipeline/source";
import { parseBookContent, parseBookContentV2 } from "./book-parser";

function tmpFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-ids-"));
  return path.join(dir, name);
}

test("assignParaIds: duplicates get occurrence suffixes in document order", () => {
  const p = (text: string) => ({ text, kind: "text" as const, html: `<p>${text}</p>` });
  const ids = assignParaIds([p("Hello."), p("World."), p("Hello."), p("Hello.")]);
  assert.match(ids[0], /^p[0-9a-z]+\.0$/);
  assert.equal(ids[1].endsWith(".0"), true);
  assert.equal(ids[2], ids[0].replace(/\.0$/, ".1"));
  assert.equal(ids[3], ids[0].replace(/\.0$/, ".2"));
  assert.deepEqual(parseParaId(ids[3]), { base: ids[0].slice(0, -2), occurrence: 2 });
  assert.equal(new Set(ids).size, 4);
});

test("paraIdBase: whitespace-insensitive, case-sensitive, kind-sensitive; images hash their html", () => {
  assert.equal(paraIdBase("a  b\n c", "text"), paraIdBase(" a b c ", "text"));
  assert.equal(normalizeForId("a  b"), "a b");
  assert.notEqual(paraIdBase("Hello", "text"), paraIdBase("hello", "text"));
  assert.notEqual(paraIdBase("Hello", "text"), paraIdBase("Hello", "heading"));
  assert.notEqual(paraIdBase("", "image", '<img src="data:image/png;base64,AA">'), paraIdBase("", "image", '<img src="data:image/png;base64,BB">'));
});

test("chapterId/bookId are stable and well-formed", () => {
  assert.equal(chapterIdOf("OEBPS/text/ch1.xhtml", 3), chapterIdOf("OEBPS/text/ch1.xhtml", 9));
  assert.equal(chapterIdOf(undefined, 2), chapterIdOf("", 2));
  assert.notEqual(chapterIdOf(undefined, 2), chapterIdOf(undefined, 3));
  assert.match(chapterIdOf("x", 0), /^c[0-9a-z]+$/);
  assert.match(bookIdOf("/books/a.epub"), /^b[0-9a-z]+$/);
});

test("buildSourceChapter: an edit to one paragraph changes only that id (and the sourceHash)", () => {
  const mk = (texts: string[]) => buildSourceChapter({ index: 0, title: "t", key: "k", paras: texts.map((t) => ({ html: `<p>${t}</p>` })) });
  const a = mk(["One.", "Two.", "Three.", "Two."]);
  const b = mk(["One.", "Two!", "Three.", "Two."]);
  assert.equal(a.paras[0].id, b.paras[0].id);
  assert.equal(a.paras[2].id, b.paras[2].id);
  assert.notEqual(a.paras[1].id, b.paras[1].id);
  // the second "Two." was ".1" in a and becomes ".0" in b — documented occurrence behaviour
  assert.equal(a.paras[3].id.endsWith(".1"), true);
  assert.equal(b.paras[3].id.endsWith(".0"), true);
  assert.notEqual(a.sourceHash, b.sourceHash);
  assert.equal(mk(["One.", "Two.", "Three.", "Two."]).sourceHash, a.sourceHash);
});

test("EPUB: ids are stable across re-parse, legacy mirrors stay index-aligned", async () => {
  const file = makeEpub(tmpFile("book.epub"), [
    `<h1>Chapter One</h1><p>It was a dark night.</p><p>"Hello," she said.</p><p>"Hello," she said.</p>`,
    `<p>Second chapter text.</p><p>More &amp; more.</p>`,
  ]);
  const v1 = await parseBookContentV2(file, "EPUB");
  const v2 = await parseBookContentV2(file, "epub");
  assert.equal(v1.parserVersion, PARSER_VERSION);
  assert.equal(v1.bookId, bookIdOf(file));
  assert.deepEqual(v1.chapters.map((c) => c.id), v2.chapters.map((c) => c.id));
  assert.deepEqual(v1.chapters.map((c) => c.paras.map((p) => p.id)), v2.chapters.map((c) => c.paras.map((p) => p.id)));
  assert.deepEqual(v1.chapters.map((c) => c.sourceHash), v2.chapters.map((c) => c.sourceHash));

  // chapter 0 is the synthetic TOC; chapter 1 is the first spine item
  assert.equal(v1.chapters[0].title, "Table of Contents");
  assert.equal(v1.chapters[0].id, chapterIdOf("#toc", 0));
  assert.equal(v1.chapters[1].id, chapterIdOf("OEBPS/text/ch0.xhtml", 1));
  assert.equal(v1.toc[0].chapterId, v1.chapters[v1.toc[0].chapterIndex].id);

  const ch = v1.chapters[1];
  assert.equal(ch.paras.length, ch.paragraphs.length);
  assert.equal(ch.paras.length, ch.htmlParagraphs.length);
  ch.paras.forEach((p, i) => {
    assert.equal(p.index, i);
    assert.equal(p.html, ch.htmlParagraphs[i]);
  });
  assert.equal(ch.paras[0].kind, "heading");
  assert.equal(ch.paras[1].text, "It was a dark night.");
  // identical paragraphs: same base, .0 / .1
  assert.equal(ch.paras[2].id.replace(/\.\d+$/, ""), ch.paras[3].id.replace(/\.\d+$/, ""));
  assert.deepEqual([ch.paras[2].id.slice(-2), ch.paras[3].id.slice(-2)], [".0", ".1"]);
  assert.equal(v1.chapters[2].paras[1].text, "More & more.");

  // the legacy API returns exactly the mirrors
  const legacy = parseBookContent(file, "EPUB");
  assert.deepEqual(legacy.chapters.map((c) => c.htmlParagraphs), v1.chapters.map((c) => c.htmlParagraphs));
  assert.deepEqual(legacy.chapters.map((c) => c.paragraphs), v1.chapters.map((c) => c.paragraphs));
});

test("EPUB: editing one paragraph keeps every other ParaId in the book", async () => {
  const a = await parseBookContentV2(makeEpub(tmpFile("a.epub"), [`<p>Alpha.</p><p>Beta.</p><p>Gamma.</p>`, `<p>Delta.</p>`]), "EPUB");
  const b = await parseBookContentV2(makeEpub(tmpFile("b.epub"), [`<p>Alpha.</p><p>Beta, revised.</p><p>Gamma.</p>`, `<p>Delta.</p>`]), "EPUB");
  const ia = a.chapters[1].paras.map((p) => p.id);
  const ib = b.chapters[1].paras.map((p) => p.id);
  assert.equal(ia[0], ib[0]);
  assert.notEqual(ia[1], ib[1]);
  assert.equal(ia[2], ib[2]);
  assert.equal(a.chapters[2].paras[0].id, b.chapters[2].paras[0].id);
  assert.equal(a.chapters[2].sourceHash, b.chapters[2].sourceHash);
  assert.notEqual(a.chapters[1].sourceHash, b.chapters[1].sourceHash);
});

test("plain-text paths are escaped (TOC labels, wall-of-text splits)", async () => {
  const wall = "&lt;b&gt;not a tag&lt;/b&gt; &amp; stuff. ".repeat(80); // > 1500 chars of text in one <p>
  const file = makeEpub(tmpFile("esc.epub"), [`<p>${wall}</p>`], ["A &lt;i&gt;title&lt;/i&gt; &amp; co"]);
  const v = await parseBookContentV2(file, "EPUB");
  for (const ch of v.chapters) {
    for (const h of ch.htmlParagraphs) {
      assert.doesNotMatch(h, /<b>|<i>/, h.slice(0, 80));
    }
  }
  const body = v.chapters[1];
  assert.ok(body.paras.length > 1, "wall of text was split");
  assert.match(body.htmlParagraphs[0], /&lt;b&gt;not a tag&lt;\/b&gt; &amp; stuff\./);
  assert.match(body.paras[0].text, /<b>not a tag<\/b> & stuff\./);
});

test("CBZ: image paras with stable ids; legacy mirrors keep bare data URIs", async () => {
  const zip = new AdmZip();
  zip.addFile("001.png", Buffer.from([137, 80, 78, 71, 1]));
  zip.addFile("002.png", Buffer.from([137, 80, 78, 71, 2]));
  const file = tmpFile("c.cbz");
  zip.writeZip(file);
  const v = await parseBookContentV2(file, "CBZ");
  assert.equal(v.isImageBook, true);
  const ch = v.chapters[0];
  assert.equal(ch.paras.length, 2);
  assert.ok(ch.paras.every((p) => p.kind === "image" && p.text === "" && p.html.startsWith('<img src="data:image/png;base64,')));
  assert.notEqual(ch.paras[0].id, ch.paras[1].id);
  assert.ok(ch.htmlParagraphs[0].startsWith("data:image/png;base64,"));
  assert.equal(ch.id, chapterIdOf(undefined, 0));
});

test("toBookContentV2: duplicate spine hrefs still get distinct chapter ids", () => {
  const v = toBookContentV2("/x.epub", {
    isImageBook: false,
    toc: [],
    chapters: [
      { title: "a", paragraphs: ["x"], htmlParagraphs: ["<p>x</p>"], sourceKey: "a.xhtml" },
      { title: "b", paragraphs: ["y"], htmlParagraphs: ["<p>y</p>"], sourceKey: "a.xhtml" },
    ],
  });
  assert.notEqual(v.chapters[0].id, v.chapters[1].id);
});
