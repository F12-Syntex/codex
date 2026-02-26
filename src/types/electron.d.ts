interface ImportedFile {
  name: string;
  filePath: string;
  format: string;
  size: number;
}

interface UpdateEvent {
  status:
    | "checking"
    | "available"
    | "not-available"
    | "progress"
    | "downloaded"
    | "error";
  data?: {
    version?: string;
    percent?: number;
    bytesPerSecond?: number;
    transferred?: number;
    total?: number;
    message?: string;
  };
}

interface ElectronAPI {
  platform: NodeJS.Platform;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  onMaximized: (callback: (maximized: boolean) => void) => void;
  importFiles: () => Promise<ImportedFile[]>;
  selectFolder: () => Promise<string | null>;
  scanFolder: (folderPath: string) => Promise<ImportedFile[]>;
  checkForUpdates: () => Promise<unknown>;
  installUpdate: () => void;
  onUpdateStatus: (callback: (event: UpdateEvent) => void) => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
