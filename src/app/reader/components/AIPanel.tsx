"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, X, BookType, Loader2, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { chatWithPreset } from "@/lib/openrouter";
import {
  DEFAULT_PRESETS,
  PRESET_OVERRIDES_KEY,
  parseOverrides,
  type PresetOverrides,
} from "@/lib/ai-presets";
import {
  buildBatchChapterRenamePrompt,
  parseBatchRenameResponse,
} from "@/lib/ai-prompts";
import type { ThemeClasses, BookContent } from "../lib/types";

interface AIPanelProps {
  theme: ThemeClasses;
  bookContent: BookContent | null;
  bookTitle: string;
  onChapterTitlesChanged: (titles: string[]) => void;
}

type RenameStatus = "idle" | "loading" | "done" | "error";

export function AIPanel({
  theme,
  bookContent,
  bookTitle,
  onChapterTitlesChanged,
}: AIPanelProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // AI state
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [presetOverrides, setPresetOverrides] = useState<PresetOverrides>({});
  const [selectedPreset, setSelectedPreset] = useState("quick");
  const [renameStatus, setRenameStatus] = useState<RenameStatus>("idle");
  const [renameError, setRenameError] = useState("");
  const [renamedCount, setRenamedCount] = useState(0);

  // Load API key and preset overrides
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
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
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

  const handleSmartRename = useCallback(async () => {
    if (!apiKey || chapters.length === 0) return;

    setRenameStatus("loading");
    setRenameError("");
    setRenamedCount(0);

    try {
      // Build chapter previews (first ~500 chars of plain text per chapter)
      const chapterData = chapters.map((ch) => ({
        title: ch.title,
        preview: ch.paragraphs
          .filter((p) => p !== "[image]")
          .join(" ")
          .slice(0, 500),
      }));

      // Process in batches of 10 to avoid token limits
      const batchSize = 10;
      const allTitles = [...chapters.map((ch) => ch.title)];

      for (let i = 0; i < chapterData.length; i += batchSize) {
        const batch = chapterData.slice(i, i + batchSize);
        const prompt = buildBatchChapterRenamePrompt(batch, bookTitle);

        const response = await chatWithPreset(
          apiKey,
          selectedPreset,
          [{ role: "user", content: prompt }],
          presetOverrides,
        );

        const content = response.choices?.[0]?.message?.content ?? "";
        const subtitles = parseBatchRenameResponse(content, batch.length);

        // Merge subtitles with original titles
        for (let j = 0; j < subtitles.length; j++) {
          const sub = subtitles[j];
          if (sub) {
            const original = chapterData[i + j].title;
            // If original already has a subtitle format, replace it
            const hasNumber = /^(Chapter|Part|Story|Volume|Book)\s+\d+/i.test(
              original,
            );
            if (hasNumber) {
              const prefix = original.match(
                /^((?:Chapter|Part|Story|Volume|Book)\s+\d+)/i,
              );
              allTitles[i + j] = prefix
                ? `${prefix[1]}: ${sub}`
                : `${original}: ${sub}`;
            } else {
              allTitles[i + j] = `${original}: ${sub}`;
            }
          }
        }

        setRenamedCount(Math.min(i + batchSize, chapterData.length));
      }

      onChapterTitlesChanged(allTitles);
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
    onChapterTitlesChanged,
  ]);

  const hasApiKey = !!apiKey?.trim();

  return (
    <>
      {/* Floating AI button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "absolute bottom-5 right-5 z-40 flex h-10 w-10 items-center justify-center rounded-lg shadow-lg transition-all",
          open
            ? "bg-[var(--accent-brand)] text-white shadow-[var(--accent-brand)]/20"
            : `${theme.surface} border ${theme.border} ${theme.btn} hover:border-[var(--accent-brand)]/30`,
        )}
      >
        <Sparkles className="h-4 w-4" strokeWidth={1.5} />
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className={cn(
            "absolute bottom-16 right-5 z-50 w-[300px] rounded-lg border shadow-lg shadow-black/30 backdrop-blur-xl",
            theme.border,
          )}
          style={{ backgroundColor: "var(--bg-overlay)" }}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between border-b px-4 py-3 ${theme.border}`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
              <span className={`text-[13px] font-medium ${theme.text}`}>
                AI Tools
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
            </button>
          </div>

          {/* Content */}
          <div className="p-3">
            {!hasApiKey ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <AlertCircle
                  className={`h-5 w-5 ${theme.muted}`}
                  strokeWidth={1.5}
                />
                <p className={`text-[12px] ${theme.muted}`}>
                  Set your OpenRouter API key in Settings to use AI features.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Preset selector */}
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] ${theme.muted}`}>Model:</span>
                  <select
                    value={selectedPreset}
                    onChange={(e) => setSelectedPreset(e.target.value)}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1 text-[11px] outline-none",
                      theme.border,
                      theme.input,
                      theme.text,
                    )}
                  >
                    {DEFAULT_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Smart Chapter Rename */}
                <div
                  className={`flex flex-col gap-2 rounded-lg border p-3 ${theme.border}`}
                >
                  <div className="flex items-center gap-2">
                    <BookType
                      className="h-3.5 w-3.5 text-[var(--accent-brand)]"
                      strokeWidth={1.5}
                    />
                    <span className={`text-[12px] font-medium ${theme.text}`}>
                      Smart Chapter Rename
                    </span>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${theme.muted}`}>
                    AI reads each chapter and generates spoiler-free subtitles
                    based on the content.
                  </p>

                  {renameStatus === "error" && (
                    <p className="text-[11px] text-red-400">{renameError}</p>
                  )}

                  {renameStatus === "loading" && (
                    <div className="flex items-center gap-2">
                      <Loader2
                        className="h-3 w-3 animate-spin text-[var(--accent-brand)]"
                        strokeWidth={1.5}
                      />
                      <span className={`text-[11px] ${theme.muted}`}>
                        Renaming {renamedCount}/{chapters.length} chapters...
                      </span>
                    </div>
                  )}

                  {renameStatus === "done" && (
                    <div className="flex items-center gap-2">
                      <Check
                        className="h-3 w-3 text-emerald-400"
                        strokeWidth={1.5}
                      />
                      <span className="text-[11px] text-emerald-400">
                        Renamed {chapters.length} chapters
                      </span>
                    </div>
                  )}

                  <button
                    onClick={handleSmartRename}
                    disabled={
                      renameStatus === "loading" || chapters.length === 0
                    }
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg py-2 text-[11px] font-medium transition-colors",
                      renameStatus === "loading"
                        ? "bg-white/[0.04] text-white/20"
                        : "bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70",
                    )}
                  >
                    {renameStatus === "loading" ? (
                      "Processing..."
                    ) : renameStatus === "done" ? (
                      "Rename Again"
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3" />
                        Rename {chapters.length} Chapters
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
