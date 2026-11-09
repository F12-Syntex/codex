/**
 * Assistant (assistant:*) and vocabulary (vocab:*) RPC handlers (owner: WS-E).
 *
 * `registerAssistant(ctx)` is called by `electron/ipc/registry.ts` after `registerAI`. It creates
 * the service on `ctx.db`, registers the WS-E tasks in WS-A's registry, takes WS-A's scheduler
 * (`peekAIRuntime()`), and registers every channel. Proposals reject with
 * `AssistantUnavailableError` until Phase 2 wiring provides WS-B's edits (and WS-C's labels):
 *
 *   configureAssistant({ applyEdits: (filePath, edits) => knowledge.applyEdits(filePath, edits), labeler });
 *
 * No `electron` import: everything comes from `ctx`, so it is testable with fakes.
 */

import type { AreaContext } from "../ipc/context";
import { peekAIRuntime } from "../ai/runtime";
import { getBookContentReader } from "../book/content-cache";
import { AssistantService, type AssistantRuntime } from "./service";

let service: AssistantService | null = null;
let pendingRuntime: AssistantRuntime | null = null;

export function getAssistantService(): AssistantService | null {
  return service;
}

/** Inject runtime dependencies owned by other streams (safe to call before or after register). */
export function configureAssistant(runtime: AssistantRuntime): void {
  if (service) service.configure(runtime);
  else pendingRuntime = { ...(pendingRuntime ?? {}), ...runtime };
}

export function registerAssistant(ctx: AreaContext): AssistantService {
  const svc = new AssistantService(ctx.db);
  // WS-A's runtime is created by registerAI, which runs first in registerAll.
  const ai = peekAIRuntime();
  if (ai) {
    svc.configure({ scheduler: ai.scheduler });
    try {
      svc.registerTasks(ai.registry);
    } catch (err) {
      console.error("[assistant] task registration failed", err);
    }
  }
  // Book content (lazy: parsing happens only when a legacy Simulate branch needs anchoring).
  svc.configure({
    books: {
      getBook: (filePath) => getBookContentReader().getBook(filePath),
      getChapter: (filePath, index) => getBookContentReader().getChapter(filePath, index),
    },
  });
  if (pendingRuntime) svc.configure(pendingRuntime);
  pendingRuntime = null;
  service = svc;

  // Answers interrupted by a crash or quit must not spin forever.
  try {
    svc.threads.failDanglingStreams();
  } catch (err) {
    console.error("[assistant] could not clean up interrupted answers", err);
  }

  ctx.handle("assistant:threads", (_m, filePath) => svc.listThreads(filePath));
  ctx.handle("assistant:thread", (_m, threadId) => svc.getThread(threadId));
  ctx.handle("assistant:create", (_m, req) => svc.createThread(req));
  ctx.handle("assistant:send", (m, req) => svc.send(req, m.senderId));
  ctx.handle("assistant:proposal", (_m, messageId, decision) => svc.decideProposal(messageId, decision));
  ctx.handle("assistant:delete", (_m, threadId) => svc.deleteThread(threadId));
  ctx.handle("assistant:rename", (_m, threadId, title) => svc.renameThread(threadId, title));
  ctx.handle("assistant:stop", (_m, threadId) => svc.stop(threadId));

  ctx.handle("assistant:branches", (_m, filePath) => svc.listBranches(filePath));
  ctx.handle("assistant:branch:create", (_m, req) => svc.createBranch(req));
  ctx.handle("assistant:branch:segments", (_m, branchId) => svc.segments(branchId));
  ctx.handle("assistant:branch:continue", (m, req) => svc.continueBranch(req, m.senderId));
  ctx.handle("assistant:branch:delete", (_m, branchId) => svc.deleteBranch(branchId));

  ctx.handle("vocab:list", (_m, filter) => svc.vocab.list(filter ?? {}));
  ctx.handle("vocab:add", (_m, item) => svc.vocab.add(item));
  ctx.handle("vocab:review", (_m, id, grade) => svc.vocab.review(id, grade));
  ctx.handle("vocab:delete", (_m, id) => {
    svc.vocab.remove(id);
  });
  ctx.handle("vocab:stats", (_m, filePath) => svc.vocab.stats(filePath));

  return svc;
}
