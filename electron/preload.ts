import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  onMaximized: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on("window:maximized", (_event, maximized) =>
      callback(maximized)
    );
  },
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.send("update:install"),
  onUpdateStatus: (
    callback: (event: { status: string; data?: unknown }) => void
  ) => {
    ipcRenderer.on("update:status", (_event, payload) => callback(payload));
  },
});
