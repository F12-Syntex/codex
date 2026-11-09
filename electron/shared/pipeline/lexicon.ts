/**
 * Layer 4: lexicon (word replacements) (owner: WS-C). Fixes S2-10.
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * - Replaces in text nodes only (never inside tags or attribute values).
 * - Longest match first; whole words (`[\p{L}\p{M}\p{N}_]` boundaries on the sides where `from`
 *   starts/ends with a word character).
 * - `smart`: case-insensitive match, case-preserving output (god→ascendant, God→Ascendant,
 *   GOD→ASCENDANT). `exact`: case-sensitive match, replacement verbatim.
 * - Scopes: `display` (page, titles, AI text shown to the user), `speech` (TTS), `both`.
 * - The default lexicon is EMPTY. Presets live in `lexicon-presets.ts`.
 */

import type { ApplyLexiconFn, Lexicon, LexiconEntry, LexiconScope } from "./types";
import { decodeEntities, escapeText, serializeTokens, tokenizeHtml } from "./html";
import { fnv1a64Base36, stableStringify } from "../ai/hash";
import { lexiconEntryKey } from "./lexicon-presets";

export const MAX_LEXICON_ENTRIES = 1000;
const MAX_FIELD = 200;

const WORD_CHAR_RE = /[\p{L}\p{M}\p{N}_]/u;
const isWordChar = (ch: string | undefined) => !!ch && WORD_CHAR_RE.test(ch);

// ── Entries + version ───────────────────────────────────────────────────────

/** Trim, default, validate and de-duplicate (later entries win, keeping the first position). */
export function normalizeLexiconEntries(entries: readonly Partial<LexiconEntry>[] | null | undefined): LexiconEntry[] {
  const out: LexiconEntry[] = [];
  const pos = new Map<string, number>();
  for (const raw of entries ?? []) {
    if (!raw || typeof raw.from !== "string" || typeof raw.to !== "string") continue;
    const from = raw.from.trim().slice(0, MAX_FIELD);
    const to = raw.to.trim().slice(0, MAX_FIELD);
    if (!from || !to) continue;
    const scope: LexiconScope = raw.scope === "display" || raw.scope === "speech" ? raw.scope : "both";
    const match = raw.match === "exact" ? "exact" : "smart";
    const e: LexiconEntry = { from, to, scope, match };
    const key = lexiconEntryKey(e);
    const at = pos.get(key);
    if (at !== undefined) out[at] = e;
    else {
      if (out.length >= MAX_LEXICON_ENTRIES) continue;
      pos.set(key, out.length);
      out.push(e);
    }
  }
  return out;
}

export function lexiconVersion(entries: readonly LexiconEntry[]): string {
  return "lx" + fnv1a64Base36(stableStringify(entries));
}

export function makeLexicon(entries: readonly Partial<LexiconEntry>[] | null | undefined): Lexicon {
  const norm = normalizeLexiconEntries(entries);
  return { version: lexiconVersion(norm), entries: norm };
}

export const EMPTY_LEXICON: Lexicon = makeLexicon([]);

/** Legacy `wordReplacements` setting (`{from,to}[]` JSON) → entries (smart, both). */
export function entriesFromLegacy(raw: string | null | undefined): LexiconEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeLexiconEntries(
      parsed.map((r) => (r && typeof r === "object" ? { from: (r as { from?: unknown }).from, to: (r as { to?: unknown }).to } : null))
        .filter(Boolean) as Partial<LexiconEntry>[],
    );
  } catch {
    return [];
  }
}

/** Entries → legacy `{from,to}[]` (what the pre-pipeline reader applies to page and TTS). */
export function entriesToLegacy(entries: readonly LexiconEntry[]): { from: string; to: string }[] {
  return entries.filter((e) => e.scope !== "speech").map((e) => ({ from: e.from, to: e.to }));
}

// ── Compilation ─────────────────────────────────────────────────────────────

interface Rule {
  from: string;
  lower: string;
  to: string;
  exact: boolean;
  len: number;
  wordStart: boolean;
  wordEnd: boolean;
}

interface ScopeRules {
  /** Rules bucketed by lowercased first char, each bucket longest first. */
  byFirst: Map<string, Rule[]>;
  candidate: RegExp | null;
}

