"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { EdgeVoice, TTSState, WordBoundary } from "../lib/types";

interface UseTTSOptions {
  paragraphs: string[];
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
  autoAdvance: boolean;
  onParagraphChange: (index: number) => void;
  onChapterEnd: () => void;
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
  const sessionRef = useRef(0); // incremented on stop to cancel stale callbacks
  const rafRef = useRef<number | null>(null);

  // Load voices on mount
  useEffect(() => {
    window.electronAPI?.ttsGetVoices().then(setVoices).catch(() => {});
  }, []);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      sessionRef.current++;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Word highlight sync loop — updates activeWordIndex based on audio.currentTime
  const startWordTracking = useCallback((boundaries: WordBoundary[]) => {
    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      const ms = audio.currentTime * 1000;
      let idx = -1;
      for (let i = 0; i < boundaries.length; i++) {
        if (ms >= boundaries[i].offset && ms < boundaries[i].offset + boundaries[i].duration) {
          idx = i;
          break;
        }
        if (ms >= boundaries[i].offset) idx = i;
      }
      setActiveWordIndex(idx);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopWordTracking = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Synthesize and play a single paragraph
  const synthesizeAndPlay = useCallback(async (paraIndex: number, session: number) => {
    const text = paragraphs[paraIndex];
    if (!text || text.trim().length === 0) {
      // Skip empty paragraphs
      if (paraIndex < paragraphs.length - 1) {
        // Move to next non-empty paragraph
        const next = paragraphs.findIndex((p, i) => i > paraIndex && p.trim().length > 0);
        if (next !== -1 && session === sessionRef.current) {
          setState(s => ({ ...s, currentParagraph: next }));
          onParagraphChange(next);
          await synthesizeAndPlay(next, session);
        }
      }
      return;
    }

    if (session !== sessionRef.current) return;

    setState({ status: "synthesizing", currentParagraph: paraIndex });
    onParagraphChange(paraIndex);

    try {
      const rateStr = `${rate >= 0 ? "+" : ""}${Math.round((rate - 1) * 100)}%`;
      const pitchStr = `${pitch >= 0 ? "+" : ""}${pitch}Hz`;
      const volStr = `${volume}%`;

      const result = await window.electronAPI?.ttsSynthesize(text, voice, rateStr, pitchStr, volStr);
      if (!result || session !== sessionRef.current) return;

      // Create audio from base64
      const audio = new Audio(`data:audio/mp3;base64,${result.audio}`);
      audioRef.current = audio;

      setWordBoundaries(result.wordBoundaries);
      setActiveWordIndex(-1);

      audio.volume = volume / 100;

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback error"));

        audio.play().then(() => {
          if (session !== sessionRef.current) { audio.pause(); return; }
          setState({ status: "playing", currentParagraph: paraIndex });
          startWordTracking(result.wordBoundaries);
        }).catch(reject);
      });

      // Audio ended naturally
      stopWordTracking();
      setActiveWordIndex(-1);

      if (session !== sessionRef.current) return;

      // Advance to next paragraph
      const nextNonEmpty = paragraphs.findIndex((p, i) => i > paraIndex && p.trim().length > 0);
      if (nextNonEmpty !== -1) {
        await synthesizeAndPlay(nextNonEmpty, session);
      } else {
        // End of chapter
        if (autoAdvance) {
          setState({ status: "idle", currentParagraph: paraIndex });
          setWordBoundaries(null);
          onChapterEnd();
        } else {
          setState({ status: "idle", currentParagraph: paraIndex });
          setWordBoundaries(null);
        }
      }
    } catch {
      if (session === sessionRef.current) {
        setState({ status: "idle", currentParagraph: paraIndex });
        setWordBoundaries(null);
        stopWordTracking();
      }
    }
  }, [paragraphs, voice, rate, pitch, volume, autoAdvance, onParagraphChange, onChapterEnd, startWordTracking, stopWordTracking]);

  // Public actions
  const play = useCallback((fromParagraph?: number) => {
    const session = ++sessionRef.current;
    // Stop any existing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    stopWordTracking();

    const startAt = fromParagraph ?? state.currentParagraph;
    synthesizeAndPlay(startAt, session);
  }, [state.currentParagraph, synthesizeAndPlay, stopWordTracking]);

  const pause = useCallback(() => {
    if (audioRef.current && state.status === "playing") {
      audioRef.current.pause();
      stopWordTracking();
      setState(s => ({ ...s, status: "paused" }));
    }
  }, [state.status, stopWordTracking]);

  const resume = useCallback(() => {
    if (audioRef.current && state.status === "paused") {
      audioRef.current.play();
      setState(s => ({ ...s, status: "playing" }));
      if (wordBoundaries) startWordTracking(wordBoundaries);
    }
  }, [state.status, wordBoundaries, startWordTracking]);

  const stop = useCallback(() => {
    sessionRef.current++;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    stopWordTracking();
    setWordBoundaries(null);
    setActiveWordIndex(-1);
    setState({ status: "idle", currentParagraph: 0 });
  }, [stopWordTracking]);

  const skipNext = useCallback(() => {
    const next = paragraphs.findIndex((p, i) => i > state.currentParagraph && p.trim().length > 0);
    if (next !== -1) {
      play(next);
    }
  }, [paragraphs, state.currentParagraph, play]);

  const skipPrev = useCallback(() => {
    // Find previous non-empty paragraph
    let prev = -1;
    for (let i = state.currentParagraph - 1; i >= 0; i--) {
      if (paragraphs[i].trim().length > 0) { prev = i; break; }
    }
    if (prev !== -1) {
      play(prev);
    }
  }, [paragraphs, state.currentParagraph, play]);

  // Expose play that handles pause/resume toggle
  const togglePlay = useCallback(() => {
    if (state.status === "paused") resume();
    else play();
  }, [state.status, resume, play]);

  return {
    state,
    voices,
    wordBoundaries,
    activeWordIndex,
    actions: {
      play: togglePlay,
      pause,
      stop,
      skipNext,
      skipPrev,
    },
  };
}
