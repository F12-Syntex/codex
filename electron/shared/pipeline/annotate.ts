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
