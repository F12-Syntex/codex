"use client";

import { useState, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  Play, Pause, Square, ChevronDown, Loader2, SkipBack, SkipForward, Search,
  RotateCcw, AudioLines, Check, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { AudioWaveform } from "@/components/ui/audio-waveform";
import type { EdgeVoice, ThemeClasses, TTSState, TTSHighlightMode } from "../lib/types";
import { PANEL_SPRING, riseIn, stopNavKeys } from "./chrome";

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
  estimatedSeconds: number;
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

const voiceName = (v: EdgeVoice) => v.shortName.split("-").pop()?.replace("Neural", "") ?? v.shortName;

function formatHms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Read Aloud — a small media player that rises above the footer pill:
 * live waveform, a big accent transport, voice picker and fine controls.
 */
export function TTSPanel({
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
  estimatedSeconds,
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
  const reduceMotion = useReducedMotion();
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [voiceSearch, setVoiceSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Click outside to close (the toggles live in the header and footer)
  useClickOutside(panelRef, onClose, "[data-reader-header], [data-reader-footer]");

  // ttsGetVoices can resolve null — never let that white-screen the reader.
  const voiceList: EdgeVoice[] = Array.isArray(voices) ? voices : [];
  const voice = voiceList.find((v) => v.shortName === selectedVoice);
  const voiceLabel = voice ? voiceName(voice) : "Select voice";

  const isActive = state.status !== "idle";
  const isPlaying = state.status === "playing";
  const isPaused = state.status === "paused";
  const isSynthesizing = state.status === "synthesizing";
  const progress = isActive && totalParagraphs > 0 ? (currentParagraph + 1) / totalParagraphs : undefined;

  const mainAction = !isActive ? onPlayFromCurrent : isPlaying ? onPause : isPaused ? onResume : undefined;
  const mainLabel = !isActive ? "Play from here" : isPlaying ? "Pause" : isPaused ? "Resume" : "Preparing…";

  const filteredVoices = voiceList.filter((v) => {
    if (!voiceSearch) return true;
    const q = voiceSearch.toLowerCase();
    return v.shortName.toLowerCase().includes(q) || v.locale.toLowerCase().includes(q) || v.gender.toLowerCase().includes(q);
  });

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 z-50 flex justify-center px-4">
      <motion.div
        ref={panelRef}
        {...riseIn}
        initial={reduceMotion ? false : riseIn.initial}
        transition={PANEL_SPRING}
        onKeyDown={stopNavKeys}
        className="glass-thick grain pointer-events-auto relative flex w-80 origin-bottom flex-col overflow-hidden rounded-2xl"
        style={{ maxHeight: "calc(100vh - 140px)" }}
      >
        <div className="overflow-y-auto p-4">
          {/* ── Now playing ─────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
              <AudioLines className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-headline text-label">Read Aloud</div>
              <div className="truncate text-2xs text-label-tertiary">
                {voice ? `${voiceLabel} · ${voice.locale}` : "Choose a voice"}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close read aloud"
              className="focus-ring pressable grid size-7 shrink-0 place-items-center rounded-full bg-fill-tertiary text-label-secondary transition-colors hover:bg-fill-secondary hover:text-label"
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          </div>

          {/* ── Waveform ────────────────────────────── */}
          <div className="mt-4 rounded-lg bg-fill-quaternary px-3 py-2.5">
            <AudioWaveform
              label={isPlaying ? "Reading aloud" : "Read aloud idle"}
              bars={36}
              barWidth={3}
              gap={4}
              height={36}
              playing={isPlaying}
              progress={progress}
              barClassName={isActive ? "bg-brand" : "bg-label-quaternary"}
              className="justify-between"
            />
            <div className="mt-2 flex items-center justify-between text-2xs tabular-nums text-label-tertiary">
              <span>{isActive && totalParagraphs > 0 ? `¶ ${currentParagraph + 1} of ${totalParagraphs}` : "Ready"}</span>
              <span>{isActive && totalParagraphs > 0 ? `−${formatHms(estimatedSeconds)}` : "Resumes where you left off"}</span>
            </div>
          </div>

          {/* ── Transport ───────────────────────────── */}
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center">
            <div className="flex justify-start">
              {isActive ? (
                <button
                  onClick={onStop}
                  title="Stop"
                  aria-label="Stop"
                  className="focus-ring pressable -ml-2 grid size-8 place-items-center rounded-full text-label-secondary transition-colors hover:bg-fill-tertiary hover:text-label"
                >
                  <Square className="size-3.5 fill-current" strokeWidth={1.75} />
                </button>
              ) : (
                <button
                  onClick={onPlayFromStart}
                  title="Play chapter from the start"
                  className="focus-ring pressable -ml-2.5 flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-label-secondary transition-colors hover:bg-fill-tertiary hover:text-label"
                >
                  <RotateCcw className="size-3.5" strokeWidth={1.75} />
                  Start
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onSkipPrev}
                disabled={!isActive}
                aria-label="Previous paragraph"
                className="focus-ring pressable grid size-10 place-items-center rounded-full text-label transition-colors hover:bg-fill-tertiary disabled:opacity-30"
              >
                <SkipBack className="size-5 fill-current" strokeWidth={1.5} />
              </button>
              <motion.button
                onClick={mainAction}
                disabled={isSynthesizing}
                aria-label={mainLabel}
                title={mainLabel}
                whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
                className="focus-ring relative grid size-14 place-items-center rounded-full bg-brand text-brand-fg shadow-[0_0_24px_-6px_var(--accent-brand)] transition-[filter] hover:brightness-110 disabled:cursor-wait"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={isSynthesizing ? "load" : isPlaying ? "pause" : "play"}
                    initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 0.5, opacity: 0, rotate: 30 }}
                    transition={{ type: "spring", stiffness: 520, damping: 28 }}
                    className="grid place-items-center"
                  >
                    {isSynthesizing ? (
                      <Loader2 className="size-6 animate-spin" strokeWidth={2} />
                    ) : isPlaying ? (
                      <Pause className="size-6 fill-current" strokeWidth={1.5} />
                    ) : (
                      <Play className="ml-0.5 size-6 fill-current" strokeWidth={1.5} />
                    )}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
              <button
                onClick={onSkipNext}
                disabled={!isActive}
                aria-label="Next paragraph"
                className="focus-ring pressable grid size-10 place-items-center rounded-full text-label transition-colors hover:bg-fill-tertiary disabled:opacity-30"
              >
                <SkipForward className="size-5 fill-current" strokeWidth={1.5} />
              </button>
            </div>

            {/* Speed is owned by the slider below — no duplicate chip here. */}
            <div aria-hidden />
          </div>

          {/* ── Voice ───────────────────────────────── */}
          <div className="mt-3">
            <button
              onClick={() => { setShowVoicePicker((v) => !v); setVoiceSearch(""); }}
              aria-expanded={showVoicePicker}
              className="focus-ring group/voice flex h-8 w-full items-center gap-2 rounded-md text-left"
            >
              <span className="flex-1 text-sm text-label">Voice</span>
              <span className="min-w-0 truncate text-sm text-label-secondary transition-colors group-hover/voice:text-label">{voiceLabel}</span>
              {voice && <span className="shrink-0 text-2xs text-label-tertiary">{voice.gender}</span>}
              <ChevronDown
                className={cn("size-4 shrink-0 text-label-tertiary transition-transform duration-300 ease-apple", showVoicePicker && "rotate-180")}
                strokeWidth={1.75}
              />
            </button>

            <AnimatePresence initial={false}>
              {showVoicePicker && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                  className="overflow-hidden"
                >
                  <div className="mt-1 rounded-lg bg-fill-quaternary p-1.5">
                    <label className="flex h-7 items-center gap-2 rounded-full bg-fill-tertiary px-2.5">
                      <Search className="size-3.5 shrink-0 text-label-tertiary" strokeWidth={1.75} />
                      <input
                        type="text"
                        value={voiceSearch}
                        onChange={(e) => setVoiceSearch(e.target.value)}
                        placeholder="Search voices"
                        autoFocus
                        className="min-w-0 flex-1 bg-transparent text-xs text-label outline-none placeholder:text-label-tertiary"
                      />
                    </label>
                    <div className="mt-1 max-h-52 overflow-y-auto">
                      {filteredVoices.map((v) => {
                        const selected = v.shortName === selectedVoice;
                        return (
                          <button
                            key={v.shortName}
                            onClick={() => { onVoiceChange(v.shortName); setShowVoicePicker(false); setVoiceSearch(""); }}
                            className={cn(
                              "focus-ring flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
                              selected ? "bg-brand text-brand-fg" : "text-label hover:bg-fill-tertiary",
                            )}
                          >
                            <Check className={cn("size-3.5 shrink-0", !selected && "invisible")} strokeWidth={2} />
                            <span className="min-w-0 flex-1 truncate">{voiceName(v)}</span>
                            <span className={cn("shrink-0 text-2xs", selected ? "opacity-80" : "text-label-tertiary")}>{v.gender}</span>
                            <span className={cn("w-12 shrink-0 text-right text-2xs", selected ? "opacity-80" : "text-label-tertiary")}>{v.locale}</span>
                          </button>
                        );
                      })}
                      {voiceList.length === 0 && (
                        <p className="px-2 py-3 text-center text-xs text-label-tertiary">Loading voices…</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Speed & volume ──────────────────────── */}
          <div className="mt-1 space-y-1">
            <div className="flex h-8 items-center gap-3">
              <span className="w-14 shrink-0 text-sm text-label">Speed</span>
              <Slider className="flex-1" aria-label="Speed" value={[rate]} min={0.5} max={3} step={0.25} onValueChange={([v]) => onRateChange(v)} />
              <span className="w-10 shrink-0 text-right text-2xs tabular-nums text-label-tertiary">{rate.toFixed(2).replace(/0$/, "")}×</span>
            </div>
            <div className="flex h-8 items-center gap-3">
              <span className="w-14 shrink-0 text-sm text-label">Volume</span>
              <Slider className="flex-1" aria-label="Volume" value={[volume]} min={0} max={100} step={5} onValueChange={([v]) => onVolumeChange(v)} />
              <span className="w-10 shrink-0 text-right text-2xs tabular-nums text-label-tertiary">{Math.round(volume)}%</span>
            </div>
          </div>

          <div className="my-3 h-px bg-separator" />

          {/* ── Highlight & behaviour ───────────────── */}
          <div className="space-y-3">
            <div className="flex h-8 items-center justify-between gap-3">
              <span className="text-sm text-label">Highlight</span>
              <SegmentedControl
                size="sm"
                value={highlightMode}
                onValueChange={onHighlightModeChange}
                options={[
                  { value: "none", label: "Off" },
                  { value: "word", label: "Word" },
                  { value: "paragraph", label: "Para" },
                  { value: "both", label: "Both" },
                ]}
              />
            </div>
            <div className="flex h-8 items-center justify-between gap-3">
              <span className="text-sm text-label">Auto-advance chapters</span>
              <Switch checked={autoAdvance} onCheckedChange={onAutoAdvanceChange} aria-label="Auto-advance chapters" />
            </div>
            <div className="flex h-8 items-center justify-between gap-3">
              <span className="text-sm text-label">Dim read paragraphs</span>
              <Switch checked={showReadMark} onCheckedChange={onShowReadMarkChange} aria-label="Dim read paragraphs" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
