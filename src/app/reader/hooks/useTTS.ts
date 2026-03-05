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

interface SynthResult {
  audio: string;
  wordBoundaries: WordBoundary[];
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
  // Tracks the current/target paragraph synchronously for rapid skip support
  const currentParaRef = useRef(0);

  // Prefetch cache: stores pre-synthesized result for the next paragraph
  const prefetchCache = useRef<Map<number, Promise<SynthResult | null>>>(new Map());

  // Refs for callbacks/options to avoid stale closures in long-running synthesis chains
  const autoAdvanceRef = useRef(autoAdvance);
  autoAdvanceRef.current = autoAdvance;
  const onChapterEndRef = useRef(onChapterEnd);
  onChapterEndRef.current = onChapterEnd;
  const onParagraphChangeRef = useRef(onParagraphChange);
  onParagraphChangeRef.current = onParagraphChange;

  // Keep refs for synthesis params so prefetch uses current values
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const pitchRef = useRef(pitch);
  pitchRef.current = pitch;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;

  // Load voices on mount
  useEffect(() => {
    window.electronAPI?.ttsGetVoices().then(setVoices).catch(() => {});
  }, []);

  // Clear prefetch cache when paragraphs or voice settings change
  useEffect(() => {
    prefetchCache.current.clear();
  }, [paragraphs, voice, rate, pitch, volume]);

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
    // Edge TTS returns offsets in 100-nanosecond ticks — convert to milliseconds
    const msb = boundaries.map(b => ({
      start: b.offset / 10_000,
      end: (b.offset + b.duration) / 10_000,
    }));
    let lastIdx = -1;
    const tick = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (!audio.paused) {
        const ms = audio.currentTime * 1000;
        // Find the word whose time range contains the current playback position.
        // Use a small look-ahead (20ms) so the highlight arrives just as the word is spoken.
        const ahead = ms + 20;
        let idx = -1;
        for (let i = 0; i < msb.length; i++) {
          if (ahead >= msb[i].start && ahead < msb[i].end) { idx = i; break; }
        }
        // Fallback: pick the last word whose start we've already passed
        if (idx === -1) {
          for (let i = msb.length - 1; i >= 0; i--) {
            if (ms >= msb[i].start) { idx = i; break; }
          }
        }
        if (idx !== lastIdx) lastIdx = idx;
        setActiveWordIndex(idx);
      }
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

  // Call Edge TTS API
  const callTTSAPI = useCallback((text: string): Promise<SynthResult | null> => {
    const rateStr = `${rateRef.current >= 0 ? "+" : ""}${Math.round((rateRef.current - 1) * 100)}%`;
    const pitchStr = `${pitchRef.current >= 0 ? "+" : ""}${pitchRef.current}Hz`;
    const volStr = `${volumeRef.current}%`;
    return window.electronAPI?.ttsSynthesize(text, voiceRef.current, rateStr, pitchStr, volStr) ?? Promise.resolve(null);
  }, []);

  // Synthesize a paragraph (uses cache if available, otherwise calls API)
  const synthesize = useCallback((paraIndex: number): Promise<SynthResult | null> => {
    const cached = prefetchCache.current.get(paraIndex);
    if (cached) {
      prefetchCache.current.delete(paraIndex);
      return cached;
    }

    const text = paragraphsRef.current[paraIndex];
    if (!text || text.trim().length === 0) return Promise.resolve(null);

    return callTTSAPI(text);
  }, [callTTSAPI]);

  // Kick off prefetch for the next non-empty paragraph
  const prefetchNext = useCallback((afterIndex: number) => {
    const paras = paragraphsRef.current;
    const next = paras.findIndex((p, i) => i > afterIndex && p.trim().length > 0);
    if (next === -1 || prefetchCache.current.has(next)) return;

    const text = paras[next];
    if (!text || text.trim().length === 0) return;

    const promise = callTTSAPI(text);
    prefetchCache.current.set(next, promise);
  }, [callTTSAPI]);

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
          onParagraphChangeRef.current(next);
          await synthesizeAndPlay(next, session);
        }
      }
      return;
    }

    if (session !== sessionRef.current) return;

    currentParaRef.current = paraIndex;
    setState({ status: "synthesizing", currentParagraph: paraIndex });
    onParagraphChangeRef.current(paraIndex);

    try {
      const result = await synthesize(paraIndex);
      if (!result || session !== sessionRef.current) return;

      // Start prefetching the next paragraph while this one plays
      prefetchNext(paraIndex);

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
        setState({ status: "idle", currentParagraph: paraIndex });
        setWordBoundaries(null);
        if (autoAdvanceRef.current) {
          onChapterEndRef.current();
        }
      }
    } catch {
      if (session === sessionRef.current) {
        setState({ status: "idle", currentParagraph: paraIndex });
        setWordBoundaries(null);
        stopWordTracking();
      }
    }
  }, [paragraphs, volume, startWordTracking, stopWordTracking, synthesize, prefetchNext]);

  // Public actions
  const play = useCallback((fromParagraph?: number) => {
    const session = ++sessionRef.current;
    // Stop any existing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    stopWordTracking();
    prefetchCache.current.clear();

    const startAt = fromParagraph ?? currentParaRef.current;
    // Immediately mark as synthesizing so the UI doesn't flash to idle
    currentParaRef.current = startAt;
    setState({ status: "synthesizing", currentParagraph: startAt });
    setActiveWordIndex(-1);
    synthesizeAndPlay(startAt, session);
  }, [synthesizeAndPlay, stopWordTracking]);

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
    prefetchCache.current.clear();
    setWordBoundaries(null);
    setActiveWordIndex(-1);
    currentParaRef.current = 0;
    setState({ status: "idle", currentParagraph: 0 });
  }, [stopWordTracking]);

  const skipNext = useCallback(() => {
    // Use ref for immediate reads — React state may be stale during rapid skips
    const cur = currentParaRef.current;
    const next = paragraphs.findIndex((p, i) => i > cur && p.trim().length > 0);
    if (next !== -1) {
      play(next);
    }
  }, [paragraphs, play]);

  const skipPrev = useCallback(() => {
    const cur = currentParaRef.current;
    let prev = -1;
    for (let i = cur - 1; i >= 0; i--) {
      if (paragraphs[i].trim().length > 0) { prev = i; break; }
    }
    if (prev !== -1) {
      play(prev);
    }
  }, [paragraphs, play]);

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
      playFrom: play,
      pause,
      stop,
      skipNext,
      skipPrev,
    },
  };
}
