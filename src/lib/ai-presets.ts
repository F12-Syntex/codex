/* ── AI Model Presets ─────────────────────────────────── */

export interface AIPreset {
  id: string;
  label: string;
  description: string;
  icon: string;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
}

export type PresetOverrides = Record<string, { model: string }>;

/** Settings key used to persist user overrides in the database */
export const PRESET_OVERRIDES_KEY = "ai-preset-overrides";

/*
 * ── Default Presets ──────────────────────────────────────
 * Add or remove entries here to change available presets.
 * The settings UI dynamically renders whatever is in this array.
 */
export const DEFAULT_PRESETS: AIPreset[] = [
  {
    id: "quick",
    label: "Quick",
    description: "Fast responses, lower cost",
    icon: "Zap",
    defaultModel: "x-ai/grok-4.1-fast", //openai/gpt-oss-safeguard-20b
    temperature: 0.7,
    maxTokens: 1024,
  },
];

/* ── Helpers ──────────────────────────────────────────── */

export function getPreset(id: string): AIPreset | undefined {
  return DEFAULT_PRESETS.find((p) => p.id === id);
}

export function getEffectiveModel(
  preset: AIPreset,
  overrides: PresetOverrides,
): string {
  return overrides[preset.id]?.model || preset.defaultModel;
}

export function parseOverrides(json: string | null): PresetOverrides {
  if (!json) return {};
  try {
    return JSON.parse(json) as PresetOverrides;
  } catch {
    return {};
  }
}

export function stringifyOverrides(overrides: PresetOverrides): string {
  return JSON.stringify(overrides);
}
