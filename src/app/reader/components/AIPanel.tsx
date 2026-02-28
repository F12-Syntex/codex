"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  X,
  BookType,
  Loader2,
  Check,
  KeyRound,
  ChevronDown,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { chatWithPreset } from "@/lib/openrouter";
import {
  DEFAULT_PRESETS,
  PRESET_OVERRIDES_KEY,
  getEffectiveModel,
  parseOverrides,
  type PresetOverrides,
} from "@/lib/ai-presets";
import {
  buildChapterRenamePrompt,
  shouldSkipRename,
  formatRenamedTitle,
} from "@/lib/ai-prompts";
import type { ThemeClasses, BookContent } from "../lib/types";

/* ── Types ───────────────────────────────────────────── */

interface AIPanelProps {
  theme: ThemeClasses;
  bookContent: BookContent | null;
  bookTitle: string;
  filePath: string;
  onChapterTitlesChanged: (titles: string[]) => void;
}

type TaskStatus = "idle" | "loading" | "done" | "error";

/* ── Feature Card Shell ──────────────────────────────── */

function FeatureCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white/[0.03] p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-brand)]/10">
          <Icon
            className="h-4 w-4 text-[var(--accent-brand)]"
            strokeWidth={1.5}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-medium text-white/80">
            {title}
          </span>
          <span className="text-[11px] leading-relaxed text-white/30">
            {description}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ── Progress Bar ────────────────────────────────────── */

