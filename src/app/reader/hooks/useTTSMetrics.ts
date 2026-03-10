"use client";

import { useRef } from "react";

/**
 * Per-rate learned metrics, persisted to localStorage.
 * All values updated via EWMA so accuracy improves with every paragraph played.
 */
interface MetricsEntry {
  /** Learned WPM from actual wall-clock playback duration */
  wpm: number;
  wpmSamples: number;
  /** Average synthesis gap between paragraphs (ms) — time from prev audio-end to next audio-start */
  gapMs: number;
  gapSamples: number;
}

type MetricsStore = Record<string, MetricsEntry>;

const STORAGE_KEY = "codex-tts-metrics-v1";

/**
 * EWMA smoothing factor.
 * 0.2 = new observation contributes 20% weight — adapts quickly but stays stable.
 */
const ALPHA = 0.2;

/**
 * Fallback WPM before any samples are collected.
 * Edge TTS produces ~160 WPM at 1x for English voices.
 */
const BASE_WPM = 160;

/** Default synthesis gap for cold-start first paragraphs */
const DEFAULT_GAP_MS = 800;

function defaultWpm(rate: number): number {
  return BASE_WPM * rate;
}

function rateKey(rate: number): string {
  // Round to 2dp for grouping (e.g. 1.25, 1.50, 2.00)
  return rate.toFixed(2);
}

function load(): MetricsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MetricsStore;
  } catch {
    // ignore parse errors
  }
  return {};
}

function save(store: MetricsStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

function ewma(prev: number, next: number): number {
  return prev * (1 - ALPHA) + next * ALPHA;
}

export interface ParagraphTiming {
  /** The ttsRate setting active during playback */
  rate: number;
  /** Number of spoken words (from wordBoundaries length) */
  wordCount: number;
  /** Wall-clock playback duration in ms (audio.play → audio.onended) */
  playbackMs: number;
  /** Gap in ms: time from previous audio-end (or play() call) to this audio-start */
  gapMs: number;
}

export function useTTSMetrics() {
  const storeRef = useRef<MetricsStore>(load());

  /**
   * Record a completed paragraph and update the adaptive model.
   * Called by useTTS after every paragraph finishes playing.
   */
  function record({ rate, wordCount, playbackMs, gapMs }: ParagraphTiming): void {
    const key = rateKey(rate);
    const prev = storeRef.current[key];
    const e: MetricsEntry = prev ?? {
      wpm: defaultWpm(rate),
      wpmSamples: 0,
      gapMs: DEFAULT_GAP_MS,
      gapSamples: 0,
    };

    if (wordCount > 3 && playbackMs > 200) {
      const observedWpm = (wordCount / playbackMs) * 60_000;
      e.wpm = e.wpmSamples === 0 ? observedWpm : ewma(e.wpm, observedWpm);
      e.wpmSamples++;
    }

    if (gapMs >= 0 && gapMs < 15_000) {
      e.gapMs = e.gapSamples === 0 ? gapMs : ewma(e.gapMs, gapMs);
      e.gapSamples++;
    }

    storeRef.current[key] = e;
    save(storeRef.current);
  }

  /**
   * Estimate remaining seconds for TTS playback.
   * Uses learned WPM + gap per paragraph; falls back to defaults before data is collected.
   */
  function estimate(rate: number, wordsRemaining: number, paragraphsRemaining: number): number {
    const key = rateKey(rate);
    const e = storeRef.current[key];
    const wpm = e?.wpmSamples ? e.wpm : defaultWpm(rate);
    const gapMs = e?.gapSamples ? e.gapMs : DEFAULT_GAP_MS;

    const speakSecs = wordsRemaining > 0 ? (wordsRemaining / wpm) * 60 : 0;
    // Current paragraph gap is already accounted for (or happening now), so offset by -1
    const gapSecs = Math.max(0, paragraphsRemaining - 1) * (gapMs / 1000);
    return Math.max(0, speakSecs + gapSecs);
  }

  return { record, estimate };
}
