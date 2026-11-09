/**
 * Renderer ⇄ main RPC contract. FROZEN at the end of Phase 0: additive changes only, announced to
 * all streams.
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * - Renderer: `window.electronAPI.rpc(channel, ...args)` (typed via `src/types/electron.d.ts`), or the
 *   per-area wrappers in `src/lib/{ai,knowledge,assistant,book}/bridge.ts`.
 * - Main: each area registers its channels with `ctx.handle(channel, fn)` from `electron/ipc/context.ts`,
 *   which type-checks the handler against this map.
 *
 * Signatures are written synchronously; the renderer always receives a Promise of the return type
 * and main handlers may return either the value or a Promise of it. All arguments and results must
 * be structured-cloneable (no functions, class instances or AbortSignals).
 */

import type {
  AISettings, BookAIPrefs, BookAIStatus, BulkRequest, BulkStatus, CacheSelector, CacheStats,
  CancelSelector, ChapterArtifacts, ArtifactKind, ChapterStatus, EnsureRequest, JobResult, JobSpec,
  JobTicket, ModelInfo, Priority, PublicAISettings, StyleDictionary, UsageSummary, AIEvent,
} from "./ai/types";
import type {
  ApplyResult, EntityIndexItem, EntitySnapshot, Frontier, KnowledgeContext, KnowledgeContextRequest,
  ReadingPosition, RecapStatus, SearchHit, WikiEdit, WikiSnapshot,
} from "./knowledge/types";
import type { BookContentV2, ChapterId, Lexicon, LexiconEntry, ParaId, ParaRef } from "./pipeline/types";
import type {
  AssistantMessage, AssistantMode, AssistantSeed, AssistantThread, CreateBranchRequest, NewVocabItem, SimBranch, SimSegment,
  VocabFilter, VocabGrade, VocabItem, VocabStats,
} from "./assistant/types";

export type { CancelSelector } from "./ai/types";

export interface RpcMap {
  // ── WS-A: AI core ─────────────────────────────────────────────────────────
  /** Queue a job. Dedupes onto an identical in-flight job (raising its priority if needed). */
  "ai:submit": (spec: JobSpec) => JobTicket;
  /** Resolves when the job finishes (done / error / cancelled). Never rejects for AI errors. */
  "ai:result": (jobId: string) => JobResult;
  /** Returns the number of jobs cancelled. */
  "ai:cancel": (sel: CancelSelector) => number;
  "ai:settings:get": () => PublicAISettings;
  "ai:settings:update": (patch: Partial<AISettings>) => PublicAISettings;
  /** Write-only; stored with safeStorage. An empty string removes the key. */
  "ai:key:set": (key: string) => { ok: boolean };
  /** Tests the stored key with the configured `fast` model. */
  "ai:key:test": () => { ok: boolean; error?: string };
  /** @deprecated Phase 2a compatibility shim for the legacy renderer client; removed in Phase 3. */
  "ai:key:get-legacy": () => string | null;
  "ai:models": () => ModelInfo[];
  "ai:usage": (sel: { filePath?: string; sinceMs?: number }) => UsageSummary;
  "ai:cache:stats": () => CacheStats;
  /** Returns the number of rows removed. */
  "ai:cache:clear": (sel: CacheSelector) => number;

  // ── WS-D: chapter artifacts, orchestrator, bulk, style ────────────────────
  "chapters:prefs:get": (filePath: string) => BookAIPrefs;
  "chapters:prefs:set": (filePath: string, patch: Partial<BookAIPrefs>) => BookAIPrefs;
  /** Queue whatever is missing/stale for one chapter; returns the status right after queueing. */
  "chapters:ensure": (req: EnsureRequest) => ChapterStatus;
  "chapters:artifacts": (filePath: string, chapterIndex: number) => ChapterArtifacts;
  "chapters:status": (filePath: string) => BookAIStatus;
  /** Per chapter and per kind. Never touches user data (user comments live in `annotations`). */
  "chapters:clear": (filePath: string, kind: ArtifactKind | "all", chapterIndex?: number) => void;
  "bulk:start": (req: BulkRequest) => { runId: string };
  "bulk:cancel": (runId: string) => void;
  /** The book's current or most recent run, or null. */
  "bulk:status": (filePath: string) => BulkStatus | null;
  "style:get": (filePath: string) => StyleDictionary;
  "style:regenerate": (filePath: string, component: string, instruction?: string) => JobTicket;

  // ── WS-C: book content, anchors, lexicon ──────────────────────────────────
  /** Parsed + sanitized + id-assigned content; the format is resolved in main. */
  "book:content": (filePath: string) => BookContentV2;
  /** Focus (or open) the book's reader window and navigate to `ref`. */
  "book:reveal": (filePath: string, ref: ParaRef) => void;
  "book:readMarks:get": (filePath: string) => Record<ChapterId, ParaId>;
  "book:readMarks:set": (filePath: string, chapterId: ChapterId, paraId: ParaId) => void;
  "lexicon:get": () => Lexicon;
  /** Replaces all entries; broadcasts a `lexicon` event with the new version. */
  "lexicon:set": (entries: LexiconEntry[]) => Lexicon;

