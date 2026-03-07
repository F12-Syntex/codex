"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  ChevronUp,
  ChevronDown,
  Gauge,
} from "lucide-react";
import type { ThemeClasses, ReadingTheme } from "../lib/types";
import type { SpeedReaderChunk } from "@/lib/speed-reader-engine";
import { calculateChunkDuration } from "@/lib/speed-reader-engine";

interface SpeedReaderViewProps {
  theme: ThemeClasses;
  readingTheme: ReadingTheme;
  chunks: SpeedReaderChunk[];
  chapterTitle: string;
  onExit: () => void;
  onChapterEnd: () => void;
  onParagraphChange?: (paraIndex: number) => void;
  /** Reports the highest paragraph index the user has seen */
  onReadProgress?: (paraIndex: number) => void;
}

export function SpeedReaderView({
  theme,
  readingTheme,
  chunks,
  chapterTitle,
  onExit,
  onChapterEnd,
  onParagraphChange,
  onReadProgress,
}: SpeedReaderViewProps) {
  // Playback state
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetWpm, setTargetWpm] = useState(400);
  const [effectiveWpm, setEffectiveWpm] = useState(400);
  const [sessionStart] = useState(() => Date.now());

  // Refs
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chunksPlayedRef = useRef(0);
  const readHighWaterRef = useRef(-1);

  const chunk = chunks[currentIndex] ?? null;

  // -- Progress through chapter --
  const progressPercent = chunks.length > 0
    ? Math.round((currentIndex / chunks.length) * 100)
    : 0;

  // -- Paragraph context --
  const currentParaIndex = chunk?.paraIndex ?? 0;

  // Report read progress when paragraph changes
  useEffect(() => {
    if (currentParaIndex > readHighWaterRef.current) {
      readHighWaterRef.current = currentParaIndex;
      onReadProgress?.(currentParaIndex);
    }
  }, [currentParaIndex, onReadProgress]);

  const paragraphText = useMemo(() => {
    if (!chunk) return "";
    return chunks
      .filter((c) => c.paraIndex === currentParaIndex)
      .map((c) => c.text)
      .join(" ");
  }, [chunks, currentParaIndex, chunk]);

  // Paragraph-level progress
  const paraChunks = useMemo(() => {
    return chunks.filter((c) => c.paraIndex === currentParaIndex);
  }, [chunks, currentParaIndex]);

  const paraProgress = useMemo(() => {
    if (paraChunks.length === 0) return 0;
    const idx = paraChunks.findIndex((c) => chunks.indexOf(c) === currentIndex);
    return idx >= 0 ? (idx + 1) / paraChunks.length : 0;
  }, [paraChunks, chunks, currentIndex]);

  // -- Main playback loop --
  useEffect(() => {
    if (!playing || currentIndex >= chunks.length) return;

    const currentChunk = chunks[currentIndex];
    const sessionMinutes = (Date.now() - sessionStart) / 60000;

    // Calculate warmup factor (0.7 -> 1.0 over first 15 chunks)
    const warmup = Math.min(1, 0.7 + (chunksPlayedRef.current / 15) * 0.3);

    const duration = calculateChunkDuration(currentChunk, {
      targetWpm,
      warmupFactor: warmup,
      sessionMinutes,
    });

    // Update effective WPM display
    const actualWpm =
      currentChunk.wordCount > 0
        ? Math.round((currentChunk.wordCount / duration) * 60000)
        : targetWpm;
    setEffectiveWpm(actualWpm);

    timerRef.current = setTimeout(() => {
      chunksPlayedRef.current++;
      const nextIndex = currentIndex + 1;

      if (nextIndex >= chunks.length) {
        setPlaying(false);
        onChapterEnd();
      } else {
        setCurrentIndex(nextIndex);
        if (chunks[nextIndex].paraIndex !== currentChunk.paraIndex) {
          onParagraphChange?.(chunks[nextIndex].paraIndex);
        }
      }
    }, duration);

    return () => clearTimeout(timerRef.current);
  }, [playing, currentIndex, chunks, targetWpm, sessionStart, onChapterEnd, onParagraphChange]);

  // -- Controls --
  const handlePlayPause = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  const handleRewind = useCallback(() => {
    const currentPara = chunks[currentIndex]?.paraIndex ?? 0;
    const paraStart = chunks.findIndex((c) => c.paraIndex === currentPara);
    if (paraStart >= 0 && paraStart < currentIndex) {
      setCurrentIndex(paraStart);
    } else if (currentIndex > 0) {
      const prevPara = chunks[currentIndex - 1]?.paraIndex ?? 0;
      const prevStart = chunks.findIndex((c) => c.paraIndex === prevPara);
      setCurrentIndex(Math.max(0, prevStart));
    }
  }, [chunks, currentIndex]);

  const handleSkipForward = useCallback(() => {
    const currentPara = chunks[currentIndex]?.paraIndex ?? 0;
    const nextParaChunk = chunks.findIndex(
      (c, i) => i > currentIndex && c.paraIndex !== currentPara
    );
    if (nextParaChunk >= 0) {
      setCurrentIndex(nextParaChunk);
      onParagraphChange?.(chunks[nextParaChunk].paraIndex);
    }
  }, [chunks, currentIndex, onParagraphChange]);

  // -- Keyboard shortcuts --
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Space") {
        e.preventDefault();
        handlePlayPause();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleRewind();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleSkipForward();
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setTargetWpm((w) => Math.min(800, w + 25));
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setTargetWpm((w) => Math.max(100, w - 25));
      }
      if (e.key === "Escape") {
        onExit();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handlePlayPause, handleRewind, handleSkipForward, onExit]);

  // -- Content type styling --
  const chunkStyle = useMemo((): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontSize: "28px",
      lineHeight: 1.4,
    };
    if (!chunk) return base;

    switch (chunk.contentType) {
      case "thought":
        return { ...base, fontStyle: "italic" };
      case "sfx":
        return { ...base, fontSize: "32px", fontWeight: 700 };
      case "system":
        return { ...base, fontFamily: "monospace" };
      case "scene-break":
        return { ...base, opacity: 0.4 };
      default:
        return base;
    }
  }, [chunk]);

  const chunkColorClass = useMemo(() => {
    if (!chunk) return theme.text;
    switch (chunk.contentType) {
      case "sfx":
        return "text-red-400";
      case "system":
        return "text-[var(--accent-brand)]";
      default:
        return theme.text;
    }
  }, [chunk, theme.text]);

  // -- Display: use HTML to preserve formatting + wiki entity colors --
  const displayHtml = useMemo(() => {
    if (!chunk) return "";
    if (chunk.contentType === "scene-break") return "\u00B7 \u00B7 \u00B7";
    return chunk.html;
  }, [chunk]);

  // -- Filled progress blocks --
  const progressBlocks = useMemo(() => {
    const total = 8;
    const filled = Math.round((progressPercent / 100) * total);
    return { filled, total };
  }, [progressPercent]);

  return (
    <div
      className="flex flex-col h-full w-full select-none"
      style={{ position: "relative", background: theme.bgRaw }}
    >
      {/* Scene Header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <span className={`text-xs ${theme.muted}`}>{chapterTitle}</span>
        <button
          onClick={onExit}
          className={`${theme.btn} p-1.5 rounded-lg transition-colors`}
          title="Exit speed reader (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Focal Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-4 overflow-hidden">
        {/* Context strip - full paragraph at low opacity */}
        {paragraphText && chunk?.contentType !== "scene-break" && (
          <p
            className={`absolute text-center max-w-2xl px-8 ${theme.text}`}
            style={{
              opacity: 0.12,
              fontSize: "16px",
              lineHeight: 1.6,
              pointerEvents: "none",
            }}
          >
            {paragraphText}
          </p>
        )}

        {/* Speaker label */}
        {chunk?.speakerName && (
          <div
            className="text-xs font-medium mb-2"
            style={{
              color: chunk.speakerColor || "var(--accent-brand)",
            }}
          >
            {chunk.speakerName}
          </div>
        )}

        {/* Active chunk — rendered as HTML to preserve formatting + wiki entity colors */}
        <div
          key={currentIndex}
          className={`text-center max-w-3xl px-4 ${chunkColorClass}`}
          style={chunkStyle}
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />

        {/* Paragraph progress bar */}
        <div className="mt-6 w-48 h-0.5 rounded-full overflow-hidden bg-white/10">
          <div
            className="h-full bg-[var(--accent-brand)] transition-all duration-200"
            style={{ width: `${paraProgress * 100}%` }}
          />
        </div>
      </div>

      {/* Control Bar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0 border-t border-white/[0.06]"
      >
        {/* Left: playback controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleRewind}
            className={`${theme.btn} p-2 rounded-lg transition-colors`}
            title="Previous paragraph (Left)"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={handlePlayPause}
            className={`${theme.btnActive} p-2 rounded-lg transition-colors`}
            title={playing ? "Pause (Space)" : "Play (Space)"}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={handleSkipForward}
            className={`${theme.btn} p-2 rounded-lg transition-colors`}
            title="Next paragraph (Right)"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Center: WPM controls */}
        <div className="flex items-center gap-2">
          <Gauge className={`h-3.5 w-3.5 ${theme.muted}`} />
          <button
            onClick={() => setTargetWpm((w) => Math.max(100, w - 25))}
            className={`${theme.btn} p-1 rounded-lg transition-colors`}
            title="Decrease WPM (Down)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <span className={`text-sm font-medium tabular-nums min-w-[4ch] text-center ${theme.text}`}>
            {effectiveWpm}
          </span>
          <span className={`text-xs ${theme.muted}`}>WPM</span>
          <button
            onClick={() => setTargetWpm((w) => Math.min(800, w + 25))}
            className={`${theme.btn} p-1 rounded-lg transition-colors`}
            title="Increase WPM (Up)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Right: progress */}
        <div className="flex items-center gap-2">
          <div className="flex gap-px">
            {Array.from({ length: progressBlocks.total }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-3 rounded-sm ${
                  i < progressBlocks.filled
                    ? "bg-[var(--accent-brand)]"
                    : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <span className={`text-xs tabular-nums ${theme.muted}`}>
            {progressPercent}%
          </span>
        </div>
      </div>
    </div>
  );
}
