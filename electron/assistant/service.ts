/**
 * Assistant service (owner: WS-E): threads, turns, proposals, Simulate branches and the vocabulary
 * deck, composed from the stores and WS-A's scheduler. `ipc.ts` is a thin RPC layer over this.
 *
 * Runtime dependencies other streams own are injected late through `configureAssistant()` (Phase
 * 2 wiring): WS-A's scheduler + task registry, WS-B's `applyEdits`. Until then the pure-DB channels
 * (threads, branches list, vocab) work and the AI channels reject with `AssistantUnavailableError`.
 */

import type { ApplyResult, WikiEdit } from "../shared/knowledge/types";
import type { JobTicket } from "../shared/ai/types";
import { Priority } from "../shared/ai/types";
import type {
  AssistantMessage, AssistantMode, AssistantSeed, AssistantThread, AssistantTurnInput, BranchContinueInput,
  BranchContinueResult, CreateBranchRequest, MessageBlock, SimBranch, SimSegment,
} from "../shared/assistant/types";
import type { SqlDb } from "../db/sql";
import type { SchedulerLike, TaskDefinitionLike, TaskRegistryLike } from "./contracts";
import { BranchStore, ThreadStore, systemClock, type StoreClock } from "./store";
import { VocabStore } from "./vocab";
import { toSafeParagraphs } from "./text";
import type { ChapterLabeler } from "./book-view";
import { createAssistantTurnTask } from "../ai/tasks/assistant";
import { createDefineTask } from "../ai/tasks/define";
import { createTranslateTask } from "../ai/tasks/translate";
import { createQuoteTask } from "../ai/tasks/quote";
import { createSimulateTask } from "../ai/tasks/simulate";

export class AssistantUnavailableError extends Error {
  constructor(what: string) {
    super(`Assistant: ${what} is not available yet`);
    this.name = "AssistantUnavailableError";
  }
}

export interface AssistantRuntime {
  scheduler?: SchedulerLike | null;
  /** WS-B `knowledge.applyEdits` (transactional; merges use the DB merge with undo log). */
  applyEdits?: ((filePath: string, edits: WikiEdit[]) => ApplyResult | Promise<ApplyResult>) | null;
  /** WS-C `classify.ts` chapter labels; default 1-based spine numbers. */
  labeler?: ChapterLabeler;
}

const MAX_TEXT = 8_000;

/** "…/Omniscient Reader.epub" → "Omniscient Reader". */
export function titleFromPath(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  return base.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").trim() || base;
}

function userBlocks(text: string, seed?: AssistantSeed): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  if (seed?.selection) blocks.push({ type: "passage", ref: seed.selection.ref, text: seed.selection.text.slice(0, 4000) });
  if (seed?.entityId) blocks.push({ type: "entity", entityId: seed.entityId });
  if (text.trim()) blocks.push({ type: "markdown", text: text.trim().slice(0, MAX_TEXT) });
  return blocks;
}

export class AssistantService {
  readonly threads: ThreadStore;
  readonly branches: BranchStore;
  readonly vocab: VocabStore;
  private runtime: AssistantRuntime = {};
  private readonly pendingAppends = new Map<string, Promise<unknown>>();

  constructor(db: SqlDb, clock: StoreClock = systemClock) {
    this.threads = new ThreadStore(db, clock);
    this.branches = new BranchStore(db, clock);
    this.vocab = new VocabStore(db, clock.now);
  }

  configure(runtime: AssistantRuntime): void {
    this.runtime = { ...this.runtime, ...runtime };
  }

