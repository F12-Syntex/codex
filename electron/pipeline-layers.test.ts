/**
 * WS-C: rewrite/format layers and anchors. Rewrite is 1:1 with explicit drops, format merges via
 * `mergedInto`, stale layers are ignored, and `resolveAnchor` follows merges and drops.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSourceChapter } from "./shared/pipeline/source";
import { applyLayers } from "./shared/pipeline/layers";
import { buildChapter, resolveAnchor, variantKeyOf } from "./shared/pipeline/build";
import { EMPTY_LEXICON, makeLexicon } from "./shared/pipeline/lexicon";
import type { FormatLayer, RewriteLayer, SourceChapter } from "./shared/pipeline/types";

function chapter(texts: string[]): SourceChapter {
  return buildSourceChapter({ index: 3, title: "Ch", key: "ch.xhtml", paras: texts.map((t) => ({ html: `<p>${t}</p>` })) });
}

const src = chapter(["Alpha one.", "Beta two.", "Gamma three.", "Delta four."]);
const [A, B, C, D] = src.paras.map((p) => p.id);

function rewrite(paras: RewriteLayer["paras"], over: Partial<RewriteLayer> = {}): RewriteLayer {
  return { mode: "concise", artifactHash: "rw1", sourceHash: src.sourceHash, paras, ...over };
}
function format(paras: FormatLayer["paras"], over: Partial<FormatLayer> = {}): FormatLayer {
  return { artifactHash: "fm1", base: "source", baseHash: src.sourceHash, paras, ...over };
}

test("no layers: rendered paras mirror the source 1:1", () => {
  const ch = buildChapter(src, { lexicon: EMPTY_LEXICON });
  assert.equal(ch.chapterId, src.id);
  assert.deepEqual(ch.paras.map((p) => p.id), [A, B, C, D]);
  assert.deepEqual(ch.visible, [0, 1, 2, 3]);
  assert.deepEqual(ch.paras.map((p) => p.html), src.paras.map((p) => p.html));
  assert.equal(ch.paras[1].text, "Beta two.");
  assert.equal(ch.byId[C], 2);
  assert.deepEqual(ch.paras[0].covers, [A]);
});

test("rewrite: 1:1 replacement, explicit drops, missing keys unchanged, html sanitized", () => {
  const rw = rewrite({
    [A]: { html: "<p>Alpha.</p>" },
    [B]: { dropped: true },
    [C]: { html: `<p onclick="x">Gamma<script>alert(1)</script>.</p>` },
  });
  const ch = buildChapter(src, { lexicon: EMPTY_LEXICON, rewrite: rw });
  assert.equal(ch.paras.length, 4, "never inserts or removes rendered paras");
  assert.equal(ch.paras[0].html, "<p>Alpha.</p>");
  assert.equal(ch.paras[1].hidden, true);
  assert.equal(ch.paras[1].mergedInto, undefined);
  assert.equal(ch.paras[1].speech, null);
  assert.equal(ch.paras[2].html, "<p>Gamma.</p>");
  assert.equal(ch.paras[3].html, "<p>Delta four.</p>");
  assert.deepEqual(ch.visible, [0, 2, 3]);
  assert.equal(applyLayers(src, rw).rewrite, "applied");
});

test("format: mergedInto hides the merged para and folds it into the host's covers", () => {
  const fm = format({ [B]: { html: "<p>Beta two. Gamma three.</p>" }, [C]: { mergedInto: B } });
  const ch = buildChapter(src, { lexicon: EMPTY_LEXICON, format: fm });
  assert.equal(ch.paras[1].html, "<p>Beta two. Gamma three.</p>");
  assert.deepEqual(ch.paras[1].covers, [B, C]);
  assert.equal(ch.paras[2].hidden, true);
  assert.equal(ch.paras[2].mergedInto, B);
  assert.deepEqual(ch.visible, [0, 1, 3]);
});

test("format: invalid merge targets and cycles leave the para visible", () => {
  const fm = format({ [A]: { mergedInto: "p-unknown.0" }, [B]: { mergedInto: C }, [C]: { mergedInto: B } });
  const ch = buildChapter(src, { lexicon: EMPTY_LEXICON, format: fm });
  assert.deepEqual(ch.visible, [0, 1, 2, 3]);
});

test("format on top of rewrite: needs base 'rewrite' + the rewrite's artifactHash", () => {
  const rw = rewrite({ [A]: { html: "<p>Alpha.</p>" } });
  const good = format({ [A]: { html: `<p><span class="ai-fmt-emphasis">Alpha.</span></p>` } }, { base: "rewrite", baseHash: "rw1" });
  const ch = buildChapter(src, { lexicon: EMPTY_LEXICON, rewrite: rw, format: good });
  assert.equal(ch.paras[0].html, `<p><span class="ai-fmt-emphasis">Alpha.</span></p>`);
  // formatted text of B falls back to the rewrite/source html
  assert.equal(ch.paras[1].html, "<p>Beta two.</p>");
});

test("stale layers are ignored (sourceHash / baseHash mismatch, wrong base)", () => {
  const staleRw = rewrite({ [A]: { html: "<p>OLD</p>" } }, { sourceHash: "other" });
  let r = applyLayers(src, staleRw);
  assert.equal(r.rewrite, "stale");
  assert.equal(r.paras[0].html, src.paras[0].html);

  const staleFmt = format({ [A]: { html: "<p>OLD</p>" } }, { baseHash: "old-source" });
  r = applyLayers(src, null, staleFmt);
  assert.equal(r.format, "stale");
  assert.equal(r.paras[0].html, src.paras[0].html);

  // format produced on the source must not be applied over a rewrite (and vice versa)
  const rw = rewrite({ [A]: { html: "<p>Alpha.</p>" } });
  r = applyLayers(src, rw, format({ [A]: { html: "<p>X</p>" } }));
  assert.equal(r.format, "stale");
  assert.equal(r.paras[0].html, "<p>Alpha.</p>");
  r = applyLayers(src, null, format({ [A]: { html: "<p>X</p>" } }, { base: "rewrite", baseHash: "rw1" }));
  assert.equal(r.format, "stale");
  // a stale rewrite also makes a rewrite-based format stale
  r = applyLayers(src, staleRw, format({ [A]: { html: "<p>X</p>" } }, { base: "rewrite", baseHash: "rw1" }));
  assert.deepEqual([r.rewrite, r.format], ["stale", "stale"]);
});

test("variantKey changes with applied layers and lexicon, not with stale layers", () => {
  const base = variantKeyOf(src, { lexicon: EMPTY_LEXICON });
  assert.equal(base, buildChapter(src, { lexicon: EMPTY_LEXICON }).variantKey);
  assert.notEqual(variantKeyOf(src, { lexicon: EMPTY_LEXICON, rewrite: rewrite({}) }), base);
  assert.equal(variantKeyOf(src, { lexicon: EMPTY_LEXICON, rewrite: rewrite({}, { sourceHash: "x" }) }), base);
  assert.notEqual(variantKeyOf(src, { lexicon: makeLexicon([{ from: "a", to: "b" }]) }), base);
  const rw = rewrite({ [B]: { dropped: true } });
  assert.equal(variantKeyOf(src, { lexicon: EMPTY_LEXICON, rewrite: rw }), buildChapter(src, { lexicon: EMPTY_LEXICON, rewrite: rw }).variantKey);
});

test("resolveAnchor: itself, merge host, next visible after a drop, previous at the end, -1 unknown", () => {
  const rw = rewrite({ [B]: { dropped: true }, [D]: { dropped: true } });
  const fm = format({ [A]: { html: "<p>Alpha one. Beta two?</p>" }, [C]: { mergedInto: A } }, { base: "rewrite", baseHash: "rw1" });
  const ch = buildChapter(src, { lexicon: EMPTY_LEXICON, rewrite: rw, format: fm });
  assert.deepEqual(ch.visible, [0]);
  assert.equal(resolveAnchor(ch, A), 0);
  assert.equal(resolveAnchor(ch, C), 0, "merged → host");
  assert.equal(resolveAnchor(ch, B), 0, "dropped with nothing visible after → previous visible");
  assert.equal(resolveAnchor(ch, D), 0);
  assert.equal(resolveAnchor(ch, "p0.0"), -1);

  const ch2 = buildChapter(src, { lexicon: EMPTY_LEXICON, rewrite: rewrite({ [B]: { dropped: true } }) });
  assert.equal(resolveAnchor(ch2, B), 2, "dropped → next visible");
});

test("block markers fold into the para that shows them", () => {
  const fm = format({ [C]: { mergedInto: B } });
  const ch = buildChapter(src, {
    lexicon: EMPTY_LEXICON,
    format: fm,
    blocks: [
      { paraId: B, comments: { ai: 1, user: 0 } },
      { paraId: C, comments: { ai: 0, user: 2 }, bookmark: true },
      { paraId: "p-unknown.0", readMark: true },
    ],
  });
  assert.deepEqual(ch.paras[1].marker, { paraId: B, comments: { ai: 1, user: 2 }, bookmark: true });
  assert.equal(ch.paras[2].marker, undefined);
  assert.equal(ch.paras[0].marker, undefined);
});
