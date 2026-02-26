import type { AccentId } from "./accent";

export type AppearanceMode = "dark" | "light" | "dim";
export type FontFamily = "geist" | "inter" | "mono" | "system";
export type CoverStyle = "rounded" | "sharp";
export type CursorStyle = "default" | "dot" | "circle" | "crosshair";

export interface ThemeConfig {
  accent: AccentId;
  customAccentColor: string;    // hex color for custom accent
  appearance: AppearanceMode;
  backgroundImage: string | null;
  backgroundBlur: number;       // 0–20
  backgroundOpacity: number;    // 0–100 (overlay darkness %)
  surfaceOpacity: number;       // 50–100 (how opaque surfaces are)
  fontFamily: FontFamily;
  coverStyle: CoverStyle;
  cursorStyle: CursorStyle;
  showFormatBadge: boolean;
  sidebarWidth: number;         // default panel % (15–35)
  tintSurfaces: boolean;        // tint surfaces with accent color
}

export const DEFAULT_THEME: ThemeConfig = {
  accent: "blue",
  customAccentColor: "#6366f1",
  appearance: "dark",
  backgroundImage: null,
  backgroundBlur: 0,
  backgroundOpacity: 70,
  surfaceOpacity: 100,
  fontFamily: "geist",
  coverStyle: "rounded",
  cursorStyle: "default",
  showFormatBadge: true,
  sidebarWidth: 20,
  tintSurfaces: false,
};

export const APPEARANCE_OPTIONS: { id: AppearanceMode; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "dim", label: "Dim" },
  { id: "light", label: "Light" },
];

export const FONT_OPTIONS: { id: FontFamily; label: string; preview: string }[] = [
  { id: "geist", label: "Geist Sans", preview: "Aa" },
  { id: "inter", label: "Inter", preview: "Aa" },
  { id: "mono", label: "Geist Mono", preview: "Aa" },
  { id: "system", label: "System", preview: "Aa" },
];
