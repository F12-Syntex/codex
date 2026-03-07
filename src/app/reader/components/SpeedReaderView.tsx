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
import type { ThemeClasses } from "../lib/types";
import type { SpeedReaderChunk } from "@/lib/speed-reader-engine";
import { calculateChunkDuration } from "@/lib/speed-reader-engine";

interface SpeedReaderViewProps {
  theme: ThemeClasses;
  chunks: SpeedReaderChunk[];
  chapterTitle: string;
  onExit: () => void;
  onChapterEnd: () => void;
  onParagraphChange?: (paraIndex: number) => void;
  onReadProgress?: (paraIndex: number) => void;
  /** Reports current chunk for TextContent background highlighting */
  onChunkChange?: (paraIndex: number, chunkText: string, charOffset: number) => void;
}

export function SpeedReaderView({
  theme,
  chunks,
  chapterTitle,
  onExit,
  onChapterEnd,
  onParagraphChange,
  onReadProgress,
  onChunkChange,
}: SpeedReaderViewProps) {
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetWpm, setTargetWpm] = useState(400);
  const [effectiveWpm, setEffectiveWpm] = useState(400);
  const [sessionStart] = useState(() => Date.now());

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chunksPlayedRef = useRef(0);
  const readHighWaterRef = useRef(-1);

  const chunk = chunks[currentIndex] ?? null;
  const currentParaIndex = chunk?.paraIndex ?? 0;

  const progressPercent = chunks.length > 0
    ? Math.round((currentIndex / chunks.length) * 100)
    : 0;

  // Compute character offset of current chunk within its paragraph
  const chunkCharOffset = useMemo(() => {
    if (!chunk) return 0;
    let offset = 0;
    for (let i = 0; i < currentIndex; i++) {
      if (chunks[i].paraIndex === chunk.paraIndex) {
        offset += chunks[i].text.length + 1;
      }
    }
    return offset;
  }, [chunk, chunks, currentIndex]);

  // Report current chunk to parent for background highlighting
  useEffect(() => {
    if (chunk) {
      onChunkChange?.(chunk.paraIndex, chunk.text, chunkCharOffset);
    }
  }, [chunk, chunkCharOffset, onChunkChange]);

  // Report read progress
  useEffect(() => {
    if (currentParaIndex > readHighWaterRef.current) {
      readHighWaterRef.current = currentParaIndex;
      onReadProgress?.(currentParaIndex);
    }
  }, [currentParaIndex, onReadProgress]);

  // Main playback loop
  useEffect(() => {
    if (!playing || currentIndex >= chunks.length) return;

    const currentChunk = chunks[currentIndex];
    const sessionMinutes = (Date.now() - sessionStart) / 60000;

    const duration = calculateChunkDuration(currentChunk, {
      targetWpm,
      chunksPlayed: chunksPlayedRef.current,
      sessionMinutes,
    });

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

  const handlePlayPause = useCallback(() => setPlaying((p) => !p), []);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Space") { e.preventDefault(); handlePlayPause(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); handleRewind(); }
      if (e.key === "ArrowRight") { e.preventDefault(); handleSkipForward(); }
      if (e.key === "ArrowUp") { e.preventDefault(); setTargetWpm((w) => Math.min(800, w + 25)); }
      if (e.key === "ArrowDown") { e.preventDefault(); setTargetWpm((w) => Math.max(200, w - 25)); }
      if (e.key === "Escape") { onExit(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handlePlayPause, handleRewind, handleSkipForward, onExit]);

  const progressBlocks = useMemo(() => {
    const total = 8;
    const filled = Math.round((progressPercent / 100) * total);
    return { filled, total };
  }, [progressPercent]);

  const displayText = useMemo(() => {
    if (!chunk) return "";
    if (chunk.contentType === "scene-break") return "\u00B7 \u00B7 \u00B7";
    return chunk.text;
  }, [chunk]);

  const chunkStyle = useMemo((): React.CSSProperties => {
    if (!chunk) return {};
    switch (chunk.contentType) {
      case "thought": return { fontStyle: "italic" };
      case "sfx": return { fontSize: "42px", fontWeight: 700 };
      case "system": return { fontFamily: "monospace", fontSize: "28px" };
      case "scene-break": return { opacity: 0.4 };
      default: return {};
    }
  }, [chunk]);

  const chunkColorClass = useMemo(() => {
    if (!chunk) return "text-white";
    switch (chunk.contentType) {
      case "sfx": return "text-red-400";
      case "system": return "text-[var(--accent-brand)]";
      default: return "text-white";
    }
  }, [chunk]);

  // Paragraph-level progress
  const paraChunks = useMemo(() => {
    return chunks.filter((c) => c.paraIndex === currentParaIndex);
  }, [chunks, currentParaIndex]);

  const paraProgress = useMemo(() => {
    if (paraChunks.length === 0) return 0;
    const idx = paraChunks.findIndex((c) => chunks.indexOf(c) === currentIndex);
    return idx >= 0 ? (idx + 1) / paraChunks.length : 0;
  }, [paraChunks, chunks, currentIndex]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col select-none">
      {/* Dark scrim over the background page */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "rgba(0, 0, 0, 0.80)" }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2 shrink-0">
        <span className="text-xs text-white/40">{chapterTitle}</span>
        <button
          onClick={onExit}
          className="p-1.5 rounded-lg text-white/30 hover:bg-white/[0.06] hover:text-white/50 transition-colors"
          title="Exit speed reader (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Focal area — RSVP at 40% from top (slightly above centre) */}
      <div className="relative z-10 flex-1 flex flex-col items-center px-4 overflow-hidden">
        {/* Top spacer: 40% of focal area */}
        <div style={{ flex: "2 1 0" }} />

        {/* Speaker label */}
        {chunk?.speakerName && (
          <div
            className="text-xs font-medium mb-2"
            style={{ color: chunk.speakerColor || "var(--accent-brand)" }}
          >
            {chunk.speakerName}
          </div>
        )}

        {/* Active chunk */}
        <div
          key={currentIndex}
          className={`text-center max-w-[60%] px-4 ${chunkColorClass}`}
          style={{ fontSize: "32px", lineHeight: 1.4, ...chunkStyle }}
        >
          {displayText}
        </div>

        {/* Paragraph progress bar */}
        <div className="mt-6 w-48 h-0.5 rounded-full overflow-hidden bg-white/10">
          <div
            className="h-full bg-[var(--accent-brand)] transition-all duration-200"
            style={{ width: `${paraProgress * 100}%` }}
          />
        </div>

        {/* Bottom spacer: 60% of focal area */}
        <div style={{ flex: "3 1 0" }} />
      </div>

      {/* Control bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 shrink-0">
        {/* Left: playback */}
        <div className="flex items-center gap-1">
          <button onClick={handleRewind} className="p-2 rounded-lg text-white/30 hover:bg-white/[0.06] hover:text-white/50 transition-colors" title="Previous paragraph (Left)">
            <SkipBack className="h-4 w-4" />
          </button>
          <button onClick={handlePlayPause} className="p-2 rounded-lg bg-white/[0.08] text-white/60 hover:bg-white/[0.12] transition-colors" title={playing ? "Pause (Space)" : "Play (Space)"}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button onClick={handleSkipForward} className="p-2 rounded-lg text-white/30 hover:bg-white/[0.06] hover:text-white/50 transition-colors" title="Next paragraph (Right)">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Center: WPM */}
        <div className="flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-white/20" />
          <button onClick={() => setTargetWpm((w) => Math.max(200, w - 25))} className="p-1 rounded-lg text-white/30 hover:bg-white/[0.06] hover:text-white/50 transition-colors" title="Decrease WPM (Down)">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-medium tabular-nums min-w-[4ch] text-center text-white/60">
            {effectiveWpm}
          </span>
          <span className="text-xs text-white/30">WPM</span>
          <button onClick={() => setTargetWpm((w) => Math.min(800, w + 25))} className="p-1 rounded-lg text-white/30 hover:bg-white/[0.06] hover:text-white/50 transition-colors" title="Increase WPM (Up)">
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
                  i < progressBlocks.filled ? "bg-[var(--accent-brand)]" : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <span className="text-xs tabular-nums text-white/30">
            {progressPercent}%
          </span>
        </div>
      </div>
    </div>
  );
}
