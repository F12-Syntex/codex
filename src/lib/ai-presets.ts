/* ── Legacy AI presets (Phase 2 compatibility) ─────────────
 *
 * Only what the remaining legacy modules still import. Models are no longer chosen per preset:
 * a preset maps to a model role in Settings › Intelligence (see `ai-client.ts`); the default
 * temperatures below are kept so legacy output stays the same. Deleted in Phase 3.
 */

export interface AIPreset {
  id: string;
  temperature?: number;
  maxTokens?: number;
}

/** @deprecated Ignored by `ai-client.ts`; kept so legacy call sites still type-check. */
export type PresetOverrides = Record<string, { model: string }>;

const PRESETS: AIPreset[] = [
  { id: "quick" },
  { id: "creative", temperature: 0.85 },
  { id: "format", temperature: 0.3 },
  { id: "format-regen", temperature: 0.9 },
];

export function getPreset(id: string): AIPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** @deprecated Models come from Settings › Intelligence; always resolves to `{}`. */
export async function loadOverrides(): Promise<PresetOverrides> {
  return {};
}
