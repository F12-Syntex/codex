export type AccentId = "blue" | "teal" | "rose" | "amber" | "violet" | "emerald";

export interface AccentOption {
  id: AccentId;
  label: string;
  swatch: string;
}

export const ACCENT_OPTIONS: AccentOption[] = [
  { id: "blue", label: "Blue", swatch: "oklch(0.60 0.20 264)" },
  { id: "teal", label: "Teal", swatch: "oklch(0.65 0.15 185)" },
  { id: "rose", label: "Rose", swatch: "oklch(0.65 0.22 10)" },
  { id: "amber", label: "Amber", swatch: "oklch(0.75 0.17 75)" },
  { id: "violet", label: "Violet", swatch: "oklch(0.62 0.22 292)" },
  { id: "emerald", label: "Emerald", swatch: "oklch(0.68 0.18 160)" },
];

export const DEFAULT_ACCENT: AccentId = "blue";
