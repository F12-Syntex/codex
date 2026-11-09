/**
 * Book content and lexicon (book:*, lexicon:*) RPC handlers (owner: WS-C). Phase 0 stub: registers nothing.
 * Register channels from `RpcMap` with `ctx.handle("book:*, lexicon:*", (meta, ...args) => …)`.
 * Do not import `electron` at the top level; take what you need from `ctx` or inject it.
 */

import type { AreaContext } from "../ipc/context";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerBook(ctx: AreaContext): void {
  // Phase 1: register book:*, lexicon:* handlers here.
}
