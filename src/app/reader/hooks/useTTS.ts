"use client";

/**
 * useTTS — Edge TTS playback over the pipeline's SPEECH projection (AI_AUDIT §4.5, S2-8/S2-9).
 *
 * - Items are the displayed paragraphs' `RenderedPara.speech` (lexicon(speech) applied,
 *   `[data-tts-skip]` speaker badges excluded), so TTS reads exactly what's on the page.
 * - Position is tracked by ParaId and every long-running chain reads REFS only. When the variant
 *   changes mid-playback (concise/formatting lands), the current paragraph finishes and playback
 *   continues after `resolveIndex(currentParaId)` in the NEW items.
 * - Edge word boundaries are aligned to speech tokens (`alignBoundaries`); each token knows the
 *   DOM word it came from (`domWord`), which the page highlights with `wordRangesInNodes`.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { ParaId, SpeechToken } from "@shared/pipeline/types";
import { alignBoundaries } from "@shared/pipeline/speech";
import type { EdgeVoice, TTSState, WordBoundary } from "../lib/types";
import type { ParagraphTiming } from "./useTTSMetrics";

/** One speakable paragraph, in page order. */
export interface TTSItem {
  id: ParaId;
  /** Index of the paragraph element on the page (`data-para-idx`). */
  index: number;
  text: string;
  tokens: SpeechToken[];
}

interface UseTTSOptions {
  items: TTSItem[];
  /**
   * Index into `items` of the item that now shows paragraph `id` (merge host / next visible),
   * or -1. Used after a variant swap; defaults to an exact id lookup.
   */
  resolveIndex?: (id: ParaId, items: TTSItem[]) => number;
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
  autoAdvance: boolean;
  onChapterEnd: () => void;
  /** A paragraph was read to the end (read marks, frontier). */
  onParagraphDone?: (item: TTSItem) => void;
  onParagraphTiming?: (timing: ParagraphTiming) => void;
}

interface SynthResult {
  audio: string;
  wordBoundaries: WordBoundary[];
}

export interface TTSPlaybackState extends TTSState {
  /** ParaId being read (null when idle). */
  currentParaId: ParaId | null;
}

/** Returns true if the text has no speakable content (empty, whitespace, or punctuation-only) */
export function isSpeakable(text: string | undefined): boolean {
  if (!text) return false;
  return text.replace(/[\s\p{P}\p{S}]/gu, "").length > 0;
}

const exactIndex = (id: ParaId, items: TTSItem[]) => items.findIndex((it) => it.id === id);

/** First speakable item at or after `from`, or -1. */
function nextSpeakableIn(list: TTSItem[], from: number): number {
  for (let i = Math.max(0, from); i < list.length; i++) if (isSpeakable(list[i].text)) return i;
  return -1;
}

const cacheKey = (it: TTSItem) => `${it.id}\u0000${it.text}`;

