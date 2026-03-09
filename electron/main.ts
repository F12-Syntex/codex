import { app, BrowserWindow, ipcMain, protocol, net, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { initUpdater } from "./updater";
import {
  initDatabase, getAllItems, addItems, deleteItem, moveItem, transferItem, updateItemMeta,
  getSetting, setSetting, getAllSettings, getBookmarks, addBookmark, deleteBookmark,
  getExcludedPaths, recordPageView, getReadingActivity, getReadingStats,
  // Wiki
  upsertWikiEntry, getWikiEntries, getWikiEntry, deleteWikiEntry,
  addWikiAliases, getWikiAliases,
  addWikiDetails, getWikiDetailsForEntry,
  addWikiRelationship, getRelationshipsForEntry,
  addWikiAppearance, getAppearancesForEntry,
  upsertChapterSummary, getChapterSummaries, getAllChapterSummaries,
  upsertArc, getActiveArcs, getAllArcs, addArcBeat, getArcBeats,
  addArcEntity, getArcEntities, deleteArc, mergeArcs,
  markChapterProcessed, getProcessedChapters,
  getWikiMeta, upsertWikiMeta,
  getEntityIndex, getRecentEntities,
  clearWiki, migrateJsonWiki,
  mergeWikiEntries, unmergeWikiEntries, getWikiMergeLog,
  // Simulate
  upsertBranch, getBranches, getBranchSegments, addSegment, deleteBranch,
} from "./database";
import { extractMetadata } from "./metadata";
import { parseBookContent, parsePdfContent } from "./book-parser";
import { EdgeTTS } from "@andresaya/edge-tts";
import { searchNovels, getNovelInfo, getDownloadManager, fetchImageAsDataUrl, getAvailableSources, type NovelInfo } from "./installer";
import { getDownloads, removeDownload, clearCompletedDownloads, getDownload } from "./database";

const SUPPORTED_EXTENSIONS = [".epub", ".pdf", ".cbz", ".cbr", ".mobi"];

function getFormat(ext: string): string {
  return ext.slice(1).toUpperCase(); // ".epub" -> "EPUB"
}

// Gradient palette for imported items (cycles through these)
const GRADIENTS = [
  "linear-gradient(135deg, #667eea, #764ba2)",
  "linear-gradient(135deg, #f093fb, #f5576c)",
  "linear-gradient(135deg, #4facfe, #00f2fe)",
  "linear-gradient(135deg, #43e97b, #38f9d7)",
  "linear-gradient(135deg, #fa709a, #fee140)",
  "linear-gradient(135deg, #a18cd1, #fbc2eb)",
  "linear-gradient(135deg, #ff9a9e, #fad0c4)",
  "linear-gradient(135deg, #84fab0, #8fd3f4)",
];
let gradientIndex = 0;

function nextGradient(): string {
  const g = GRADIENTS[gradientIndex % GRADIENTS.length];
  gradientIndex++;
  return g;
}

interface EnrichedFile {
  id?: number;
  name: string;
  filePath: string;
  format: string;
  size: number;
  title: string;
  author: string;
  coverBase64: string;
  gradient: string;
}

function enrichFile(fp: string): EnrichedFile {
  const ext = path.extname(fp).toLowerCase();
  const stat = fs.statSync(fp);
  const meta = extractMetadata(fp);
  return {
    name: path.basename(fp, ext),
    filePath: fp,
    format: getFormat(ext),
    size: stat.size,
    title: meta.title,
    author: meta.author,
    coverBase64: meta.cover,
    gradient: nextGradient(),
  };
}

function scanDirectory(dirPath: string): EnrichedFile[] {
  const results: EnrichedFile[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanDirectory(fullPath));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          results.push(enrichFile(fullPath));
        }
      }
    }
  } catch {
    // permission error or inaccessible directory — skip
  }
  return results;
}