function ProgressBar({
  current,
  total,
  skipped,
  status,
}: {
  current: number;
  total: number;
  skipped: number;
  status: TaskStatus;
}) {
  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-1 overflow-hidden rounded-lg bg-white/[0.06]">
        <div
          className={cn(
            "h-full rounded-lg transition-all duration-500",
            status === "done"
              ? "bg-emerald-400/70"
              : status === "error"
                ? "bg-red-400/70"
                : "bg-[var(--accent-brand)]/70",
          )}
          style={{ width: `${status === "done" ? 100 : pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/25">
          {status === "done" ? (
            <span className="text-emerald-400/70">
              Done{skipped > 0 ? ` · ${skipped} skipped` : ""}
            </span>
          ) : status === "error" ? (
            <span className="text-red-400/70">Failed</span>
          ) : status === "loading" ? (
            `${current} of ${total}`
          ) : (
            `${total} chapters${skipped > 0 ? ` · ${skipped} already named` : ""}`
          )}
        </span>
        {status === "loading" && (
          <Loader2
            className="h-3 w-3 animate-spin text-[var(--accent-brand)]/50"
            strokeWidth={1.5}
          />
        )}
        {status === "done" && (
          <Check className="h-3 w-3 text-emerald-400/70" strokeWidth={2} />
        )}
      </div>
    </div>
  );
}

/* ── Action Button ───────────────────────────────────── */

function ActionButton({
  onClick,
  disabled,
  loading,
  variant = "primary",
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  loading?: boolean;
  variant?: "primary" | "ghost";
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-all",
        variant === "ghost"
          ? disabled
            ? "bg-transparent text-white/10"
            : "bg-transparent text-white/30 hover:bg-white/[0.04] hover:text-white/50"
          : disabled
            ? "bg-white/[0.03] text-white/15"
            : "bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/20",
      )}
    >
      {loading && (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
      )}
      {children}
    </button>
  );
}

/* ── Main Panel ──────────────────────────────────────── */

export function AIPanel({
  theme,
  bookContent,
  bookTitle,
  onChapterTitlesChanged,
}: AIPanelProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // AI state
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [presetOverrides, setPresetOverrides] = useState<PresetOverrides>({});
  const [selectedPreset, setSelectedPreset] = useState("quick");
  const [renameStatus, setRenameStatus] = useState<TaskStatus>("idle");
  const [renameError, setRenameError] = useState("");
  const [renamedCount, setRenamedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [originalTitles, setOriginalTitles] = useState<string[] | null>(null);
  const abortRef = useRef(false);

  // Load settings
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    Promise.all([
      api.getSetting("openrouterApiKey"),
      api.getSetting(PRESET_OVERRIDES_KEY),
    ]).then(([key, overridesJson]) => {
      if (key) setApiKey(key);
      setPresetOverrides(parseOverrides(overridesJson));
    });
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const timer = setTimeout(
      () => document.addEventListener("mousedown", handler),
      10,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  const chapters = bookContent?.chapters ?? [];
  const hasApiKey = !!apiKey?.trim();
  const currentPreset = DEFAULT_PRESETS.find((p) => p.id === selectedPreset);
  const modelName = currentPreset
    ? getEffectiveModel(currentPreset, presetOverrides)
    : "";

  // Count how many will be skipped
  const skipCount = chapters.filter((ch) => shouldSkipRename(ch.title)).length;
  const renameableCount = chapters.length - skipCount;

  // ── Smart Rename Handler (1-by-1) ─────────────────

  const handleSmartRename = useCallback(async () => {
    if (!apiKey || chapters.length === 0) return;

    // Save original titles for reset (only on first run)
    if (!originalTitles) {
      setOriginalTitles(chapters.map((ch) => ch.title));
    }

    setRenameStatus("loading");
    setRenameError("");
    setRenamedCount(0);
    setSkippedCount(0);
    abortRef.current = false;

    try {
      const allTitles = chapters.map((ch) => ch.title);
      let processed = 0;
      let skipped = 0;

      for (let i = 0; i < chapters.length; i++) {
        if (abortRef.current) break;

        const ch = chapters[i];

        // Skip non-content chapters and already-named chapters
        if (shouldSkipRename(ch.title)) {
          skipped++;
          processed++;
          setSkippedCount(skipped);
          setRenamedCount(processed);
          continue;
        }

        const preview = ch.paragraphs
          .filter((p) => p !== "[image]")
          .join(" ")
          .slice(0, 500);

        const prompt = buildChapterRenamePrompt(ch.title, preview, bookTitle);

        const response = await chatWithPreset(
          apiKey,
          selectedPreset,
          [{ role: "user", content: prompt }],
          presetOverrides,
        );

        const subtitle = (response.choices?.[0]?.message?.content ?? "").trim();

        if (subtitle) {
          allTitles[i] = formatRenamedTitle(ch.title, subtitle);
        }

        processed++;
        setRenamedCount(processed);

        // Update titles incrementally so user sees progress
        onChapterTitlesChanged([...allTitles]);
      }

      setRenameStatus("done");
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Failed to rename chapters",
      );
      setRenameStatus("error");
    }
  }, [
    apiKey,
    chapters,
    bookTitle,
    selectedPreset,
    presetOverrides,
    originalTitles,
    onChapterTitlesChanged,
  ]);

  // ── Reset Handler ─────────────────────────────────

  const handleReset = useCallback(() => {
    if (!originalTitles) return;
    onChapterTitlesChanged([...originalTitles]);
    setRenameStatus("idle");
    setRenamedCount(0);
    setSkippedCount(0);
  }, [originalTitles, onChapterTitlesChanged]);

  // ── Stop Handler ──────────────────────────────────

  const handleStop = useCallback(() => {
    abortRef.current = true;
  }, []);

  // ── Render ──────────────────────────────────────────

  return (
    <>
      {/* Floating trigger */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={cn(
          "absolute bottom-5 right-5 z-40 flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200",
          open
            ? "bg-[var(--accent-brand)] text-white shadow-lg shadow-[var(--accent-brand)]/25"
            : "bg-white/[0.06] text-white/40 shadow-lg shadow-black/20 backdrop-blur-sm hover:bg-white/[0.10] hover:text-white/60",
        )}
      >
        <Sparkles className="h-4 w-4" strokeWidth={1.5} />
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute bottom-[68px] right-5 z-50 flex w-[320px] flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-[var(--bg-overlay)]/95 shadow-[0_8px_40px_-8px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-brand)]/15">
                <Sparkles
                  className="h-3.5 w-3.5 text-[var(--accent-brand)]"
                  strokeWidth={1.5}
                />
              </div>
              <span className="text-[13px] font-medium text-white/80">
                AI Tools
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-white/20 transition-colors hover:bg-white/[0.06] hover:text-white/40"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>

          {/* Divider */}
          <div className="mx-4 h-px bg-white/[0.06]" />

          {/* Body */}
          <div className="flex flex-col gap-3 p-4">
            {!hasApiKey ? (
              /* ── No API Key State ──────────────── */
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04]">
                  <KeyRound
                    className="h-5 w-5 text-white/20"
                    strokeWidth={1.5}
                  />
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="text-[13px] font-medium text-white/50">
                    API Key Required
                  </span>
                  <span className="max-w-[220px] text-[11px] leading-relaxed text-white/25">
                    Add your OpenRouter API key in Settings to unlock AI
                    features.
                  </span>
                </div>
                <button
                  onClick={() =>
                    window.open("https://openrouter.ai/keys", "_blank")
                  }
                  className="mt-1 flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/50"
                >
                  Get a key
                  <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <>
                {/* ── Model Selector ────────────────── */}
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-[11px] text-white/30">Using</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedPreset}
                      onChange={(e) => setSelectedPreset(e.target.value)}
                      className="appearance-none bg-transparent pr-4 text-right text-[11px] font-medium text-white/60 outline-none"
                    >
                      {DEFAULT_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="-ml-4 h-3 w-3 text-white/20"
                      strokeWidth={1.5}
                    />
                  </div>
                </div>

                {/* ── Feature: Smart Chapter Rename ── */}
                <FeatureCard
                  icon={BookType}
                  title="Smart Chapter Rename"
                  description="Generate spoiler-free subtitles one chapter at a time"
                >
                  <ProgressBar
                    current={renamedCount}
                    total={chapters.length}
                    skipped={renameStatus === "idle" ? skipCount : skippedCount}
                    status={renameStatus}
                  />

                  {renameStatus === "error" && (
                    <p className="text-[11px] leading-relaxed text-red-400/80">
                      {renameError}
                    </p>
                  )}

                  {/* Info about what will be skipped */}
                  {renameStatus === "idle" && skipCount > 0 && (
                    <p className="text-[11px] leading-relaxed text-white/20">
                      {skipCount} chapter{skipCount !== 1 ? "s" : ""} already
                      named — will be skipped
                    </p>
                  )}

                  <div className="flex gap-2">
                    {renameStatus === "loading" ? (
                      <ActionButton onClick={handleStop} disabled={false}>
                        Stop
                      </ActionButton>
                    ) : (
                      <ActionButton
                        onClick={handleSmartRename}
                        disabled={renameableCount === 0}
                        loading={false}
                      >
                        {renameStatus === "done"
                          ? "Run Again"
                          : renameableCount > 0
                            ? `Rename ${renameableCount} Chapter${renameableCount !== 1 ? "s" : ""}`
                            : "Nothing to rename"}
                      </ActionButton>
                    )}

                    {/* Reset button */}
                    {originalTitles && renameStatus !== "loading" && (
                      <ActionButton
                        onClick={handleReset}
                        disabled={false}
                        variant="ghost"
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
                        Reset
                      </ActionButton>
                    )}
                  </div>
                </FeatureCard>
              </>
            )}
          </div>

          {/* Footer — model info */}
          {hasApiKey && (
            <>
              <div className="mx-4 h-px bg-white/[0.06]" />
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="max-w-[200px] truncate text-[11px] text-white/15">
                  {modelName}
                </span>
                <span className="text-[11px] text-white/10">OpenRouter</span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
