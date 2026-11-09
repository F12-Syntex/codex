/**
 * Chapters / bulk / style (chapters:*, bulk:*, style:*) RPC handlers (owner: WS-D). Phase 0 stub: registers nothing.
 * Register channels from `RpcMap` with `ctx.handle("chapters:*, bulk:*, style:*", (meta, ...args) => …)`.
 * Do not import `electron` at the top level; take what you need from `ctx` or inject it.
 */

import type { AreaContext } from "../ipc/context";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerChapters(ctx: AreaContext): void {
  // Phase 1: register chapters:*, bulk:*, style:* handlers here.
}
