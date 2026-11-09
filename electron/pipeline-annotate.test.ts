/**
 * WS-C: annotate + decorate. Entities are matched after the lexicon, longest first, never inside
 * tags or `[data-tts-skip]`, and only from the (frontier-gated) list the caller passes.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChapter } from "./shared/pipeline/build";
import { buildSourceChapter } from "./shared/pipeline/source";
import { compileEntities, locateQuote, matchEntities } from "./shared/pipeline/annotate";
import { EMPTY_LEXICON, makeLexicon } from "./shared/pipeline/lexicon";
import { tokenizeHtml } from "./shared/pipeline/html";
import type { EntityMatcher } from "./shared/pipeline/types";

const ent = (id: string, names: string[], color = "blue"): EntityMatcher => ({ id, names, color, type: "character" });
const one = (html: string) => buildSourceChapter({ index: 0, title: "", paras: [{ html }] });
const wikiIds = (html: string) =>
  tokenizeHtml(html).flatMap((t) => (t.type === "start" && t.name === "span" ? t.attrs.filter((a) => a.name === "data-wiki-id").map((a) => a.value) : []));

test("entities are matched after the lexicon, using lexicon-applied names", () => {
  const lex = makeLexicon([{ from: "god", to: "Ascendant" }]);
  const ch = buildChapter(one(`<p>The God of War met a god.</p>`), { lexicon: lex, entities: [ent("gow", ["God of War"], "red")] });
  const p = ch.paras[0];
  assert.equal(p.text, "The Ascendant of War met a ascendant.");
  assert.equal(p.html, `<p>The <span class="wiki-entity wiki-entity-red" data-wiki-id="gow">Ascendant of War</span> met a ascendant.</p>`);
});

test("longest name first; whole words; aliases; capitalised names need capitalised text", () => {
  const ents = [ent("kim", ["Kim", "Soyoung"]), ent("kimsy", ["Kim Soyoung"]), ent("will", ["Will"])];
  const c = compileEntities(ents, EMPTY_LEXICON);
  const text = "Kim Soyoung said Kim will see Soyoung. Kimchi! Will nodded.";
  const hits = matchEntities(text, c).map((r) => [text.slice(r.start, r.end), r.entityId]);
  assert.deepEqual(hits, [["Kim Soyoung", "kimsy"], ["Kim", "kim"], ["Soyoung", "kim"], ["Will", "will"]]);
  // names split across whitespace/newlines still match
  assert.deepEqual(matchEntities("Kim\n Soyoung", c).map((r) => r.entityId), ["kimsy"]);
  // 1-char names are ignored
  assert.equal(compileEntities([ent("x", ["X"])], EMPTY_LEXICON).re, null);
});

test("no matches inside tags or attributes, nor inside [data-tts-skip] subtrees", () => {
  const html = `<p class="Kim" title="Kim"><span class="ai-fmt-dialogue-kim" data-tts-skip>Kim</span> “Hi,” said Kim.</p>`;
  const ch = buildChapter(one(html), { lexicon: EMPTY_LEXICON, entities: [ent("kim", ["Kim"])] });
  const out = ch.paras[0].html;
  assert.deepEqual(wikiIds(out), ["kim"], "exactly one highlight");
  assert.match(out, /<span class="ai-fmt-dialogue-kim" data-tts-skip>Kim<\/span>/);
  assert.match(out, /said <span class="wiki-entity wiki-entity-blue" data-wiki-id="kim">Kim<\/span>\./);
  assert.match(out, /^<p class="Kim" title="Kim">/);
});

test("only the frontier-gated list passed in is matched", () => {
  const src = one(`<p>Kim met Jin, then Arthur.</p>`);
  const visibleSoFar = [ent("kim", ["Kim"]), ent("jin", ["Jin"])]; // Arthur not introduced yet
  const ch = buildChapter(src, { lexicon: EMPTY_LEXICON, entities: visibleSoFar });
  assert.deepEqual(wikiIds(ch.paras[0].html), ["kim", "jin"]);
  assert.deepEqual(wikiIds(buildChapter(src, { lexicon: EMPTY_LEXICON }).paras[0].html), []);
});

test("highlights resolve by quote text, also on merged paras; ranges split across inline tags", () => {
  const src = buildSourceChapter({ index: 0, title: "", paras: [{ html: `<p>The <em>quick</em> brown fox.</p>` }, { html: `<p>Second line.</p>` }] });
  const [a, b] = src.paras.map((p) => p.id);
  const ch = buildChapter(src, {
    lexicon: EMPTY_LEXICON,
    format: { artifactHash: "f", base: "source", baseHash: src.sourceHash, paras: { [a]: { html: `<p>The <em>quick</em> brown fox. Second line.</p>` }, [b]: { mergedInto: a } } },
    annotations: [
      { kind: "highlight", paraId: a, quote: "quick  brown", id: "h1", tone: "quote" },
      { kind: "highlight", paraId: b, quote: "Second line", id: "h2", tone: "vocab" },
      { kind: "highlight", paraId: a, quote: "not there", id: "h3", tone: "quote" },
    ],
  });
  const html = ch.paras[0].html;
  assert.equal(
    html,
    `<p>The <em><mark class="codex-hl codex-hl-quote" data-hl-id="h1">quick</mark></em><mark class="codex-hl codex-hl-quote" data-hl-id="h1"> brown</mark> fox. ` +
      `<mark class="codex-hl codex-hl-vocab" data-hl-id="h2">Second line</mark>.</p>`,
  );
  assert.deepEqual(locateQuote("Hello World", "hello   world"), { start: 0, end: 11 });
  assert.equal(locateQuote("abc", ""), null);
});

test("decorations are escaped and validated (no markup injection through ids/colours)", () => {
  const ch = buildChapter(one(`<p>Kim &lt;3</p>`), { lexicon: EMPTY_LEXICON, entities: [ent(`x" onclick="alert(1)`, ["Kim"], `red" onmouseover="x`)] });
  const html = ch.paras[0].html;
  for (const t of tokenizeHtml(html)) if (t.type === "start") for (const a of t.attrs) assert.ok(!a.name.startsWith("on"), html);
  assert.match(html, /&lt;3/);
});
