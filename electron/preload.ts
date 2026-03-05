import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isDev: process.env.NODE_ENV === "development",
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  onMaximized: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on("window:maximized", (_event, maximized) =>
      callback(maximized)
    );
  },

  // Library operations
  importFiles: (section: string, view: string) =>
    ipcRenderer.invoke("library:import-files", section, view),
  selectFolder: () => ipcRenderer.invoke("library:select-folder"),
  scanFolder: (folderPath: string, section: string, view: string) =>
    ipcRenderer.invoke("library:scan-folder", folderPath, section, view),
  getItems: (section: string) =>
    ipcRenderer.invoke("library:get-items", section),
  deleteItem: (id: number) =>
    ipcRenderer.invoke("library:delete-item", id),
  moveItem: (id: number, view: string) =>
    ipcRenderer.invoke("library:move-item", id, view),
  transferItem: (id: number, section: string, view: string) =>
    ipcRenderer.invoke("library:transfer-item", id, section, view),

  // Settings
  getSetting: (key: string) =>
    ipcRenderer.invoke("library:get-setting", key),
  setSetting: (key: string, value: string) =>
    ipcRenderer.invoke("library:set-setting", key, value),
  getAllSettings: () =>
    ipcRenderer.invoke("library:get-all-settings"),

  // Reader
  openReader: (bookInfo: { id: number; title: string; author: string; filePath: string; cover: string; format: string }) =>
    ipcRenderer.invoke("reader:open", bookInfo),

  // Reader content
  getBookContent: (filePath: string, format: string) =>
    ipcRenderer.invoke("reader:get-content", filePath, format),

  // Style Dictionary
  openStyleDictionary: (info: { filePath: string; title: string }) =>
    ipcRenderer.invoke("style-dictionary:open", info),

  // Wiki
  openWiki: (info: { filePath: string; title: string; entryId?: string }) =>
    ipcRenderer.invoke("wiki:open", info),

  // Wiki DB operations
  wikiUpsertEntry: (entry: { id: string; filePath: string; name: string; type: string; shortDescription?: string; description?: string; color?: string; firstAppearance?: number; significance?: number; status?: string }) =>
    ipcRenderer.invoke("wiki:upsert-entry", entry),
  wikiGetEntries: (filePath: string) =>
    ipcRenderer.invoke("wiki:get-entries", filePath),
  wikiGetEntry: (filePath: string, entryId: string) =>
    ipcRenderer.invoke("wiki:get-entry", filePath, entryId),
  wikiDeleteEntry: (filePath: string, entryId: string) =>
    ipcRenderer.invoke("wiki:delete-entry", filePath, entryId),

  wikiAddAliases: (filePath: string, entryId: string, aliases: string[]) =>
    ipcRenderer.invoke("wiki:add-aliases", filePath, entryId, aliases),
  wikiGetAliases: (filePath: string, entryId: string) =>
    ipcRenderer.invoke("wiki:get-aliases", filePath, entryId),

  wikiAddDetails: (filePath: string, entryId: string, details: { chapterIndex: number; category: string; content: string }[]) =>
    ipcRenderer.invoke("wiki:add-details", filePath, entryId, details),
  wikiGetDetails: (filePath: string, entryId: string, maxChapter?: number) =>
    ipcRenderer.invoke("wiki:get-details", filePath, entryId, maxChapter),

  wikiAddRelationship: (filePath: string, rel: { sourceId: string; targetId: string; relation: string; sinceChapter: number; description?: string }) =>
    ipcRenderer.invoke("wiki:add-relationship", filePath, rel),
  wikiGetRelationships: (filePath: string, entryId: string, maxChapter?: number) =>
    ipcRenderer.invoke("wiki:get-relationships", filePath, entryId, maxChapter),

  wikiAddAppearance: (filePath: string, entryId: string, chapterIndex: number) =>
    ipcRenderer.invoke("wiki:add-appearance", filePath, entryId, chapterIndex),
  wikiGetAppearances: (filePath: string, entryId: string) =>
    ipcRenderer.invoke("wiki:get-appearances", filePath, entryId),

  wikiUpsertChapterSummary: (filePath: string, summary: { chapterIndex: number; summary: string; keyEvents?: string; activeEntities?: string; mood?: string }) =>
    ipcRenderer.invoke("wiki:upsert-chapter-summary", filePath, summary),
  wikiGetChapterSummaries: (filePath: string, fromCh: number, toCh: number) =>
    ipcRenderer.invoke("wiki:get-chapter-summaries", filePath, fromCh, toCh),
  wikiGetAllChapterSummaries: (filePath: string) =>
    ipcRenderer.invoke("wiki:get-all-chapter-summaries", filePath),

  wikiUpsertArc: (filePath: string, arc: { id: string; name: string; description?: string; arcType?: string; status?: string; startChapter: number; endChapter?: number | null }) =>
    ipcRenderer.invoke("wiki:upsert-arc", filePath, arc),
  wikiGetActiveArcs: (filePath: string) =>
    ipcRenderer.invoke("wiki:get-active-arcs", filePath),
  wikiGetAllArcs: (filePath: string) =>
    ipcRenderer.invoke("wiki:get-all-arcs", filePath),
  wikiAddArcBeat: (filePath: string, arcId: string, beat: { chapterIndex: number; beatType: string; description: string }) =>
    ipcRenderer.invoke("wiki:add-arc-beat", filePath, arcId, beat),
  wikiGetArcBeats: (filePath: string, arcId: string) =>
    ipcRenderer.invoke("wiki:get-arc-beats", filePath, arcId),
  wikiAddArcEntity: (filePath: string, arcId: string, entryId: string, role: string) =>
    ipcRenderer.invoke("wiki:add-arc-entity", filePath, arcId, entryId, role),
  wikiGetArcEntities: (filePath: string, arcId: string) =>
    ipcRenderer.invoke("wiki:get-arc-entities", filePath, arcId),
  wikiDeleteArc: (filePath: string, arcId: string) =>
    ipcRenderer.invoke("wiki:delete-arc", filePath, arcId),
  wikiMergeArcs: (filePath: string, sourceArcIds: string[], targetArcId: string) =>
    ipcRenderer.invoke("wiki:merge-arcs", filePath, sourceArcIds, targetArcId),

  wikiMarkProcessed: (filePath: string, chapterIndex: number) =>
    ipcRenderer.invoke("wiki:mark-processed", filePath, chapterIndex),
  wikiGetProcessed: (filePath: string) =>
    ipcRenderer.invoke("wiki:get-processed", filePath),

  wikiGetMeta: (filePath: string) =>
    ipcRenderer.invoke("wiki:get-meta", filePath),
  wikiUpsertMeta: (filePath: string, bookTitle: string) =>
    ipcRenderer.invoke("wiki:upsert-meta", filePath, bookTitle),

  wikiGetEntityIndex: (filePath: string) =>
    ipcRenderer.invoke("wiki:get-entity-index", filePath),
  wikiGetRecentEntities: (filePath: string, lastN: number, currentChapter: number) =>
    ipcRenderer.invoke("wiki:get-recent-entities", filePath, lastN, currentChapter),

  wikiClear: (filePath: string) =>
    ipcRenderer.invoke("wiki:clear", filePath),
  wikiMigrateJson: (filePath: string) =>
    ipcRenderer.invoke("wiki:migrate-json", filePath),

  // Simulate
  simUpsertBranch: (branch: { id: string; filePath: string; entityId: string; entityName: string; chapterIndex: number; truncateAfterPara: number }) =>
    ipcRenderer.invoke("sim:upsert-branch", branch),
  simGetBranches: (filePath: string) =>
    ipcRenderer.invoke("sim:get-branches", filePath),
  simGetSegments: (filePath: string, branchId: string) =>
    ipcRenderer.invoke("sim:get-segments", filePath, branchId),
  simAddSegment: (segment: { filePath: string; branchId: string; segmentIndex: number; userInput: string; htmlParagraphs: string }) =>
    ipcRenderer.invoke("sim:add-segment", segment),
  simDeleteBranch: (filePath: string, branchId: string) =>
    ipcRenderer.invoke("sim:delete-branch", filePath, branchId),

  // Bookmarks
  getBookmarks: (filePath: string) =>
    ipcRenderer.invoke("bookmarks:get", filePath),
  addBookmark: (filePath: string, chapterIndex: number, paragraphIndex: number, label: string) =>
    ipcRenderer.invoke("bookmarks:add", filePath, chapterIndex, paragraphIndex, label),
  deleteBookmark: (id: number) =>
    ipcRenderer.invoke("bookmarks:delete", id),

  // TTS
  ttsGetVoices: () => ipcRenderer.invoke("tts:get-voices"),
  ttsSynthesize: (text: string, voice: string, rate: string, pitch?: string, volume?: string) =>
    ipcRenderer.invoke("tts:synthesize", text, voice, rate, pitch, volume),

  // Shell
  openExternal: (url: string) =>
    ipcRenderer.invoke("shell:open-external", url),

  // Reading Activity
  recordPageView: (filePath: string, title: string, chapterIndex: number, chapterTitle: string, pageIndex: number, totalPages: number, totalChapters: number) =>
    ipcRenderer.invoke("activity:record-page", filePath, title, chapterIndex, chapterTitle, pageIndex, totalPages, totalChapters),
  getReadingActivity: (filePath?: string, limit?: number) =>
    ipcRenderer.invoke("activity:get", filePath, limit),
  getReadingStats: () =>
    ipcRenderer.invoke("activity:stats"),

  // Installer (dev-only)
  installerSearch: (keyword: string, page: number) =>
    ipcRenderer.invoke("installer:search", keyword, page),
  installerNovelInfo: (url: string) =>
    ipcRenderer.invoke("installer:novel-info", url),
  installerDownload: (novelInfo: unknown) =>
    ipcRenderer.invoke("installer:download", novelInfo),
  installerCancelDownload: () =>
    ipcRenderer.invoke("installer:cancel-download"),
  onInstallerProgress: (callback: (progress: { current: number; total: number; chapterTitle: string }) => void) => {
    ipcRenderer.on("installer:download-progress", (_event, progress) => callback(progress));
  },

  // Updates
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.send("update:install"),
  onUpdateStatus: (
    callback: (event: { status: string; data?: unknown }) => void
  ) => {
    ipcRenderer.on("update:status", (_event, payload) => callback(payload));
  },
});
