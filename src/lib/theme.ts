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
  { id: "system", label: "System", preview: "Aa" },
];

/**
 * CSS `font-family` for each typeface choice. The main window writes the
 * chosen one into `--font-ui` on <html> (which `font-sans` resolves to), and
 * the Appearance previews use them directly — so none may reference
 * `--font-ui` itself. `system` mirrors the default `--font-ui` stack in
 * globals.css: the platform UI face, with Inter where there's no SF.
 */
export const FONT_FAMILY_CSS: Record<FontFamily, string> = {
  geist: "var(--font-geist-sans, system-ui), sans-serif",
  inter: "var(--font-inter, 'Inter'), sans-serif",
  mono: "var(--font-geist-mono, ui-monospace), monospace",
  system:
    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', var(--font-inter, 'Inter'), var(--font-geist-sans, system-ui), system-ui, sans-serif",
};

/** The five corner-radius stops offered in Appearance (px). */
export const RADIUS_STOPS = [0, 4, 8, 12, 16] as const;
