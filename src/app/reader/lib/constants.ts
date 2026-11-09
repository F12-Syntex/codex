import type { ReaderSettings, ThemeClasses, CustomFont } from "./types";
import { READER_FONTS, readerFontFaceCss, DEFAULT_READER_FONT, type ReaderFont } from "@shared/reader-fonts";

export const SETTINGS_KEY = "readerSettings";

// Fonts: one registry (@shared/reader-fonts) for the picker and the @font-face rules.
const toCustomFont = (f: ReaderFont): CustomFont => ({ name: f.name, family: f.stack, file: f.files[0]?.file ?? "" });

/** Bundled faces (public/fonts/). */
export const CUSTOM_FONTS: CustomFont[] = READER_FONTS.filter((f) => f.files.length > 0).map(toCustomFont);

/** System fonts. */
export const BUILTIN_FONTS: CustomFont[] = READER_FONTS.filter((f) => f.files.length === 0).map(toCustomFont);

export const ALL_FONTS = [...CUSTOM_FONTS, ...BUILTIN_FONTS];

/** `@font-face` rules, injected once by the reader layout. */
export const FONT_FACE_CSS = readerFontFaceCss();

export const DEFAULT_SETTINGS: ReaderSettings = {
  readingTheme: "dark",
  ttsProvider: "edge",
  ttsVoice: "en-US-ChristopherNeural",
  ttsRate: 1.0,
  ttsPitch: 0,
  ttsVolume: 100,
  ttsAutoAdvance: false,
  ttsHighlightMode: "both",
  ttsShowReadMark: true,
  fontFamily: DEFAULT_READER_FONT.stack,
  fontSize: 18,
  lineHeight: 1.8,
  paraSpacing: 16,
  textPadding: 48,
  // Column measure in px (also capped at 70ch by TextContent).
  maxTextWidth: 680,
  animatedPageTurn: true,
  immersiveMode: false,
};

// Theme classes following conventions.md
// Using solid backgrounds for panels (no transparency)
export const THEMES: Record<string, ThemeClasses> = {
  dark: {
    bg: "bg-[var(--bg-inset)]",
    bgRaw: "var(--bg-inset)",
    text: "text-white/85",
    muted: "text-white/40",
    surface: "bg-[var(--bg-surface)]",
    panel: "bg-[var(--bg-overlay)]",
    border: "border-white/[0.06]",
    btn: "text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:text-white/20",
    btnActive: "bg-[var(--bg-elevated)] text-white/90",
    subtle: "bg-white/[0.06]",
    input: "bg-[var(--bg-inset)]",
  },
  light: {
    bg: "bg-[#fafafa]",
    bgRaw: "#fafafa",
    text: "text-[#1a1a1a]",
    muted: "text-[#1a1a1a]/40",
    surface: "bg-[#f0f0f0]",
    panel: "bg-white",
    border: "border-black/[0.08]",
    btn: "text-black/50 hover:bg-black/[0.06] hover:text-black/80 disabled:text-black/20",
    btnActive: "bg-black/[0.08] text-black/90",
    subtle: "bg-black/[0.04]",
    input: "bg-black/[0.04]",
  },
  sepia: {
    bg: "bg-[#f4ecd8]",
    bgRaw: "#f4ecd8",
    text: "text-[#5b4636]",
    muted: "text-[#5b4636]/40",
    surface: "bg-[#e8dcc8]",
    panel: "bg-[#efe5d0]",
    border: "border-[#5b4636]/10",
    btn: "text-[#5b4636]/50 hover:bg-[#5b4636]/10 hover:text-[#5b4636]/80 disabled:text-[#5b4636]/20",
    btnActive: "bg-[#5b4636]/15 text-[#5b4636]/90",
    subtle: "bg-[#5b4636]/[0.08]",
    input: "bg-[#5b4636]/[0.06]",
  },
};
