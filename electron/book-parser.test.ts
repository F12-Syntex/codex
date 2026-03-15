import { test } from "node:test";
import assert from "node:assert";
import { parseBookContent } from "./book-parser";

test("parseBookContent handles unsupported format", () => {
  const result = parseBookContent("test.txt", "TXT");

  assert.strictEqual(result.chapters.length, 1);
  assert.strictEqual(result.chapters[0].title, "Unsupported Format");
  assert.match(result.chapters[0].paragraphs[0], /The format "TXT" is not yet supported/);
  assert.strictEqual(result.isImageBook, false);
  assert.strictEqual(result.toc.length, 0);
});

test("parseBookContent handles PDF sync call error", () => {
  const result = parseBookContent("test.pdf", "PDF");

  assert.strictEqual(result.chapters.length, 1);
  assert.strictEqual(result.chapters[0].title, "Error");
  assert.match(result.chapters[0].paragraphs[0], /Use parsePdfContent\(\) for PDF files/);
});
