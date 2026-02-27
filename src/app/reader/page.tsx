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
  Type,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  ChevronDown,
  StopCircle,
  Loader2,
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

const FONT_SIZES = [14, 16, 18, 20, 22];

const PLACEHOLDER_TEXT = [
  "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.",
  "\"My dear Mr. Bennet,\" said his lady to him one day, \"have you heard that Netherfield Park is let at last?\" Mr. Bennet replied that he had not. \"But it is,\" returned she; \"for Mrs. Long has just been here, and she told me all about it.\"",
  "Mr. Bennet was so odd a mixture of quick parts, sarcastic humour, reserve, and caprice, that the experience of three and twenty years had been insufficient to make his wife understand his character. Her mind was less difficult to develop. She was a woman of mean understanding, little information, and uncertain temper. When she was discontented, she fancied herself nervous. The business of her life was to get her daughters married; its solace was visiting and news.",
  "Mr. Bennet was among the earliest of those who waited on Mr. Bingley. He had always intended to visit him, though to the last always assuring his wife that he should not go; and till the evening after the visit was paid she had no knowledge of it. It was then disclosed in the following manner. Observing his second daughter employed in trimming a hat, he suddenly addressed her with:",
  "\"I hope Mr. Bingley will like it, Lizzy.\" \"We are not in a way to know what Mr. Bingley likes,\" said her mother resentfully, \"since we are not to visit.\" \"But you forget, mamma,\" said Elizabeth, \"that we shall meet him at the assemblies, and that Mrs. Long has promised to introduce him.\"",
  "\"I do not believe Mrs. Long will do any such thing. She has two nieces of her own. She is a selfish, hypocritical woman, and I have no opinion of her.\" \"No more have I,\" said Mr. Bennet; \"and I am glad to find that you do not depend on her serving you.\"",
  "They were in fact very fine ladies; not deficient in good humour when they were pleased, nor in the power of being agreeable where they chose it; but proud and conceited. They were rather handsome, had been educated in one of the first private seminaries in town, had a fortune of twenty thousand pounds, were in the habit of spending more than they ought, and of associating with people of rank.",
  "Mr. Bingley had not been of age two years, when he was tempted by an accidental recommendation to look at Netherfield House. He did look at it, and into it for half an hour — was pleased with the situation and the principal rooms, satisfied with what the owner said in its praise, and took it immediately.",
];

/* ── Persisted settings shape ───────────────────────── */

