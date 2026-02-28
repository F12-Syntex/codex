import type { ReaderSettings, ThemeClasses, CustomFont } from "./types";

export const SETTINGS_KEY = "readerSettings";

// Custom fonts from public/fonts/
export const CUSTOM_FONTS: CustomFont[] = [
  { name: "Literata", family: "'Literata', Georgia, serif", file: "Literata.woff2" },
  { name: "Lora", family: "'Lora', Georgia, serif", file: "Lora.woff2" },
  { name: "Merriweather", family: "'Merriweather', Georgia, serif", file: "Merriweather.woff2" },
  { name: "Source Serif", family: "'Source Serif 4', Georgia, serif", file: "SourceSerif4.woff2" },
  { name: "Crimson Text", family: "'Crimson Text', Georgia, serif", file: "CrimsonText.woff2" },
  { name: "Inter", family: "'Inter', system-ui, sans-serif", file: "Inter.woff2" },
];

// Built-in system fonts
export const BUILTIN_FONTS: CustomFont[] = [
  { name: "Georgia", family: "Georgia, 'Times New Roman', serif", file: "" },
  { name: "Palatino", family: "'Palatino Linotype', 'Book Antiqua', Palatino, serif", file: "" },
  { name: "System Sans", family: "system-ui, -apple-system, sans-serif", file: "" },
];

// All fonts combined
export const ALL_FONTS = [...CUSTOM_FONTS, ...BUILTIN_FONTS];

// Font face CSS for custom fonts
export const FONT_FACE_CSS = CUSTOM_FONTS.map(font => `
  @font-face {
    font-family: '${font.name}';
    src: url('/fonts/${font.file}') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
`).join("\n");

export const DEFAULT_SETTINGS: ReaderSettings = {
  readingTheme: "dark",
  ttsVoice: "en-US-AriaNeural",
  ttsRate: 1.0,
  ttsPitch: 0,
  ttsVolume: 100,
  ttsAutoAdvance: false,
  fontFamily: "'Literata', Georgia, serif",
  fontSize: 18,
  lineHeight: 1.8,
  paraSpacing: 16,
  textPadding: 48,
  maxTextWidth: 900,
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
