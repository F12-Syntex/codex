/**
 * Generic typed RPC caller shared by every `src/lib/<area>/bridge.ts`.
 * Safe to import from server-rendered modules: `window` is only touched when a call is made.
 */

import type { RpcArgs, RpcChannel, RpcResult } from "@shared/rpc";

/** True inside an Electron window whose preload exposes the RPC bridge. */
export function hasRpc(): boolean {
  return typeof window !== "undefined" && typeof window.electronAPI?.rpc === "function";
}

export class RpcUnavailableError extends Error {
  constructor(channel: string) {
    super(`RPC "${channel}" is unavailable outside the Electron app`);
    this.name = "RpcUnavailableError";
  }
}

/** Invoke a main-process handler. Rejects with `RpcUnavailableError` outside Electron. */
export function rpc<K extends RpcChannel>(channel: K, ...args: RpcArgs<K>): Promise<RpcResult<K>> {
  if (!hasRpc()) return Promise.reject(new RpcUnavailableError(channel));
  return window.electronAPI.rpc(channel, ...args) as Promise<RpcResult<K>>;
}