interface ReaderSettings {
  readingTheme: ReadingTheme;
  fontSize: number;
  ttsVoice: string;
  ttsRate: number;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  readingTheme: "dark",
  fontSize: 2,
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
    // Also persist to Electron DB for cross-window access
    window.electronAPI?.setSetting(SETTINGS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

/* ── TTS state shared between panel and content ─────── */

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

/* ── ReaderTextBlock — custom text element ──────────── */

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

/* ── TTS Panel ──────────────────────────────────────── */

function TTSPanel({
  readingTheme,
  paragraphCount,
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
}: {
  readingTheme: ReadingTheme;
  paragraphCount: number;
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
}) {
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowVoicePicker(false);
      }
    };
    if (showVoicePicker) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [showVoicePicker]);

  const voice = voices.find((v) => v.shortName === selectedVoice);

  const btnClass = readingTheme === "dark"
    ? "text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:text-white/15"
    : readingTheme === "sepia"
      ? "text-[#5b4636]/50 hover:bg-[#5b4636]/10 hover:text-[#5b4636]/80 disabled:text-[#5b4636]/15"
      : "text-black/50 hover:bg-black/[0.06] hover:text-black/80 disabled:text-black/15";

  const borderColor = readingTheme === "dark"
    ? "border-white/[0.06]"
    : readingTheme === "sepia"
      ? "border-[#5b4636]/10"
      : "border-black/[0.08]";

  const mutedText = readingTheme === "dark"
    ? "text-white/40"
    : readingTheme === "sepia"
      ? "text-[#5b4636]/40"
      : "text-black/40";

  const surfaceBg = readingTheme === "dark"
    ? "bg-[var(--bg-overlay)]"
    : readingTheme === "sepia"
      ? "bg-[#e0d4bc]"
      : "bg-white";

  const voiceLabel = voice
    ? voice.shortName.split("-").pop()?.replace("Neural", "") ?? voice.shortName
    : "Select voice";

  return (
    <div className={`flex items-center gap-2 border-t px-4 py-2 ${borderColor}`}>
      {/* Voice selector */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowVoicePicker((v) => !v)}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${btnClass}`}
        >
          <Volume2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="max-w-[100px] truncate">{voiceLabel}</span>
          <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
        </button>

        {showVoicePicker && (
          <div
            className={`absolute bottom-full left-0 mb-1 max-h-[200px] w-[260px] overflow-y-auto rounded-lg border p-1 shadow-lg shadow-black/30 ${borderColor} ${surfaceBg}`}
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
              <p className={`px-2 py-3 text-center text-[11px] ${mutedText}`}>
                Loading voices...
              </p>
            )}
          </div>
        )}
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onPrev}
          disabled={tts.currentParagraph === 0 && !tts.isPlaying}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${btnClass}`}
        >
          <SkipBack className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>

        {tts.isSynthesizing ? (
          <div className={`flex h-7 w-7 items-center justify-center ${mutedText}`}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
          </div>
        ) : tts.isPlaying ? (
          <button
            onClick={onPause}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${btnClass}`}
          >
            <Pause className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        ) : (
          <button
            onClick={onPlay}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${btnClass}`}
          >
            <Play className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}

        {(tts.isPlaying || tts.isPaused) && (
          <button
            onClick={onStop}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${btnClass}`}
          >
            <StopCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}

        <button
          onClick={onNext}
          disabled={tts.currentParagraph >= paragraphCount - 1 && !tts.isPlaying}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${btnClass}`}
        >
          <SkipForward className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Paragraph indicator */}
      <span className={`text-[11px] ${mutedText}`}>
        {tts.currentParagraph + 1} / {paragraphCount}
      </span>

      {/* Speed control — only applied on next synthesis, no pitch shift */}
      <div className="ml-auto flex items-center gap-1.5">
        <span className={`text-[11px] ${mutedText}`}>Speed</span>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.25}
          value={rate}
          onChange={(e) => onRateChange(parseFloat(e.target.value))}
          className="h-1 w-16 cursor-pointer accent-[var(--accent-brand)]"
        />
        <span className={`w-[32px] text-right text-[11px] tabular-nums ${mutedText}`}>
          {rate.toFixed(2).replace(/0$/, "")}x
        </span>
      </div>
    </div>
  );
}

/* ── Reader Content ─────────────────────────────────── */