export function useTTS({
  items,
  resolveIndex,
  voice,
  rate,
  pitch,
  volume,
  autoAdvance,
  onChapterEnd,
  onParagraphDone,
  onParagraphTiming,
}: UseTTSOptions) {
  const [state, setState] = useState<TTSPlaybackState>({ status: "idle", currentParagraph: 0, currentParaId: null });
  const [voices, setVoices] = useState<EdgeVoice[]>([]);
  /** The item being spoken (as synthesized) and the token under the playhead. */
  const [playing, setPlaying] = useState<{ item: TTSItem; token: number } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const currentIdRef = useRef<ParaId | null>(null);
  const boundaryTokensRef = useRef<{ start: number; end: number; token: number }[] | null>(null);
  const prefetchCache = useRef<Map<string, Promise<SynthResult | null>>>(new Map());
  const lastAudioEndRef = useRef<number | null>(null);

  // Everything long-running reads refs (S2-8: no stale closures).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const resolveRef = useRef(resolveIndex ?? exactIndex);
  resolveRef.current = resolveIndex ?? exactIndex;
  const autoAdvanceRef = useRef(autoAdvance);
  autoAdvanceRef.current = autoAdvance;
  const onChapterEndRef = useRef(onChapterEnd);
  onChapterEndRef.current = onChapterEnd;
  const onParagraphDoneRef = useRef(onParagraphDone);
  onParagraphDoneRef.current = onParagraphDone;
  const onParagraphTimingRef = useRef(onParagraphTiming);
  onParagraphTimingRef.current = onParagraphTiming;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const pitchRef = useRef(pitch);
  pitchRef.current = pitch;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    window.electronAPI?.ttsGetVoices().then(setVoices).catch(() => {});
  }, []);

  // Voice settings changed: cached audio no longer matches.
  useEffect(() => {
    prefetchCache.current.clear();
  }, [voice, rate, pitch, volume]);

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

  const stopWordTracking = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startWordTracking = useCallback((item: TTSItem) => {
    const spans = boundaryTokensRef.current;
    if (!spans) return;
    let last = -2;
    const tick = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (!audio.paused) {
        const ms = audio.currentTime * 1000;
        const ahead = ms + 20;
        let tok = -1;
        for (const s of spans) {
          if (ahead >= s.start && ahead < s.end) { tok = s.token; break; }
        }
        if (tok === -1) {
          for (let i = spans.length - 1; i >= 0; i--) {
            if (ms >= spans[i].start) { tok = spans[i].token; break; }
          }
        }
        if (tok !== last) {
          last = tok;
          setPlaying({ item, token: tok });
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const callTTSAPI = useCallback((text: string): Promise<SynthResult | null> => {
    const ttsRate = Math.min(rateRef.current, 2);
    const rateStr = `${ttsRate >= 0 ? "+" : ""}${Math.round((ttsRate - 1) * 100)}%`;
    const pitchStr = `${pitchRef.current >= 0 ? "+" : ""}${pitchRef.current}Hz`;
    const volStr = `${volumeRef.current}%`;
    return window.electronAPI?.ttsSynthesize(text, voiceRef.current, rateStr, pitchStr, volStr) ?? Promise.resolve(null);
  }, []);

  const synthesize = useCallback((it: TTSItem): Promise<SynthResult | null> => {
    const key = cacheKey(it);
    const cached = prefetchCache.current.get(key);
    if (cached) {
      prefetchCache.current.delete(key);
      return cached;
    }
    return isSpeakable(it.text) ? callTTSAPI(it.text) : Promise.resolve(null);
  }, [callTTSAPI]);

  /** Where to continue after `id` finished: resolves through a variant swap. */
  const nextAfter = useCallback((id: ParaId, sourceIndex: number): number => {
    const list = itemsRef.current;
    let i = exactIndex(id, list);
    if (i >= 0) return nextSpeakableIn(itemsRef.current, i + 1);
    i = resolveRef.current(id, list);
    if (i < 0) {
      // Unknown id: continue at the first item after the old position.
      const k = list.findIndex((it) => it.index > sourceIndex);
      return k < 0 ? -1 : nextSpeakableIn(itemsRef.current, k);
    }
    // Dropped → the resolved paragraph hasn't been read yet; merged → its host already has.
    return nextSpeakableIn(itemsRef.current, list[i].index > sourceIndex ? i : i + 1);
  }, []);

  const prefetch = useCallback((after: number) => {
    const n = nextSpeakableIn(itemsRef.current, after + 1);
    if (n < 0) return;
    const it = itemsRef.current[n];
    const key = cacheKey(it);
    if (!prefetchCache.current.has(key)) prefetchCache.current.set(key, callTTSAPI(it.text));
  }, [callTTSAPI]);

  const speak = useCallback(async (at: number, session: number): Promise<void> => {
    const it = itemsRef.current[at];
    if (!it || session !== sessionRef.current) return;
    currentIdRef.current = it.id;
    setState({ status: "synthesizing", currentParagraph: it.index, currentParaId: it.id });
    setPlaying({ item: it, token: -1 });

    try {
      const gapStart = lastAudioEndRef.current ?? Date.now();
      const result = await synthesize(it);
      if (session !== sessionRef.current) return;
      if (!result) {
        const n = nextAfter(it.id, it.index);
        if (n >= 0) return speak(n, session);
        throw new Error("synthesis failed");
      }
      prefetch(at);

      const words = result.wordBoundaries.filter((b) => (b as { type?: string }).type !== "SentenceBoundary");
      const map = alignBoundaries(it.tokens, it.text, words);
      boundaryTokensRef.current = words.map((b, i) => ({ start: b.offset / 10_000, end: (b.offset + b.duration) / 10_000, token: map[i] }));

      const audio = new Audio(`data:audio/mp3;base64,${result.audio}`);
      audioRef.current = audio;
      audio.volume = volumeRef.current / 100;
      audio.playbackRate = rateRef.current / Math.min(rateRef.current, 2);

      let audioStartMs = 0;
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback error"));
        audio.play().then(() => {
          if (session !== sessionRef.current) { audio.pause(); resolve(); return; }
          audioStartMs = Date.now();
          setState({ status: "playing", currentParagraph: it.index, currentParaId: it.id });
          startWordTracking(it);
        }).catch(reject);
      });
      stopWordTracking();
      if (session !== sessionRef.current) return;

      const audioEndMs = Date.now();
      lastAudioEndRef.current = audioEndMs;
      if (audioStartMs > 0) {
        onParagraphTimingRef.current?.({
          rate: rateRef.current,
          wordCount: words.length,
          playbackMs: audioEndMs - audioStartMs,
          gapMs: audioStartMs - gapStart,
        });
      }
      onParagraphDoneRef.current?.(it);

      const n = nextAfter(it.id, it.index);
      if (n >= 0) return speak(n, session);
      setState({ status: "idle", currentParagraph: it.index, currentParaId: null });
      setPlaying(null);
      currentIdRef.current = null;
      if (autoAdvanceRef.current) onChapterEndRef.current();
    } catch {
      if (session === sessionRef.current) {
        stopWordTracking();
        setState({ status: "idle", currentParagraph: it.index, currentParaId: null });
        setPlaying(null);
      }
    }
  }, [synthesize, nextAfter, prefetch, startWordTracking, stopWordTracking]);

  /** Start at the first speakable item at or after page paragraph `index` (default: current). */
  const playFrom = useCallback((index?: number) => {
    const session = ++sessionRef.current;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    stopWordTracking();
    prefetchCache.current.clear();
    const list = itemsRef.current;
    let at: number;
    if (index === undefined) {
      const cur = currentIdRef.current;
      at = cur ? Math.max(0, exactIndex(cur, list)) : 0;
    } else {
      at = list.findIndex((it) => it.index >= index);
    }
    at = at < 0 ? -1 : nextSpeakableIn(itemsRef.current, at);
    if (at < 0) return;
    void speak(at, session);
  }, [speak, stopWordTracking]);

  const pause = useCallback(() => {
    if (audioRef.current && state.status === "playing") {
      audioRef.current.pause();
      stopWordTracking();
      setState((s) => ({ ...s, status: "paused" }));
    }
  }, [state.status, stopWordTracking]);

  const resume = useCallback(() => {
    if (audioRef.current && state.status === "paused") {
      void audioRef.current.play();
      setState((s) => ({ ...s, status: "playing" }));
      if (playing) startWordTracking(playing.item);
    }
  }, [state.status, playing, startWordTracking]);

  const stop = useCallback(() => {
    sessionRef.current++;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    stopWordTracking();
    prefetchCache.current.clear();
    boundaryTokensRef.current = null;
    currentIdRef.current = null;
    lastAudioEndRef.current = null;
    setPlaying(null);
    setState({ status: "idle", currentParagraph: 0, currentParaId: null });
  }, [stopWordTracking]);

  const skipNext = useCallback(() => {
    const cur = currentIdRef.current;
    const list = itemsRef.current;
    const i = cur ? exactIndex(cur, list) : -1;
    const n = nextSpeakableIn(itemsRef.current, i + 1);
    if (n >= 0) playFrom(list[n].index);
  }, [playFrom]);

  const skipPrev = useCallback(() => {
    const cur = currentIdRef.current;
    const list = itemsRef.current;
    const i = cur ? exactIndex(cur, list) : -1;
    for (let k = i - 1; k >= 0; k--) {
      if (isSpeakable(list[k].text)) {
        playFrom(list[k].index);
        return;
      }
    }
  }, [playFrom]);

  const togglePlay = useCallback(() => {
    if (state.status === "paused") resume();
    else playFrom();
  }, [state.status, resume, playFrom]);

  /**
   * DOM word to highlight. The token index is mapped through the CURRENT items, so after a
   * variant swap (e.g. a speaker badge added) the highlight follows the new markup; when the
   * paragraph's speech text itself changed, there is no reliable word → no word highlight.
   */
  const activeWordIndex = useMemo(() => {
    if (!playing || playing.token < 0) return -1;
    const now = items.find((it) => it.id === playing.item.id);
    const src = now && now.text === playing.item.text ? now : null;
    return src?.tokens[playing.token]?.domWord ?? -1;
  }, [playing, items]);

  return {
    state,
    voices,
    activeWordIndex,
    actions: {
      play: togglePlay,
      playFrom,
      pause,
      stop,
      skipNext,
      skipPrev,
    },
  };
}
