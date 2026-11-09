/**
 * Map text the reader selected on the page (display variant: lexicon applied, maybe a Concise /
 * Polish rewrite) back to the SOURCE paragraph, so AI inputs reason about the book as written
 * (AI_AUDIT §4.5: AI inputs never see display transforms; QA-P2-8). Pure.
 */

import type { Lexicon } from "./types";
import { locateQuote, locateQuoteFuzzy } from "./annotate";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Undo display word replacements (to → from), best effort: case is not restored. */
export function unapplyLexiconText(text: string, lexicon: Lexicon | null | undefined): string {
  let out = text;
  for (const e of lexicon?.entries ?? []) {
    if (e.scope === "speech" || !e.to || !e.from) continue;
    const re = e.match === "exact" ? new RegExp(escapeRe(e.to), "g") : new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(e.to)}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, e.from);
  }
  return out;
}

export interface SourceSelection {
  /** The selection's text as written in the source paragraph. */
  text: string;
  start: number;
  end: number;
}

/**
 * Where `displayText` (selected on the page) is in `sourceText`: exact match, then the text with
 * word replacements undone, then the best word-overlap span (a rewritten variant). Null if the
 * selection can't be located (callers keep the display text as a hint).
 */
export function locateInSource(sourceText: string, displayText: string, lexicon?: Lexicon | null): SourceSelection | null {
  if (!sourceText || !displayText.trim()) return null;
  const candidates = [displayText];
  const undone = unapplyLexiconText(displayText, lexicon);
  if (undone !== displayText) candidates.push(undone);
  for (const c of candidates) {
    const loc = locateQuote(sourceText, c);
    if (loc) return { ...loc, text: sourceText.slice(loc.start, loc.end) };
  }
  for (const c of candidates) {
    const loc = locateQuoteFuzzy(sourceText, c);
    if (loc) return { ...loc, text: sourceText.slice(loc.start, loc.end) };
  }
  return null;
}