export interface CompiledLexicon {
  version: string;
  display: ScopeRules;
  speech: ScopeRules;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compileScope(entries: readonly LexiconEntry[], scope: "display" | "speech"): ScopeRules {
  const rules: Rule[] = entries
    .filter((e) => e.scope === "both" || e.scope === scope)
    .map((e) => ({
      from: e.from,
      lower: e.from.toLowerCase(),
      to: e.to,
      exact: e.match === "exact",
      len: e.from.length,
      wordStart: isWordChar(e.from[0]),
      wordEnd: isWordChar(e.from[e.from.length - 1]),
    }))
    .sort((a, b) => b.len - a.len);
  if (rules.length === 0) return { byFirst: new Map(), candidate: null };
  const byFirst = new Map<string, Rule[]>();
  for (const r of rules) {
    const k = r.lower[0];
    const list = byFirst.get(k);
    if (list) list.push(r);
    else byFirst.set(k, [r]);
  }
  const alternation = Array.from(new Set(rules.map((r) => escapeRe(r.lower)))).join("|");
  return { byFirst, candidate: new RegExp(alternation, "giu") };
}

const compiledCache = new Map<string, CompiledLexicon>();

export function compileLexicon(lex: Lexicon): CompiledLexicon {
  const hit = compiledCache.get(lex.version);
  if (hit) return hit;
  const c: CompiledLexicon = { version: lex.version, display: compileScope(lex.entries, "display"), speech: compileScope(lex.entries, "speech") };
  if (compiledCache.size >= 16) compiledCache.delete(compiledCache.keys().next().value as string);
  compiledCache.set(lex.version, c);
  return c;
}

/** Match the case pattern of `original` onto `to`. */
export function smartCase(original: string, to: string): string {
  const lower = original.toLowerCase();
  const upper = original.toUpperCase();
  if (lower === upper) return to; // no letters
  if (original === lower) return to.toLowerCase();
  if (original === upper && original.length > 1) return to.toUpperCase();
  const first = original.charAt(0);
  if (first === first.toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
    return to.charAt(0).toUpperCase() + to.slice(1);
  }
  return to;
}

export interface LexMatch {
  start: number;
  end: number;
  to: string;
}

/** Non-overlapping matches, left to right, longest first at each position. */
export function findLexiconMatches(text: string, sr: ScopeRules): LexMatch[] {
  const out: LexMatch[] = [];
  const re = sr.candidate;
  if (!re || !text) return out;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const p = m.index;
    const bucket = sr.byFirst.get(text.charAt(p).toLowerCase()) ?? [];
    let hit: LexMatch | null = null;
    for (const r of bucket) {
      if (p + r.len > text.length) continue;
      const seg = text.substr(p, r.len);
      if (r.exact ? seg !== r.from : seg.toLowerCase() !== r.lower) continue;
      if (r.wordStart && p > 0 && isWordChar(text[p - 1])) continue;
      if (r.wordEnd && isWordChar(text[p + r.len])) continue;
      hit = { start: p, end: p + r.len, to: r.exact ? r.to : smartCase(seg, r.to) };
      break;
    }
    if (hit) {
      out.push(hit);
      re.lastIndex = hit.end;
    } else {
      re.lastIndex = p + 1;
    }
  }
  return out;
}

function splice(text: string, matches: LexMatch[], from = 0, to = text.length): string {
  let out = "";
  let at = from;
  for (const m of matches) {
    if (m.start < from || m.end > to) continue;
    out += text.slice(at, m.start) + m.to;
    at = m.end;
  }
  return out + text.slice(at, to);
}

// ── Application ─────────────────────────────────────────────────────────────

/** Apply to plain text (titles, entity names, AI text shown to the user). */
export function applyLexiconText(text: string, lex: Lexicon, scope: "display" | "speech"): string {
  const c = compileLexicon(lex);
  const sr = scope === "display" ? c.display : c.speech;
  if (!sr.candidate) return text;
  return splice(text, findLexiconMatches(text, sr));
}

/** Apply to html, in text nodes only. Unchanged text nodes keep their exact raw html. */
export const applyLexicon: ApplyLexiconFn = (html, lex, scope) => {
  const c = compileLexicon(lex);
  const sr = scope === "display" ? c.display : c.speech;
  if (!sr.candidate || !html) return html;
  const tokens = tokenizeHtml(html);
  const replace = new Map<number, string>();
  tokens.forEach((t, i) => {
    if (t.type !== "text" || t.rawText) return;
    const d = decodeEntities(t.raw);
    const matches = findLexiconMatches(d, sr);
    if (matches.length > 0) replace.set(i, escapeText(splice(d, matches)));
  });
  return replace.size > 0 ? serializeTokens(tokens, replace) : html;
};

/** One piece of a text node after applying both scopes: unchanged text, or a changed cluster. */
export interface LexPiece {
  disp: string;
  speech: string;
  same: boolean;
}

/**
 * Split `text` into pieces so display and speech outputs can be aligned word-for-word:
 * overlapping display/speech matches are clustered; outside clusters both outputs are identical.
 * `pieces.map(p => p.disp).join("")` equals `applyLexiconText(text, lex, "display")` (same for speech).
 */
export function lexiconPieces(text: string, c: CompiledLexicon): LexPiece[] {
  const dm = findLexiconMatches(text, c.display);
  const sm = findLexiconMatches(text, c.speech);
  if (dm.length === 0 && sm.length === 0) return text ? [{ disp: text, speech: text, same: true }] : [];
  const spans = [...dm, ...sm].map((m) => [m.start, m.end] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const clusters: [number, number][] = [];
  for (const s of spans) {
    const last = clusters[clusters.length - 1];
    if (last && s[0] < last[1]) last[1] = Math.max(last[1], s[1]);
    else clusters.push([s[0], s[1]]);
  }
  const out: LexPiece[] = [];
  let at = 0;
  for (const [s, e] of clusters) {
    if (s > at) out.push({ disp: text.slice(at, s), speech: text.slice(at, s), same: true });
    out.push({ disp: splice(text, dm, s, e), speech: splice(text, sm, s, e), same: false });
    at = e;
  }
  if (at < text.length) out.push({ disp: text.slice(at), speech: text.slice(at), same: true });
  return out;
}
