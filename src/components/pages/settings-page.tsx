"use client";

import { useState } from "react";
import {
  FolderOpen,
  HardDrive,
  Info,
  RefreshCw,
  Trash2,
  Download,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { APP_VERSION } from "@/lib/version";

interface SettingsPageProps {
  onImportItems: (items: LibraryItem[]) => void;
  activeSection: string;
}

/* ── Setting row helpers ─────────────────────────────────── */

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-white/70">{label}</span>
        {description && (
          <span className="text-[11px] text-white/25">{description}</span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SettingSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <Icon className="h-3.5 w-3.5 text-white/20" strokeWidth={1.5} />
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/20">{title}</span>
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-[var(--bg-surface)]">
        <div className="flex flex-col divide-y divide-white/[0.04] px-4">
          {children}
        </div>
      </div>
    </section>
  );
}

/* ── Tab types ────────────────────────────────────────────── */

type SettingsTab = "general" | "ai";

/* ── Settings page ───────────────────────────────────────── */

export function SettingsPage({ onImportItems, activeSection }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [autoScan, setAutoScan] = useState(false);
  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScanCount, setLastScanCount] = useState<number | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  const hasApi = !!api && "getSetting" in api && "setSetting" in api && "scanFolder" in api;

  // Load saved settings on mount
  useState(() => {
    if (!hasApi) return;
    Promise.all([
      api!.getSetting("libraryPath"),
      api!.getSetting("autoScan"),
      api!.getSetting("openrouterApiKey"),
    ]).then(([path, scan, key]) => {
      if (path) setLibraryPath(path);
      if (scan) setAutoScan(scan === "true");
      if (key) setApiKey(key);
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

  const handleCheckUpdates = async () => {
    if (!api?.checkForUpdates) {
      setUpdateStatus("Updates not available in dev mode");
      return;
    }
    setCheckingUpdates(true);
    setUpdateStatus(null);
    try {
      await api.checkForUpdates();
      setUpdateStatus("You're up to date");
    } catch {
      setUpdateStatus("Couldn't check for updates");
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleClearLibrary = async () => {
    // This would need confirmation in a real app
    // For now just a placeholder
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    if (hasApi) api!.setSetting("openrouterApiKey", value);
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "ai", label: "AI" },
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-6 pt-5 pb-1">
        <h1 className="text-sm font-medium text-white/80">Settings</h1>
        <p className="mt-1 text-[11px] text-white/25">Manage your library, updates, and preferences.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-4 px-6 pt-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "pb-2 text-[11px] font-medium uppercase tracking-wider transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-[var(--accent-brand)] text-white/70"
                : "text-white/25 hover:text-white/40"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "general" && (
        <div className="flex max-w-[560px] flex-col gap-5 p-6">
          {/* ── Library ──────────────────────────────── */}
          <SettingSection icon={FolderOpen} title="Library">
            <SettingRow
              label="Library folder"
              description={libraryPath ?? "No folder selected"}
            >
              <button
                onClick={handleSelectFolder}
                className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/[0.10] hover:text-white/70"
              >
                Browse
              </button>
            </SettingRow>

            <SettingRow
              label="Auto-scan on launch"
              description="Automatically import new files when the app starts"
            >
              <Switch checked={autoScan} onCheckedChange={handleAutoScanChange} />
            </SettingRow>

            {libraryPath && (
              <div className="py-3">
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[11px] font-medium transition-colors",
                    scanning
                      ? "bg-white/[0.04] text-white/20"
                      : "bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70"
                  )}
                >
                  <RefreshCw className={cn("h-3 w-3", scanning && "animate-spin")} />
                  {scanning ? "Scanning..." : "Scan Library Now"}
                </button>
                {lastScanCount !== null && (
                  <p className="mt-2 text-center text-[11px] text-white/25">
                    {lastScanCount === 0 ? "No new files found" : `Imported ${lastScanCount} file${lastScanCount !== 1 ? "s" : ""}`}
                  </p>
                )}
              </div>
            )}
          </SettingSection>

          {/* ── Storage ─────────────────────────────── */}
          <SettingSection icon={HardDrive} title="Data">
            <SettingRow
              label="Clear library"
              description="Remove all items from your library. Files on disk are not affected."
            >
              <button
                onClick={handleClearLibrary}
                className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            </SettingRow>
          </SettingSection>

          {/* ── Updates ─────────────────────────────── */}
          <SettingSection icon={Download} title="Updates">
            <SettingRow
              label="Check for updates"
              description={updateStatus ?? `Current version: ${APP_VERSION}`}
            >
              <button
                onClick={handleCheckUpdates}
                disabled={checkingUpdates}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium transition-colors",
                  checkingUpdates
                    ? "text-white/20"
                    : "text-white/50 hover:bg-white/[0.10] hover:text-white/70"
                )}
              >
                <RefreshCw className={cn("h-3 w-3", checkingUpdates && "animate-spin")} />
                {checkingUpdates ? "Checking..." : "Check Now"}
              </button>
            </SettingRow>
          </SettingSection>

          {/* ── About ──────────────────────────────── */}
          <SettingSection icon={Info} title="About">
            <SettingRow label="Version">
              <span className="text-[11px] text-white/30">{APP_VERSION}</span>
            </SettingRow>
            <SettingRow label="Source">
              <button
                onClick={() => window.open("https://github.com/F12-Syntex/codex", "_blank")}
                className="text-[11px] text-white/30 transition-colors hover:text-white/50"
              >
                github.com/F12-Syntex/codex
              </button>
            </SettingRow>
          </SettingSection>
        </div>
      )}

      {activeTab === "ai" && (
        <div className="flex max-w-[560px] flex-col gap-5 p-6">
          <SettingSection icon={Key} title="OpenRouter">
            <SettingRow
              label="API Key"
              description="Used for AI-powered features like recommendations"
            >
              <div className="flex items-center gap-2">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="sk-or-..."
                  className="w-44 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[11px] text-white/70 placeholder-white/15 outline-none transition-colors focus:bg-white/[0.08]"
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="rounded-lg p-1.5 text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/50"
                >
                  {showApiKey ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </button>
              </div>
            </SettingRow>
            <SettingRow label="Get an API key">
              <button
                onClick={() => window.open("https://openrouter.ai/keys", "_blank")}
                className="flex items-center gap-1.5 text-[11px] text-white/30 transition-colors hover:text-white/50"
              >
                openrouter.ai/keys
                <ExternalLink className="h-3 w-3" />
              </button>
            </SettingRow>
          </SettingSection>
        </div>
      )}
    </div>
  );
}
