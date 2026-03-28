export interface WordReplacement {
  from: string;
  to: string;
}

const SETTINGS_KEY = "wordReplacements";

export function getDefaultReplacements(): WordReplacement[] {
  return [{ from: "god", to: "transcendent" }];
}

export async function loadReplacements(): Promise<WordReplacement[]> {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (!api?.getSetting) return getDefaultReplacements();
  const raw = await api.getSetting(SETTINGS_KEY);
  if (!raw) return getDefaultReplacements();
  try {
    return JSON.parse(raw) as WordReplacement[];
  } catch {
    return getDefaultReplacements();
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
 */
export function applyReplacements(html: string, replacements: WordReplacement[]): string {
  if (replacements.length === 0) return html;

  let result = html;
  for (const { from, to } of replacements) {
    if (!from || !to) continue;
    // Build a case-insensitive whole-word regex
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");

    // Replace only in text nodes (outside of < > tags)
    result = result.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, text) => {
      if (tag) return tag; // preserve HTML tags untouched
      return text.replace(regex, (word: string) => smartCase(word, from, to));
    });
  }
  return result;
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
