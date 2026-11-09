/**
 * `openAssistant(seed)` — a per-window event bus so any surface (SelectionToolbar "Ask",
 * EntityCard "Ask about…", the reader menu "Recap") can open the Assistant without prop drilling.
 * `AssistantLauncher` (or any host) subscribes with `onOpenAssistant`. A request made before a
 * host mounted is kept and delivered to the first subscriber.
 *
 *   openAssistant({ selection: { ref, text } }, { mode: "explain", prompt: "Explain this", autoSend: true });
 *   openAssistant({ quickAction: "recap" }, { autoSend: true });
 */

import type { AssistantMode, AssistantSeed } from "@shared/assistant/types";
import { quickAction } from "@shared/assistant/quick-actions";

export interface OpenAssistantOptions {
  /** Default: "explain" for a selection, "lookup" for an entity, else "chat". */
  mode?: AssistantMode;
  /** Pre-filled (or, with autoSend, sent) composer text. */
  prompt?: string;
  /** Send immediately instead of pre-filling. Default true for quick actions. */
  autoSend?: boolean;
  /** Continue an existing conversation instead of starting one. */
  threadId?: string;
  /** Only hosts showing this book react (defaults to any). */
  filePath?: string;
}

export interface OpenAssistantRequest extends OpenAssistantOptions {
  seed?: AssistantSeed;
  mode: AssistantMode;
  autoSend: boolean;
  /** Monotonic id, so hosts can ignore a request they already handled. */
  id: number;
}

type Listener = (req: OpenAssistantRequest) => void;

const listeners = new Set<Listener>();
let pending: OpenAssistantRequest | null = null;
let seq = 0;

export function defaultModeFor(seed?: AssistantSeed): AssistantMode {
  if (seed?.selection) return "explain";
  if (seed?.entityId) return "lookup";
  if (seed?.quickAction === "recap") return "recap";
  return "chat";
}

export function openAssistant(seed?: AssistantSeed, opts: OpenAssistantOptions = {}): void {
  const qa = quickAction(seed?.quickAction);
  const req: OpenAssistantRequest = {
    ...opts,
    seed,
    mode: opts.mode ?? defaultModeFor(seed),
    prompt: opts.prompt ?? qa?.prompt,
    autoSend: opts.autoSend ?? !!qa,
    id: ++seq,
  };
  if (listeners.size === 0) {
    pending = req;
    return;
  }
  for (const l of Array.from(listeners)) {
    try {
      l(req);
    } catch (err) {
      console.error("[assistant] open listener failed", err);
    }
  }
}

/** Subscribe a host. Returns an unsubscriber (usable as a useEffect cleanup). */
export function onOpenAssistant(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const p = pending;
    pending = null;
    queueMicrotask(() => listener(p));
  }
  return () => {
    listeners.delete(listener);
  };
}
