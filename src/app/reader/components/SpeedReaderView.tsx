"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Minus,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/ui/progress-ring";
import type { ThemeClasses } from "../lib/types";
import { ChromeButton, PillDivider, PANEL_SPRING } from "./chrome";
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
  const reduceMotion = useReducedMotion();
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

  const displayText = useMemo(() => {
    if (!chunk) return "";
    if (chunk.contentType === "scene-break") return "\u00B7 \u00B7 \u00B7";
    return chunk.text;
  }, [chunk]);

  const chunkStyle = useMemo((): React.CSSProperties => {
    if (!chunk) return {};
    switch (chunk.contentType) {
      case "thought": return { fontStyle: "italic" };
      case "sfx": return { fontSize: "48px", fontWeight: 700 };
      case "system": return { fontFamily: "var(--font-mono)", fontSize: "30px" };
      default: return {};
    }
  }, [chunk]);

  const chunkColorClass = useMemo(() => {
    if (!chunk) return theme.text;
    switch (chunk.contentType) {
      case "sfx": return "text-danger";
      case "system": return "text-brand";
      case "scene-break": return "text-label-tertiary";
      default: return theme.text;
    }
  }, [chunk, theme.text]);

  // Optimal Recognition Point — the letter the eye should land on.
  const orp = useMemo(() => {
    const text = displayText;
    if (!chunk || chunk.contentType === "scene-break" || !/\p{L}/u.test(text)) {
      return null;
    }
    const len = text.length;
    let idx = len <= 1 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : len <= 13 ? 3 : Math.floor(len * 0.3);
    while (idx < len - 1 && !/[\p{L}\p{N}]/u.test(text[idx])) idx++;
    return { pre: text.slice(0, idx), pivot: text[idx], post: text.slice(idx + 1) };
  }, [chunk, displayText]);

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
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
      className="absolute inset-0 z-20 flex select-none flex-col"
    >
      {/* Paper veil — the page dissolves behind the focus word */}
      <div
        className="pointer-events-none absolute inset-0 backdrop-blur-xl"
        style={{ backgroundColor: "color-mix(in srgb, var(--reader-paper, var(--canvas)) 92%, transparent)" }}
      />

      {/* Top: chapter + exit */}
      <div className="relative z-10 flex h-12 shrink-0 items-center justify-center px-14">
        <span className="truncate text-xs text-label-tertiary">{chapterTitle}</span>
        <ChromeButton onClick={onExit} title="Exit speed reader (Esc)" aria-label="Exit speed reader" className="absolute right-3 top-2">
          <X strokeWidth={1.75} />
        </ChromeButton>
      </div>

      {/* Focal area — RSVP slightly above centre */}
      <div className="relative z-10 flex flex-1 flex-col items-center overflow-hidden px-8">
        <div style={{ flex: "2 1 0" }} />

        {/* Speaker label */}
        <div className="mb-3 h-4 text-xs font-semibold tracking-wide" style={{ color: chunk?.speakerColor || "var(--accent-brand)" }}>
          {chunk?.speakerName ?? ""}
        </div>

        {/* Reticle */}
        <div className="relative w-full max-w-3xl">
          <div className="mx-auto mb-3 flex w-72 items-end justify-center">
            <span className="h-px flex-1 bg-separator-strong" />
            <span className="h-3 w-px bg-brand/60" />
            <span className="h-px flex-1 bg-separator-strong" />
          </div>

          <div
            className={cn("flex w-full items-baseline font-display", chunkColorClass)}
            style={{ fontSize: "40px", lineHeight: 1.3, ...chunkStyle }}
          >
            {orp ? (
              <>
                <span className="min-w-0 flex-1 overflow-hidden whitespace-pre text-right">{orp.pre}</span>
                <span className="text-brand">{orp.pivot}</span>
                <span className="min-w-0 flex-1 overflow-hidden whitespace-pre text-left">{orp.post}</span>
              </>
            ) : (
              <span className="w-full text-center">{displayText}</span>
            )}
          </div>

          <div className="mx-auto mt-3 flex w-72 items-start justify-center">
            <span className="h-px flex-1 bg-separator-strong" />
            <span className="h-3 w-px bg-brand/60" />
            <span className="h-px flex-1 bg-separator-strong" />
          </div>
        </div>

        {/* Paragraph progress */}
        <div className="mt-8 h-1 w-40 overflow-hidden rounded-full bg-fill-secondary">
          <div
            className="h-full origin-left rounded-full bg-brand transition-transform duration-200 ease-apple"
            style={{ transform: `scaleX(${paraProgress})` }}
          />
        </div>

        <div style={{ flex: "3 1 0" }} />
      </div>

      {/* Control pill */}
      <div className="relative z-10 flex shrink-0 justify-center pb-4">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...PANEL_SPRING, delay: 0.05 }}
          className="glass flex h-12 items-center gap-1 rounded-full p-1.5"
        >
          <ChromeButton onClick={handleRewind} title="Previous paragraph (←)" aria-label="Previous paragraph">
            <SkipBack className="fill-current" strokeWidth={1.5} />
          </ChromeButton>
          <motion.button
            onClick={handlePlayPause}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            title={playing ? "Pause (Space)" : "Play (Space)"}
            aria-label={playing ? "Pause" : "Play"}
            className="focus-ring grid size-9 place-items-center rounded-full bg-brand text-brand-fg shadow-[0_0_20px_-6px_var(--accent-brand)] transition-[filter] hover:brightness-110"
          >
            {playing ? <Pause className="size-4 fill-current" strokeWidth={1.5} /> : <Play className="ml-0.5 size-4 fill-current" strokeWidth={1.5} />}
          </motion.button>
          <ChromeButton onClick={handleSkipForward} title="Next paragraph (→)" aria-label="Next paragraph">
            <SkipForward className="fill-current" strokeWidth={1.5} />
          </ChromeButton>

          <PillDivider />

          <ChromeButton compact onClick={() => setTargetWpm((w) => Math.max(200, w - 25))} title="Slower (↓)" aria-label="Decrease words per minute">
            <Minus strokeWidth={2} />
          </ChromeButton>
          <div className="flex w-16 flex-col items-center leading-none" title={`Target ${targetWpm} wpm`}>
            <span className="text-sm font-semibold tabular-nums text-label">{effectiveWpm}</span>
            <span className="mt-0.5 text-2xs uppercase tracking-wide text-label-tertiary">wpm</span>
          </div>
          <ChromeButton compact onClick={() => setTargetWpm((w) => Math.min(800, w + 25))} title="Faster (↑)" aria-label="Increase words per minute">
            <Plus strokeWidth={2} />
          </ChromeButton>

          <PillDivider />

          <div className="flex items-center gap-2 pl-1 pr-2.5">
            <ProgressRing value={progressPercent / 100} size={22} stroke={2.5} aria-label="Chapter progress" />
            <span className="w-8 text-xs tabular-nums text-label-secondary">{progressPercent}%</span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
