"use client";

import { useState } from "react";
import {
  Folder,
  RefreshCw,
  ScanSearch,
  Trash2,
  Download,
  BookOpen,
  Key,
  ExternalLink,
  RotateCcw,
  Replace,
  Plus,
  X,
  Info,
  Code2,
  ShieldCheck,
  Sparkles,
  Zap,
  Feather,
  Type,
  Wand2,
  Library,
  Settings2,
  BookText,
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow, ListIcon, type ListIconTint } from "@/components/ui/list-group";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { GlassModal } from "@/components/ui/glass-modal";
import { SecureInput } from "@/components/ui/secure-input";
import { BlurFade } from "@/components/ui/blur-fade";
import { APP_VERSION } from "@/lib/version";
import { testApiKey } from "@/lib/openrouter";
import { ModelCombobox } from "@/components/ui/model-combobox";
import {
  DEFAULT_PRESETS,
  PRESET_OVERRIDES_KEY,
  getEffectiveModel,
  parseOverrides,
  stringifyOverrides,
  type PresetOverrides,
} from "@/lib/ai-presets";
import {
  loadReplacements,
  saveReplacements,
  type WordReplacement,
} from "@/lib/word-replacements";


interface SettingsPageProps {
  onImportItems: (items: LibraryItem[]) => void;
  activeSection: string;
}

/* ── Presentational helpers ───────────────────────────────── */

/** Text field styled like a macOS inset field (fixed height, accent focus ring). */
const FIELD =
  "h-8 rounded-md bg-fill-tertiary px-3 text-sm text-label outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-label-quaternary hover:bg-fill-secondary focus:bg-fill-secondary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_35%,transparent)]";

const PRESET_ICONS: Record<string, { icon: React.ReactNode; tint: ListIconTint }> = {
  quick: { icon: <Zap />, tint: "orange" },
  creative: { icon: <Feather />, tint: "pink" },
  format: { icon: <Type />, tint: "blue" },
  "format-regen": { icon: <Wand2 />, tint: "teal" },
};

/* ── Tab types ────────────────────────────────────────────── */

type SettingsTab = "general" | "books" | "ai";

