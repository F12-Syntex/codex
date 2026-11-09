/**
 * Typed renderer wrappers for `assistant:*` (owner WS-E). Streaming text arrives as `delta`
 * AI events for the job returned by `send`; the final message is re-read with `thread()`.
 */

import type { AssistantMode, AssistantSeed } from "@shared/assistant/types";
import { rpc } from "@/lib/ai/rpc";

export const assistant = {
  threads: (filePath: string) => rpc("assistant:threads", filePath),
  thread: (threadId: string) => rpc("assistant:thread", threadId),
  create: (req: { filePath: string; mode: AssistantMode; seed?: AssistantSeed }) => rpc("assistant:create", req),
  send: (req: { threadId: string; text: string; seed?: AssistantSeed }) => rpc("assistant:send", req),
  decideProposal: (messageId: string, decision: "apply" | "reject") => rpc("assistant:proposal", messageId, decision),
  remove: (threadId: string) => rpc("assistant:delete", threadId),
} as const;
