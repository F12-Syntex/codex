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
  { id: "blue",    label: "Blue",    swatch: "#0a84ff", hue: 264 },
  { id: "indigo",  label: "Indigo",  swatch: "#5e5ce6", hue: 280 },
  { id: "violet",  label: "Purple",  swatch: "#bf5af2", hue: 292 },
  { id: "pink",    label: "Pink",    swatch: "#ff375f", hue: 340 },
  { id: "rose",    label: "Rose",    swatch: "#ff6482",  hue: 10 },
  { id: "crimson", label: "Red", swatch: "#ff453a",  hue: 25 },
  { id: "orange",  label: "Orange",  swatch: "#ff9f0a",  hue: 55 },
  { id: "amber",   label: "Yellow",   swatch: "#ffd60a",  hue: 75 },
  { id: "lime",    label: "Lime",    swatch: "#a4e34f", hue: 130 },
  { id: "emerald", label: "Green", swatch: "#30d158", hue: 160 },
  { id: "teal",    label: "Teal",    swatch: "#40c8e0", hue: 185 },
  { id: "cyan",    label: "Cyan",    swatch: "#64d2ff", hue: 210 },
];

export const DEFAULT_ACCENT: AccentId = "blue";
