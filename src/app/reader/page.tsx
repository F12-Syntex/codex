"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import {
  Minus,
  Square,
  X,
  Copy,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  ChevronDown,
  StopCircle,
  Loader2,
  BookOpen,
  AudioLines,
} from "lucide-react";
import { useSearchParams } from "next/navigation";

type ReadingTheme = "dark" | "light" | "sepia";

interface EdgeVoice {
  name: string;
  shortName: string;
  gender: string;
  locale: string;
}

const THEME_STYLES: Record<ReadingTheme, { bg: string; text: string; mutedText: string; surface: string }> = {
  dark: {
    bg: "bg-[var(--bg-inset)]",
    text: "text-white/85",
    mutedText: "text-white/40",
    surface: "bg-[var(--bg-surface)]/80",
  },
  light: {
    bg: "bg-[#fafafa]",
    text: "text-[#1a1a1a]",
    mutedText: "text-[#1a1a1a]/40",
    surface: "bg-[#f0f0f0]/90",
  },
  sepia: {
    bg: "bg-[#f4ecd8]",
    text: "text-[#5b4636]",
    mutedText: "text-[#5b4636]/40",
    surface: "bg-[#e8dcc8]/90",
  },
};

/* ── Persisted settings shape ───────────────────────── */

interface ReaderSettings {
  readingTheme: ReadingTheme;
  ttsVoice: string;
  ttsRate: number;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  readingTheme: "dark",
  ttsVoice: "en-US-AriaNeural",
  ttsRate: 1.0,
};

const SETTINGS_KEY = "readerSettings";

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Partial<ReaderSettings>) {
  try {
    const current = loadSettings();
    const next = { ...current, ...s };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    window.electronAPI?.setSetting(SETTINGS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

/* ── TTS state ──────────────────────────────────────── */

interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  isSynthesizing: boolean;
  currentParagraph: number;
}

export default function ReaderPage() {
  return (
    <Suspense>
      <ReaderContent />
    </Suspense>
  );
}

/* ── ReaderTextBlock ────────────────────────────────── */

function ReaderTextBlock({
  children,
  index,
  tts,
}: {
  children: React.ReactNode;
  index: number;
  tts: TTSState;
  readingTheme: ReadingTheme;
}) {
  const isActive = (tts.isPlaying || tts.isPaused || tts.isSynthesizing) && tts.currentParagraph === index;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && (tts.isPlaying || tts.isSynthesizing) && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isActive, tts.isPlaying, tts.isSynthesizing]);

  return (
    <div ref={ref} className="relative">
      <div
        className={`pointer-events-none absolute -inset-x-4 -inset-y-2 rounded-lg border transition-all duration-300 ease-out ${
          isActive
            ? "scale-100 border-[var(--accent-brand-dim)] bg-[var(--accent-brand-subtle)] opacity-100"
            : "scale-[0.98] border-transparent bg-transparent opacity-0"
        }`}
      />
      <p className="relative">{children}</p>
    </div>
  );
}

/* ── Themed helpers ─────────────────────────────────── */

function themedBtnClass(rt: ReadingTheme): string {
  return rt === "dark"
    ? "text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:text-white/15"
    : rt === "sepia"
      ? "text-[#5b4636]/50 hover:bg-[#5b4636]/10 hover:text-[#5b4636]/80 disabled:text-[#5b4636]/15"
      : "text-black/50 hover:bg-black/[0.06] hover:text-black/80 disabled:text-black/15";
}

function themedBorderColor(rt: ReadingTheme): string {
  return rt === "dark"
    ? "border-white/[0.04]"
    : rt === "sepia"
      ? "border-[#5b4636]/10"
      : "border-black/[0.06]";
}

function themedMutedText(rt: ReadingTheme): string {
  return rt === "dark" ? "text-white/40" : rt === "sepia" ? "text-[#5b4636]/40" : "text-black/40";
}

function themedSubtleBg(rt: ReadingTheme): string {
  return rt === "dark" ? "bg-white/[0.06]" : rt === "sepia" ? "bg-[#5b4636]/10" : "bg-black/[0.06]";
}

/* ── TTS Modal ──────────────────────────────────────── */

