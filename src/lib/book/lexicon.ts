/**
 * Per-window lexicon store (owner: WS-C). One `lexicon:get` per window, refreshed on
 * `{type:"lexicon"}` events, shared by every consumer (page, speed reader, TTS, AI text).
 *
 *   const lex = useLexicon();
 *   applyLexiconText(title, lex, "display")
 *
 * Outside Electron (or before main registers `lexicon:*`) it resolves to the empty lexicon.
 */

"use client";

import { useSyncExternalStore } from "react";
import type { Lexicon, LexiconEntry } from "@shared/pipeline/types";
import { EMPTY_LEXICON } from "@shared/pipeline/lexicon";
import { mergePreset } from "@shared/pipeline/lexicon-presets";
import { lexicon as lexiconRpc } from "./bridge";
import { onAIEvent } from "@/lib/ai/events";

let current: Lexicon = EMPTY_LEXICON;
let loaded: Promise<Lexicon> | null = null;
let detach: (() => void) | null = null;
/** Version a refetch is in flight for (dedupes the store's own listener and `getLexicon(v)`). */
let fetchingFor: string | null = null;
const listeners = new Set<() => void>();

function publish(lex: Lexicon): Lexicon {
  if (lex.version !== current.version) {
    current = lex;
    for (const l of Array.from(listeners)) l();
  }
  return current;
}

function fetchLexicon(): Promise<Lexicon> {
  loaded = lexiconRpc.get().then(publish, () => current);
  return loaded;
}

/** Refetch once per announced version, whichever `lexicon` listener runs first. */
function refreshFor(version: string): Promise<Lexicon> {
  if (fetchingFor === version && loaded) return loaded;
  fetchingFor = version;
  const p = fetchLexicon();
  void p.then(() => {
    if (fetchingFor === version) fetchingFor = null;
  });
  return p;
}

function ensureAttached(): void {
  if (detach) return;
  detach = onAIEvent("lexicon", (e) => {
    if (e.version !== current.version) void refreshFor(e.version);
  });
}

/**
 * The current lexicon (loads once per window). With `version` (from a `lexicon` event), never
 * returns the cached copy when it is older: `ai:event` listeners run in subscription order, so a
 * caller may ask before this store's own listener has refetched (QA-P1-3).
 */
export function getLexicon(version?: string): Promise<Lexicon> {
  ensureAttached();
  if (version && version !== current.version) return refreshFor(version);
  return loaded ?? fetchLexicon();
}

/** Synchronous snapshot (EMPTY_LEXICON until the first load resolves). */
export function lexiconSnapshot(): Lexicon {
  return current;
}

export function subscribeLexicon(cb: () => void): () => void {
  ensureAttached();
  if (!loaded) void fetchLexicon();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Replace all entries (main broadcasts the new version to every window). */
export async function setLexiconEntries(entries: LexiconEntry[]): Promise<Lexicon> {
  return publish(await lexiconRpc.set(entries));
}

/** Merge a named preset (e.g. "cultivation-terms") into the user's entries. */
export async function applyLexiconPreset(presetId: string): Promise<Lexicon> {
  const lex = await getLexicon();
  return setLexiconEntries(mergePreset(lex.entries, presetId));
}

/** React hook: the current lexicon, re-rendering on change. */
export function useLexicon(): Lexicon {
  return useSyncExternalStore(subscribeLexicon, lexiconSnapshot, () => EMPTY_LEXICON);
}
