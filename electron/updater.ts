import { autoUpdater } from "electron-updater";
import { BrowserWindow, ipcMain } from "electron";

export function initUpdater(mainWindow: BrowserWindow) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  function sendStatus(status: string, data?: unknown) {
    mainWindow.webContents.send("update:status", { status, data });
  }

  autoUpdater.on("checking-for-update", () => {
    sendStatus("checking");
  });

  autoUpdater.on("update-available", (info) => {
    sendStatus("available", { version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    sendStatus("not-available");
  });

  autoUpdater.on("download-progress", (progress) => {
    sendStatus("progress", {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendStatus("downloaded", { version: info.version });
  });

  autoUpdater.on("error", (error) => {
    sendStatus("error", { message: error.message });
  });

  ipcMain.handle("update:check", () => {
    return autoUpdater.checkForUpdates();
  });

  ipcMain.on("update:install", () => {
    autoUpdater.quitAndInstall();
  });

  // Check for updates shortly after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently fail if offline or no releases exist yet
    });
  }, 3000);
}
