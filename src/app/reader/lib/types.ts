// Types for the reader (copied from electron.d.ts since it's not a module)

export interface BookChapter {
  title: string;
  paragraphs: string[];
  htmlParagraphs: string[];
}

export interface BookContent {
  chapters: BookChapter[];
  isImageBook: boolean;
  fontFamily?: string;
  fontSizePx?: number;
  css?: string;
}

export interface ReaderBookmark {
  id: number;
  filePath: string;
  chapterIndex: number;
  paragraphIndex: number;
  label: string;
  createdAt: string;
}

export interface WordBoundary {
  type: "WordBoundary";
  offset: number;
  duration: number;
  text: string;
}

export type ReadingTheme = "dark" | "light" | "sepia";

export interface ReaderSettings {
  readingTheme: ReadingTheme;
  ttsVoice: string;
  ttsRate: number;
  ttsPitch: number;
  ttsVolume: number;
  ttsAutoAdvance: boolean;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paraSpacing: number;
  textPadding: number;
  maxTextWidth: number;
  animatedPageTurn: boolean;
  immersiveMode: boolean;
}

export interface CustomFont {
  name: string;
  family: string;
  file: string;
}

export interface EdgeVoice {
  name: string;
  shortName: string;
  gender: string;
  locale: string;
}

export type TTSStatus = "idle" | "synthesizing" | "playing" | "paused";

export interface TTSState {
  status: TTSStatus;
  currentParagraph: number;
}

export interface ThemeClasses {
  bg: string;
  bgRaw: string;
  text: string;
  muted: string;
  surface: string;
  panel: string;
  border: string;
  btn: string;
  btnActive: string;
  subtle: string;
  input: string;
}
