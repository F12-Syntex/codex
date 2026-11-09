/**
 * Optional word-replacement presets (owner: WS-C). Nothing here is applied by default: the
 * default lexicon is EMPTY (owner decision, AI_AUDIT §7 #8). The user applies a preset explicitly,
 * which merges its entries into their own list (their existing entries win).
 *
 * PURE, dependency-free (imported by `src/lib/word-replacements.ts` and the lexicon store).
 */

import type { LexiconEntry } from "./types";

export interface LexiconPreset {
  id: string;
  name: string;
  description: string;
  entries: readonly LexiconEntry[];
}

const both = (from: string, to: string): LexiconEntry => ({ from, to, scope: "both", match: "smart" });

/** The list that used to be applied to every book by default (`getDefaultReplacements()`). */
export const CULTIVATION_TERMS: LexiconPreset = {
  id: "cultivation-terms",
  name: "Cultivation terms",
  description: "Replaces god, goddess, deity and related words with “Ascendant” terms.",
  entries: [
    both("goddesses", "Ascendants"),
    both("goddess", "Ascendant"),
    both("godhood", "Apotheosis"),
    both("godlike", "transcendent"),
    both("godly", "ascendant"),
    both("gods", "Ascendants"),
    both("god", "Ascendant"),
    both("demigods", "lesser Ascendants"),
    both("demigod", "lesser Ascendant"),
    both("deities", "Ascendant entities"),
    both("deity", "Ascendant entity"),
    both("divinity", "celestial essence"),
  ],
};

export const LEXICON_PRESETS: readonly LexiconPreset[] = [CULTIVATION_TERMS];

export function getLexiconPreset(id: string): LexiconPreset | undefined {
  return LEXICON_PRESETS.find((p) => p.id === id);
}

/** Identity of an entry for de-duplication: smart entries are case-insensitive. */
export function lexiconEntryKey(e: Pick<LexiconEntry, "from" | "match" | "scope">): string {
  const from = e.from.trim();
  return `${e.match === "exact" ? "x:" + from : "s:" + from.toLowerCase()}|${e.scope}`;
}

/** Append the preset's entries that the user doesn't already have. Never overrides theirs. */
export function mergePreset(entries: readonly LexiconEntry[], presetId: string): LexiconEntry[] {
  const preset = getLexiconPreset(presetId);
  if (!preset) return [...entries];
  const have = new Set(entries.map(lexiconEntryKey));
  // A smart "both" entry also shadows the same word in any scope the user customised.
  const haveWord = new Set(entries.map((e) => (e.match === "exact" ? e.from.trim() : e.from.trim().toLowerCase())));
  const add = preset.entries.filter((e) => !have.has(lexiconEntryKey(e)) && !haveWord.has(e.from.toLowerCase()));
  return [...entries, ...add.map((e) => ({ ...e }))];
}
