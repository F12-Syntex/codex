export interface WordReplacement {
  from: string;
  to: string;
}

const SETTINGS_KEY = "wordReplacements";

export function getDefaultReplacements(): WordReplacement[] {
  return [
    { from: "goddesses", to: "Ascendants" },
    { from: "goddess", to: "Ascendant" },
    { from: "godhood", to: "Apotheosis" },
    { from: "godlike", to: "transcendent" },
    { from: "godly", to: "ascendant" },
    { from: "gods", to: "Ascendants" },
    { from: "god", to: "Ascendant" },
    { from: "demigods", to: "lesser Ascendants" },
    { from: "demigod", to: "lesser Ascendant" },
    { from: "deities", to: "Ascendant entities" },
    { from: "deity", to: "Ascendant entity" },
    { from: "divinity", to: "celestial essence" },
  ];
}

export async function loadReplacements(): Promise<WordReplacement[]> {
  const defaults = getDefaultReplacements();
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (!api?.getSetting) return defaults;
  const raw = await api.getSetting(SETTINGS_KEY);
  if (!raw) return defaults;
  try {
    const saved = JSON.parse(raw) as WordReplacement[];
    // Merge: defaults are always present, saved entries override/extend by 'from' key.
    // Setting 'to' to empty string removes a default entry.
    const byKey = new Map<string, WordReplacement>();
    for (const r of defaults) byKey.set(r.from.toLowerCase(), r);
    for (const r of saved) if (r.from) byKey.set(r.from.toLowerCase(), r);
    return [...byKey.values()].filter(r => r.to);
  } catch {
    return defaults;
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
