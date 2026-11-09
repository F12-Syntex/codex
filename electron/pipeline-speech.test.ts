/**
 * WS-C: speech projection. One word definition shared by page and TTS; `[data-tts-skip]`
 * subtrees (speaker badges) are skipped even with nested entity spans; speech tokens map to DOM
 * words across speech-only and display-only lexicon entries; Edge-TTS boundaries align to tokens.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { alignBoundaries, buildSpeech, tokenizeVisible, wordRangesInNodes } from "./shared/pipeline/speech";
import { buildChapter } from "./shared/pipeline/build";
import { buildSourceChapter } from "./shared/pipeline/source";
import { EMPTY_LEXICON, makeLexicon } from "./shared/pipeline/lexicon";
import type { SpeechBoundary } from "./shared/pipeline/types";

const words = (html: string) => {
  const t = tokenizeVisible(html);
  return t.words.map((w) => t.text.slice(w.start, w.end));
};

test("tokenizeVisible: skips [data-tts-skip] subtrees, including nested entity spans", () => {
  const html =
    `<p><span class="ai-fmt-dialogue-kim" data-tts-skip><span class="wiki-entity" data-wiki-id="kim">Kim</span> Soyoung</span>` +
    ` “Hello, <span class="wiki-entity" data-wiki-id="jin">Jin</span>!” she said.</p>`;
  assert.deepEqual(words(html), ["“Hello,", "Jin!”", "she", "said."]);
});

test("tokenizeVisible: inline elements never split words; <br> and blocks do; entities decoded", () => {
  assert.deepEqual(words(`<p>Kim<em>’s</em> sword&nbsp;and&amp;shield</p>`), ["Kim’s", "sword", "and&shield"]);
  assert.deepEqual(words(`<p>one<br>two</p><p>three</p>`), ["one", "two", "three"]);
  assert.deepEqual(words(`<div><p>a</p><p>b</p></div>`), ["a", "b"]);
  assert.deepEqual(words(`<p><img src="data:image/png;base64,AA" alt="x"></p>`), []);
});

test("wordRangesInNodes: DOM text nodes agree with tokenizeVisible word indices", () => {
  // text nodes of <p>Kim<em>’s</em> big <b>sw</b>ord</p>
  const nodes = ["Kim", "’s", " big ", "sw", "ord"];
  assert.deepEqual(wordRangesInNodes(nodes, 0), [{ node: 0, start: 0, end: 3 }, { node: 1, start: 0, end: 2 }]);
  assert.deepEqual(wordRangesInNodes(nodes, 1), [{ node: 2, start: 1, end: 4 }]);
  assert.deepEqual(wordRangesInNodes(nodes, 2), [{ node: 3, start: 0, end: 2 }, { node: 4, start: 0, end: 3 }]);
  assert.deepEqual(wordRangesInNodes(nodes, 3), []);
  assert.equal(words(`<p>Kim<em>’s</em> big <b>sw</b>ord</p>`).length, 3);
});

test("buildSpeech: speech-only and display-only replacements keep domWord aligned", () => {
  const lex = makeLexicon([
    { from: "Mr.", to: "Mister", scope: "speech", match: "exact" },
    { from: "god", to: "Lord of Battle", scope: "display" },
    { from: "HP", to: "health points", scope: "speech", match: "exact" },
  ]);
  const html = `<p><span class="ai-fmt-dialogue-kim" data-tts-skip>Kim</span> Mr. Park, the god, lost HP fast.</p>`;
  const sp = buildSpeech(html, lex)!;
  assert.equal(sp.text, "Mister Park, the god, lost health points fast.");
  const spoken = sp.tokens.map((t) => sp.text.slice(t.start, t.end));
  assert.deepEqual(spoken, ["Mister", "Park,", "the", "god,", "lost", "health", "points", "fast."]);

  // DOM words come from the display html: Mr. Park, the lord of battle, lost HP fast. (smart case)
  const ch = buildChapter(buildSourceChapter({ index: 0, title: "", paras: [{ html }] }), { lexicon: lex });
  const p = ch.paras[0];
  const dom = words(p.html);
  assert.deepEqual(dom, ["Mr.", "Park,", "the", "lord", "of", "battle,", "lost", "HP", "fast."]);
  assert.deepEqual(p.speech!.tokens.map((t) => dom[t.domWord]), ["Mr.", "Park,", "the", "lord", "lost", "HP", "HP", "fast."]);
  // monotonic
  const idx = p.speech!.tokens.map((t) => t.domWord);
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
});

test("buildChapter: entity decorations don't change word counts; images and hidden paras have no speech", () => {
  const src = buildSourceChapter({
    index: 0, title: "",
    paras: [
      { html: `<p>Kim Soyoung met Jin at the gate.</p>` },
      { html: `<p><img src="data:image/png;base64,AA" alt=""></p>` },
    ],
  });
  const ch = buildChapter(src, {
    lexicon: EMPTY_LEXICON,
    entities: [{ id: "kim", names: ["Kim Soyoung"], color: "blue", type: "character" }, { id: "jin", names: ["Jin"], color: "red", type: "character" }],
  });
  const p = ch.paras[0];
  assert.match(p.html, /data-wiki-id="kim"/);
  assert.equal(words(p.html).length, 7);
  assert.equal(p.speech!.tokens.length, 7);
  assert.deepEqual(p.speech!.tokens.map((t) => t.domWord), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(ch.paras[1].kind, "image");
  assert.equal(ch.paras[1].speech, null);
});

test("alignBoundaries: recorded Edge-TTS boundaries with punctuation, numbers and hyphens", () => {
  const text = "“Wait,” said Mr. Kim. It’s 3:45 — 1,234 well-known men.";
  const sp = buildSpeech(`<p>${text}</p>`, EMPTY_LEXICON)!;
  const toks = sp.tokens.map((t) => sp.text.slice(t.start, t.end));
  assert.deepEqual(toks, ["“Wait,”", "said", "Mr.", "Kim.", "It’s", "3:45", "—", "1,234", "well-known", "men."]);
  // shape of `tts.getWordBoundaries()` (offset/duration in 100-ns ticks; punctuation boundaries included)
  const b = (text: string, offset: number): SpeechBoundary => ({ text, offset, duration: 2_000_000 });
  const boundaries = [
    b("Wait", 1_000_000), b(",", 4_000_000), b("said", 6_000_000), b("Mr.", 9_000_000), b("Kim", 12_000_000),
    b(".", 14_000_000), b("It's", 17_000_000), b("3:45", 20_000_000), b("1,234", 26_000_000),
    b("well", 32_000_000), b("known", 35_000_000), b("men", 38_000_000), b(".", 41_000_000),
  ];
  assert.deepEqual(alignBoundaries(sp.tokens, sp.text, boundaries), [0, -1, 1, 2, 3, -1, 4, 5, 7, 8, 8, 9, -1]);
});

test("alignBoundaries: multi-token boundaries, unvoiced tokens, entity-escaped text, no backtracking", () => {
  const sp = buildSpeech(`<p>Welcome to New York (pause) Tom &amp; Jerry, said Tom.</p>`, EMPTY_LEXICON)!;
  const b = (text: string): SpeechBoundary => ({ text, offset: 0, duration: 0 });
  // tokens: Welcome0 to1 New2 York3 (pause)4 Tom5 &6 Jerry,7 said8 Tom.9
  assert.deepEqual(
    alignBoundaries(sp.tokens, sp.text, [b("Welcome"), b("to"), b("New York"), b("Tom"), b("&amp;"), b("Jerry"), b("said"), b("Tom"), b("zzz")]),
    [0, 1, 2, 5, -1, 7, 8, 9, -1],
  );
});
