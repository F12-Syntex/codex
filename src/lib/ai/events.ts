/**
 * Per-window singleton for the `"ai:event"` stream. Subscribes to the preload once (lazily, on
 * the first listener) and fans out to any number of listeners, so components never register
 * IPC listeners themselves and nothing leaks across mounts.
 *
 *   useEffect(() => onAIEvent("artifact", (e) => { if (e.filePath === filePath) refresh(); }), [filePath]);
 */

import type { AIEvent, AIEventOf, AIEventType } from "@shared/ai/types";

type Listener = (e: AIEvent) => void;

const listeners = new Set<Listener>();
let detach: (() => void) | null = null;

function dispatch(e: AIEvent): void {
  // Copy so listeners may unsubscribe while being called.
  for (const l of Array.from(listeners)) {
    try {
      l(e);
    } catch (err) {
      console.error("[ai:event] listener failed", err);
    }
  }
}

function ensureAttached(): void {
  if (detach || typeof window === "undefined" || typeof window.electronAPI?.on !== "function") return;
  detach = window.electronAPI.on("ai:event", dispatch);
}

/** Listen to every AI event. Returns an unsubscriber (usable directly as a useEffect cleanup). */
export function onAnyAIEvent(listener: Listener): () => void {
  ensureAttached();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Listen to one event type, with the payload narrowed. Returns an unsubscriber. */
export function onAIEvent<T extends AIEventType>(type: T, listener: (e: AIEventOf<T>) => void): () => void {
  return onAnyAIEvent((e) => {
    if (e.type === type) listener(e as AIEventOf<T>);
  });
}

/** Number of active listeners (diagnostics/tests). */
export function aiEventListenerCount(): number {
  return listeners.size;
}
