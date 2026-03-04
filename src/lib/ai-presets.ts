/* ── AI Model Presets ─────────────────────────────────── */

export interface AIPreset {
  id: string;
  label: string;
  description: string;
  icon: string;
  defaultModel: string;
  temperature?: number;
  maxTokens?: number;
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
    defaultModel: "google/gemini-2.5-flash-lite-preview-09-2025",
    maxTokens: 16384,
  },
  {
    id: "creative",
    label: "Creative",
    description: "Long-form narrative generation",
    icon: "Feather",
    defaultModel: "google/gemini-2.5-flash-lite-preview-09-2025",
    temperature: 0.85,
    maxTokens: 8000,
  },
  {
    id: "format",
    label: "Format",
    description: "Text formatting",
    icon: "Paintbrush",
    defaultModel: "google/gemini-2.5-flash-lite-preview-09-2025",
    temperature: 0.3,
    maxTokens: 16384,
  },
  {
    id: "format-regen",
    label: "Format Regen",
    description: "Style regeneration",
    icon: "RefreshCw",
    defaultModel: "google/gemini-2.5-flash-lite-preview-09-2025",
    temperature: 0.9,
    maxTokens: 16384,
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

/** Load user's preset overrides from settings (shared helper). */
export async function loadOverrides(): Promise<PresetOverrides> {
  const raw = await window.electronAPI?.getSetting(PRESET_OVERRIDES_KEY);
  return parseOverrides(raw ?? null);
}
