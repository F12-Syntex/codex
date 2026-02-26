interface ElectronAPI {
  platform: NodeJS.Platform;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  onMaximized: (callback: (maximized: boolean) => void) => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
