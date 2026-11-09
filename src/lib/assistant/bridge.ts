/**
 * Typed renderer wrappers for `assistant:*` and `vocab:*` (owner WS-E). Streaming text arrives as
 * `delta` AI events for the job returned by `send`; the final message is re-read with `thread()`.
 * Define / translate / quote classification run as plain AI jobs (`ai:submit`), so they share the
 * scheduler, the cache and the cost ledger with everything else.
 */

import type {
  AssistantMode, AssistantSeed, CreateBranchRequest, DefineInput, DefineResult, NewVocabItem, QuoteClassifyInput,
  QuoteClassifyResult, TranslateInput, TranslateResult, VocabFilter, VocabGrade,
} from "@shared/assistant/types";
import type { JobResult } from "@shared/ai/types";
import { Priority } from "@shared/ai/types";
import { rpc } from "@/lib/ai/rpc";

export const assistant = {
  threads: (filePath: string) => rpc("assistant:threads", filePath),
  thread: (threadId: string) => rpc("assistant:thread", threadId),
  create: (req: { filePath: string; mode: AssistantMode; seed?: AssistantSeed }) => rpc("assistant:create", req),
  send: (req: { threadId: string; text: string; seed?: AssistantSeed }) => rpc("assistant:send", req),
  decideProposal: (messageId: string, decision: "apply" | "reject") => rpc("assistant:proposal", messageId, decision),
  remove: (threadId: string) => rpc("assistant:delete", threadId),
  rename: (threadId: string, title: string) => rpc("assistant:rename", threadId, title),
  stop: (threadId: string) => rpc("assistant:stop", threadId),
} as const;

export const branches = {
  list: (filePath: string) => rpc("assistant:branches", filePath),
  create: (req: CreateBranchRequest) => rpc("assistant:branch:create", req),
  segments: (branchId: string) => rpc("assistant:branch:segments", branchId),
  /** Starts the continuation; await `ai.result(jobId)` then re-read `segments`. */
  continue: (branchId: string, text: string) => rpc("assistant:branch:continue", { branchId, text }),
  remove: (branchId: string) => rpc("assistant:branch:delete", branchId),
} as const;

export const vocab = {
  list: (filter: VocabFilter = {}) => rpc("vocab:list", filter),
  add: (item: NewVocabItem) => rpc("vocab:add", item),
  review: (id: number, grade: VocabGrade) => rpc("vocab:review", id, grade),
  remove: (id: number) => rpc("vocab:delete", id),
  stats: (filePath?: string) => rpc("vocab:stats", filePath),
} as const;

async function runJob<I, O>(task: "selection.define" | "selection.translate" | "quote.classify", input: I, filePath?: string): Promise<JobResult<O>> {
  const ticket = await rpc("ai:submit", { task, input, priority: Priority.Interactive, ...(filePath ? { scope: { filePath } } : {}) });
  return (await rpc("ai:result", ticket.jobId)) as JobResult<O>;
}

/** Interactive single-shot tasks. Resolve with the `JobResult` (check `state` / `error`). */
export const selection = {
  define: (input: DefineInput, filePath?: string) => runJob<DefineInput, DefineResult>("selection.define", input, filePath),
  translate: (input: TranslateInput, filePath?: string) => runJob<TranslateInput, TranslateResult>("selection.translate", input, filePath),
  classifyQuote: (input: QuoteClassifyInput) => runJob<QuoteClassifyInput, QuoteClassifyResult>("quote.classify", input, input.filePath),
} as const;
