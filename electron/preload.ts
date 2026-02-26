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

  // Updates
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.send("update:install"),
  onUpdateStatus: (
    callback: (event: { status: string; data?: unknown }) => void
  ) => {
    ipcRenderer.on("update:status", (_event, payload) => callback(payload));
  },
});