const isDev = process.env.NODE_ENV === "development";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function createAppWindow(
  route: string,
  params?: URLSearchParams,
  size?: { width: number; height: number; minWidth: number; minHeight: number },
): BrowserWindow {
  const win = new BrowserWindow({
    width: size?.width ?? 1000,
    height: size?.height ?? 700,
    minWidth: size?.minWidth ?? 600,
    minHeight: size?.minHeight ?? 400,
    frame: false,
    titleBarStyle: "hidden",
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "icon.ico")
      : path.join(__dirname, "../build/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const query = params ? `?${params.toString()}` : "";
  const prodRoute = route || "index";
  win.loadURL(isDev ? `http://localhost:3000/${route}${query}` : `app://./${prodRoute}.html${query}`);
  win.on("maximize", () => win.webContents.send("window:maximized", true));
  win.on("unmaximize", () => win.webContents.send("window:maximized", false));
  return win;
}

function createWindow() {
  // Initialize database before setting up IPC
  initDatabase();

  mainWindow = createAppWindow("", undefined, { width: 1200, height: 800, minWidth: 800, minHeight: 600 });

  ipcMain.on("window:minimize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });
  ipcMain.on("window:maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });
  ipcMain.on("window:close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    // If it's NOT the main window, just close the child window — don't touch mainWindow
    if (win !== mainWindow) {
      win.destroy();
      return;
    }
    // If it IS the main window, close everything and quit
    isQuitting = true;
    BrowserWindow.getAllWindows().forEach((w) => {
      if (w !== mainWindow && !w.isDestroyed()) w.destroy();
    });
    win.close();
  });

  // ── Reader: open book in new window ──────────
  ipcMain.handle("reader:open", (_event, bookInfo: { id: number; title: string; author: string; filePath: string; cover: string; format: string }) => {
    const params = new URLSearchParams({
      title: bookInfo.title,
      author: bookInfo.author,
      format: bookInfo.format,
      filePath: bookInfo.filePath,
    });
    const readerWin = createAppWindow("reader", params);
    // Persist last-open reader so it can be restored on next launch
    setSetting("lastReader", JSON.stringify(bookInfo));
    readerWin.on("closed", () => {
      setSetting("lastReader", "");
    });
  });

  // ── Style Dictionary: open in new window ─────────
  ipcMain.handle("style-dictionary:open", (_event, info: { filePath: string; title: string }) => {
    const params = new URLSearchParams({
      filePath: info.filePath,
      title: info.title,
    });
    createAppWindow("style-dictionary", params, { width: 900, height: 700, minWidth: 600, minHeight: 400 });
  });

  // ── Buddy: open in new window ────────────────────
  ipcMain.handle("buddy:open", (_event, info: { filePath: string; title: string; currentChapter: number; totalChapters: number }) => {
    const params = new URLSearchParams({
      filePath: info.filePath,
      title: info.title,
      currentChapter: String(info.currentChapter),
      totalChapters: String(info.totalChapters),
    });
    createAppWindow("buddy", params, { width: 600, height: 700, minWidth: 400, minHeight: 400 });
  });

  // ── Wiki: open in new window ─────────────────────
  ipcMain.handle("wiki:open", (_event, info: { filePath: string; title: string; entryId?: string }) => {
    const params = new URLSearchParams({
      filePath: info.filePath,
      title: info.title,
    });
    if (info.entryId) params.set("entryId", info.entryId);
    createAppWindow("wiki", params, { width: 1000, height: 750, minWidth: 700, minHeight: 500 });
  });

  // ── Reader: get book content ──────────────────────
  ipcMain.handle("reader:get-content", async (_event, filePath: string, format: string) => {
    try {
      if (format.toUpperCase() === "PDF") return await parsePdfContent(filePath);
      return parseBookContent(filePath, format);
    } catch (err) {
      console.error(`[main] reader:get-content — EXCEPTION:`, err);
      throw err;
    }
  });

  // ── Bookmarks ───────────────────────────────────────
  ipcMain.handle("bookmarks:get", (_event, filePath: string) => {
    return getBookmarks(filePath);
  });

  ipcMain.handle("bookmarks:add", (_event, filePath: string, chapterIndex: number, paragraphIndex: number, label: string) => {
    return addBookmark(filePath, chapterIndex, paragraphIndex, label);
  });

  ipcMain.handle("bookmarks:delete", (_event, id: number) => {
    deleteBookmark(id);
  });

  // ── TTS: Edge TTS via @andresaya/edge-tts ─────────

  ipcMain.handle("tts:get-voices", async () => {
    const tts = new EdgeTTS();
    const voices = await tts.getVoices();
    // Return a serializable subset
    return voices.map((v: { Name: string; ShortName: string; Gender: string; Locale: string }) => ({
      name: v.Name,
      shortName: v.ShortName,
      gender: v.Gender,
      locale: v.Locale,
    }));
  });

  ipcMain.handle("tts:synthesize", async (_event, text: string, voice: string, rate: string, pitch?: string, volume?: string) => {
    const options: { rate: string; pitch?: string; volume?: string } = { rate };
    if (pitch) options.pitch = pitch;
    if (volume) options.volume = volume;

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const tts = new EdgeTTS();
        await tts.synthesize(text, voice, options);
        const buffer = tts.toBuffer();
        const wordBoundaries = tts.getWordBoundaries();
        return { audio: buffer.toString("base64"), wordBoundaries };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < maxRetries - 1 && (msg.includes("503") || msg.includes("server"))) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  });

  // ── Library: import files via dialog ──────────────

  ipcMain.handle("library:import-files", async (_event, section: string, view: string) => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import files",
      filters: [
        { name: "Books & Comics", extensions: ["epub", "pdf", "cbz", "cbr", "mobi"] },
      ],
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled) return [];

    const enriched = result.filePaths.map((fp) => enrichFile(fp));

    // Save to database
    const dbItems = enriched.map((f) => ({
      title: f.title,
      author: f.author,
      cover: f.coverBase64,
      gradient: f.gradient,
      format: f.format,
      filePath: f.filePath,
      size: f.size,
      section,
      view,
    }));

    return addItems(dbItems);
  });

  // ── Shell: open external URL ─────────────────────

  ipcMain.handle("shell:open-external", (_event, url: string) => {
    return shell.openExternal(url);
  });

  ipcMain.handle("shell:show-item-in-folder", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  // ── Library: select folder ────────────────────────

  ipcMain.handle("library:select-folder", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select library folder",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // ── Library: scan folder recursively ──────────────

  ipcMain.handle("library:scan-folder", (_event, folderPath: string, section: string, view: string) => {
    const enriched = scanDirectory(folderPath);
    const excluded = getExcludedPaths();

    const dbItems = enriched
      .filter((f) => !excluded.has(f.filePath))
      .map((f) => ({
        title: f.title,
        author: f.author,
        cover: f.coverBase64,
        gradient: f.gradient,
        format: f.format,
        filePath: f.filePath,
        size: f.size,
        section,
        view,
      }));

    return addItems(dbItems);
  });

  // ── Library: get items from database ──────────────

  ipcMain.handle("library:get-items", (_event, section: string) => {
    return getAllItems(section);
  });

  // ── Library: delete item ──────────────────────────

  ipcMain.handle("library:delete-item", (_event, id: number) => {
    deleteItem(id);
  });

  // ── Library: move item (change view) ──────────────

  ipcMain.handle("library:move-item", (_event, id: number, targetView: string) => {
    moveItem(id, targetView);
  });

  // ── Library: transfer item (change section + view) ─

  ipcMain.handle("library:transfer-item", (_event, id: number, targetSection: string, targetView: string) => {
    transferItem(id, targetSection, targetView);
  });

  ipcMain.handle("library:update-item-meta", (_event, id: number, fields: { title?: string; author?: string; cover?: string }) => {
    updateItemMeta(id, fields);
  });

  // ── Settings ──────────────────────────────────────

  ipcMain.handle("library:get-setting", (_event, key: string) => {
    return getSetting(key);
  });

  ipcMain.handle("library:set-setting", (_event, key: string, value: string) => {
    setSetting(key, value);
  });

  ipcMain.handle("library:get-all-settings", () => {
    return getAllSettings();
  });

  // ── Reading Activity ──────────────────────────────

  ipcMain.handle("activity:record-page", (_event, filePath: string, title: string, chapterIndex: number, chapterTitle: string, pageIndex: number, totalPages: number, totalChapters: number) => {
    recordPageView(filePath, title, chapterIndex, chapterTitle, pageIndex, totalPages, totalChapters);
  });

  ipcMain.handle("activity:get", (_event, filePath?: string, limit?: number) => {
    return getReadingActivity(filePath, limit);
  });

  ipcMain.handle("activity:stats", () => {
    return getReadingStats();
  });

  // ── Wiki ────────────────────────────────────────────

  ipcMain.handle("wiki:upsert-entry", (_event, entry) => { upsertWikiEntry(entry); });
  ipcMain.handle("wiki:get-entries", (_event, filePath: string) => getWikiEntries(filePath));
  ipcMain.handle("wiki:get-entry", (_event, filePath: string, entryId: string) => getWikiEntry(filePath, entryId));
  ipcMain.handle("wiki:delete-entry", (_event, filePath: string, entryId: string) => { deleteWikiEntry(filePath, entryId); });

  ipcMain.handle("wiki:add-aliases", (_event, filePath: string, entryId: string, aliases: string[]) => { addWikiAliases(filePath, entryId, aliases); });
  ipcMain.handle("wiki:get-aliases", (_event, filePath: string, entryId: string) => getWikiAliases(filePath, entryId));

  ipcMain.handle("wiki:add-details", (_event, filePath: string, entryId: string, details: { chapterIndex: number; category: string; content: string }[]) => { addWikiDetails(filePath, entryId, details); });
  ipcMain.handle("wiki:get-details", (_event, filePath: string, entryId: string, maxChapter?: number) => getWikiDetailsForEntry(filePath, entryId, maxChapter));

  ipcMain.handle("wiki:add-relationship", (_event, filePath: string, rel: { sourceId: string; targetId: string; relation: string; sinceChapter: number; description?: string }) => { addWikiRelationship(filePath, rel); });
  ipcMain.handle("wiki:get-relationships", (_event, filePath: string, entryId: string, maxChapter?: number) => getRelationshipsForEntry(filePath, entryId, maxChapter));

  ipcMain.handle("wiki:add-appearance", (_event, filePath: string, entryId: string, chapterIndex: number) => { addWikiAppearance(filePath, entryId, chapterIndex); });
  ipcMain.handle("wiki:get-appearances", (_event, filePath: string, entryId: string) => getAppearancesForEntry(filePath, entryId));

  ipcMain.handle("wiki:upsert-chapter-summary", (_event, filePath: string, summary: { chapterIndex: number; summary: string; keyEvents?: string; activeEntities?: string; mood?: string }) => { upsertChapterSummary(filePath, summary); });
  ipcMain.handle("wiki:get-chapter-summaries", (_event, filePath: string, fromCh: number, toCh: number) => getChapterSummaries(filePath, fromCh, toCh));
  ipcMain.handle("wiki:get-all-chapter-summaries", (_event, filePath: string) => getAllChapterSummaries(filePath));

  ipcMain.handle("wiki:upsert-arc", (_event, filePath: string, arc: { id: string; name: string; description?: string; arcType?: string; status?: string; startChapter: number; endChapter?: number | null }) => { upsertArc(filePath, arc); });
  ipcMain.handle("wiki:get-active-arcs", (_event, filePath: string) => getActiveArcs(filePath));
  ipcMain.handle("wiki:get-all-arcs", (_event, filePath: string) => getAllArcs(filePath));
  ipcMain.handle("wiki:add-arc-beat", (_event, filePath: string, arcId: string, beat: { chapterIndex: number; beatType: string; description: string }) => { addArcBeat(filePath, arcId, beat); });
  ipcMain.handle("wiki:get-arc-beats", (_event, filePath: string, arcId: string) => getArcBeats(filePath, arcId));
  ipcMain.handle("wiki:add-arc-entity", (_event, filePath: string, arcId: string, entryId: string, role: string) => { addArcEntity(filePath, arcId, entryId, role); });
  ipcMain.handle("wiki:get-arc-entities", (_event, filePath: string, arcId: string) => getArcEntities(filePath, arcId));
  ipcMain.handle("wiki:delete-arc", (_event, filePath: string, arcId: string) => { deleteArc(filePath, arcId); });
  ipcMain.handle("wiki:merge-arcs", (_event, filePath: string, sourceArcIds: string[], targetArcId: string) => { mergeArcs(filePath, sourceArcIds, targetArcId); });

  ipcMain.handle("wiki:mark-processed", (_event, filePath: string, chapterIndex: number) => { markChapterProcessed(filePath, chapterIndex); });
  ipcMain.handle("wiki:get-processed", (_event, filePath: string) => getProcessedChapters(filePath));

  ipcMain.handle("wiki:get-meta", (_event, filePath: string) => getWikiMeta(filePath));
  ipcMain.handle("wiki:upsert-meta", (_event, filePath: string, bookTitle: string) => { upsertWikiMeta(filePath, bookTitle); });

  ipcMain.handle("wiki:get-entity-index", (_event, filePath: string) => getEntityIndex(filePath));
  ipcMain.handle("wiki:get-recent-entities", (_event, filePath: string, lastN: number, currentChapter: number) => getRecentEntities(filePath, lastN, currentChapter));

  ipcMain.handle("wiki:clear", (_event, filePath: string) => { clearWiki(filePath); });
  ipcMain.handle("wiki:migrate-json", (_event, filePath: string) => migrateJsonWiki(filePath));

  ipcMain.handle("wiki:merge-entries", (_event, filePath: string, sourceId: string, targetId: string) => { mergeWikiEntries(filePath, sourceId, targetId); });
  ipcMain.handle("wiki:unmerge-entries", (_event, filePath: string, mergeLogId: number) => { unmergeWikiEntries(filePath, mergeLogId); });
  ipcMain.handle("wiki:get-merge-log", (_event, filePath: string) => getWikiMergeLog(filePath));

  // ── Simulate ────────────────────────────────────────

  ipcMain.handle("sim:upsert-branch", (_event, branch: { id: string; filePath: string; entityId: string; entityName: string; chapterIndex: number; truncateAfterPara: number }) => { upsertBranch(branch); });
  ipcMain.handle("sim:get-branches", (_event, filePath: string) => getBranches(filePath));
  ipcMain.handle("sim:get-segments", (_event, filePath: string, branchId: string) => getBranchSegments(filePath, branchId));
  ipcMain.handle("sim:add-segment", (_event, segment: { filePath: string; branchId: string; segmentIndex: number; userInput: string; htmlParagraphs: string }) => addSegment(segment));
  ipcMain.handle("sim:delete-branch", (_event, filePath: string, branchId: string) => { deleteBranch(filePath, branchId); });

  // ── Installer (dev-only) ──────────────────────────────

  ipcMain.handle("installer:sources", () => {
    return getAvailableSources();
  });

  ipcMain.handle("installer:search", async (_event, sourceId: string, keyword: string, page: number) => {
    return searchNovels(sourceId, keyword, page);
  });

  ipcMain.handle("installer:novel-info", async (_event, sourceId: string, url: string) => {
    return getNovelInfo(sourceId, url);
  });

  ipcMain.handle("installer:queue-download", async (_event, sourceId: string, novelInfo: NovelInfo) => {
    const mgr = getDownloadManager();
    const id = await mgr.queueDownload(sourceId, novelInfo);
    return id;
  });

  ipcMain.handle("installer:cancel-download", (_event, id: number) => {
    getDownloadManager().cancelDownload(id);
  });

  ipcMain.handle("installer:retry-download", (_event, id: number) => {
    getDownloadManager().retryDownload(id);
  });

  ipcMain.handle("installer:remove-download", (_event, id: number) => {
    removeDownload(id);
  });

  ipcMain.handle("installer:get-downloads", () => {
    return getDownloads();
  });

  ipcMain.handle("installer:clear-completed", () => {
    clearCompletedDownloads();
  });

  ipcMain.handle("installer:import-completed", (_event, id: number) => {
    const row = getDownload(id);
    if (!row?.epub_path) return null;
    const enriched = enrichFile(row.epub_path);
    const dbItems = [{
      title: enriched.title,
      author: enriched.author,
      cover: enriched.coverBase64,
      gradient: enriched.gradient,
      format: enriched.format,
      filePath: enriched.filePath,
      size: enriched.size,
      section: "books",
      view: "bookshelf",
    }];
    const imported = addItems(dbItems);
    // Notify all windows so the bookshelf refreshes
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("library:items-changed");
      }
    }
    return imported;
  });

  ipcMain.handle("installer:proxy-image", async (_event, url: string) => {
    return fetchImageAsDataUrl(url);
  });

  // Resume any interrupted downloads
  getDownloadManager().resumeOnStartup();

  // ── Window events ─────────────────────────────────

  mainWindow.on("closed", () => {
    const remainingWindows = BrowserWindow.getAllWindows();
    mainWindow = null;
    isQuitting = true;
    // When main window closes, destroy all reader windows too
    remainingWindows.forEach((win) => {
      if (!win.isDestroyed()) win.destroy();
    });
  });

  if (!isDev && mainWindow) {
    initUpdater(mainWindow);
  }
}

