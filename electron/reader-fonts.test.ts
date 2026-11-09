/**
 * Every reader face in the registry ships its file in public/fonts as real WOFF2, and the
 * @font-face rules declare exactly those files under the family the stacks ask for.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { READER_FONTS, readerFontFaceCss, DEFAULT_READER_FONT } from "./shared/reader-fonts";

const FONTS_DIR = path.resolve(__dirname, "..", "public", "fonts");

test("reader fonts: every registered file exists in public/fonts and is WOFF2", () => {
  for (const f of READER_FONTS) {
    for (const x of f.files) {
      const p = path.join(FONTS_DIR, x.file);
      assert.ok(fs.existsSync(p), `${x.file} is missing`);
      const head = fs.readFileSync(p).subarray(0, 4).toString("latin1");
      assert.equal(head, "wOF2", `${x.file} is not WOFF2`);
      assert.ok(fs.statSync(p).size > 20_000, `${x.file} looks like a stub subset`);
    }
  }
});

test("reader fonts: @font-face family = first token of the stack; default face is bundled", () => {
  const css = readerFontFaceCss();
  for (const f of READER_FONTS) {
    const first = f.stack.split(",")[0].trim().replace(/^'|'$/g, "");
    assert.equal(first, f.family, `${f.name}: stack and family disagree`);
    for (const x of f.files) assert.ok(css.includes(`font-family:'${f.family}';src:url('/fonts/${x.file}')`), x.file);
  }
  assert.ok(DEFAULT_READER_FONT.files.length > 0);
});
