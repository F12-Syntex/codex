/**
 * What every area's `register*()` receives. Structural types only (no `electron` import), so area
 * modules and the registry can be unit-tested with fakes.
 */

import type { SqlDb } from "../db/sql";
import type { EventChannel, EventMap, RpcArgs, RpcChannel, RpcMap } from "../shared/rpc";

/** Subset of `Electron.IpcMainInvokeEvent` handlers may rely on. */
export interface InvokeEventLike {
  sender: { id: number };
}

/** Subset of `Electron.IpcMain` used by the registry. `ipcMain` satisfies it. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: InvokeEventLike, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

/** Subset of `BrowserWindow` used for broadcasting. `BrowserWindow` satisfies it. */
export interface WindowLike {
  isDestroyed(): boolean;
  webContents: { id: number; send(channel: string, ...args: unknown[]): void };
}

/** Passed to RPC handlers as the first argument. */
export interface InvokeMeta {
  /** webContents id of the calling window; use it for owner-scoped cancellation. */
  senderId: number;
  /** Raw event, e.g. for `BrowserWindow.fromWebContents(event.sender)` in main-only code. */
  event: InvokeEventLike;
}

export type RpcHandler<K extends RpcChannel> = (
  meta: InvokeMeta,
  ...args: RpcArgs<K>
) => ReturnType<RpcMap[K]> | Promise<ReturnType<RpcMap[K]>>;

export interface AreaContext {
  db: SqlDb;
  /** All live windows (main, readers, buddy, wiki…). */
  getWindows: () => WindowLike[];
  /** Register a typed handler for a channel from `RpcMap`. Throws if the channel is not
   *  preload-allowlisted (it would be unreachable) or already registered. */
  handle<K extends RpcChannel>(channel: K, handler: RpcHandler<K>): void;
  /** Send an event to every live window. */
  broadcast<E extends EventChannel>(channel: E, payload: EventMap[E]): void;
}

export interface RegistryDeps {
  db: SqlDb;
  getWindows: () => WindowLike[];
  ipcMain: IpcMainLike;
}
