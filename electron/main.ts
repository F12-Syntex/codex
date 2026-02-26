import { app, BrowserWindow, ipcMain, protocol, net } from "electron";
import path from "path";
import { pathToFileURL } from "url";

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
