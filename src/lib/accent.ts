export type AccentId =
  | "blue" | "teal" | "rose" | "amber" | "violet" | "emerald"
  | "orange" | "pink" | "cyan" | "indigo" | "crimson" | "lime"
  | "custom";

export interface AccentOption {
  id: AccentId;
  label: string;
  swatch: string;        // CSS color for the circle
  hue?: number;          // oklch hue for tint-surfaces
}

export const ACCENT_OPTIONS: AccentOption[] = [
  { id: "blue",    label: "Blue",    swatch: "oklch(0.60 0.20 264)", hue: 264 },
  { id: "indigo",  label: "Indigo",  swatch: "oklch(0.55 0.24 280)", hue: 280 },
  { id: "violet",  label: "Violet",  swatch: "oklch(0.62 0.22 292)", hue: 292 },
  { id: "pink",    label: "Pink",    swatch: "oklch(0.68 0.22 340)", hue: 340 },
  { id: "rose",    label: "Rose",    swatch: "oklch(0.65 0.22 10)",  hue: 10 },
  { id: "crimson", label: "Crimson", swatch: "oklch(0.58 0.24 25)",  hue: 25 },
  { id: "orange",  label: "Orange",  swatch: "oklch(0.72 0.19 55)",  hue: 55 },
  { id: "amber",   label: "Amber",   swatch: "oklch(0.75 0.17 75)",  hue: 75 },
  { id: "lime",    label: "Lime",    swatch: "oklch(0.76 0.18 130)", hue: 130 },
  { id: "emerald", label: "Emerald", swatch: "oklch(0.68 0.18 160)", hue: 160 },
  { id: "teal",    label: "Teal",    swatch: "oklch(0.65 0.15 185)", hue: 185 },
  { id: "cyan",    label: "Cyan",    swatch: "oklch(0.72 0.14 210)", hue: 210 },
];

export const DEFAULT_ACCENT: AccentId = "blue";