const CONFIRM_COPY: Record<string, { title: string; body: string; action: string }> = {
  wiki: {
    title: "Clear all wiki data?",
    body: "Every wiki entry, relationship, arc and summary for every book will be permanently deleted. This can't be undone.",
    action: "Clear Wiki Data",
  },
  formatting: {
    title: "Clear formatting cache?",
    body: "All AI-formatted chapter data will be deleted. Chapters will be reformatted the next time you open them.",
    action: "Clear Cache",
  },
};

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
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [presetOverrides, setPresetOverrides] = useState<PresetOverrides>({});
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [clearStatus, setClearStatus] = useState<string | null>(null);
  const [wordReplacements, setWordReplacements] = useState<WordReplacement[]>([]);

  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  const hasApi = !!api && "getSetting" in api && "setSetting" in api && "scanFolder" in api;

  // Load saved settings on mount
  useState(() => {
    if (!hasApi) return;
    Promise.all([
      api!.getSetting("libraryPath"),
      api!.getSetting("autoScan"),
      api!.getSetting("openrouterApiKey"),
      api!.getSetting(PRESET_OVERRIDES_KEY),
    ]).then(([path, scan, key, overridesJson]) => {
      if (path) setLibraryPath(path);
      if (scan) setAutoScan(scan === "true");
      if (key) setApiKey(key);
      setPresetOverrides(parseOverrides(overridesJson));
    });
    loadReplacements().then(setWordReplacements);
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
    setUpdateStatus("Checking for updates...");

    // Listen for the real result from electron-updater
    const cleanup = api.onUpdateStatus?.((event) => {
      switch (event.status) {
        case "not-available":
          setUpdateStatus("You're up to date");
          setCheckingUpdates(false);
          cleanup?.();
          break;
        case "available": {
          const data = event.data as { version?: string } | undefined;
          setUpdateStatus(`Update v${data?.version ?? "?"} available — downloading...`);
          break;
        }
        case "downloaded": {
          const data = event.data as { version?: string } | undefined;
          setUpdateStatus(`v${data?.version ?? "?"} downloaded — restart to install`);
          setCheckingUpdates(false);
          cleanup?.();
          break;
        }
        case "error": {
          const data = event.data as { message?: string } | undefined;
          setUpdateStatus(`Update failed: ${data?.message ?? "unknown error"}`);
          setCheckingUpdates(false);
          cleanup?.();
          break;
        }
      }
    });

    try {
      await api.checkForUpdates();
    } catch {
      setUpdateStatus("Couldn't check for updates");
      setCheckingUpdates(false);
      cleanup?.();
    }
  };

  const handleClearLibrary = async () => {
    // This would need confirmation in a real app
    // For now just a placeholder
  };

  const handleClearWiki = async () => {
    if (confirmAction !== "wiki") {
      setConfirmAction("wiki");
      return;
    }
    setConfirmAction(null);
    try {
      await api?.wikiClearAll?.();
      setClearStatus("Wiki data cleared");
      setTimeout(() => setClearStatus(null), 3000);
    } catch {
      setClearStatus("Failed to clear wiki data");
      setTimeout(() => setClearStatus(null), 3000);
    }
  };

  const handleClearFormatting = async () => {
    if (confirmAction !== "formatting") {
      setConfirmAction("formatting");
      return;
    }
    setConfirmAction(null);
    try {
      await api?.clearSettingsByPrefix?.("formattedChapters:");
      await api?.clearSettingsByPrefix?.("fmtCondensedChapters:");
      await api?.clearSettingsByPrefix?.("styleDictionary:");
      await api?.clearSettingsByPrefix?.("formattingEnabled:");
      setClearStatus("Formatting cache cleared");
      setTimeout(() => setClearStatus(null), 3000);
    } catch {
      setClearStatus("Failed to clear formatting");
      setTimeout(() => setClearStatus(null), 3000);
    }
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setTestResult(null);
    if (hasApi) api!.setSetting("openrouterApiKey", value);
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) return;
    setTestingKey(true);
    setTestResult(null);
    const result = await testApiKey(apiKey);
    setTestResult(result);
    setTestingKey(false);
  };

  const handlePresetModelChange = (presetId: string, model: string) => {
    const next = { ...presetOverrides, [presetId]: { model } };
    setPresetOverrides(next);
    if (hasApi) api!.setSetting(PRESET_OVERRIDES_KEY, stringifyOverrides(next));
  };

  const handlePresetReset = (presetId: string) => {
    const next = { ...presetOverrides };
    delete next[presetId];
    setPresetOverrides(next);
    if (hasApi) api!.setSetting(PRESET_OVERRIDES_KEY, stringifyOverrides(next));
  };

  const handleReplacementChange = (index: number, field: "from" | "to", value: string) => {
    const next = [...wordReplacements];
    next[index] = { ...next[index], [field]: value };
    setWordReplacements(next);
    saveReplacements(next);
  };

  const handleAddReplacement = () => {
    const next = [...wordReplacements, { from: "", to: "" }];
    setWordReplacements(next);
    saveReplacements(next);
  };

  const handleRemoveReplacement = (index: number) => {
    const next = wordReplacements.filter((_, i) => i !== index);
    setWordReplacements(next);
    saveReplacements(next);
  };

  const tabs: { value: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { value: "general", label: "General", icon: <Settings2 className="size-3.5" /> },
    { value: "books", label: "Books", icon: <BookText className="size-3.5" /> },
    { value: "ai", label: "AI", icon: <Sparkles className="size-3.5" /> },
  ];

  const confirmCopy = confirmAction ? CONFIRM_COPY[confirmAction] : null;
  const runConfirmed = () => {
    if (confirmAction === "wiki") handleClearWiki();
    else if (confirmAction === "formatting") handleClearFormatting();
  };

  const testDescription = testResult
    ? testResult.ok
      ? "API key is valid"
      : testResult.error ?? "Invalid key"
    : "Verify your key works";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── Header ─────────────────────────────────── */}
      <header className="px-8 pt-6 pb-4">
        <h1 className="text-large-title font-display text-label">Settings</h1>
        <p className="mt-1 text-sm text-label-secondary">Manage your library, updates, and preferences.</p>
      </header>

      <div className="px-8 pb-2">
        <SegmentedControl<SettingsTab>
          value={activeTab}
          onValueChange={setActiveTab}
          options={tabs}
          size="md"
        />
      </div>

      {/* ── Tab content ─────────────────────────────── */}
      <div key={activeTab} className="flex w-full max-w-2xl flex-col gap-7 px-8 pt-5 pb-32">
        {activeTab === "general" && (
          <>
            <BlurFade>
              <ListGroup title="Library">
                <ListRow
                  icon={<Folder />}
                  iconTint="blue"
                  label="Library folder"
                  description={
                    <span className="block truncate" title={libraryPath ?? undefined}>
                      {libraryPath ?? "No folder selected"}
                    </span>
                  }
                >
                  <Button size="sm" variant="secondary" onClick={handleSelectFolder} className="w-24">
                    {libraryPath ? "Change…" : "Browse…"}
                  </Button>
                </ListRow>

                <ListRow
                  icon={<RefreshCw />}
                  iconTint="teal"
                  label="Auto-scan on launch"
                  description="Automatically import new files when the app starts"
                >
                  <Switch checked={autoScan} onCheckedChange={handleAutoScanChange} />
                </ListRow>

                {libraryPath && (
                  <ListRow
                    icon={<ScanSearch />}
                    iconTint="green"
                    label="Scan library"
                    description={
                      lastScanCount !== null ? (
                        <span className={cn(lastScanCount > 0 && "text-success")}>
                          {lastScanCount === 0
                            ? "No new files found"
                            : `Imported ${lastScanCount} file${lastScanCount !== 1 ? "s" : ""}`}
                        </span>
                      ) : (
                        "Look for new books and comics in your library folder"
                      )
                    }
                  >
                    <Button size="sm" variant="secondary" onClick={handleScan} disabled={scanning} className="w-24">
                      <RefreshCw className={cn("size-3.5", scanning && "animate-spin")} />
                      {scanning ? "Scanning" : "Scan Now"}
                    </Button>
                  </ListRow>
                )}
              </ListGroup>
            </BlurFade>

            <BlurFade delay={0.03}>
              <ListGroup title="Updates">
                <ListRow
                  icon={<Download />}
                  iconTint="indigo"
                  label="Software update"
                  description={updateStatus ?? `Current version: ${APP_VERSION}`}
                >
                  <Button size="sm" variant="secondary" onClick={handleCheckUpdates} disabled={checkingUpdates} className="w-24">
                    <RefreshCw className={cn("size-3.5", checkingUpdates && "animate-spin")} />
                    {checkingUpdates ? "Checking" : "Check Now"}
                  </Button>
                </ListRow>
              </ListGroup>
            </BlurFade>

            <BlurFade delay={0.06}>
              <ListGroup title="About">
                <ListRow icon={<Info />} iconTint="gray" label="Version">
                  <Badge variant="outline">v{APP_VERSION}</Badge>
                </ListRow>
                <ListRow icon={<Code2 />} iconTint="gray" label="Source code">
                  <button
                    type="button"
                    onClick={() => window.open("https://github.com/F12-Syntex/codex", "_blank")}
                    className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-label-secondary transition-colors hover:bg-fill-tertiary hover:text-label"
                  >
                    github.com/F12-Syntex/codex
                    <ExternalLink className="size-3" strokeWidth={2} />
                  </button>
                </ListRow>
              </ListGroup>
            </BlurFade>

            <BlurFade delay={0.09}>
              <ListGroup
                title={
                  <span className="inline-flex items-center gap-1.5 text-danger">
                    <AlertTriangle className="size-3.5" strokeWidth={2} />
                    Danger Zone
                  </span>
                }
                footer={
                  clearStatus ? (
                    <span className={cn("inline-flex items-center gap-1.5", clearStatus.startsWith("Failed") ? "text-danger" : "text-success")}>
                      {clearStatus.startsWith("Failed") ? <X className="size-3" strokeWidth={2.5} /> : <Check className="size-3" strokeWidth={2.5} />}
                      {clearStatus}
                    </span>
                  ) : (
                    "Files on disk are never touched."
                  )
                }
              >
                <ListRow
                  icon={<Library />}
                  iconTint="red"
                  label="Clear library"
                  description="Remove all items from your library. Files on disk are not affected."
                  destructive
                >
                  <DangerButton onClick={handleClearLibrary}>Clear…</DangerButton>
                </ListRow>
                <ListRow
                  icon={<BookOpen />}
                  iconTint="red"
                  label="Clear wiki data"
                  description="Delete all wiki entries, relationships, arcs, and summaries for every book."
                  destructive
                >
                  <DangerButton onClick={handleClearWiki}>Clear…</DangerButton>
                </ListRow>
                <ListRow
                  icon={<Trash2 />}
                  iconTint="red"
                  label="Clear formatting cache"
                  description="Delete all AI-formatted chapter data. Chapters will reformat on next visit."
                  destructive
                >
                  <DangerButton onClick={handleClearFormatting}>Clear…</DangerButton>
                </ListRow>
              </ListGroup>
            </BlurFade>
          </>
        )}

        {activeTab === "books" && (
          <BlurFade>
            <ListGroup
              title="Word Replacements"
              footer="Replace specific words when rendering books. Case is preserved automatically."
            >
              <div className="flex h-11 items-center gap-3 px-3">
                <ListIcon tint="purple">
                  <Replace />
                </ListIcon>
                <span className="flex-1 text-sm text-label">Replacements</span>
                <Badge>{wordReplacements.length}</Badge>
              </div>

              {wordReplacements.map((r, i) => (
                <div key={i} className="group/row flex h-12 items-center gap-2 pr-2 pl-12">
                  <input
                    type="text"
                    value={r.from}
                    onChange={(e) => handleReplacementChange(i, "from", e.target.value)}
                    placeholder="Original word"
                    aria-label="Original word"
                    className={cn(FIELD, "min-w-0 flex-1")}
                  />
                  <ArrowRight className="size-3.5 shrink-0 text-label-tertiary" strokeWidth={2} />
                  <input
                    type="text"
                    value={r.to}
                    onChange={(e) => handleReplacementChange(i, "to", e.target.value)}
                    placeholder="Replacement"
                    aria-label="Replacement"
                    className={cn(FIELD, "min-w-0 flex-1")}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemoveReplacement(i)}
                    aria-label="Remove replacement"
                    title="Remove"
                    className="text-label-tertiary hover:text-danger"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}

              <ListRow
                onClick={handleAddReplacement}
                icon={
                  <span className="inline-flex size-6 items-center justify-center text-brand">
                    <Plus strokeWidth={2.25} />
                  </span>
                }
                label={<span className="font-medium text-brand">Add Replacement</span>}
              />
            </ListGroup>
          </BlurFade>
        )}

        {activeTab === "ai" && (
          <>
            <BlurFade>
              <ListGroup
                title="OpenRouter"
                footer="Your key is stored locally and only sent to OpenRouter."
              >
                <ListRow
                  icon={<Key />}
                  iconTint="orange"
                  label="API key"
                  description="Used for AI-powered features like recommendations"
                >
                  <SecureInput
                    value={apiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder="sk-or-..."
                    revealed={showApiKey}
                    onRevealedChange={setShowApiKey}
                    containerClassName="w-60"
                    aria-label="OpenRouter API key"
                  />
                </ListRow>
                <ListRow
                  icon={<ShieldCheck />}
                  iconTint="green"
                  label="Test connection"
                  description={
                    <span className={cn(testResult?.ok && "text-success", testResult && !testResult.ok && "text-danger")}>
                      {testDescription}
                    </span>
                  }
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleTestKey}
                    disabled={testingKey || !apiKey.trim()}
                    className={cn(
                      "w-24",
                      testResult?.ok && "text-success",
                      testResult && !testResult.ok && "text-danger",
                    )}
                  >
                    {testingKey ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : testResult?.ok ? (
                      <Check className="size-3.5" strokeWidth={2.5} />
                    ) : testResult && !testResult.ok ? (
                      <X className="size-3.5" strokeWidth={2.5} />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    {testingKey ? "Testing" : testResult?.ok ? "Valid" : testResult && !testResult.ok ? "Failed" : "Test"}
                  </Button>
                </ListRow>
                <ListRow
                  icon={<ExternalLink />}
                  iconTint="gray"
                  label="Get an API key"
                  description="openrouter.ai/keys"
                  onClick={() => window.open("https://openrouter.ai/keys", "_blank")}
                >
                  <ArrowRight className="size-4 text-label-tertiary" strokeWidth={1.75} />
                </ListRow>
              </ListGroup>
            </BlurFade>

            <BlurFade delay={0.04}>
              <ListGroup title="Model Presets" footer="Pick which model powers each AI feature. Overridden presets can be reset to their default.">
                {DEFAULT_PRESETS.map((preset) => {
                  const isOverridden = !!presetOverrides[preset.id];
                  const effectiveModel = getEffectiveModel(preset, presetOverrides);
                  const meta = PRESET_ICONS[preset.id] ?? { icon: <Sparkles />, tint: "purple" as ListIconTint };

                  return (
                    <ListRow
                      key={preset.id}
                      icon={meta.icon}
                      iconTint={meta.tint}
                      label={
                        <span className="inline-flex items-center gap-2">
                          {preset.label}
                          {isOverridden && <Badge variant="accent">Custom</Badge>}
                        </span>
                      }
                      description={preset.description}
                    >
                      <ModelCombobox
                        value={effectiveModel}
                        onChange={(model) => handlePresetModelChange(preset.id, model)}
                        placeholder={preset.defaultModel}
                      />
                      {/* Fixed-width slot keeps every combobox aligned */}
                      <span className="inline-flex size-7 items-center justify-center">
                        {isOverridden && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handlePresetReset(preset.id)}
                            title="Reset to default"
                            aria-label={`Reset ${preset.label} to default`}
                            className="text-label-tertiary hover:text-label"
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        )}
                      </span>
                    </ListRow>
                  );
                })}
              </ListGroup>
            </BlurFade>
          </>
        )}
      </div>

      {/* ── Destructive confirmation ─────────────────── */}
      <GlassModal
        open={!!confirmCopy}
        onClose={() => setConfirmAction(null)}
        title={confirmCopy?.title}
        width={420}
        icon={
          <span className="inline-flex size-10 items-center justify-center rounded-lg bg-danger/15 text-danger">
            <AlertTriangle className="size-5" strokeWidth={1.75} />
          </span>
        }
      >
        <GlassModal.Body>
          <p className="text-sm leading-relaxed text-label-secondary">{confirmCopy?.body}</p>
        </GlassModal.Body>
        <GlassModal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setConfirmAction(null)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={runConfirmed} autoFocus>
            <Trash2 className="size-3.5" />
            {confirmCopy?.action}
          </Button>
        </GlassModal.Footer>
      </GlassModal>
    </div>
  );
}

function DangerButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={onClick}
      className="w-24 text-danger hover:bg-danger/15 hover:text-danger"
    >
      {children}
    </Button>
  );
}
