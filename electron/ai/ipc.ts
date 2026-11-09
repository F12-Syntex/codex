/**
 * AI core (ai:*) RPC handlers (owner: WS-A). Phase 0 stub: registers nothing.
 * Register channels from `RpcMap` with `ctx.handle("ai:*", (meta, ...args) => …)`.
 * Do not import `electron` at the top level; take what you need from `ctx` or inject it.
 */

import type { AreaContext } from "../ipc/context";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerAI(ctx: AreaContext): void {
  // Phase 1: register ai:* handlers here.
}