function TTSModal({
  readingTheme,
  paragraphs,
  tts,
  onPlay,
  onPause,
  onStop,
  onPrev,
  onNext,
  voices,
  selectedVoice,
  onVoiceChange,
  rate,
  onRateChange,
  onClose,
}: {
  readingTheme: ReadingTheme;
  paragraphs: string[];
  tts: TTSState;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  voices: EdgeVoice[];
  selectedVoice: string;
  onVoiceChange: (shortName: string) => void;
  rate: number;
  onRateChange: (rate: number) => void;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const voicePickerRef = useRef<HTMLDivElement>(null);

  const btnClass = themedBtnClass(readingTheme);
  const borderColor = themedBorderColor(readingTheme);
  const mutedText = themedMutedText(readingTheme);

  const surfaceBg = readingTheme === "dark"
    ? "bg-[var(--bg-overlay)]"
    : readingTheme === "sepia"
      ? "bg-[#e0d4bc]"
      : "bg-white";

  const solidBg = readingTheme === "dark"
    ? "bg-[var(--bg-elevated)]"
    : readingTheme === "sepia"
      ? "bg-[#d8ccb4]"
      : "bg-[#e8e8e8]";

  const textColor = readingTheme === "dark"
    ? "text-white/80"
    : readingTheme === "sepia"
      ? "text-[#5b4636]/80"
      : "text-black/80";

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close voice picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (voicePickerRef.current && !voicePickerRef.current.contains(e.target as Node)) {
        setShowVoicePicker(false);
      }
    };
    if (showVoicePicker) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [showVoicePicker]);

  const voice = voices.find((v) => v.shortName === selectedVoice);
  const voiceLabel = voice
    ? voice.shortName.split("-").pop()?.replace("Neural", "") ?? voice.shortName
    : "Select voice";

  // Progress through paragraphs
  const paraProgress = paragraphs.length > 0
    ? ((tts.currentParagraph + 1) / paragraphs.length) * 100
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        ref={modalRef}
        className={`w-[340px] rounded-lg border ${borderColor} ${surfaceBg} shadow-lg shadow-black/30`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-4 py-3 ${borderColor}`}>
          <span className={`text-[13px] font-medium ${textColor}`}>Text to Speech</span>
          <button
            onClick={onClose}
            className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${btnClass}`}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Playback controls — centered, prominent */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={onPrev}
                disabled={tts.currentParagraph === 0 && !tts.isPlaying}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${btnClass}`}
              >
                <SkipBack className="h-4 w-4" strokeWidth={1.5} />
              </button>

              {tts.isSynthesizing ? (
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${solidBg} ${mutedText}`}>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                </div>
              ) : tts.isPlaying ? (
                <button
                  onClick={onPause}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${solidBg} transition-colors ${textColor}`}
                >
                  <Pause className="h-4 w-4" strokeWidth={1.5} />
                </button>
              ) : (
                <button
                  onClick={onPlay}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${solidBg} transition-colors ${textColor}`}
                >
                  <Play className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}

              {(tts.isPlaying || tts.isPaused) ? (
                <button
                  onClick={onStop}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${btnClass}`}
                >
                  <StopCircle className="h-4 w-4" strokeWidth={1.5} />
                </button>
              ) : (
                <button
                  onClick={onNext}
                  disabled={tts.currentParagraph >= paragraphs.length - 1 && !tts.isPlaying}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${btnClass}`}
                >
                  <SkipForward className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}

              {(tts.isPlaying || tts.isPaused) && (
                <button
                  onClick={onNext}
                  disabled={tts.currentParagraph >= paragraphs.length - 1 && !tts.isPlaying}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${btnClass}`}
                >
                  <SkipForward className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full">
              <div className={`h-1 w-full rounded-lg ${themedSubtleBg(readingTheme)}`}>
                <div
                  className="h-full rounded-lg bg-[var(--accent-brand)] transition-all duration-200"
                  style={{ width: `${paraProgress}%` }}
                />
              </div>
              <div className={`mt-1 flex justify-between text-[11px] ${mutedText}`}>
                <span>Paragraph {tts.currentParagraph + 1}</span>
                <span>{paragraphs.length} total</span>
              </div>
            </div>
          </div>

          {/* Voice selector */}
          <div className="relative" ref={voicePickerRef}>
            <label className={`mb-1 block text-[11px] font-medium ${mutedText}`}>Voice</label>
            <button
              onClick={() => setShowVoicePicker((v) => !v)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[12px] transition-colors ${themedSubtleBg(readingTheme)} ${textColor}`}
            >
              <div className="flex items-center gap-2">
                <Volume2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{voiceLabel}</span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" strokeWidth={1.5} />
            </button>

            {showVoicePicker && (
              <div
                className={`absolute bottom-full left-0 z-50 mb-1 max-h-[200px] w-full overflow-y-auto rounded-lg border p-1 shadow-lg shadow-black/30 ${borderColor} ${surfaceBg}`}
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
                        v.shortName === selectedVoice
                          ? readingTheme === "dark"
                            ? "bg-white/[0.08] text-white/80"
                            : readingTheme === "sepia"
                              ? "bg-[#5b4636]/10 text-[#5b4636]/80"
                              : "bg-black/[0.06] text-black/80"
                          : btnClass
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className={`shrink-0 text-[11px] ${mutedText}`}>{v.gender}</span>
                      <span className={`shrink-0 text-[11px] ${mutedText}`}>{v.locale}</span>
                    </button>
                  );
                })}
                {voices.length === 0 && (
                  <p className={`px-2 py-3 text-center text-[11px] ${mutedText}`}>Loading voices...</p>
                )}
              </div>
            )}
          </div>

          {/* Speed control */}
          <div>
            <label className={`mb-1 block text-[11px] font-medium ${mutedText}`}>Speed</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.25}
                value={rate}
                onChange={(e) => onRateChange(parseFloat(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-[var(--accent-brand)]"
              />
              <span className={`w-[36px] text-right text-[12px] tabular-nums ${textColor}`}>
                {rate.toFixed(2).replace(/0$/, "")}x
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Reader Content ─────────────────────────────────── */

function ReaderContent() {
  const searchParams = useSearchParams();
  const title = searchParams.get("title") || "Untitled";
  const author = searchParams.get("author") || "Unknown Author";
  const format = searchParams.get("format") || "EPUB";
  const filePath = searchParams.get("filePath") || "";

  // Book content state
  const [bookContent, setBookContent] = useState<BookContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const chapterPickerRef = useRef<HTMLDivElement>(null);

  // Settings
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>("dark");
  const [maximized, setMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // TTS
  const [showTTS, setShowTTS] = useState(false);
  const [tts, setTTS] = useState<TTSState>({
    isPlaying: false,
    isPaused: false,
    isSynthesizing: false,
    currentParagraph: 0,
  });
  const [voices, setVoices] = useState<EdgeVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("en-US-AriaNeural");
  const [rate, setRate] = useState(1.0);

  // Audio refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentParaRef = useRef(0);
  const rateRef = useRef(1.0);
  const voiceRef = useRef("en-US-AriaNeural");
  const sessionRef = useRef(0);

  const contentRef = useRef<HTMLDivElement>(null);
  const theme = THEME_STYLES[readingTheme];
  const btnClass = themedBtnClass(readingTheme);
  const borderColor = themedBorderColor(readingTheme);
  const mutedText = themedMutedText(readingTheme);

  // Current chapter data
  const chapters = bookContent?.chapters ?? [];
  const chapter = chapters[currentChapter];
  const paragraphs = chapter?.paragraphs ?? [];
  const isImageBook = bookContent?.isImageBook ?? false;

  // Native font from book
  const nativeFontFamily = bookContent?.fontFamily;
  const nativeFontSize = bookContent?.fontSizePx;

  // ── Load book content ──────────────────────────────
  useEffect(() => {
    if (!filePath) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    window.electronAPI?.getBookContent(filePath, format).then((content) => {
      setBookContent(content);
      setIsLoading(false);
    }).catch(() => {
      setBookContent({
        chapters: [{ title: "Error", paragraphs: ["Failed to load book content."] }],
        isImageBook: false,
      });
      setIsLoading(false);
    });
  }, [filePath, format]);

  // ── Load persisted settings ────────────────────────
  useEffect(() => {
    const stored = loadSettings();
    setReadingTheme(stored.readingTheme);
    setSelectedVoice(stored.ttsVoice);
    voiceRef.current = stored.ttsVoice;
    setRate(stored.ttsRate);
    rateRef.current = stored.ttsRate;

    window.electronAPI?.getSetting(SETTINGS_KEY).then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val) as Partial<ReaderSettings>;
          if (parsed.readingTheme) setReadingTheme(parsed.readingTheme);
          if (parsed.ttsVoice) {
            setSelectedVoice(parsed.ttsVoice);
            voiceRef.current = parsed.ttsVoice;
          }
          if (parsed.ttsRate !== undefined) {
            setRate(parsed.ttsRate);
            rateRef.current = parsed.ttsRate;
          }
        } catch { /* ignore */ }
      }
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);

  // ── Persist helpers ────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSettings = useCallback((patch: Partial<ReaderSettings>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveSettings(patch), 300);
  }, []);

  const handleThemeChange = useCallback((t: ReadingTheme) => {
    setReadingTheme(t);
    persistSettings({ readingTheme: t });
  }, [persistSettings]);

  useEffect(() => {
    window.electronAPI?.onMaximized(setMaximized);
  }, []);

  // Load Edge TTS voices
  useEffect(() => {
    window.electronAPI?.ttsGetVoices().then((v) => {
      const english = v.filter((voice) => voice.locale.startsWith("en-"));
      setVoices(english);
      if (english.length > 0 && !english.some((e) => e.shortName === voiceRef.current)) {
        setSelectedVoice(english[0].shortName);
        voiceRef.current = english[0].shortName;
      }
    }).catch(() => {});
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // Close chapter picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (chapterPickerRef.current && !chapterPickerRef.current.contains(e.target as Node)) {
        setShowChapterPicker(false);
      }
    };
    if (showChapterPicker) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [showChapterPicker]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  const rateToStr = (r: number) => {
    const pct = Math.round((r - 1) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  };

  const synthesizeAndPlayRef = useRef<((index: number) => Promise<void>) | null>(null);

  const synthesizeAndPlay = useCallback(async (index: number) => {
    if (!window.electronAPI?.ttsSynthesize || isImageBook) return;

    const session = ++sessionRef.current;
    currentParaRef.current = index;
    setTTS({ isPlaying: false, isPaused: false, isSynthesizing: true, currentParagraph: index });

    const currentRate = rateRef.current;
    const currentVoice = voiceRef.current;

    try {
      const base64 = await window.electronAPI.ttsSynthesize(
        paragraphs[index],
        currentVoice,
        rateToStr(currentRate),
      );

      if (sessionRef.current !== session) return;

      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audioRef.current = audio;

      audio.onended = () => {
        if (sessionRef.current !== session) return;
        const next = currentParaRef.current + 1;
        if (next < paragraphs.length) {
          synthesizeAndPlayRef.current?.(next);
        } else {
          currentParaRef.current = 0;
          setTTS({ isPlaying: false, isPaused: false, isSynthesizing: false, currentParagraph: 0 });
        }
      };

      audio.onerror = () => {
        if (sessionRef.current === session) {
          setTTS((s) => ({ ...s, isPlaying: false, isSynthesizing: false }));
        }
      };

      if (sessionRef.current !== session) return;

      setTTS({ isPlaying: true, isPaused: false, isSynthesizing: false, currentParagraph: index });
      await audio.play();
    } catch {
      if (sessionRef.current === session) {
        setTTS((s) => ({ ...s, isPlaying: false, isSynthesizing: false }));
      }
    }
  }, [paragraphs, isImageBook]);

  synthesizeAndPlayRef.current = synthesizeAndPlay;

  const handlePlay = useCallback(() => {
    if (tts.isPaused && audioRef.current) {
      setTTS((s) => ({ ...s, isPlaying: true, isPaused: false }));
      audioRef.current.play();
    } else {
      synthesizeAndPlay(currentParaRef.current);
    }
  }, [tts.isPaused, synthesizeAndPlay]);

  const handlePause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setTTS((s) => ({ ...s, isPlaying: false, isPaused: true }));
  }, []);

  const handleStop = useCallback(() => {
    sessionRef.current++;
    stopPlayback();
    currentParaRef.current = 0;
    setTTS({ isPlaying: false, isPaused: false, isSynthesizing: false, currentParagraph: 0 });
  }, [stopPlayback]);

  const handlePrev = useCallback(() => {
    const prev = Math.max(0, currentParaRef.current - 1);
    currentParaRef.current = prev;
    if (tts.isPlaying || tts.isSynthesizing) {
      stopPlayback();
      synthesizeAndPlay(prev);
    } else {
      sessionRef.current++;
      stopPlayback();
      setTTS((s) => ({ ...s, isPaused: false, currentParagraph: prev }));
    }
  }, [tts.isPlaying, tts.isSynthesizing, stopPlayback, synthesizeAndPlay]);

  const handleNext = useCallback(() => {
    const next = Math.min(paragraphs.length - 1, currentParaRef.current + 1);
    currentParaRef.current = next;
    if (tts.isPlaying || tts.isSynthesizing) {
      stopPlayback();
      synthesizeAndPlay(next);
    } else {
      sessionRef.current++;
      stopPlayback();
      setTTS((s) => ({ ...s, isPaused: false, currentParagraph: next }));
    }
  }, [paragraphs.length, tts.isPlaying, tts.isSynthesizing, stopPlayback, synthesizeAndPlay]);

  const handleVoiceChange = useCallback((shortName: string) => {
    setSelectedVoice(shortName);
    voiceRef.current = shortName;
    persistSettings({ ttsVoice: shortName });
    if (tts.isPlaying || tts.isSynthesizing) {
      stopPlayback();
      synthesizeAndPlay(currentParaRef.current);
    }
  }, [tts.isPlaying, tts.isSynthesizing, stopPlayback, synthesizeAndPlay, persistSettings]);

  const handleRateChange = useCallback((newRate: number) => {
    setRate(newRate);
    rateRef.current = newRate;
    persistSettings({ ttsRate: newRate });
  }, [persistSettings]);

  // Chapter navigation
  const handleChapterChange = useCallback((index: number) => {
    sessionRef.current++;
    stopPlayback();
    currentParaRef.current = 0;
    setTTS({ isPlaying: false, isPaused: false, isSynthesizing: false, currentParagraph: 0 });
    setCurrentChapter(index);
    setShowChapterPicker(false);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [stopPlayback]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        if (currentChapter > 0) handleChapterChange(currentChapter - 1);
      } else if (e.key === "ArrowRight") {
        if (currentChapter < chapters.length - 1) handleChapterChange(currentChapter + 1);
      } else if (e.key === " " && !e.repeat) {
        e.preventDefault();
        if (isImageBook) return;
        if (tts.isPlaying) handlePause();
        else handlePlay();
      } else if (e.key === "Escape") {
        if (showTTS) {
          setShowTTS(false);
        } else if (tts.isPlaying || tts.isPaused) {
          handleStop();
        } else if (isFullscreen) {
          document.exitFullscreen?.();
          setIsFullscreen(false);
        } else {
          window.electronAPI?.close();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentChapter, chapters.length, isFullscreen, isImageBook, tts.isPlaying, tts.isPaused, showTTS, handlePause, handlePlay, handleStop, handleChapterChange]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const chapterProgress = chapters.length > 0 ? ((currentChapter + 1) / chapters.length) * 100 : 0;

  const surfaceBg = readingTheme === "dark"
    ? "bg-[var(--bg-overlay)]"
    : readingTheme === "sepia"
      ? "bg-[#e0d4bc]"
      : "bg-white";

  // Build article font style from native book fonts
  const articleStyle: React.CSSProperties = {};
  if (nativeFontFamily) {
    articleStyle.fontFamily = nativeFontFamily;
  }
  if (nativeFontSize) {
    articleStyle.fontSize = `${nativeFontSize}px`;
  }

  if (!settingsLoaded) return null;

  const ttsActive = tts.isPlaying || tts.isPaused || tts.isSynthesizing;

  return (
    <div className={`flex h-screen flex-col ${theme.bg} transition-colors duration-300`}>
      {/* ── Title bar ───────────────────────────────── */}
      <header
        className={`flex h-11 shrink-0 items-center border-b ${theme.surface} backdrop-blur-md ${borderColor}`}
      >
        <div className="app-drag-region flex h-full flex-1 items-center gap-2 pl-3.5">
          <span className={`truncate text-[13px] font-medium ${theme.text}`}>{title}</span>
          <span className={`shrink-0 text-[11px] ${theme.mutedText}`}>{author}</span>
        </div>

        <div className="no-drag flex items-center gap-1 pr-1">
          {/* Theme switcher */}
          <div className={`flex items-center gap-0.5 rounded-lg p-0.5 ${themedSubtleBg(readingTheme)}`}>
            {(["dark", "light", "sepia"] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleThemeChange(t)}
                className={`rounded-[6px] px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                  readingTheme === t
                    ? readingTheme === "dark"
                      ? "bg-white/[0.1] text-white/80"
                      : readingTheme === "sepia"
                        ? "bg-[#5b4636]/15 text-[#5b4636]/80"
                        : "bg-black/[0.1] text-black/70"
                    : readingTheme === "dark"
                      ? "text-white/30 hover:text-white/50"
                      : readingTheme === "sepia"
                        ? "text-[#5b4636]/30 hover:text-[#5b4636]/50"
                        : "text-black/30 hover:text-black/50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* TTS button */}
          {!isImageBook && (
            <button
              onClick={() => setShowTTS((v) => !v)}
              className={`ml-1 flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                ttsActive
                  ? "bg-[var(--accent-brand)] text-white"
                  : btnClass
              }`}
            >
              <AudioLines className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              readingTheme === "dark"
                ? "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
                : readingTheme === "sepia"
                  ? "text-[#5b4636]/40 hover:bg-[#5b4636]/10 hover:text-[#5b4636]/70"
                  : "text-black/40 hover:bg-black/[0.06] hover:text-black/70"
            }`}
          >
            {isFullscreen ? (
              <Minimize className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <Maximize className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        </div>

        {/* Window controls */}
        <div className="flex h-full items-center">
          <button
            onClick={() => window.electronAPI?.minimize()}
            className={`inline-flex h-full w-11 items-center justify-center transition-colors ${
              readingTheme === "dark"
                ? "text-white/30 hover:bg-white/[0.06] hover:text-white/60"
                : readingTheme === "sepia"
                  ? "text-[#5b4636]/30 hover:bg-[#5b4636]/10 hover:text-[#5b4636]/60"
                  : "text-black/30 hover:bg-black/[0.06] hover:text-black/60"
            }`}
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => window.electronAPI?.maximize()}
            className={`inline-flex h-full w-11 items-center justify-center transition-colors ${
              readingTheme === "dark"
                ? "text-white/30 hover:bg-white/[0.06] hover:text-white/60"
                : readingTheme === "sepia"
                  ? "text-[#5b4636]/30 hover:bg-[#5b4636]/10 hover:text-[#5b4636]/60"
                  : "text-black/30 hover:bg-black/[0.06] hover:text-black/60"
            }`}
          >
            {maximized ? (
              <Copy className="h-3 w-3" strokeWidth={1.5} />
            ) : (
              <Square className="h-3 w-3" strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={() => window.electronAPI?.close()}
            className="inline-flex h-full w-11 items-center justify-center text-white/30 transition-colors hover:bg-[#e81123]/80 hover:text-white"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* ── Content area ───────────────────────────── */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className={`h-6 w-6 animate-spin ${theme.mutedText}`} strokeWidth={1.5} />
              <span className={`text-[13px] ${theme.mutedText}`}>Loading book...</span>
            </div>
          </div>
        ) : isImageBook ? (
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-8">
            {paragraphs.map((dataUri, i) => (
              <img
                key={i}
                src={dataUri}
                alt={`Page ${i + 1}`}
                className="w-full rounded-lg shadow-lg shadow-black/20"
                loading="lazy"
              />
            ))}
          </div>
        ) : (
          <article
            className="mx-auto max-w-2xl px-8 py-12"
            style={articleStyle}
          >
            <h2
              className={`mb-8 text-center text-sm font-medium uppercase tracking-widest ${theme.mutedText}`}
            >
              {chapter?.title ?? ""}
            </h2>

            <div className={`space-y-6 leading-relaxed ${theme.text}`}>
              {paragraphs.map((text, i) => (
                <ReaderTextBlock key={i} index={i} tts={tts} readingTheme={readingTheme}>
                  {text}
                </ReaderTextBlock>
              ))}
            </div>
          </article>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────── */}
      <footer className={`shrink-0 ${theme.surface} backdrop-blur-md`}>
        {/* Chapter progress bar */}
        <div className={`h-[2px] w-full ${themedSubtleBg(readingTheme)}`}>
          <div
            className="h-full bg-[var(--accent-brand)] transition-all duration-300"
            style={{ width: `${chapterProgress}%` }}
          />
        </div>

        <div className="flex h-10 items-center px-3">
          {/* Prev chapter */}
          <button
            onClick={() => { if (currentChapter > 0) handleChapterChange(currentChapter - 1); }}
            disabled={currentChapter === 0}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${btnClass}`}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>

          {/* Chapter selector — solid, prominent */}
          <div className="relative mx-2 flex-1" ref={chapterPickerRef}>
            <button
              onClick={() => setShowChapterPicker((v) => !v)}
              className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${themedSubtleBg(readingTheme)} ${
                readingTheme === "dark"
                  ? "text-white/70 hover:bg-white/[0.1] hover:text-white/90"
                  : readingTheme === "sepia"
                    ? "text-[#5b4636]/70 hover:bg-[#5b4636]/15 hover:text-[#5b4636]/90"
                    : "text-black/70 hover:bg-black/[0.1] hover:text-black/90"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{chapter?.title ?? "No chapters"}</span>
              <span className={`shrink-0 text-[11px] ${mutedText}`}>
                {currentChapter + 1}/{chapters.length}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" strokeWidth={1.5} />
            </button>

            {showChapterPicker && (
              <div
                className={`absolute bottom-full left-0 z-50 mb-1 max-h-[320px] w-full overflow-y-auto rounded-lg border p-1 shadow-lg shadow-black/30 ${borderColor} ${surfaceBg}`}
              >
                {chapters.map((ch, i) => (
                  <button
                    key={i}
                    onClick={() => handleChapterChange(i)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] transition-colors ${
                      i === currentChapter
                        ? readingTheme === "dark"
                          ? "bg-white/[0.1] text-white/90"
                          : readingTheme === "sepia"
                            ? "bg-[#5b4636]/15 text-[#5b4636]/90"
                            : "bg-black/[0.08] text-black/90"
                        : readingTheme === "dark"
                          ? "text-white/60 hover:bg-white/[0.06] hover:text-white/80"
                          : readingTheme === "sepia"
                            ? "text-[#5b4636]/60 hover:bg-[#5b4636]/[0.08] hover:text-[#5b4636]/80"
                            : "text-black/60 hover:bg-black/[0.04] hover:text-black/80"
                    }`}
                  >
                    <span className={`w-6 shrink-0 text-right tabular-nums text-[11px] ${mutedText}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{ch.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Next chapter */}
          <button
            onClick={() => { if (currentChapter < chapters.length - 1) handleChapterChange(currentChapter + 1); }}
            disabled={currentChapter >= chapters.length - 1}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${btnClass}`}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </footer>

      {/* ── TTS Modal ──────────────────────────────── */}
      {showTTS && !isImageBook && (
        <TTSModal
          readingTheme={readingTheme}
          paragraphs={paragraphs}
          tts={tts}
          onPlay={handlePlay}
          onPause={handlePause}
          onStop={handleStop}
          onPrev={handlePrev}
          onNext={handleNext}
          voices={voices}
          selectedVoice={selectedVoice}
          onVoiceChange={handleVoiceChange}
          rate={rate}
          onRateChange={handleRateChange}
          onClose={() => setShowTTS(false)}
        />
      )}
    </div>
  );
}
