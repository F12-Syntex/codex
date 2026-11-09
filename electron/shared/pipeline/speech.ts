/**
 * Layer 7 (speech projection) (owner: WS-C). Fixes S2-8 and S2-9.
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * One definition of "word" is shared by the page and TTS: a maximal run of non-whitespace in the
 * visible text of a paragraph, where visible text excludes `[data-tts-skip]` subtrees and `<br>` /
 * block boundaries count as whitespace (see `walkText`). Inline elements (entity spans, `<em>`…)
 * never split words. The Phase 2 DOM highlighter must use `wordRangesInNodes` with the text
 * nodes of the paragraph (skipping `[data-tts-skip]` subtrees) so it counts identically.
 */

import type { AlignBoundariesFn, SpeechBoundary, SpeechToken, TokenizeVisibleFn } from "./types";
import { walkText, wordsOf, type TextMap } from "./html";
import { compileLexicon, lexiconPieces, type CompiledLexicon } from "./lexicon";
import type { Lexicon } from "./types";

/** Visible (non-skip) text of a TextMap, with segment offsets remapped. */
function visibleOf(map: TextMap): string {
  let s = "";
  for (const seg of map.segs) {
    if (seg.skip) continue;
    if (seg.sep) {
      if (s.length > 0 && !s.endsWith("\n")) s += "\n";
      continue;
    }
    s += map.text.slice(seg.start, seg.end);
  }
  return s.replace(/\n+$/, "");
}

/** Visible words of `html`, skipping `[data-tts-skip]` subtrees. */
export const tokenizeVisible: TokenizeVisibleFn = (html) => {
  const text = visibleOf(walkText(html));
  return { text, words: wordsOf(text) };
};

/**
 * Speech projection of one paragraph.
 * `baseHtml` is the layered html BEFORE any lexicon. The display html is
 * `applyLexicon(baseHtml, lex, "display")` (+ decorations, which never change text), so DOM word
 * indices are computed from the display-lexicon text; speech text uses the speech-lexicon text.
 * Each speech token maps to the DOM word it was derived from (`domWord`).
 */
export function buildSpeech(baseHtml: string, lex: Lexicon | CompiledLexicon): { text: string; tokens: SpeechToken[] } | null {
  const c = "display" in lex ? lex : compileLexicon(lex);
  const map = walkText(baseHtml);
  // Pieces aligned between display and speech outputs.
  const pieces: { dStart: number; dEnd: number; sStart: number; sEnd: number; same: boolean }[] = [];
  let disp = "";
  let sp = "";
  const push = (d: string, s: string, same: boolean) => {
    if (!d && !s) return;
    pieces.push({ dStart: disp.length, dEnd: disp.length + d.length, sStart: sp.length, sEnd: sp.length + s.length, same });
    disp += d;
    sp += s;
  };
  for (const seg of map.segs) {
    if (seg.skip) continue;
    if (seg.sep) {
      if (disp.length > 0 && !disp.endsWith("\n")) push("\n", "\n", true);
      continue;
    }
    for (const p of lexiconPieces(map.text.slice(seg.start, seg.end), c)) push(p.disp, p.speech, p.same);
  }
  // Same trailing-separator rule as tokenizeVisible.
  while (disp.endsWith("\n") && pieces.length > 0 && pieces[pieces.length - 1].same && pieces[pieces.length - 1].dEnd - pieces[pieces.length - 1].dStart === 1) {
    pieces.pop();
    disp = disp.slice(0, -1);
    sp = sp.slice(0, -1);
  }

  const domWords = wordsOf(disp);
  const spWords = wordsOf(sp);
  if (spWords.length === 0) return null;
  // Trim the speech text (e.g. the space after a skipped speaker badge); offsets shift with it.
  const lead = spWords[0].start;
  const tail = spWords[spWords.length - 1].end;

  const dispOffset = (sOff: number): number => {
    for (const p of pieces) {
      if (sOff < p.sStart || sOff >= p.sEnd) continue;
      if (p.same) return p.dStart + (sOff - p.sStart);
      const sl = p.sEnd - p.sStart;
      const dl = p.dEnd - p.dStart;
      return p.dStart + Math.min(dl - 1, Math.floor(((sOff - p.sStart) * dl) / Math.max(1, sl)));
    }
    return disp.length;
  };
  let w = 0;
  const tokens: SpeechToken[] = spWords.map((sw) => {
    const d = dispOffset(sw.start);
    while (w < domWords.length - 1 && domWords[w].end <= d) w++;
    return { start: sw.start - lead, end: sw.end - lead, domWord: domWords.length > 0 ? w : -1 };
  });
  return { text: sp.slice(lead, tail), tokens };
}

