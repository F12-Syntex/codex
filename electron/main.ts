import { app, BrowserWindow, ipcMain, protocol, net, dialog } from "electron";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { initUpdater } from "./updater";
import { initDatabase, getAllItems, addItems, deleteItem, moveItem, transferItem, getSetting, setSetting, getAllSettings, getBookmarks, addBookmark, deleteBookmark } from "./database";
import { extractMetadata } from "./metadata";
import { parseBookContent } from "./book-parser";
import type { LibraryItem } from "./database";
import { EdgeTTS } from "@andresaya/edge-tts";

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

function createWindow() {
  // Initialize database before setting up IPC
  initDatabase();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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
    const readerWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 600,
      minHeight: 400,
      frame: false,
      titleBarStyle: "hidden",
      icon: path.join(__dirname, "../build/icon.png"),
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const params = new URLSearchParams({
      title: bookInfo.title,
      author: bookInfo.author,
      format: bookInfo.format,
      filePath: bookInfo.filePath,
    });

    if (isDev) {
      readerWindow.loadURL(`http://localhost:3000/reader?${params.toString()}`);
    } else {
      readerWindow.loadURL(`app://./reader.html?${params.toString()}`);
    }

    readerWindow.on("maximize", () => {
      readerWindow.webContents.send("window:maximized", true);
    });
    readerWindow.on("unmaximize", () => {
      readerWindow.webContents.send("window:maximized", false);
    });
  });

  // ── Reader: get book content ──────────────────────
  ipcMain.handle("reader:get-content", (_event, filePath: string, format: string) => {
    return parseBookContent(filePath, format);
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

  ipcMain.handle("tts:synthesize", async (_event, text: string, voice: string, rate: string) => {
    const tts = new EdgeTTS();
    await tts.synthesize(text, voice, { rate });
    const buffer = tts.toBuffer();
    // Return as base64 for safe IPC transfer
    return buffer.toString("base64");
  });

  // ── Library: import files via dialog ──────────────

  ipcMain.handle("library:import-files", async (_event, section: string, view: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
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

  // ── Library: select folder ────────────────────────

  ipcMain.handle("library:select-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Select library folder",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // ── Library: scan folder recursively ──────────────

  ipcMain.handle("library:scan-folder", (_event, folderPath: string, section: string, view: string) => {
    const enriched = scanDirectory(folderPath);

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

  // ── Window events ─────────────────────────────────

  mainWindow.on("maximize", () => {
    mainWindow!.webContents.send("window:maximized", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow!.webContents.send("window:maximized", false);
  });
  mainWindow.on("closed", () => {
    const remainingWindows = BrowserWindow.getAllWindows();
    mainWindow = null;
    isQuitting = true;
    // When main window closes, destroy all reader windows too
    remainingWindows.forEach((win) => {
      if (!win.isDestroyed()) win.destroy();
    });
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadURL("app://./index.html");
    initUpdater(mainWindow!);
  }
}

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
