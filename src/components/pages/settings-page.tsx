"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Folder,
  RefreshCw,
  Trash2,
  Download,
  ExternalLink,
  RotateCcw,
  Plus,
  X,
  Sparkles,
  HardDrive,
  BookText,
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { GlassModal } from "@/components/ui/glass-modal";
import { SecureInput } from "@/components/ui/secure-input";
import { APP_VERSION } from "@/lib/version";
import { testApiKey } from "@/lib/openrouter";
import { ModelCombobox } from "@/components/ui/model-combobox";
import { ThemePanel } from "@/components/theme-panel";
import type { ThemeConfig } from "@/lib/theme";
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
  /** Settings › Appearance renders the same ThemePanel as the dock's quick
      path. The pane appears only when the shell passes both of these. */
  theme?: ThemeConfig;
  onThemeChange?: (patch: Partial<ThemeConfig>) => void;
}

/* ── Presentational helpers ───────────────────────────────── */

/** Text field styled like a macOS inset field (fixed height, accent focus ring). */
const FIELD =
  "h-8 rounded-md bg-fill-tertiary px-3 text-sm text-label outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-label-quaternary hover:bg-fill-secondary focus:bg-fill-secondary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_35%,transparent)]";

/* ── Tab types ────────────────────────────────────────────── */

type SettingsTab = "library" | "appearance" | "books" | "ai" | "updates" | "storage";

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