/**
 * Word ranges inside a sequence of DOM text-node strings (page order, `[data-tts-skip]` subtrees
 * and their text already excluded; pass "\n" for a `<br>`/block boundary). Returns, for word
 * `wordIndex`, the node-local ranges it covers (a word can span inline elements).
 */
export function wordRangesInNodes(nodeTexts: readonly string[], wordIndex: number): { node: number; start: number; end: number }[] {
  let idx = -1;
  let inWord = false;
  const out: { node: number; start: number; end: number }[] = [];
  for (let n = 0; n < nodeTexts.length; n++) {
    const t = nodeTexts[n];
    for (let i = 0; i < t.length; i++) {
      const ws = /\s/.test(t[i]);
      if (!ws && !inWord) {
        idx++;
        inWord = true;
        if (idx > wordIndex) return out;
      } else if (ws) {
        inWord = false;
      }
      if (!ws && idx === wordIndex) {
        const last = out[out.length - 1];
        if (last && last.node === n && last.end === i) last.end = i + 1;
        else out.push({ node: n, start: i, end: i + 1 });
      }
    }
  }
  return out;
}

// ── Edge-TTS boundary alignment ─────────────────────────────────────────────

const normWord = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Align Edge-TTS word boundaries to speech tokens. For each boundary i, returns the index j of
 * the token it belongs to (-1 for punctuation-only or unmatched boundaries). Monotonic: never
 * moves backwards. Handles a token spoken as several boundaries ("well-known" → "well", "known")
 * and several tokens spoken as one boundary, and skips tokens the engine didn't voice.
 */
export const alignBoundaries: AlignBoundariesFn = (tokens, speechText, boundaries) => {
  const normTok = tokens.map((t) => normWord(speechText.slice(t.start, t.end)));
  const out: number[] = [];
  let j = 0; // current token
  let k = 0; // chars of normTok[j] already consumed
  const LOOKAHEAD = 12;

  const advance = (tok: number, consumedEnd: number) => {
    j = tok;
    k = consumedEnd;
    while (j < normTok.length && k >= normTok[j].length) {
      j++;
      k = 0;
    }
  };

  for (const b of boundaries as SpeechBoundary[]) {
    const nb = normWord(decodeBoundaryText(b.text));
    if (!nb) {
      out.push(-1);
      continue;
    }
    let found = -1;
    // 1. continue inside the current token
    if (j < normTok.length) {
      const rest = normTok[j].slice(k);
      const at = rest.indexOf(nb);
      if (at === 0 || (at > 0 && k === 0)) {
        found = j;
        advance(j, k + at + nb.length);
      }
    }
    // 2. look ahead for a token that starts with / contains the boundary text
    if (found < 0) {
      for (let t = j + (k > 0 ? 1 : 0); t < Math.min(normTok.length, j + LOOKAHEAD); t++) {
        if (!normTok[t]) continue;
        const at = normTok[t].indexOf(nb);
        if (at >= 0) {
          found = t;
          advance(t, at + nb.length);
          break;
        }
      }
    }
    // 3. one boundary covering several tokens ("1 000", "New York" read as one unit)
    if (found < 0 && j < normTok.length) {
      let acc = normTok[j].slice(k);
      let t = j;
      while (acc.length < nb.length && t + 1 < normTok.length) acc += normTok[++t];
      if (acc.startsWith(nb)) {
        found = j;
        advance(t + 1, 0);
      }
    }
    out.push(found);
  }
  return out;
};

function decodeBoundaryText(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
