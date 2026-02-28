"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { EdgeVoice, TTSState, WordBoundary } from "../lib/types";

interface UseTTSOptions {
  paragraphs: string[];
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
  autoAdvance: boolean;
  onParagraphChange?: (index: number) => void;
  onChapterEnd?: () => void;
}

function formatRate(rate: number): string {
  const pct = Math.round((rate - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function formatPitch(pitch: number): string {
  return pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`;
}

function formatVolume(vol: number): string {
  const adj = vol - 100;
  return adj >= 0 ? `+${adj}%` : `${adj}%`;
}

export function useTTS({
  paragraphs,
  voice,
  rate,
  pitch,
  volume,
  autoAdvance,
  onParagraphChange,
  onChapterEnd,
}: UseTTSOptions) {
  const [state, setState] = useState<TTSState>({ status: "idle", currentParagraph: 0 });
  const [voices, setVoices] = useState<EdgeVoice[]>([]);
  const [wordBoundaries, setWordBoundaries] = useState<WordBoundary[] | null>(null);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  // Load voices on mount
  useEffect(() => {
    window.electronAPI
      ?.ttsGetVoices()
      .then((v) => {
        const english = v.filter((vx) => vx.locale.startsWith("en-"));
        setVoices(english);
      })
      .catch(() => {});
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Word tracking animation loop
  const startWordTracking = useCallback((audio: HTMLAudioElement, boundaries: WordBoundary[]) => {
    setWordBoundaries(boundaries);
    setActiveWordIndex(-1);

    const tick = () => {
      if (!audio || audio.paused) return;
      const currentMs = audio.currentTime * 1000;

      let idx = -1;
      for (let i = 0; i < boundaries.length; i++) {
        if (currentMs >= boundaries[i].offset) {
          idx = i;
        } else {
          break;
        }
      }
      setActiveWordIndex(idx);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopWordTracking = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    setWordBoundaries(null);
    setActiveWordIndex(-1);
  }, []);

  // Core synthesis function
  const synthesizeAndPlay = useCallback(
    async (index: number) => {
      if (!window.electronAPI?.ttsSynthesize) return;

      const session = ++sessionRef.current;
      setState({ status: "synthesizing", currentParagraph: index });
      stopWordTracking();
      onParagraphChange?.(index);

      try {
        const result = await window.electronAPI.ttsSynthesize(
          paragraphs[index],
          voice,
          formatRate(rate),
          formatPitch(pitch),
          formatVolume(volume)
        );

        if (sessionRef.current !== session) return; // Cancelled

        const audio = new Audio(`data:audio/mp3;base64,${result.audio}`);
        audioRef.current = audio;

        audio.onended = () => {
          if (sessionRef.current !== session) return;
          stopWordTracking();

          const next = index + 1;
          if (next < paragraphs.length) {
            synthesizeAndPlay(next);
          } else if (autoAdvance) {
            onChapterEnd?.();
          } else {
            setState({ status: "idle", currentParagraph: 0 });
          }
        };

        audio.onerror = () => {
          if (sessionRef.current === session) {
            setState((s) => ({ ...s, status: "idle" }));
            stopWordTracking();
          }
        };

        if (sessionRef.current !== session) return;
        setState({ status: "playing", currentParagraph: index });

        // Start word tracking if boundaries available
        if (result.wordBoundaries && result.wordBoundaries.length > 0) {
          startWordTracking(audio, result.wordBoundaries);
        }

        await audio.play();
      } catch {
        if (sessionRef.current === session) {
          setState((s) => ({ ...s, status: "idle" }));
          stopWordTracking();
        }
      }
    },
    [paragraphs, voice, rate, pitch, volume, autoAdvance, onParagraphChange, onChapterEnd, startWordTracking, stopWordTracking]
  );

  // Actions
  const actions = useMemo(() => ({
    play: (fromParagraph?: number) => {
      const idx = fromParagraph ?? state.currentParagraph;
      if (state.status === "paused" && audioRef.current) {
        setState((s) => ({ ...s, status: "playing" }));
        audioRef.current.play();
        // Resume word tracking
        if (wordBoundaries && audioRef.current) {
          startWordTracking(audioRef.current, wordBoundaries);
        }
      } else {
        synthesizeAndPlay(idx);
      }
    },

    pause: () => {
      if (audioRef.current) {
        audioRef.current.pause();
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = 0;
        }
      }
      setState((s) => ({ ...s, status: "paused" }));
    },

    resume: () => {
      if (audioRef.current && state.status === "paused") {
        setState((s) => ({ ...s, status: "playing" }));
        audioRef.current.play();
        if (wordBoundaries) {
          startWordTracking(audioRef.current, wordBoundaries);
        }
      }
    },

    stop: () => {
      sessionRef.current++;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      stopWordTracking();
      setState({ status: "idle", currentParagraph: 0 });
    },

    skipNext: () => {
      const next = Math.min(paragraphs.length - 1, state.currentParagraph + 1);
      if (state.status === "playing" || state.status === "synthesizing") {
        sessionRef.current++;
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
          audioRef.current = null;
        }
        stopWordTracking();
        synthesizeAndPlay(next);
      } else {
        setState((s) => ({ ...s, currentParagraph: next }));
        onParagraphChange?.(next);
      }
    },

    skipPrev: () => {
      const prev = Math.max(0, state.currentParagraph - 1);
      if (state.status === "playing" || state.status === "synthesizing") {
        sessionRef.current++;
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
          audioRef.current = null;
        }
        stopWordTracking();
        synthesizeAndPlay(prev);
      } else {
        setState((s) => ({ ...s, currentParagraph: prev }));
        onParagraphChange?.(prev);
      }
    },

    setCurrentParagraph: (index: number) => {
      setState((s) => ({ ...s, currentParagraph: index }));
    },
  }), [state, paragraphs.length, wordBoundaries, synthesizeAndPlay, startWordTracking, stopWordTracking, onParagraphChange]);

  return {
    state,
    voices,
    wordBoundaries,
    activeWordIndex,
    actions,
  };
}