  // ── WS-B: knowledge ───────────────────────────────────────────────────────
  /** Report the reading position; returns the (possibly advanced) frontier. */
  "knowledge:position": (filePath: string, pos: ReadingPosition) => Frontier;
  "knowledge:frontier": (filePath: string) => Frontier;
  "knowledge:context": (req: KnowledgeContextRequest) => KnowledgeContext;
  /** `frontier` defaults to the book's current frontier (with the global spoiler mode). */
  "knowledge:entityIndex": (filePath: string, frontier?: Frontier) => EntityIndexItem[];
  "knowledge:entity": (filePath: string, id: string, frontier?: Frontier) => EntitySnapshot | null;
  "knowledge:search": (filePath: string, query: string, opts: { frontier?: Frontier; limit?: number }) => SearchHit[];
  "knowledge:edits:apply": (filePath: string, edits: WikiEdit[]) => ApplyResult;
  "knowledge:ingest": (filePath: string, chapterIndex: number, priority: Priority) => JobTicket;
  /** Whole book, or one chapter (removes what that chapter's run created). */
  "knowledge:clear": (filePath: string, chapterIndex?: number) => void;
  /** Wiki window bulk read. */
  "knowledge:wiki": (filePath: string, frontier?: Frontier) => WikiSnapshot;
  /** Additive (Phase 1): revert one applied edit by its `ApplyResult.undoIds` entry. */
  "knowledge:edits:undo": (filePath: string, undoId: number) => boolean;
  /** Additive (Phase 1): should the "Previously on…" recap be offered now? Starts a reading
   *  session if the book was idle for 30 min. */
  "knowledge:recapStatus": (filePath: string) => RecapStatus;
  /** Additive (Phase 1): the recap up to `chapterIndex` was shown or dismissed. */
  "knowledge:recapSeen": (filePath: string, chapterIndex: number) => void;

  // ── WS-E: assistant ───────────────────────────────────────────────────────
  "assistant:threads": (filePath: string) => AssistantThread[];
  "assistant:thread": (threadId: string) => { thread: AssistantThread; messages: AssistantMessage[] };
  "assistant:create": (req: { filePath: string; mode: AssistantMode; seed?: AssistantSeed }) => AssistantThread;
  /** Appends the user message and starts an `assistant.turn` job (group `thread:<id>`). */
  "assistant:send": (req: { threadId: string; text: string; seed?: AssistantSeed }) => JobTicket;
  "assistant:proposal": (messageId: string, decision: "apply" | "reject") => ApplyResult;
  "assistant:delete": (threadId: string) => void;
  // Additive (WS-E Phase 1) ─────────────────────────────────────────────────
  "assistant:rename": (threadId: string, title: string) => AssistantThread;
  /** Cancels the thread's running turn (group `thread:<id>`); returns jobs cancelled. */
  "assistant:stop": (threadId: string) => number;
  /** Simulate ("what if…") branches anchored by ParaRef. */
  "assistant:branches": (filePath: string) => SimBranch[];
  "assistant:branch:create": (req: CreateBranchRequest) => SimBranch;
  /** Waits for an in-flight continuation of this branch to be stored first. */
  "assistant:branch:segments": (branchId: string) => SimSegment[];
  /** Starts `branch.continue` (group `branch:<id>`, streams deltas); main appends the segment on success. */
  "assistant:branch:continue": (req: { branchId: string; text: string }) => JobTicket;
  "assistant:branch:delete": (branchId: string) => void;
  /** Vocabulary deck (SM-2). */
  "vocab:list": (filter?: VocabFilter) => VocabItem[];
  "vocab:add": (item: NewVocabItem) => VocabItem;
  "vocab:review": (id: number, grade: VocabGrade) => VocabItem;
  "vocab:delete": (id: number) => void;
  "vocab:stats": (filePath?: string) => VocabStats;
}

export type RpcChannel = keyof RpcMap;
export type RpcArgs<K extends RpcChannel> = Parameters<RpcMap[K]>;
export type RpcResult<K extends RpcChannel> = Awaited<ReturnType<RpcMap[K]>>;

/** Main → renderer broadcast channels and their payloads. */
export interface EventMap {
  "ai:event": AIEvent;
}

export type EventChannel = keyof EventMap;

// ── Allowlists (enforced by the preload; mirrored there because sandboxed preloads cannot
//    require local modules — `electron/foundation.test.ts` checks the copies stay identical) ──

/** RPC channels the preload forwards. Legacy `wiki:*` etc. are NOT reachable through `rpc`. */
export const RPC_CHANNEL_RE = /^(ai|chapters|bulk|style|book|lexicon|knowledge|assistant|vocab|library):/;

/** Events the preload lets a renderer subscribe to through `on`. */
export const EVENT_CHANNELS: readonly EventChannel[] = ["ai:event"];

export function isAllowedChannel(channel: unknown): channel is string {
  return typeof channel === "string" && channel.length <= 128 && RPC_CHANNEL_RE.test(channel);
}

export function isAllowedEvent(event: unknown): event is EventChannel {
  return typeof event === "string" && (EVENT_CHANNELS as readonly string[]).includes(event);
}
