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

interface ReadingActivityRecord {
  id: number;
  filePath: string;
  title: string;
  chapterIndex: number;
  chapterTitle: string;
  pageIndex: number;
  totalPages: number;
  totalChapters: number;
  timestamp: string;
}

interface ReadingStats {
  totalPagesRead: number;
  totalSessions: number;
  booksRead: number;
  activityByBook: { filePath: string; title: string; pagesRead: number; lastRead: string }[];
}

// Wiki DB types
interface WikiEntryRow {
  id: string;
  file_path: string;
  name: string;
  type: string;
  short_description: string;
  description: string;
  color: string;
  first_appearance: number;
  significance: number;
  status: string;
}

interface WikiDetailRow {
  id: number;
  file_path: string;
  entry_id: string;
  chapter_index: number;
  category: string;
  content: string;
}

interface WikiRelationshipRow {
  id: number;
  file_path: string;
  source_id: string;
  target_id: string;
  relation: string;
  since_chapter: number;
  until_chapter: number | null;
  description: string;
}

interface WikiChapterSummaryRow {
  file_path: string;
  chapter_index: number;
  summary: string;
  key_events: string;
  active_entities: string;
  mood: string;
}

interface WikiArcRow {
  id: string;
  file_path: string;
  name: string;
  description: string;
  arc_type: string;
  status: string;
  start_chapter: number;
  end_chapter: number | null;
}

interface WikiArcBeatRow {
  id: number;
  file_path: string;
  arc_id: string;
  chapter_index: number;
  beat_type: string;
  description: string;
}

interface WikiEntityIndexItem {
  id: string;
  name: string;
  type: string;
  color: string;
  aliases: string[];
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

  // Style Dictionary
  openStyleDictionary: (info: { filePath: string; title: string }) => Promise<void>;

  // Wiki
  openWiki: (info: { filePath: string; title: string }) => Promise<void>;

  // Wiki DB operations
  wikiUpsertEntry: (entry: { id: string; filePath: string; name: string; type: string; shortDescription?: string; description?: string; color?: string; firstAppearance?: number; significance?: number; status?: string }) => Promise<void>;
  wikiGetEntries: (filePath: string) => Promise<WikiEntryRow[]>;
  wikiGetEntry: (filePath: string, entryId: string) => Promise<WikiEntryRow | null>;
  wikiDeleteEntry: (filePath: string, entryId: string) => Promise<void>;

  wikiAddAliases: (filePath: string, entryId: string, aliases: string[]) => Promise<void>;
  wikiGetAliases: (filePath: string, entryId: string) => Promise<string[]>;

  wikiAddDetails: (filePath: string, entryId: string, details: { chapterIndex: number; category: string; content: string }[]) => Promise<void>;
  wikiGetDetails: (filePath: string, entryId: string, maxChapter?: number) => Promise<WikiDetailRow[]>;

  wikiAddRelationship: (filePath: string, rel: { sourceId: string; targetId: string; relation: string; sinceChapter: number; description?: string }) => Promise<void>;
  wikiGetRelationships: (filePath: string, entryId: string, maxChapter?: number) => Promise<WikiRelationshipRow[]>;

  wikiAddAppearance: (filePath: string, entryId: string, chapterIndex: number) => Promise<void>;
  wikiGetAppearances: (filePath: string, entryId: string) => Promise<number[]>;

  wikiUpsertChapterSummary: (filePath: string, summary: { chapterIndex: number; summary: string; keyEvents?: string; activeEntities?: string; mood?: string }) => Promise<void>;
  wikiGetChapterSummaries: (filePath: string, fromCh: number, toCh: number) => Promise<WikiChapterSummaryRow[]>;
  wikiGetAllChapterSummaries: (filePath: string) => Promise<WikiChapterSummaryRow[]>;

  wikiUpsertArc: (filePath: string, arc: { id: string; name: string; description?: string; arcType?: string; status?: string; startChapter: number; endChapter?: number | null }) => Promise<void>;
  wikiGetActiveArcs: (filePath: string) => Promise<WikiArcRow[]>;
  wikiGetAllArcs: (filePath: string) => Promise<WikiArcRow[]>;
  wikiAddArcBeat: (filePath: string, arcId: string, beat: { chapterIndex: number; beatType: string; description: string }) => Promise<void>;
  wikiGetArcBeats: (filePath: string, arcId: string) => Promise<WikiArcBeatRow[]>;
  wikiAddArcEntity: (filePath: string, arcId: string, entryId: string, role: string) => Promise<void>;
  wikiGetArcEntities: (filePath: string, arcId: string) => Promise<{ entry_id: string; role: string }[]>;

  wikiMarkProcessed: (filePath: string, chapterIndex: number) => Promise<void>;
  wikiGetProcessed: (filePath: string) => Promise<number[]>;

  wikiGetMeta: (filePath: string) => Promise<{ file_path: string; book_title: string; updated_at: string } | null>;
  wikiUpsertMeta: (filePath: string, bookTitle: string) => Promise<void>;

  wikiGetEntityIndex: (filePath: string) => Promise<WikiEntityIndexItem[]>;
  wikiGetRecentEntities: (filePath: string, lastN: number, currentChapter: number) => Promise<WikiEntryRow[]>;

  wikiClear: (filePath: string) => Promise<void>;
  wikiMigrateJson: (filePath: string) => Promise<boolean>;

  // Bookmarks
  getBookmarks: (filePath: string) => Promise<ReaderBookmark[]>;
  addBookmark: (filePath: string, chapterIndex: number, paragraphIndex: number, label: string) => Promise<ReaderBookmark>;
  deleteBookmark: (id: number) => Promise<void>;

  // TTS
  ttsGetVoices: () => Promise<Array<{ name: string; shortName: string; gender: string; locale: string }>>;
  ttsSynthesize: (text: string, voice: string, rate: string, pitch?: string, volume?: string) => Promise<TTSSynthesisResult>;

  // Shell
  openExternal: (url: string) => Promise<void>;

  // Settings
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  getAllSettings: () => Promise<Record<string, string>>;

  // Reading Activity
  recordPageView: (filePath: string, title: string, chapterIndex: number, chapterTitle: string, pageIndex: number, totalPages: number, totalChapters: number) => Promise<void>;
  getReadingActivity: (filePath?: string, limit?: number) => Promise<ReadingActivityRecord[]>;
  getReadingStats: () => Promise<ReadingStats>;

  // Updates
  checkForUpdates: () => Promise<unknown>;
  installUpdate: () => void;
  onUpdateStatus: (callback: (event: UpdateEvent) => void) => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
