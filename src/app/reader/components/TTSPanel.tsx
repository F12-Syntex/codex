"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward, StopCircle, Volume2, ChevronDown, Loader2 } from "lucide-react";
import type { EdgeVoice, ThemeClasses, TTSState } from "../lib/types";

interface TTSPanelProps {
  theme: ThemeClasses;
  paragraphCount: number;
  state: TTSState;
  voices: EdgeVoice[];
  selectedVoice: string;
  rate: number;
  pitch: number;
  volume: number;
  autoAdvance: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  onVoiceChange: (voice: string) => void;
  onRateChange: (rate: number) => void;
  onPitchChange: (pitch: number) => void;
  onVolumeChange: (volume: number) => void;
  onAutoAdvanceChange: (enabled: boolean) => void;
  onClose: () => void;
}

export function TTSPanel({
  theme,
  paragraphCount,
  state,
  voices,
  selectedVoice,
  rate,
  pitch,
  volume,
  autoAdvance,
  onPlay,
  onPause,
  onStop,
  onPrev,
  onNext,
  onVoiceChange,
  onRateChange,
  onPitchChange,
  onVolumeChange,
  onAutoAdvanceChange,
  onClose,
}: TTSPanelProps) {
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const voicePickerRef = useRef<HTMLDivElement>(null);

  // Click outside to close panel
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to prevent immediate close from the toggle button click
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const voice = voices.find((v) => v.shortName === selectedVoice);
  const voiceLabel = voice
    ? voice.shortName.split("-").pop()?.replace("Neural", "") ?? voice.shortName
    : "Select voice";

  const progress = paragraphCount > 0 ? ((state.currentParagraph + 1) / paragraphCount) * 100 : 0;

  return (
    <div
      ref={panelRef}
      className={`absolute right-12 top-full z-50 mt-2 w-[320px] rounded-lg border ${theme.border} ${theme.panel} shadow-lg shadow-black/30`}
    >
      <div className="space-y-3 p-4">
        {/* Playback controls */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              disabled={state.currentParagraph === 0 && state.status === "idle"}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
            >
              <SkipBack className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>

            {state.status === "synthesizing" ? (
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${theme.subtle} ${theme.muted}`}>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              </div>
            ) : state.status === "playing" ? (
              <button
                onClick={onPause}
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${theme.subtle} transition-colors ${theme.text}`}
              >
                <Pause className="h-4 w-4" strokeWidth={1.5} />
              </button>
            ) : (
              <button
                onClick={onPlay}
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${theme.subtle} transition-colors ${theme.text}`}
              >
                <Play className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}

            {(state.status === "playing" || state.status === "paused") && (
              <button
                onClick={onStop}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
              >
                <StopCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            )}

            <button
              onClick={onNext}
              disabled={state.currentParagraph >= paragraphCount - 1 && state.status === "idle"}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
            >
              <SkipForward className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>

          {/* Progress */}
          <div className="w-full">
            <div className={`h-1 w-full rounded-lg ${theme.subtle}`}>
              <div
                className="h-full rounded-lg bg-[var(--accent-brand)] transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className={`mt-1 flex justify-between text-[11px] ${theme.muted}`}>
              <span>Paragraph {state.currentParagraph + 1}</span>
              <span>{paragraphCount} total</span>
            </div>
          </div>
        </div>

        {/* Voice selector */}
        <div className="relative" ref={voicePickerRef}>
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
            <div
              className={`absolute bottom-full left-0 z-50 mb-1 max-h-[200px] w-full overflow-y-auto rounded-lg border p-1 shadow-lg shadow-black/30 ${theme.border} ${theme.panel}`}
            >
              {voices.map((v) => {
                const label = v.shortName.split("-").pop()?.replace("Neural", "") ?? v.shortName;
                return (
                  <button
                    key={v.shortName}
                    onClick={() => {
                      onVoiceChange(v.shortName);
                      setShowVoicePicker(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors ${
                      v.shortName === selectedVoice ? theme.btnActive : theme.btn
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <span className={`shrink-0 text-[11px] ${theme.muted}`}>{v.gender}</span>
                    <span className={`shrink-0 text-[11px] ${theme.muted}`}>{v.locale}</span>
                  </button>
                );
              })}
              {voices.length === 0 && (
                <p className={`px-2 py-3 text-center text-[11px] ${theme.muted}`}>Loading voices...</p>
              )}
            </div>
          )}
        </div>

        {/* Sliders */}
        <SliderRow label="Speed" value={rate} min={0.5} max={2} step={0.25} format={(v) => `${v.toFixed(2).replace(/0$/, "")}x`} onChange={onRateChange} theme={theme} />
        <SliderRow label="Pitch" value={pitch} min={-50} max={50} step={5} format={(v) => `${v >= 0 ? "+" : ""}${v}Hz`} onChange={onPitchChange} theme={theme} />
        <SliderRow label="Vol" value={volume} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={onVolumeChange} theme={theme} />

        {/* Auto-advance toggle */}
        <div className="flex items-center justify-between">
          <span className={`text-[11px] ${theme.muted}`}>Auto-advance chapters</span>
          <button
            onClick={() => onAutoAdvanceChange(!autoAdvance)}
            className={`relative h-5 w-9 rounded-full transition-colors ${autoAdvance ? "bg-[var(--accent-brand)]" : theme.subtle}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${autoAdvance ? "translate-x-4" : ""}`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  theme,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  theme: ThemeClasses;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-10 text-[11px] ${theme.muted}`}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-[var(--accent-brand)]"
      />
      <span className={`w-[36px] text-right text-[12px] tabular-nums ${theme.text}`}>{format(value)}</span>
    </div>
  );
}