// Set app user model ID so Windows taskbar shows the correct icon
app.setAppUserModelId("com.codex.app");

app.whenReady().then(() => {
  const outDir = path.join(__dirname, "../out");

  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let filePath = decodeURIComponent(url.pathname);

    // Remove leading slash on Windows
    if (filePath.startsWith("/")) {
      filePath = filePath.slice(1);
    }

    const fullPath = path.join(outDir, filePath);
    return net.fetch(pathToFileURL(fullPath).toString());
  });

  createWindow();

  // Restore reader window if one was open when the app last closed
  try {
    const last = getSetting("lastReader");
    if (last) {
      const bookInfo = JSON.parse(last) as { id: number; title: string; author: string; filePath: string; cover: string; format: string };
      if (bookInfo.filePath && fs.existsSync(bookInfo.filePath)) {
        const params = new URLSearchParams({
          title: bookInfo.title,
          author: bookInfo.author,
          format: bookInfo.format,
          filePath: bookInfo.filePath,
        });
        const readerWin = createAppWindow("reader", params);
        readerWin.on("closed", () => {
          setSetting("lastReader", "");
        });
      } else {
        // File no longer exists, clear stale setting
        setSetting("lastReader", "");
      }
    }
  } catch { /* ignore invalid JSON or missing file */ }
});

app.on("window-all-closed", () => {
  // Only quit when the main window has been closed, not when reader windows close
  if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) return;
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
