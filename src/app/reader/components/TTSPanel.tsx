"use client";

import { useState, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { Play, Pause, Square, Volume2, ChevronDown, Loader2, SkipBack, SkipForward } from "lucide-react";
import type { EdgeVoice, ThemeClasses, TTSState, TTSHighlightMode } from "../lib/types";

interface TTSPanelProps {
  theme: ThemeClasses;
  state: TTSState;
  voices: EdgeVoice[];
  selectedVoice: string;
  rate: number;
  volume: number;
  autoAdvance: boolean;
  highlightMode: TTSHighlightMode;
  showReadMark: boolean;
  currentParagraph: number;
  totalParagraphs: number;
  wordsRemaining: number;
  onPlayFromStart: () => void;
  onPlayFromCurrent: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkipPrev: () => void;
  onSkipNext: () => void;
  onVoiceChange: (voice: string) => void;
  onRateChange: (rate: number) => void;
  onVolumeChange: (volume: number) => void;
  onAutoAdvanceChange: (enabled: boolean) => void;
  onHighlightModeChange: (mode: TTSHighlightMode) => void;
  onShowReadMarkChange: (enabled: boolean) => void;
  onClose: () => void;
}

export function TTSPanel({
  theme,
  state,
  voices,
  selectedVoice,
  rate,
  volume,
  autoAdvance,
  highlightMode,
  showReadMark,
  currentParagraph,
  totalParagraphs,
  wordsRemaining,
  onPlayFromStart,
  onPlayFromCurrent,
  onPause,
  onResume,
  onStop,
  onSkipPrev,
  onSkipNext,
  onVoiceChange,
  onRateChange,
  onVolumeChange,
  onAutoAdvanceChange,
  onHighlightModeChange,
  onShowReadMarkChange,
  onClose,
}: TTSPanelProps) {
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useClickOutside(panelRef, onClose, "[data-reader-header]");

  const voice = voices.find((v) => v.shortName === selectedVoice);
  const voiceLabel = voice
    ? voice.shortName.split("-").pop()?.replace("Neural", "") ?? voice.shortName
    : "Select voice";

  const isActive = state.status !== "idle";
  const isPlaying = state.status === "playing";
  const isPaused = state.status === "paused";
  const isSynthesizing = state.status === "synthesizing";

  return (
    <div
      ref={panelRef}
      className={`absolute right-12 top-full z-50 mt-2 w-[280px] rounded-lg border ${theme.border} ${theme.panel} shadow-lg shadow-black/30`}
    >
      <div className="space-y-3 p-4">
        {/* Play controls */}
        {!isActive ? (
          <div className="flex gap-2">
            <button
              onClick={onPlayFromStart}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] transition-colors ${theme.subtle} ${theme.text}`}
            >
              <Play className="h-3 w-3" strokeWidth={2} />
              From start
            </button>
            <button
              onClick={onPlayFromCurrent}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] transition-colors ${theme.subtle} ${theme.text}`}
            >
              <Play className="h-3 w-3" strokeWidth={2} />
              From here
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5">
            <button
              onClick={onSkipPrev}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
            >
              <SkipBack className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            {isSynthesizing ? (
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${theme.subtle} ${theme.muted}`}>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              </div>
            ) : isPlaying ? (
              <button
                onClick={onPause}
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${theme.subtle} transition-colors ${theme.text}`}
              >
                <Pause className="h-4 w-4" strokeWidth={1.5} />
              </button>
            ) : isPaused ? (
              <button
                onClick={onResume}
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${theme.subtle} transition-colors ${theme.text}`}
              >
                <Play className="h-4 w-4" strokeWidth={1.5} />
              </button>
            ) : null}
            <button
              onClick={onStop}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
            >
              <Square className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={onSkipNext}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
            >
              <SkipForward className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Progress info — shown during active TTS */}
        {isActive && totalParagraphs > 0 && (() => {
          const pct = Math.round(((currentParagraph + 1) / totalParagraphs) * 100);
          const wpm = 150 * rate;
          const mins = Math.ceil(wordsRemaining / wpm);
          const timeStr = mins < 1 ? "<1 min" : mins === 1 ? "1 min" : `${mins} min`;
          return (
            <div className="space-y-1.5">
              {/* Progress bar */}
              <div className={`h-1 w-full overflow-hidden rounded-full ${theme.subtle}`}>
                <div
                  className="h-full rounded-full bg-[var(--accent-brand)] transition-all duration-300"
                  style={{ width: `${pct}%`, opacity: 0.7 }}
                />
              </div>
              {/* Stats row */}
              <div className="flex items-center justify-between">
                <span className={`text-xs tabular-nums ${theme.muted}`}>
                  {currentParagraph + 1}/{totalParagraphs}
                </span>
                <span className={`text-xs ${theme.muted}`}>
                  ~{timeStr} left
                </span>
              </div>
            </div>
          );
        })()}

        {/* Voice selector */}
        <div className="relative">
          <button
            onClick={() => setShowVoicePicker((v) => !v)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[12px] transition-colors ${theme.subtle} ${theme.text}`}
          >
            <div className="flex items-center gap-2">
              <Volume2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{voiceLabel}</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" strokeWidth={1.5} />
          </button>

          {showVoicePicker && (
            <div className={`absolute bottom-full left-0 z-50 mb-1 max-h-[200px] w-full overflow-y-auto rounded-lg border p-1 shadow-lg shadow-black/30 ${theme.border} ${theme.panel}`}>
              {voices.map((v) => {
                const label = v.shortName.split("-").pop()?.replace("Neural", "") ?? v.shortName;
                return (
                  <button
                    key={v.shortName}
                    onClick={() => { onVoiceChange(v.shortName); setShowVoicePicker(false); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${v.shortName === selectedVoice ? theme.btnActive : theme.btn}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <span className={`shrink-0 text-xs ${theme.muted}`}>{v.gender}</span>
                    <span className={`shrink-0 text-xs ${theme.muted}`}>{v.locale}</span>
                  </button>
                );
              })}
              {voices.length === 0 && (
                <p className={`px-2 py-3 text-center text-xs ${theme.muted}`}>Loading voices...</p>
              )}
            </div>
          )}
        </div>

        {/* Speed & Volume */}
        <SliderRow label="Speed" value={rate} min={0.5} max={2} step={0.25} format={(v) => `${v.toFixed(2).replace(/0$/, "")}x`} onChange={onRateChange} theme={theme} />
        <SliderRow label="Vol" value={volume} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={onVolumeChange} theme={theme} />

        {/* Auto-advance toggle */}
        <div className="flex items-center justify-between">
          <span className={`text-xs ${theme.muted}`}>Auto-advance chapters</span>
          <button
            onClick={() => onAutoAdvanceChange(!autoAdvance)}
            className={`relative h-5 w-9 rounded-full transition-colors ${autoAdvance ? "bg-[var(--accent-brand)]" : theme.subtle}`}
          >
            <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${autoAdvance ? "translate-x-4" : ""}`} />
          </button>
        </div>

        {/* Divider */}
        <div className={`border-t ${theme.border}`} />

        {/* Highlight mode */}
        <div className="space-y-2">
          <span className={`text-xs ${theme.muted}`}>Highlight</span>
          <div className={`flex rounded-lg ${theme.subtle} p-0.5`}>
            {(["none", "word", "para", "both"] as const).map((mode) => {
              const value: TTSHighlightMode = mode === "para" ? "paragraph" : mode;
              const label = mode === "para" ? "Para" : mode.charAt(0).toUpperCase() + mode.slice(1);
              const active = highlightMode === value;
              return (
                <button
                  key={mode}
                  onClick={() => onHighlightModeChange(value)}
                  className={`flex-1 rounded-lg px-1 py-1 text-xs transition-colors ${active ? theme.btnActive : theme.btn}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Read mark toggle */}
        <div className="flex items-center justify-between">
          <span className={`text-xs ${theme.muted}`}>Dim read paragraphs</span>
          <button
            onClick={() => onShowReadMarkChange(!showReadMark)}
            className={`relative h-5 w-9 rounded-full transition-colors ${showReadMark ? "bg-[var(--accent-brand)]" : theme.subtle}`}
          >
            <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${showReadMark ? "translate-x-4" : ""}`} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, format, onChange, theme }: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void; theme: ThemeClasses;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-10 text-xs ${theme.muted}`}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-[var(--accent-brand)]"
      />
      <span className={`w-[36px] text-right text-[12px] tabular-nums ${theme.text}`}>{format(value)}</span>
    </div>
  );
}
