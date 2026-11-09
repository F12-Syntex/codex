/**
 * Reader typefaces: the ONE registry (owner: WS-C). The Aa picker, the `@font-face` rules
 * injected by the reader layout and the font test (electron/reader-fonts.test.ts) all read it,
 * so a face can't be offered without being declared, nor declared without its file.
 *
 * PURE: no `electron`, Node or DOM imports (imported by the renderer through `@shared/*`).
 * Files live in `public/fonts/` and are WOFF2 (Latin subsets of the variable fonts).
 */

export interface ReaderFontFile {
  /** File name in public/fonts/. */
  file: string;
  /** CSS weight range of the variable font, e.g. "200 900" (or a single weight). */
  weight: string;
  style: "normal" | "italic";
}

export interface ReaderFont {
  /** Picker label. */
  name: string;
  /** CSS family name the faces are declared under (first token of `stack`). */
  family: string;
  /** Full `font-family` value the reader applies. */
  stack: string;
  /** Empty for system fonts. */
  files: ReaderFontFile[];
}

export const READER_FONTS: readonly ReaderFont[] = [
  {
    name: "Literata", family: "Literata", stack: "'Literata', Georgia, serif",
    files: [
      { file: "Literata.woff2", weight: "200 900", style: "normal" },
      { file: "Literata-Italic.woff2", weight: "200 900", style: "italic" },
    ],
  },
  {
    name: "Lora", family: "Lora", stack: "'Lora', Georgia, serif",
    files: [
      { file: "Lora.woff2", weight: "400 700", style: "normal" },
      { file: "Lora-Italic.woff2", weight: "400 700", style: "italic" },
    ],
  },
  {
    name: "Merriweather", family: "Merriweather", stack: "'Merriweather', Georgia, serif",
    files: [
      { file: "Merriweather.woff2", weight: "300 900", style: "normal" },
      { file: "Merriweather-Italic.woff2", weight: "300 900", style: "italic" },
    ],
  },
  {
    name: "Source Serif", family: "Source Serif 4", stack: "'Source Serif 4', Georgia, serif",
    files: [{ file: "SourceSerif4.woff2", weight: "200 900", style: "normal" }],
  },
  {
    name: "Crimson Text", family: "Crimson Text", stack: "'Crimson Text', Georgia, serif",
    files: [
      { file: "CrimsonText.woff2", weight: "400", style: "normal" },
      { file: "CrimsonText-SemiBold.woff2", weight: "600", style: "normal" },
      { file: "CrimsonText-Italic.woff2", weight: "400", style: "italic" },
    ],
  },
  {
    name: "Inter", family: "Inter", stack: "'Inter', system-ui, sans-serif",
    files: [{ file: "Inter.woff2", weight: "100 900", style: "normal" }],
  },
  { name: "Georgia", family: "Georgia", stack: "Georgia, 'Times New Roman', serif", files: [] },
  { name: "Palatino", family: "Palatino Linotype", stack: "'Palatino Linotype', 'Book Antiqua', Palatino, serif", files: [] },
  { name: "System Sans", family: "system-ui", stack: "system-ui, -apple-system, sans-serif", files: [] },
];

/** The default reading face (preloaded by the reader layout). */
export const DEFAULT_READER_FONT = READER_FONTS[0];

/** `@font-face` rules for every bundled file. */
export function readerFontFaceCss(base = "/fonts/"): string {
  return READER_FONTS.flatMap((f) =>
    f.files.map(
      (x) => `@font-face{font-family:'${f.family}';src:url('${base}${x.file}') format('woff2');font-weight:${x.weight};font-style:${x.style};font-display:swap;}`,
    ),
  ).join("\n");
}