  /** Task definitions for WS-A's registry (call once; tasks close over this service's stores). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  taskDefinitions(): TaskDefinitionLike<any, any>[] {
    const labeler = this.runtime.labeler;
    return [
      createAssistantTurnTask({ store: this.threads, labeler }),
      createDefineTask(),
      createTranslateTask(),
      createQuoteTask(),
      createSimulateTask({ labeler }),
    ];
  }

  registerTasks(registry: TaskRegistryLike): void {
    for (const def of this.taskDefinitions()) registry.register(def);
  }

  private scheduler(): SchedulerLike {
    const s = this.runtime.scheduler;
    if (!s) throw new AssistantUnavailableError("the AI scheduler");
    return s;
  }

  // ── Threads ───────────────────────────────────────────────────────────────

  listThreads(filePath: string): AssistantThread[] {
    return this.threads.listThreads(filePath);
  }

  getThread(threadId: string): { thread: AssistantThread; messages: AssistantMessage[] } {
    const thread = this.threads.getThread(threadId);
    if (!thread) throw new Error("Conversation not found");
    return { thread, messages: this.threads.messages(threadId) };
  }

  createThread(req: { filePath: string; mode: AssistantMode; seed?: AssistantSeed }): AssistantThread {
    return this.threads.createThread(req);
  }

  renameThread(threadId: string, title: string): AssistantThread {
    const t = title.trim().slice(0, 120);
    if (t) this.threads.renameThread(threadId, t);
    const thread = this.threads.getThread(threadId);
    if (!thread) throw new Error("Conversation not found");
    return thread;
  }

  deleteThread(threadId: string): void {
    try {
      this.runtime.scheduler?.cancel({ group: `thread:${threadId}` });
    } catch { /* nothing running */ }
    this.threads.deleteThread(threadId);
  }

  /** Appends the user message + an assistant placeholder and starts `assistant.turn`. */
  send(req: { threadId: string; text: string; seed?: AssistantSeed }, owner?: number): JobTicket {
    const scheduler = this.scheduler();
    const thread = this.threads.getThread(req.threadId);
    if (!thread) throw new Error("Conversation not found");
    const existing = this.threads.messages(thread.id);

    // One turn at a time per thread: a new question supersedes an unfinished answer.
    if (existing.some((m) => m.status === "streaming")) {
      try {
        scheduler.cancel({ group: `thread:${thread.id}` });
      } catch { /* ignore */ }
      for (const m of existing) {
        if (m.status === "streaming") {
          this.threads.updateMessage(m.id, { status: "error", error: { code: "cancelled", message: "Superseded by a new question.", retryable: true } });
        }
      }
    }

    const seed = req.seed ?? (existing.length === 0 ? this.threads.getSeed(thread.id) : undefined);
    const blocks = userBlocks(req.text, seed);
    if (!blocks.length) throw new Error("Empty message");
    this.threads.appendMessage(thread.id, { role: "user", blocks, citations: [], entityLinks: [], status: "done" });
    const placeholder = this.threads.appendMessage(thread.id, {
      role: "assistant", blocks: [], citations: [], entityLinks: [], status: "streaming",
    });

    const input: AssistantTurnInput = {
      threadId: thread.id,
      messageId: placeholder.id,
      filePath: thread.filePath,
      bookTitle: titleFromPath(thread.filePath),
      ...(seed?.quickAction ? { quickAction: seed.quickAction } : {}),
    };
    const ticket = scheduler.submit(
      { task: "assistant.turn", input, scope: { filePath: thread.filePath }, priority: Priority.Interactive, group: `thread:${thread.id}`, cache: "bypass", stream: true },
      owner,
    );
    // Safety net: whatever happens to the job, the placeholder never stays "streaming".
    void scheduler.result(ticket.jobId).then(
      (r) => this.finalizeTurn(placeholder.id, r.state, r.error),
      (err) => this.finalizeTurn(placeholder.id, "error", { code: "unknown", message: String(err), retryable: true }),
    );
    return ticket;
  }

  private finalizeTurn(messageId: string, state: "done" | "error" | "cancelled", error?: AssistantMessage["error"]): void {
    const m = this.threads.getMessage(messageId);
    if (!m || m.status !== "streaming") return;
    if (state === "done") {
      this.threads.updateMessage(messageId, { status: "done" });
      return;
    }
    this.threads.updateMessage(messageId, {
      status: "error",
      error: error ?? (state === "cancelled"
        ? { code: "cancelled", message: "Stopped.", retryable: true }
        : { code: "unknown", message: "The answer failed.", retryable: true }),
    });
  }

  /** Stop the running answer of a thread. */
  stop(threadId: string): number {
    return this.scheduler().cancel({ group: `thread:${threadId}` });
  }

  async decideProposal(messageId: string, decision: "apply" | "reject"): Promise<ApplyResult> {
    const msg = this.threads.getMessage(messageId);
    if (!msg?.proposal) throw new Error("No proposal on this message");
    const empty: ApplyResult = { applied: 0, failed: [], mergeLogIds: [] };
    if (msg.proposal.status !== "pending") return empty;
    if (decision === "reject") {
      this.threads.updateMessage(messageId, { proposal: { ...msg.proposal, status: "rejected" } });
      return empty;
    }
    const apply = this.runtime.applyEdits;
    if (!apply) throw new AssistantUnavailableError("wiki editing");
    const thread = this.threads.getThread(msg.threadId);
    if (!thread) throw new Error("Conversation not found");
    const result = await apply(thread.filePath, msg.proposal.edits);
    if (result.applied > 0 || result.failed.length === 0) {
      this.threads.updateMessage(messageId, { proposal: { ...msg.proposal, status: "applied" } });
    }
    return result;
  }

  // ── Simulate branches ─────────────────────────────────────────────────────

  listBranches(filePath: string): SimBranch[] {
    return this.branches.list(filePath);
  }

  createBranch(req: CreateBranchRequest): SimBranch {
    return this.branches.create(req);
  }

  async segments(branchId: string): Promise<SimSegment[]> {
    await this.pendingAppends.get(branchId)?.catch(() => undefined);
    return this.branches.segments(branchId);
  }

  deleteBranch(branchId: string): void {
    try {
      this.runtime.scheduler?.cancel({ group: `branch:${branchId}` });
    } catch { /* ignore */ }
    this.branches.remove(branchId);
  }

  /** Starts `branch.continue`; on success the segment is appended in main (before `segments()` resolves). */
  continueBranch(req: { branchId: string; text: string }, owner?: number): JobTicket {
    const scheduler = this.scheduler();
    const branch = this.branches.get(req.branchId);
    if (!branch) throw new Error("Branch not found");
    const text = req.text.trim().slice(0, 1000);
    if (!text) throw new Error("Describe what should happen");
    const history = this.branches.segments(branch.id).map((s) => ({ userInput: s.userInput, paragraphs: s.paragraphs }));
    const input: BranchContinueInput = {
      filePath: branch.filePath,
      ref: branch.ref,
      ...(branch.entityId ? { entityId: branch.entityId } : {}),
      ...(branch.entityName ? { entityName: branch.entityName } : {}),
      direction: text,
      history,
      bookTitle: titleFromPath(branch.filePath),
    };
    const ticket = scheduler.submit(
      { task: "branch.continue", input, scope: { filePath: branch.filePath }, priority: Priority.Interactive, group: `branch:${branch.id}`, cache: "bypass", stream: true },
      owner,
    );
    const pending = scheduler.result<BranchContinueResult>(ticket.jobId).then((r) => {
      if (r.state !== "done" || !r.output || !this.branches.get(branch.id)) return;
      this.branches.append(branch.id, {
        userInput: text,
        // Re-sanitise defensively: only <p>/<em>/<strong>/<br> survive.
        paragraphs: r.output.paragraphs.flatMap((p) => toSafeParagraphs(p)),
        choices: (r.output.choices ?? []).slice(0, 4),
      });
    });
    this.pendingAppends.set(branch.id, pending);
    void pending.finally(() => {
      if (this.pendingAppends.get(branch.id) === pending) this.pendingAppends.delete(branch.id);
    });
    return ticket;
  }
}
