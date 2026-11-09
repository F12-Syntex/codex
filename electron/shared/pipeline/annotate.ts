/**
 * Layer 5: annotate (owner: WS-C). Fixes S2-10 / S2-11 for highlights.
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * - Entities are matched on the POST-lexicon visible text with lexicon-applied names, so
 *   "God of War" still highlights after god→Ascendant ("Ascendant of War").
 * - Callers pass only entities ≤ frontier (`knowledge:entityIndex` is frontier-gated); nothing
 *   else is ever matched.
 * - Longest name first; whole words; names shorter than 2 chars are ignored. Matching is
 *   case-insensitive, except that a name starting with a capital only matches capitalised text
 *   ("Will" the character does not match "will" the verb).
 * - Matches never fall inside `[data-tts-skip]` subtrees (speaker badges) and never inside tags
 *   (we only ever look at text).
 */

import type { EntityMatcher, Lexicon } from "./types";
import { applyLexiconText } from "./lexicon";

export interface EntityRange {
  start: number;
  end: number;
  entityId: string;
  color: string;
}

interface CompiledEntities {
  re: RegExp | null;
  byKey: Map<string, { entity: EntityMatcher; requireCap: boolean }>;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const keyOf = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
const startsUpper = (s: string) => {
  const ch = s.charAt(0);
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
};

const cache = new WeakMap<readonly EntityMatcher[], Map<string, CompiledEntities>>();

export function compileEntities(entities: readonly EntityMatcher[], lex: Lexicon): CompiledEntities {
  let perLex = cache.get(entities);
  if (!perLex) cache.set(entities, (perLex = new Map()));
  const hit = perLex.get(lex.version);
  if (hit) return hit;

  const byKey = new Map<string, { entity: EntityMatcher; requireCap: boolean }>();
  for (const e of entities) {
    for (const raw of e.names) {
      if (typeof raw !== "string") continue;
      const name = applyLexiconText(raw.trim().replace(/\s+/g, " "), lex, "display");
      if (name.length < 2) continue;
      const k = keyOf(name);
      if (!byKey.has(k)) byKey.set(k, { entity: e, requireCap: startsUpper(name) });
    }
  }
  const names = Array.from(byKey.keys()).sort((a, b) => b.length - a.length);
  const re = names.length
    ? new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${names.map((n) => escapeRe(n).replace(/ /g, "\\s+")).join("|")})(?![\\p{L}\\p{M}\\p{N}_])`, "giu")
    : null;
  const out = { re, byKey };
  perLex.set(lex.version, out);
  return out;
}

/**
 * Entity ranges in `text`. `blocked(start, end)` returns true for ranges that must not be
 * decorated (e.g. overlapping a `[data-tts-skip]` subtree).
 */
export function matchEntities(text: string, compiled: CompiledEntities, blocked?: (start: number, end: number) => boolean): EntityRange[] {
  const out: EntityRange[] = [];
  const re = compiled.re;
  if (!re || !text) return out;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const hit = compiled.byKey.get(keyOf(m[0]));
    if (!hit || (hit.requireCap && !startsUpper(m[0])) || blocked?.(start, end)) {
      re.lastIndex = start + 1;
      continue;
    }
    out.push({ start, end, entityId: hit.entity.id, color: hit.entity.color });
  }
  return out;
}

/**
 * Locate a highlight's quote inside a paragraph's visible text. Whitespace-insensitive; exact
 * case first, then case-insensitive. Returns null if the quote no longer occurs.
 */
export function locateQuote(text: string, quote: string): { start: number; end: number } | null {
  const q = quote.trim();
  if (!q) return null;
  const pattern = q.split(/\s+/).map(escapeRe).join("\\s+");
  for (const flags of ["u", "iu"]) {
    const m = new RegExp(pattern, flags).exec(text);
    if (m) return { start: m.index, end: m.index + m[0].length };
  }
  return null;
}

/** Minimum share of the quote's significant words a fuzzy match must contain (as `reanchorByQuote`). */
export const FUZZY_QUOTE_MIN_OVERLAP = 0.6;

/**
 * Fallback for `locateQuote` when the quote was saved from another variant (a Concise/Polish
 * rewrite) and no longer occurs verbatim (QA-P2-2): the span of `text` whose words best overlap
 * the quote's significant words (> 2 letters, case-insensitive), if the overlap is ≥ 60%.
 * The span is trimmed to start and end on quote words.
 */
export function locateQuoteFuzzy(text: string, quote: string): { start: number; end: number } | null {
  const wordRe = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  const qWords = (quote.match(wordRe) ?? []).map((w) => w.toLowerCase());
  const sig = new Set(qWords.filter((w) => w.length > 2));
  if (sig.size < 3) return null;
  const words: { w: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(wordRe)) words.push({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  if (words.length === 0) return null;

  let best: { score: number; from: number; to: number } | null = null;
  const maxLen = Math.ceil(qWords.length * 1.5) + 2;
  for (let from = 0; from < words.length; from++) {
    if (!sig.has(words[from].w)) continue; // spans start on a quote word
    const seen = new Set<string>();
    for (let to = from; to < words.length && to - from + 1 <= maxLen; to++) {
      const w = words[to].w;
      if (!sig.has(w)) continue;
      seen.add(w);
      const score = seen.size / sig.size;
      if (!best || score > best.score || (score === best.score && to - from < best.to - best.from)) best = { score, from, to };
    }
  }
  if (!best || best.score < FUZZY_QUOTE_MIN_OVERLAP) return null;
  return { start: words[best.from].start, end: words[best.to].end };
}
