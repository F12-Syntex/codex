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

interface SavedQuote {
  id: number;
  filePath: string;
  chapterIndex: number;
  paragraphIndex: number;
  text: string;
  chapterTitle: string;
  bookTitle: string;
  speaker: string;
  kind: string;
  note: string;
  aiEnhanced: boolean;
  createdAt: string;
}

interface BookChapter {
  title: string;
  paragraphs: string[];
  htmlParagraphs: string[];
}

interface TocEntry {
  label: string;
  chapterIndex: number;
}

interface BookContent {
  chapters: BookChapter[];
  isImageBook: boolean;
  toc: TocEntry[];
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
  relevance: number;
  is_superseded: number;
  superseded_chapter: number | null;
}

interface WikiAliasRow {
  alias: string;
  alias_type: string;
  relevance: number;
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

interface WikiMergeLogRow {
  id: number;
  file_path: string;
  source_id: string;
  target_id: string;
  source_name: string;
  target_name: string;
  source_snapshot: string;
  merged_at: string;
}

// Simulate DB types
interface SimBranchRow {
  id: string;
  file_path: string;
  entity_id: string;
  entity_name: string;
  chapter_index: number;
  truncate_after_para: number;
  created_at: string;
}

interface SimSegmentRow {
  id: number;
  file_path: string;
  branch_id: string;
  segment_index: number;
  user_input: string;
  html_paragraphs: string; // JSON stringified string[]
  created_at: string;
}

interface InstallerSearchResult {
  title: string;
  url: string;
  slug: string;
  thumbnail: string;
  author: string;
}

interface InstallerNovelInfo {
  title: string;
  author: string;
  genres: string[];
  status: string;
  rating: string;
  description: string;
  thumbnail: string;
  totalChapters: number;
  chapters: { title: string; url: string }[];
}

interface InstallerDownloadProgress {
  id: number;
  current: number;
  total: number;
  chapterTitle: string;
  eta: number | null;
  status: string;
}

interface MCStatRow {
  id: number;
  file_path: string;
  stat_key: string;
  category: string;
  display_name: string;
  value: string | null;
  is_active: number;
  last_chapter: number;
}

interface InstallerDownloadRow {
  id: number;
  source_id: string;
  novel_title: string;
  novel_author: string | null;
  novel_url: string;
  thumbnail: string | null;
  chapters_json: string;
  total_chapters: number;
  current_chapter: number;
  status: string;
  error: string | null;
  epub_path: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ElectronAPI {
  platform: NodeJS.Platform;
  isDev: boolean;
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
  updateItemMeta: (id: number, fields: { title?: string; author?: string; cover?: string }) => Promise<void>;

  // Reader
  openReader: (bookInfo: { id: number; title: string; author: string; filePath: string; cover: string; format: string }) => Promise<void>;
  getBookContent: (filePath: string, format: string) => Promise<BookContent>;

  // Style Dictionary
  openStyleDictionary: (info: { filePath: string; title: string }) => Promise<void>;

  // Buddy
  openBuddy: (info: { filePath: string; title: string; currentChapter: number; totalChapters: number }) => Promise<void>;

  // Wiki
  openWiki: (info: { filePath: string; title: string; entryId?: string }) => Promise<void>;

  // Wiki DB operations
  wikiUpsertEntry: (entry: { id: string; filePath: string; name: string; type: string; shortDescription?: string; description?: string; color?: string; firstAppearance?: number; significance?: number; status?: string }) => Promise<void>;
  wikiGetEntries: (filePath: string) => Promise<WikiEntryRow[]>;
  wikiGetEntry: (filePath: string, entryId: string) => Promise<WikiEntryRow | null>;
  wikiDeleteEntry: (filePath: string, entryId: string) => Promise<void>;

  wikiAddAliases: (filePath: string, entryId: string, aliases: Array<string | { alias: string; alias_type?: string; relevance?: number }>) => Promise<void>;
  wikiGetAliases: (filePath: string, entryId: string) => Promise<WikiAliasRow[]>;

  wikiAddDetails: (filePath: string, entryId: string, details: { chapterIndex: number; category: string; content: string; relevance?: number }[]) => Promise<void>;
  wikiGetDetails: (filePath: string, entryId: string, maxChapter?: number) => Promise<WikiDetailRow[]>;
  wikiSupersedeDetails: (filePath: string, entryId: string, category: string, currentChapter: number) => Promise<void>;

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
  wikiDeleteArc: (filePath: string, arcId: string) => Promise<void>;
  wikiMergeArcs: (filePath: string, sourceArcIds: string[], targetArcId: string) => Promise<void>;

  wikiMarkProcessed: (filePath: string, chapterIndex: number) => Promise<void>;
  wikiUnmarkProcessed: (filePath: string, chapterIndex: number) => Promise<void>;
  wikiGetProcessed: (filePath: string) => Promise<number[]>;

  wikiGetMeta: (filePath: string) => Promise<{ file_path: string; book_title: string; updated_at: string } | null>;
  wikiUpsertMeta: (filePath: string, bookTitle: string) => Promise<void>;

  wikiGetEntityIndex: (filePath: string) => Promise<WikiEntityIndexItem[]>;
  wikiGetRecentEntities: (filePath: string, lastN: number, currentChapter: number) => Promise<WikiEntryRow[]>;

  wikiClear: (filePath: string) => Promise<void>;
  wikiMigrateJson: (filePath: string) => Promise<boolean>;

  wikiMergeEntries: (filePath: string, sourceId: string, targetId: string) => Promise<void>;
  wikiUnmergeEntries: (filePath: string, mergeLogId: number) => Promise<void>;
  wikiGetMergeLog: (filePath: string) => Promise<WikiMergeLogRow[]>;

  wikiUpsertMCStat: (filePath: string, stat: { key: string; category: string; name: string; value: string | null; isActive: boolean; chapter: number }) => Promise<void>;
  wikiGetMCStats: (filePath: string) => Promise<MCStatRow[]>;
  wikiSetMCEntityId: (filePath: string, entityId: string) => Promise<void>;
  wikiGetMCEntityId: (filePath: string) => Promise<string | null>;
  wikiPurgeNullEntries: (filePath: string) => Promise<number>;

  // Simulate
  simUpsertBranch: (branch: { id: string; filePath: string; entityId: string; entityName: string; chapterIndex: number; truncateAfterPara: number }) => Promise<void>;
  simGetBranches: (filePath: string) => Promise<SimBranchRow[]>;
  simGetSegments: (filePath: string, branchId: string) => Promise<SimSegmentRow[]>;
  simAddSegment: (segment: { filePath: string; branchId: string; segmentIndex: number; userInput: string; htmlParagraphs: string }) => Promise<number>;
  simDeleteBranch: (filePath: string, branchId: string) => Promise<void>;

  // Bookmarks
  getBookmarks: (filePath: string) => Promise<ReaderBookmark[]>;
  addBookmark: (filePath: string, chapterIndex: number, paragraphIndex: number, label: string) => Promise<ReaderBookmark>;
  deleteBookmark: (id: number) => Promise<void>;

  // Quotes
  quotesGet: (filePath: string) => Promise<SavedQuote[]>;
  quotesGetAll: () => Promise<SavedQuote[]>;
  quotesAdd: (filePath: string, chapterIndex: number, paragraphIndex: number, text: string, chapterTitle: string, bookTitle: string) => Promise<SavedQuote>;
  quotesUpdate: (id: number, fields: { speaker?: string; kind?: string; note?: string; aiEnhanced?: boolean }) => Promise<void>;
  quotesDelete: (id: number) => Promise<void>;
  openQuotes: (info: { filePath?: string; title?: string }) => Promise<void>;

  // TTS
  ttsGetVoices: () => Promise<Array<{ name: string; shortName: string; gender: string; locale: string }>>;
  ttsSynthesize: (text: string, voice: string, rate: string, pitch?: string, volume?: string) => Promise<TTSSynthesisResult>;
  // Shell
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (filePath: string) => Promise<void>;

  // Library change events
  onLibraryChanged: (callback: () => void) => void;

  // Settings
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  getAllSettings: () => Promise<Record<string, string>>;

  // Reading Activity
  recordPageView: (filePath: string, title: string, chapterIndex: number, chapterTitle: string, pageIndex: number, totalPages: number, totalChapters: number) => Promise<void>;
  getReadingActivity: (filePath?: string, limit?: number) => Promise<ReadingActivityRecord[]>;
  getReadingStats: () => Promise<ReadingStats>;

  // Installer (dev-only)
  installerGetSources: () => Promise<{ id: string; name: string; url: string }[]>;
  installerSearch: (sourceId: string, keyword: string, page: number) => Promise<{ results: InstallerSearchResult[]; page: number; totalPages: number }>;
  installerNovelInfo: (sourceId: string, url: string) => Promise<InstallerNovelInfo>;
  installerQueueDownload: (sourceId: string, novelInfo: InstallerNovelInfo) => Promise<number>;
  installerCancelDownload: (id: number) => Promise<void>;
  installerRetryDownload: (id: number) => Promise<void>;
  installerRemoveDownload: (id: number) => Promise<void>;
  installerGetDownloads: () => Promise<InstallerDownloadRow[]>;
  installerClearCompleted: () => Promise<void>;
  installerImportCompleted: (id: number) => Promise<LibraryItem[] | null>;
  installerProxyImage: (url: string) => Promise<string>;
  onInstallerProgress: (callback: (progress: InstallerDownloadProgress) => void) => void;

  // Updates
  checkForUpdates: () => Promise<unknown>;
  installUpdate: () => void;
  onUpdateStatus: (callback: (event: UpdateEvent) => void) => (() => void);
}

interface Window {
  electronAPI: ElectronAPI;
}
