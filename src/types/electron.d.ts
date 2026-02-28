interface LibraryItem {
  id: number;
  title: string;
  author: string;
  cover: string;
  gradient: string;
  format: string;
  filePath: string;
  size: number;
  section: string;
  view: string;
  addedAt: string;
}

interface ImportedFile {
  name: string;
  filePath: string;
  format: string;
  size: number;
}

interface UpdateEvent {
  status:
    | "checking"
    | "available"
    | "not-available"
    | "progress"
    | "downloaded"
    | "error";
  data?: {
    version?: string;
    percent?: number;
    bytesPerSecond?: number;
    transferred?: number;
    total?: number;
    message?: string;
  };
}

interface ReaderBookmark {
  id: number;
  filePath: string;
  chapterIndex: number;
  paragraphIndex: number;
  label: string;
  createdAt: string;
}

interface BookChapter {
  title: string;
  paragraphs: string[];
  htmlParagraphs: string[];
}

interface BookContent {
  chapters: BookChapter[];
  isImageBook: boolean;
  fontFamily?: string;
  fontSizePx?: number;
  css?: string;
}

interface WordBoundary {
  type: "WordBoundary";
  offset: number;
  duration: number;
  text: string;
}

interface TTSSynthesisResult {
  audio: string;
  wordBoundaries: WordBoundary[];
}

interface ElectronAPI {
  platform: NodeJS.Platform;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  onMaximized: (callback: (maximized: boolean) => void) => void;

  // Library operations
  importFiles: (section: string, view: string) => Promise<LibraryItem[]>;
  selectFolder: () => Promise<string | null>;
  scanFolder: (folderPath: string, section: string, view: string) => Promise<LibraryItem[]>;
  getItems: (section: string) => Promise<LibraryItem[]>;
  deleteItem: (id: number) => Promise<void>;
  moveItem: (id: number, view: string) => Promise<void>;
  transferItem: (id: number, section: string, view: string) => Promise<void>;

  // Reader
  openReader: (bookInfo: { id: number; title: string; author: string; filePath: string; cover: string; format: string }) => Promise<void>;
  getBookContent: (filePath: string, format: string) => Promise<BookContent>;

  // Bookmarks
  getBookmarks: (filePath: string) => Promise<ReaderBookmark[]>;
  addBookmark: (filePath: string, chapterIndex: number, paragraphIndex: number, label: string) => Promise<ReaderBookmark>;
  deleteBookmark: (id: number) => Promise<void>;

  // TTS
  ttsGetVoices: () => Promise<Array<{ name: string; shortName: string; gender: string; locale: string }>>;
  ttsSynthesize: (text: string, voice: string, rate: string, pitch?: string, volume?: string) => Promise<TTSSynthesisResult>;

  // Settings
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  getAllSettings: () => Promise<Record<string, string>>;

  // Updates
  checkForUpdates: () => Promise<unknown>;
  installUpdate: () => void;
  onUpdateStatus: (callback: (event: UpdateEvent) => void) => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
