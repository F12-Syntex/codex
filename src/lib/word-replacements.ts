/**
 * Word replacements — the Settings-page view of the LEXICON (owner: WS-C).
 *
 * Replacements are applied in exactly one place: the pipeline's lexicon layer (page, speed
 * reader, TTS, entity names, assistant/AI text). This module only reads and writes the user's
 * list through the lexicon store in main (`lexicon:get/set`), which broadcasts a `lexicon` event
 * so every open window re-renders. Speech-only entries and per-word scope/match survive edits
 * made here.
 */

import type { LexiconEntry } from "@shared/pipeline/types";
import { CULTIVATION_TERMS, LEXICON_PRESETS } from "@shared/pipeline/lexicon-presets";
import { getLexicon, setLexiconEntries } from "@/lib/book/lexicon";
import { hasRpc } from "@/lib/ai/rpc";

export interface WordReplacement {
  from: string;
  to: string;
}

/** Default replacements: none (the old built-ins are the opt-in "Cultivation terms" preset). */
export function getDefaultReplacements(): WordReplacement[] {
  return [];
}

export interface WordReplacementPreset {
  id: string;
  name: string;
  description: string;
  replacements: WordReplacement[];
}

/** Optional presets the user can apply from Settings → Reading. */
export const WORD_REPLACEMENT_PRESETS: readonly WordReplacementPreset[] = LEXICON_PRESETS.map((p) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  replacements: p.entries.map((e) => ({ from: e.from, to: e.to })),
}));

/** Id of the preset holding the former defaults. */
export const CULTIVATION_PRESET_ID = CULTIVATION_TERMS.id;

/** Merge a preset into the user's list (their own entries win). Returns a new list to save. */
export function applyReplacementPreset(current: WordReplacement[], presetId: string): WordReplacement[] {
  const preset = WORD_REPLACEMENT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return [...current];
  const have = new Set(current.filter((r) => r.from.trim()).map((r) => r.from.trim().toLowerCase()));
  return [...current, ...preset.replacements.filter((r) => !have.has(r.from.toLowerCase())).map((r) => ({ ...r }))];
}

/** The user's page-visible replacements (display/both lexicon entries). */
export async function loadReplacements(): Promise<WordReplacement[]> {
  if (!hasRpc()) return [];
  try {
    const lex = await getLexicon();
    return lex.entries.filter((e) => e.scope !== "speech").map((e) => ({ from: e.from, to: e.to }));
  } catch {
    return [];
  }
}

/**
 * Pure merge used by `saveReplacements`: the edited display list replaces the display/both
 * entries (keeping each word's scope/match), speech-only entries are kept. Blank rows (being
 * typed) are skipped.
 */
export function mergeReplacements(current: readonly LexiconEntry[], edited: readonly WordReplacement[]): LexiconEntry[] {
  const prior = new Map(current.filter((e) => e.scope !== "speech").map((e) => [e.from.toLowerCase(), e]));
  const shown: LexiconEntry[] = edited
    .filter((r) => r.from.trim() && r.to.trim())
    .map((r) => {
      const p = prior.get(r.from.trim().toLowerCase());
      return { from: r.from.trim(), to: r.to.trim(), scope: p?.scope ?? "both", match: p?.match ?? "smart" };
    });
  return [...shown, ...current.filter((e) => e.scope === "speech")];
}

export async function saveReplacements(replacements: WordReplacement[]): Promise<void> {
  if (!hasRpc()) return;
  const lex = await getLexicon();
  await setLexiconEntries(mergeReplacements(lex.entries, replacements));
}
