import type { AccentId } from "./accent";

export type AppearanceMode = "dark" | "light" | "dim";
export type FontFamily = "geist" | "inter" | "mono" | "system";
export type CoverStyle = "rounded" | "sharp";
export type CursorStyle = "default" | "modern" | "classic" | "dark";

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
  borderRadius: number;         // 0–16px
  showFormatBadge: boolean;
  sidebarWidth: number;         // default panel % (15–35)
  tintSurfaces: boolean;        // tint surfaces with accent color
  ambientBackground: boolean;   // animated "ink" shader behind the glass
}

export const DEFAULT_THEME: ThemeConfig = {
  accent: "blue",
  customAccentColor: "#0a84ff",
  appearance: "dark",
  backgroundImage: null,
  backgroundBlur: 0,
  backgroundOpacity: 70,
  surfaceOpacity: 100,
  fontFamily: "system",
  coverStyle: "rounded",
  cursorStyle: "default",
  borderRadius: 12,
  showFormatBadge: true,
  sidebarWidth: 20,
  tintSurfaces: false,
  ambientBackground: true,
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
  { id: "system", label: "San Francisco", preview: "Aa" },
];
