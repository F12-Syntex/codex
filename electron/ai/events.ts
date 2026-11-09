/**
 * Main-side AI event bus (owner: WS-A). Every area emits `AIEvent`s here; the runtime forwards
 * them to all windows on the single `"ai:event"` channel (`ctx.broadcast`).
 *
 * Listener errors are caught and logged, never propagated to the emitter.
 */

import type { AIEvent, AIEventOf, AIEventType } from "../shared/ai/types";

export interface AIEventBus {
  emit(e: AIEvent): void;
  /** Returns an unsubscriber. */
  on(listener: (e: AIEvent) => void): () => void;
  onType<T extends AIEventType>(type: T, listener: (e: AIEventOf<T>) => void): () => void;
  listenerCount(): number;
}

export function createEventBus(log: (msg: string, err: unknown) => void = (m, e) => console.error(m, e)): AIEventBus {
  const listeners = new Set<(e: AIEvent) => void>();
  const bus: AIEventBus = {
    emit(e) {
      for (const l of Array.from(listeners)) {
        try {
          l(e);
        } catch (err) {
          log("[ai:event] listener failed", err);
        }
      }
    },
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onType(type, listener) {
      return bus.on((e) => {
        if (e.type === type) listener(e as AIEventOf<typeof type>);
      });
    },
    listenerCount: () => listeners.size,
  };
  return bus;
}
