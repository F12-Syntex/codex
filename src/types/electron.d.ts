interface ElectronAPI {
  platform: NodeJS.Platform;
}

interface Window {
  electronAPI: ElectronAPI;
}
