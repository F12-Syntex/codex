import { CULTIVATION_TERMS, LEXICON_PRESETS } from "@shared/pipeline/lexicon-presets";

export interface WordReplacement {
  from: string;
  to: string;
}

const SETTINGS_KEY = "wordReplacements";

/**
 * Default replacements: NONE. (Owner decision: the old built-in list — god → Ascendant and
 * friends — was applied to every book and couldn't be removed. It is now the opt-in
 * "Cultivation terms" preset below.) Kept as a function for existing callers.
 */
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

/**
 * Merge a preset into the user's list: appends the preset's words the user doesn't already have
 * (case-insensitive by `from`); the user's own entries always win. Returns a new list to save.
 */
export function applyReplacementPreset(current: WordReplacement[], presetId: string): WordReplacement[] {
  const preset = WORD_REPLACEMENT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return [...current];
  const have = new Set(current.filter((r) => r.from.trim()).map((r) => r.from.trim().toLowerCase()));
  return [...current, ...preset.replacements.filter((r) => !have.has(r.from.toLowerCase())).map((r) => ({ ...r }))];
}

/**
 * The user's saved list, exactly as saved (no hidden defaults merged in). Blank rows and legacy
 * "removed default" tombstones (`to: ""`) are skipped. Users who never saved a list get [].
 */
export async function loadReplacements(): Promise<WordReplacement[]> {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (!api?.getSetting) return [];
  const raw = await api.getSetting(SETTINGS_KEY);
  if (!raw) return [];
  try {
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return [];
    return saved.filter(
      (r): r is WordReplacement => !!r && typeof r.from === "string" && typeof r.to === "string" && !!r.from.trim() && !!r.to,
    );
  } catch {
    return [];
  }
}

export async function saveReplacements(replacements: WordReplacement[]): Promise<void> {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (!api?.setSetting) return;
  await api.setSetting(SETTINGS_KEY, JSON.stringify(replacements));
}

/**
 * Apply smart word replacements to an HTML string.
 * Preserves case: if the source word starts uppercase, the replacement starts uppercase too.
 * Only replaces whole words (word-boundary matching).
 * Skips content inside HTML tags to avoid breaking markup.
 *
 * Uses a single-pass regex with all patterns joined by alternation, sorted longest-first
 * so that e.g. "goddess" is matched before "god" and "godhood" before "god".
 */
export function applyReplacements(html: string, replacements: WordReplacement[]): string {
  if (replacements.length === 0) return html;

  // Filter valid entries and sort by 'from' length descending (longest match first)
  const sorted = [...replacements]
    .filter(r => r.from && r.to)
    .sort((a, b) => b.from.length - a.from.length);
  if (sorted.length === 0) return html;

  // Build a lowercase lookup: "goddess" -> { from: "goddess", to: "Ascendant" }
  const lookup = new Map<string, { from: string; to: string }>();
  for (const r of sorted) {
    const key = r.from.toLowerCase();
    if (!lookup.has(key)) lookup.set(key, r);
  }

  // Build a single alternation regex with all patterns, longest first
  const alternation = sorted
    .map(r => r.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`\\b(?:${alternation})\\b`, "gi");

  // Replace only in text nodes (outside of < > tags)
  return html.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag; // preserve HTML tags untouched
    return text.replace(regex, (word: string) => {
      const entry = lookup.get(word.toLowerCase());
      if (!entry) return word;
      return smartCase(word, entry.from, entry.to);
    });
  });
}

/** Apply replacements to plain text (no HTML tag handling needed). */
export function applyReplacementsPlain(text: string, replacements: WordReplacement[]): string {
  if (replacements.length === 0) return text;

  const sorted = [...replacements]
    .filter(r => r.from && r.to)
    .sort((a, b) => b.from.length - a.from.length);
  if (sorted.length === 0) return text;

  const lookup = new Map<string, { from: string; to: string }>();
  for (const r of sorted) {
    const key = r.from.toLowerCase();
    if (!lookup.has(key)) lookup.set(key, r);
  }

  const alternation = sorted
    .map(r => r.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`\\b(?:${alternation})\\b`, "gi");

  return text.replace(regex, (word: string) => {
    const entry = lookup.get(word.toLowerCase());
    if (!entry) return word;
    return smartCase(word, entry.from, entry.to);
  });
}

/** Match the case pattern of the original word onto the replacement */
function smartCase(original: string, from: string, to: string): string {
  // All uppercase: GOD -> TRANSCENDENT
  if (original === from.toUpperCase()) return to.toUpperCase();
  // First letter uppercase: God -> Transcendent
  if (original[0] === original[0].toUpperCase() && original.slice(1) === from.slice(1).toLowerCase()) {
    return to.charAt(0).toUpperCase() + to.slice(1).toLowerCase();
  }
  // All lowercase: god -> transcendent
  if (original === from.toLowerCase()) return to.toLowerCase();
  // Fallback: preserve as-is
  return to;
}
