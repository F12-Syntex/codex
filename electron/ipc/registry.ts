/**
 * Single entry point for the new RPC areas. `main.ts` calls `registerAll()` once after
 * `initDatabase()`. Each area owns its own `register*` in its own file, so no stream has to edit
 * this file or `main.ts` in Phase 1.
 */

import { isAllowedChannel } from "../shared/rpc";
import type { EventChannel, EventMap, RpcArgs, RpcChannel } from "../shared/rpc";
import type { AreaContext, InvokeEventLike, RegistryDeps, RpcHandler } from "./context";
import { registerAI } from "../ai/ipc";
import { registerChapters } from "../ai/chapters-ipc";
import { registerBook } from "../book/ipc";
import { getKnowledgeService, registerKnowledge } from "../knowledge/ipc";
import { configureAssistant, registerAssistant } from "../assistant/ipc";
import { registerLibrary } from "../library/ipc";

export type { AreaContext, RegistryDeps } from "./context";

/** Build the context areas receive. Exported for tests. */
export function createAreaContext(deps: RegistryDeps): AreaContext & { channels: Set<string> } {
  const channels = new Set<string>();

  return {
    db: deps.db,
    getWindows: deps.getWindows,
    channels,
    handle<K extends RpcChannel>(channel: K, handler: RpcHandler<K>) {
      if (!isAllowedChannel(channel)) {
        throw new Error(`ipc: channel "${channel}" is not allowlisted by the preload`);
      }
      if (channels.has(channel)) throw new Error(`ipc: channel "${channel}" registered twice`);
      channels.add(channel);
      deps.ipcMain.handle(channel, (event: InvokeEventLike, ...args: unknown[]) =>
        handler({ senderId: event.sender.id, event }, ...(args as RpcArgs<K>)),
      );
    },
    broadcast<E extends EventChannel>(channel: E, payload: EventMap[E]) {
      for (const win of deps.getWindows()) {
        if (win.isDestroyed()) continue;
        try {
          win.webContents.send(channel, payload);
        } catch { /* window closing */ }
      }
    },
  };
}

let registered: AreaContext | null = null;

/** Idempotent: a second call (e.g. macOS `activate` re-creating the main window) is a no-op. */
export function registerAll(deps: RegistryDeps): AreaContext {
  if (registered) return registered;
  const ctx = createAreaContext(deps);
  registerAI(ctx);
  registerChapters(ctx);
  registerBook(ctx);
  registerKnowledge(ctx);
  registerAssistant(ctx);
  registerLibrary(ctx);
  // Assistant wiki-edit proposals apply through the knowledge service (transactional, undoable).
  const knowledge = getKnowledgeService();
  if (knowledge) configureAssistant({ applyEdits: (filePath, edits) => knowledge.applyEdits(filePath, edits) });
  registered = ctx;
  return ctx;
}

/** The context created by `registerAll`, for main-side modules that need to broadcast. */
export function getAreaContext(): AreaContext | null {
  return registered;
}
