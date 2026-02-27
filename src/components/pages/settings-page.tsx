"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { APP_VERSION } from "@/lib/version";

interface SettingsPageProps {
  onImportItems: (items: LibraryItem[]) => void;
  activeSection: string;
}

export function SettingsPage({ onImportItems, activeSection }: SettingsPageProps) {
  const [autoScan, setAutoScan] = useState(false);
  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScanCount, setLastScanCount] = useState<number | null>(null);

  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  const hasApi = !!api && "getSetting" in api && "setSetting" in api && "scanFolder" in api;

  // Load saved settings on mount
  useState(() => {
    if (!hasApi) return;
    Promise.all([
      api!.getSetting("libraryPath"),
      api!.getSetting("autoScan"),
    ]).then(([path, scan]) => {
      if (path) setLibraryPath(path);
      if (scan) setAutoScan(scan === "true");
    });
  });

  const handleSelectFolder = async () => {
    const folder = await api?.selectFolder?.();
    if (folder) {
      setLibraryPath(folder);
      if (hasApi) api!.setSetting("libraryPath", folder);
    }
  };

  const handleAutoScanChange = (v: boolean) => {
    setAutoScan(v);
    if (hasApi) api!.setSetting("autoScan", String(v));
  };

  const handleScan = async () => {
    if (!libraryPath || !hasApi) return;
    setScanning(true);
    setLastScanCount(null);
    const defaultView = activeSection === "books" ? "bookshelf" : "series";
    try {
      const items = await api!.scanFolder(libraryPath, activeSection, defaultView);
      if (items && items.length > 0) {
        onImportItems(items);
        setLastScanCount(items.length);
      } else {
        setLastScanCount(0);
      }
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-white/[0.04] px-6 py-4">
        <h1 className="text-sm font-medium text-white/80">Settings</h1>
      </div>

      <div className="flex flex-col gap-6 p-6">
        {/* Library section */}
        <section className="flex flex-col gap-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/20">Library</p>

          <div className="rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-white/60">Library path</span>
                <button
                  onClick={handleSelectFolder}
                  className="max-w-[240px] truncate rounded-lg bg-white/[0.04] px-3 py-1 text-[11px] text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/60"
                >
                  {libraryPath ?? "Select folder..."}
                </button>
              </div>

              {libraryPath && (
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-medium transition-colors",
                    scanning
                      ? "bg-white/[0.04] text-white/20"
                      : "bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70"
                  )}
                >
                  {scanning ? "Scanning..." : "Scan Now"}
                </button>
              )}

              {lastScanCount !== null && (
                <span className="text-[11px] text-white/25">
                  {lastScanCount === 0 ? "No supported files found" : `Found ${lastScanCount} file${lastScanCount !== 1 ? "s" : ""}`}
                </span>
              )}

              <div className="flex items-center justify-between">
                <Label className="text-[13px] font-normal text-white/60">Auto-scan on launch</Label>
                <Switch checked={autoScan} onCheckedChange={handleAutoScanChange} />
              </div>
            </div>
          </div>
        </section>

        {/* About section */}
        <section className="flex flex-col gap-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/20">About</p>

          <div className="rounded-lg border border-white/[0.06] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-white/60">Version</span>
              <span className="text-[11px] text-white/30">{APP_VERSION}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