function ReaderContent() {
  const searchParams = useSearchParams();
  const title = searchParams.get("title") || "Untitled";
  const author = searchParams.get("author") || "Unknown Author";

  // Load persisted settings
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>("dark");
  const [fontSize, setFontSize] = useState(2);
  const [currentPage, setCurrentPage] = useState(1);
  const [maximized, setMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // TTS state
  const [tts, setTTS] = useState<TTSState>({
    isPlaying: false,
    isPaused: false,
    isSynthesizing: false,
    currentParagraph: 0,
  });
  const [voices, setVoices] = useState<EdgeVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("en-US-AriaNeural");
  const [rate, setRate] = useState(1.0);

  // Audio refs — speed is handled entirely by Edge TTS server-side (no pitch shift)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentParaRef = useRef(0);
  const cancelledRef = useRef(false);
  const rateRef = useRef(1.0);
  const voiceRef = useRef("en-US-AriaNeural");
  // Session ID to invalidate stale onended callbacks
  const sessionRef = useRef(0);

  const contentRef = useRef<HTMLDivElement>(null);
  const totalPages = 42;
  const theme = THEME_STYLES[readingTheme];

  // ── Load persisted settings on mount ─────────────
  useEffect(() => {
    // Try localStorage first, then Electron DB
    const stored = loadSettings();
    setReadingTheme(stored.readingTheme);
    setFontSize(stored.fontSize);
    setSelectedVoice(stored.ttsVoice);
    voiceRef.current = stored.ttsVoice;
    setRate(stored.ttsRate);
    rateRef.current = stored.ttsRate;

    // Also try loading from Electron DB (overrides localStorage if present)
    window.electronAPI?.getSetting(SETTINGS_KEY).then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val) as Partial<ReaderSettings>;
          if (parsed.readingTheme) setReadingTheme(parsed.readingTheme);
          if (parsed.fontSize !== undefined) setFontSize(parsed.fontSize);
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

  // ── Persist helpers (debounced) ──────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSettings = useCallback((patch: Partial<ReaderSettings>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveSettings(patch), 300);
  }, []);

  // Wrap setters with persistence
  const handleThemeChange = useCallback((t: ReadingTheme) => {
    setReadingTheme(t);
    persistSettings({ readingTheme: t });
  }, [persistSettings]);

  const handleFontSizeChange = useCallback((fn: (prev: number) => number) => {
    setFontSize((prev) => {
      const next = fn(prev);
      persistSettings({ fontSize: next });
      return next;
    });
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

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  // Convert rate number to Edge TTS rate string
  const rateToStr = (r: number) => {
    const pct = Math.round((r - 1) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  };

  // Use a ref for the synthesize function so onended always calls the latest version
  const synthesizeAndPlayRef = useRef<((index: number) => Promise<void>) | null>(null);

  const synthesizeAndPlay = useCallback(async (index: number) => {
    if (!window.electronAPI?.ttsSynthesize) return;

    // Bump session to invalidate any prior onended callbacks
    const session = ++sessionRef.current;
    cancelledRef.current = false;
    currentParaRef.current = index;
    setTTS({ isPlaying: false, isPaused: false, isSynthesizing: true, currentParagraph: index });

    // Read rate/voice from refs at call time (not from closure)
    const currentRate = rateRef.current;
    const currentVoice = voiceRef.current;

    try {
      const base64 = await window.electronAPI.ttsSynthesize(
        PLACEHOLDER_TEXT[index],
        currentVoice,
        rateToStr(currentRate),
      );

      // Stale check
      if (sessionRef.current !== session) return;

      // Create audio element from base64 mp3
      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audioRef.current = audio;

      audio.onended = () => {
        // Only auto-advance if this is still the active session
        if (sessionRef.current !== session) return;
        const next = currentParaRef.current + 1;
        if (next < PLACEHOLDER_TEXT.length) {
          // Call via ref to always get the latest function
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
  }, []);

  // Keep the ref in sync
  synthesizeAndPlayRef.current = synthesizeAndPlay;

  const handlePlay = useCallback(() => {
    if (tts.isPaused && audioRef.current) {
      // Resume paused audio — re-attach onended since session is same
      setTTS((s) => ({ ...s, isPlaying: true, isPaused: false }));
      audioRef.current.play();
    } else {
      synthesizeAndPlay(currentParaRef.current);
    }
  }, [tts.isPaused, synthesizeAndPlay]);

  const handlePause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    // Don't bump session — we want to resume this same audio
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
    const next = Math.min(PLACEHOLDER_TEXT.length - 1, currentParaRef.current + 1);
    currentParaRef.current = next;
    if (tts.isPlaying || tts.isSynthesizing) {
      stopPlayback();
      synthesizeAndPlay(next);
    } else {
      sessionRef.current++;
      stopPlayback();
      setTTS((s) => ({ ...s, isPaused: false, currentParagraph: next }));
    }
  }, [tts.isPlaying, tts.isSynthesizing, stopPlayback, synthesizeAndPlay]);

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
    // Speed applies on next synthesis — no live pitch shift
  }, [persistSettings]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      } else if (e.key === "ArrowRight" && currentPage < totalPages) {
        setCurrentPage((p) => p + 1);
      } else if (e.key === " " && !e.repeat) {
        e.preventDefault();
        if (tts.isPlaying) handlePause();
        else handlePlay();
      } else if (e.key === "Escape") {
        if (tts.isPlaying || tts.isPaused) {
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
  }, [currentPage, totalPages, isFullscreen, tts.isPlaying, tts.isPaused, handlePause, handlePlay, handleStop]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const progress = (currentPage / totalPages) * 100;

  // Don't render until settings are loaded to avoid flash of defaults
  if (!settingsLoaded) return null;

  return (
    <div className={`flex h-screen flex-col ${theme.bg} transition-colors duration-300`}>
      {/* ── Top bar (always visible) ───────────────── */}
      <header
        className={`flex h-11 shrink-0 items-center border-b ${theme.surface} backdrop-blur-md ${
          readingTheme === "dark"
            ? "border-white/[0.04]"
            : readingTheme === "sepia"
              ? "border-[#5b4636]/10"
              : "border-black/[0.06]"
        }`}
      >
        <div className="app-drag-region flex h-full flex-1 items-center gap-2 pl-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`truncate text-[13px] font-medium ${theme.text}`}>
              {title}
            </span>
            <span className={`shrink-0 text-[11px] ${theme.mutedText}`}>
              {author}
            </span>
          </div>
        </div>

        <div className="no-drag flex items-center gap-1">
          <div className={`flex items-center gap-0.5 rounded-lg p-0.5 ${
            readingTheme === "dark"
              ? "bg-white/[0.06]"
              : readingTheme === "sepia"
                ? "bg-[#5b4636]/10"
                : "bg-black/[0.06]"
          }`}>
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

          <div className="ml-1 flex items-center gap-0.5">
            <button
              onClick={() => handleFontSizeChange((s) => Math.max(0, s - 1))}
              disabled={fontSize === 0}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                readingTheme === "dark"
                  ? "text-white/40 hover:bg-white/[0.06] hover:text-white/70 disabled:text-white/15"
                  : readingTheme === "sepia"
                    ? "text-[#5b4636]/40 hover:bg-[#5b4636]/10 hover:text-[#5b4636]/70 disabled:text-[#5b4636]/15"
                    : "text-black/40 hover:bg-black/[0.06] hover:text-black/70 disabled:text-black/15"
              }`}
            >
              <Type className="h-3 w-3" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => handleFontSizeChange((s) => Math.min(FONT_SIZES.length - 1, s + 1))}
              disabled={fontSize === FONT_SIZES.length - 1}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                readingTheme === "dark"
                  ? "text-white/40 hover:bg-white/[0.06] hover:text-white/70 disabled:text-white/15"
                  : readingTheme === "sepia"
                    ? "text-[#5b4636]/40 hover:bg-[#5b4636]/10 hover:text-[#5b4636]/70 disabled:text-[#5b4636]/15"
                    : "text-black/40 hover:bg-black/[0.06] hover:text-black/70 disabled:text-black/15"
              }`}
            >
              <Type className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <button
            onClick={toggleFullscreen}
            className={`ml-1 flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
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
        <article
          className="mx-auto max-w-2xl px-8 py-12"
          style={{ fontSize: `${FONT_SIZES[fontSize]}px` }}
        >
          <h2
            className={`mb-8 text-center text-sm font-medium uppercase tracking-widest ${theme.mutedText}`}
          >
            Chapter 1
          </h2>

          <div className={`space-y-6 leading-relaxed ${theme.text}`}>
            {PLACEHOLDER_TEXT.map((text, i) => (
              <ReaderTextBlock key={i} index={i} tts={tts} readingTheme={readingTheme}>
                {text}
              </ReaderTextBlock>
            ))}
          </div>
        </article>
      </div>

      {/* ── Bottom bar ─────────────────────────────── */}
      <footer
        className={`shrink-0 border-t ${
          readingTheme === "dark"
            ? "border-white/[0.04]"
            : readingTheme === "sepia"
              ? "border-[#5b4636]/10"
              : "border-black/[0.06]"
        }`}
      >
        <div className={`h-[2px] w-full ${
          readingTheme === "dark"
            ? "bg-white/[0.06]"
            : readingTheme === "sepia"
              ? "bg-[#5b4636]/10"
              : "bg-black/[0.06]"
        }`}>
          <div
            className="h-full bg-[var(--accent-brand)] transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <TTSPanel
          readingTheme={readingTheme}
          paragraphCount={PLACEHOLDER_TEXT.length}
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
        />

        <div className={`flex items-center justify-between border-t px-4 py-2 ${
          readingTheme === "dark"
            ? "border-white/[0.04]"
            : readingTheme === "sepia"
              ? "border-[#5b4636]/10"
              : "border-black/[0.06]"
        } ${theme.surface} backdrop-blur-md`}>
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              readingTheme === "dark"
                ? "text-white/40 hover:bg-white/[0.06] hover:text-white/70 disabled:text-white/15"
                : readingTheme === "sepia"
                  ? "text-[#5b4636]/40 hover:bg-[#5b4636]/10 hover:text-[#5b4636]/70 disabled:text-[#5b4636]/15"
                  : "text-black/40 hover:bg-black/[0.06] hover:text-black/70 disabled:text-black/15"
            }`}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>

          <span className={`text-[11px] ${theme.mutedText}`}>
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              readingTheme === "dark"
                ? "text-white/40 hover:bg-white/[0.06] hover:text-white/70 disabled:text-white/15"
                : readingTheme === "sepia"
                  ? "text-[#5b4636]/40 hover:bg-[#5b4636]/10 hover:text-[#5b4636]/70 disabled:text-[#5b4636]/15"
                  : "text-black/40 hover:bg-black/[0.06] hover:text-black/70 disabled:text-black/15"
            }`}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </footer>
    </div>
  );
}