export function SettingsPage({ onImportItems, activeSection, theme, onThemeChange }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("library");
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

  const reduceMotion = useReducedMotion();

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

  const hasAppearance = !!theme && !!onThemeChange;
  const allPanes: { value: SettingsTab; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; description: string }[] = [
    { value: "library", label: "Library", icon: Folder, description: "Where Codex finds your books and comics, and how it keeps them in sync." },
    { value: "appearance", label: "Appearance", icon: Palette, description: "Mode, accent, type and canvas. The same controls as the dock’s Appearance button." },
    { value: "books", label: "Reading", icon: BookText, description: "Fine-tune how book text is rendered while you read." },
    { value: "ai", label: "Intelligence", icon: Sparkles, description: "Connect OpenRouter and choose the models behind every AI feature." },
    { value: "updates", label: "Software Update", icon: Download, description: "Keep Codex current and learn about this build." },
    { value: "storage", label: "Storage", icon: HardDrive, description: "Reset cached data. Files on disk are never touched." },
  ];
  const panes = allPanes.filter((p) => p.value !== "appearance" || hasAppearance);
  const pane = panes.find((p) => p.value === activeTab) ?? panes[0];

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
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Page header ─────────────────────────────── */}
      <header className="shrink-0 px-8 pt-6 pb-4">
        <h1 className="text-large-title font-display text-label">Settings</h1>
        <p className="mt-1 text-sm text-label-secondary">Manage your library, updates, and preferences.</p>
      </header>

      <div className="flex min-h-0 flex-1 gap-8 pl-8">
        {/* ── Pane rail (System Settings sidebar) ──── */}
        <nav aria-label="Settings sections" className="w-56 shrink-0 self-start">
          <ul className="glass-thin grain relative flex flex-col gap-0.5 rounded-2xl p-2">
            {panes.map((p) => {
              const active = p.value === activeTab;
              const Icon = p.icon;
              return (
                <li key={p.value}>
                  <button
                    type="button"
                    onClick={() => setActiveTab(p.value)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group/row focus-ring relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors duration-150",
                      active ? "text-label" : "text-label-secondary hover:bg-fill-quaternary hover:text-label",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="settings-pane-pill"
                        className="absolute inset-0 rounded-md bg-fill-secondary"
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.42 }}
                      />
                    )}
                    <Icon
                      className={cn(
                        "relative size-4 shrink-0 transition-colors duration-150",
                        active ? "text-brand" : "text-label-tertiary group-hover/row:text-label-secondary",
                      )}
                      strokeWidth={1.75}
                    />
                    <span className={cn("relative flex-1 truncate text-sm", active && "font-medium")}>{p.label}</span>
                    {p.value === "books" && wordReplacements.length > 0 && (
                      <span className="relative text-2xs tabular-nums text-label-tertiary">{wordReplacements.length}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── Pane content ─────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-8 pb-32">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              className="flex w-full max-w-2xl flex-col gap-7"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
              transition={{ duration: reduceMotion ? 0.1 : 0.26, ease: [0.32, 0.72, 0, 1] }}
            >
              {/* Pane header — aligned to the group cards' left edge */}
              <div className="min-w-0 pt-1">
                <h2 className="text-title font-display text-label">{pane.label}</h2>
                <p className="mt-1 text-sm text-label-secondary">{pane.description}</p>
              </div>

              {activeTab === "library" && (
                <ListGroup title="Library Folder" footer="Scans import new files into the section you’re currently viewing.">
                  <ListRow
                    label="Library folder"
                    description={
                      libraryPath ? (
                        <span className="block truncate font-mono text-2xs" title={libraryPath}>
                          {libraryPath}
                        </span>
                      ) : (
                        "No folder selected"
                      )
                    }
                  >
                    <Button size="sm" variant="secondary" onClick={handleSelectFolder} className="w-24">
                      {libraryPath ? "Change…" : "Browse…"}
                    </Button>
                  </ListRow>

                  <ListRow
                    label="Auto-scan on launch"
                    description="Automatically import new files when the app starts"
                  >
                    <Switch checked={autoScan} onCheckedChange={handleAutoScanChange} />
                  </ListRow>

                  {libraryPath && (
                    <ListRow
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
              )}

              {activeTab === "appearance" && theme && onThemeChange && (
                <ThemePanel theme={theme} onThemeChange={onThemeChange} />
              )}

              {activeTab === "updates" && (
                <>
                  <SpotlightCard className="glass grain relative overflow-hidden rounded-2xl p-5">
                    <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-brand/25 blur-3xl" />
                    <div className="relative flex items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/codex-logo.svg" alt="" className="size-14 shrink-0 select-none" draggable={false} />
                      <p className="min-w-0 flex-1 truncate text-sm text-label-secondary">
                        <span className="font-display text-lg font-semibold text-label tabular-nums">Codex {APP_VERSION}</span>
                        <span aria-hidden> · </span>
                        {updateStatus ?? "You’re up to date"}
                      </p>
                      <Button size="sm" onClick={handleCheckUpdates} disabled={checkingUpdates} className="w-28">
                        <RefreshCw className={cn("size-3.5", checkingUpdates && "animate-spin")} />
                        {checkingUpdates ? "Checking" : "Check Now"}
                      </Button>
                    </div>
                  </SpotlightCard>

                  <ListGroup title="About">
                    <ListRow
                      label="Source code"
                      description="github.com/F12-Syntex/codex"
                      onClick={() => window.open("https://github.com/F12-Syntex/codex", "_blank")}
                    >
                      <ExternalLink className="size-4 text-label-tertiary" strokeWidth={1.75} />
                    </ListRow>
                  </ListGroup>
                </>
              )}

              {activeTab === "storage" && (
                <ListGroup
                  title="Reset"
                  footer={
                    clearStatus ? (
                      <span className={cn("inline-flex items-center gap-1.5", clearStatus.startsWith("Failed") ? "text-danger" : "text-success")}>
                        {clearStatus.startsWith("Failed") ? <X className="size-3" strokeWidth={2.5} /> : <Check className="size-3" strokeWidth={2.5} />}
                        {clearStatus}
                      </span>
                    ) : (
                      "These actions can't be undone."
                    )
                  }
                >
                  <ListRow
                    label="Clear library"
                    description="Remove all items from your library. Files on disk are not affected."
                  >
                    <DangerButton onClick={handleClearLibrary}>Clear…</DangerButton>
                  </ListRow>
                  <ListRow
                    label="Clear wiki data"
                    description="Delete all wiki entries, relationships, arcs, and summaries for every book."
                  >
                    <DangerButton onClick={handleClearWiki}>Clear…</DangerButton>
                  </ListRow>
                  <ListRow
                    label="Clear formatting cache"
                    description="Delete all AI-formatted chapter data. Chapters will reformat on next visit."
                  >
                    <DangerButton onClick={handleClearFormatting}>Clear…</DangerButton>
                  </ListRow>
                </ListGroup>
              )}

              {activeTab === "books" && (
                <ListGroup
                  title="Word Replacements"
                  footer="Replace specific words when rendering books. Case is preserved automatically."
                >
                  {wordReplacements.map((r, i) => (
                    <div key={i} className="flex h-12 items-center gap-2 pr-2 pl-3">
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
                    label={
                      <span className="inline-flex items-center gap-2 font-medium text-brand">
                        <Plus className="size-4" strokeWidth={2.25} />
                        Add Replacement
                      </span>
                    }
                  />
                </ListGroup>
              )}

              {activeTab === "ai" && (
                <>
                  <ListGroup title="OpenRouter" footer="Your key is stored locally and only sent to OpenRouter.">
                    <ListRow
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
                        className={cn("w-24", testResult?.ok && "text-success", testResult && !testResult.ok && "text-danger")}
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
                      label="Get an API key"
                      description="openrouter.ai/keys"
                      onClick={() => window.open("https://openrouter.ai/keys", "_blank")}
                    >
                      <ArrowRight className="size-4 text-label-tertiary" strokeWidth={1.75} />
                    </ListRow>
                  </ListGroup>

                  <ListGroup
                    title="Model Presets"
                    footer="Pick which model powers each AI feature. Customised presets can be reset to their default."
                  >
                    {DEFAULT_PRESETS.map((preset) => {
                      const isOverridden = !!presetOverrides[preset.id];
                      const effectiveModel = getEffectiveModel(preset, presetOverrides);

                      return (
                        <ListRow
                          key={preset.id}
                          label={
                            <span className="inline-flex items-center gap-2">
                              {preset.label}
                              {isOverridden && <Badge variant="accent">Custom</Badge>}
                            </span>
                          }
                          description={preset.description}
                        >
                          {/* Reset slot sits BEFORE the combobox so the combobox's
                              trailing edge lands on the row's 12px inset like every
                              other control; the fixed slot keeps the comboboxes aligned. */}
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
                          <ModelCombobox
                            value={effectiveModel}
                            onChange={(model) => handlePresetModelChange(preset.id, model)}
                            placeholder={preset.defaultModel}
                          />
                        </ListRow>
                      );
                    })}
                  </ListGroup>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
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
