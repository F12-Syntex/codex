import { app, BrowserWindow, ipcMain, protocol, net, dialog } from "electron";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { initUpdater } from "./updater";

const SUPPORTED_EXTENSIONS = [".epub", ".pdf", ".cbz", ".cbr", ".mobi"];

interface ImportedFile {
  name: string;
  filePath: string;
  format: string;
  size: number;
}

function getFormat(ext: string): string {
  return ext.slice(1).toUpperCase(); // ".epub" -> "EPUB"
}

function scanDirectory(dirPath: string): ImportedFile[] {
  const results: ImportedFile[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanDirectory(fullPath));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          const stat = fs.statSync(fullPath);
          results.push({
            name: path.basename(entry.name, ext),
            filePath: fullPath,
            format: getFormat(ext),
            size: stat.size,
          });
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

function createWindow() {
  const mainWindow = new BrowserWindow({
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

  ipcMain.on("window:minimize", () => mainWindow.minimize());
  ipcMain.on("window:maximize", () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on("window:close", () => mainWindow.close());

  // Library: import files via dialog
  ipcMain.handle("library:import-files", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import files",
      filters: [
        { name: "Books & Comics", extensions: ["epub", "pdf", "cbz", "cbr", "mobi"] },
      ],
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled) return [];
    return result.filePaths.map((fp) => {
      const ext = path.extname(fp).toLowerCase();
      const stat = fs.statSync(fp);
      return {
        name: path.basename(fp, ext),
        filePath: fp,
        format: getFormat(ext),
        size: stat.size,
      } as ImportedFile;
    });
  });

  // Library: select folder
  ipcMain.handle("library:select-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select library folder",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Library: scan folder recursively
  ipcMain.handle("library:scan-folder", (_event, folderPath: string) => {
    return scanDirectory(folderPath);
  });

  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window:maximized", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window:maximized", false);
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadURL("app://./index.html");
    initUpdater(mainWindow);
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
