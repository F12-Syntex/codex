/**
 * AI core contracts (owner: WS-A; chapter/orchestrator section: WS-D).
 * FROZEN at the end of Phase 0: additive changes only, announced to all streams.
 *
 * PURE: no `electron`, Node or DOM imports.
 *
 * All AI calls run in the main process (one scheduler, one cache, one rate limiter). Renderers
 * submit `JobSpec`s over RPC and observe progress through the single `"ai:event"` stream.
 */

import type { Frontier } from "../knowledge/types";
import type { ChapterId, FormatLayer, ParaId, ParaRef, RewriteLayer } from "../pipeline/types";

// ── Models, priorities, tasks ───────────────────────────────────────────────

/** Each task declares a role; settings map roles to model ids. */
export type ModelRole = "fast" | "rewrite" | "format" | "analysis" | "chat" | "creative" | "web";

export const MODEL_ROLES: readonly ModelRole[] = ["fast", "rewrite", "format", "analysis", "chat", "creative", "web"];

/** Lower number = more urgent. One concurrency slot is always reserved for `Interactive`. */
export const Priority = { Interactive: 0, Visible: 1, Prefetch: 2, Background: 3 } as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export type TaskId =
  | "chapter.title" | "chapter.condense" | "chapter.format" | "chapter.comments"
  | "chapter.knowledge" | "style.regenerate"
  | "book.recap" | "entity.lookup"
  | "assistant.turn" | "selection.define" | "selection.translate"
  | "quote.classify" | "branch.continue"
  | "book.lookup" | "library.tag"
  /** Phase 2 compatibility: raw chat completions from the legacy renderer modules
   *  (`src/lib/ai-client.ts`), routed through the one queue, cache and key. Removed in Phase 3. */
  | "legacy.complete";

// ── Chat primitives ─────────────────────────────────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments, exactly as the model produced them. */
  arguments: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Set on role "tool": the call this message answers. */
  toolCallId?: string;
  /** Set on role "assistant" when the model requested tools. */
  toolCalls?: ToolCall[];
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON schema of the arguments object. */
  parameters: object;
}

// ── Jobs ────────────────────────────────────────────────────────────────────

/** What a job is about; drives cancellation by file, events and usage attribution. */
export interface JobScope {
  filePath?: string;
  chapterIndex?: number;
  chapterId?: ChapterId;
}

export interface JobSpec<I = unknown> {
  task: TaskId;
  /** Task-specific input (see AI_AUDIT Appendix A). Must be structured-cloneable. */
  input: I;
  scope?: JobScope;
  priority: Priority;
  /** Cancellation/progress group, e.g. "bulk:<runId>", "prefetch:<filePath>", "thread:<id>". */
  group?: string;
  /** "use" (default): read and write cache. "refresh": skip read, write. "bypass": neither. */
  cache?: "use" | "refresh" | "bypass";
  /** Emit `delta` events while the model streams. */
  stream?: boolean;
}

export type JobState = "queued" | "running" | "done" | "error" | "cancelled";

export interface JobTicket {
  jobId: string;
  /** True when deduped onto an identical in-flight job (same task + cache key). */
  joined: boolean;
  /** True when answered from cache; the job is already `done`. */
  cached: boolean;
}

export interface JobResult<O = unknown> {
  jobId: string;
  state: "done" | "error" | "cancelled";
  output?: O;
  error?: AIErrorInfo;
  /** One entry per model call (a job may make several, e.g. chunks or tool rounds). */
  usage: Usage[];
  cached: boolean;
  durationMs: number;
}

/** Scheduler introspection row (`Scheduler.snapshot()`, debugging UIs). */
export interface JobView {
  jobId: string;
  task: TaskId;
  scope?: JobScope;
  group?: string;
  priority: Priority;
  state: JobState;
  /** webContents id of the window that submitted it, if any. */
  owner?: number;
  lane?: string;
  attempts: number;
  queuedAt: number;
  startedAt?: number;
  progress?: { done: number; total: number };
}

/** Selects jobs to cancel. `priorityAtLeast` matches jobs whose priority number is ≥ the value
 *  (i.e. equally or LESS urgent), e.g. `{filePath, priorityAtLeast: Priority.Prefetch}`. */
export type CancelSelector =
  | { jobId: string }
  | { group: string }
  | { filePath: string; priorityAtLeast?: Priority };

// ── Errors and usage ────────────────────────────────────────────────────────

export type AIErrorCode =
  | "no_api_key" | "auth" | "rate_limited" | "timeout" | "network" | "server"
  | "bad_request" | "model_unavailable" | "content_filtered" | "truncated"
  | "parse" | "validation" | "cancelled" | "budget_exceeded" | "unknown";

/** Serializable error (crosses IPC). Retry policy lives in the scheduler, not in tasks:
 *  rate_limited → global pause until `retryAt`; server/network/timeout → jittered backoff;
 *  truncated → task splits; parse/validation → one re-ask; auth/no_api_key → circuit breaker. */
export interface AIErrorInfo {
  code: AIErrorCode;
  message: string;
  retryable: boolean;
  /** HTTP status, when the error came from the provider. */
  status?: number;
  /** Epoch ms after which a retry may succeed (from Retry-After / X-RateLimit-Reset). */
  retryAt?: number;
}

export interface Usage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd?: number;
  /** True when served from cache (no provider call, no cost). */
  cached?: boolean;
}

export interface UsageSummary {
  sinceMs: number;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  cacheHits: number;
  errors: number;
  byTask: { task: TaskId; requests: number; promptTokens: number; completionTokens: number; costUsd: number }[];
  byModel: { model: string; requests: number; promptTokens: number; completionTokens: number; costUsd: number }[];
}

// ── Models ──────────────────────────────────────────────────────────────────

/** From OpenRouter `/models`, cached 24 h in main. */
export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  /** USD per token (OpenRouter reports strings; parsed to numbers). */
  pricing: { prompt: number; completion: number };
  capabilities: {
    /** `response_format: {type: "json_object"}` */
    json: boolean;
    /** `response_format: {type: "json_schema"}` */
    jsonSchema: boolean;
    tools: boolean;
    reasoning: boolean;
  };
  /** Expiry/deprecation date reported by the provider, if any (epoch ms). */
  expiresAt?: number;
}

// ── Cache ───────────────────────────────────────────────────────────────────

/** All fields optional; an empty selector clears everything. */
export interface CacheSelector {
  filePath?: string;
  task?: TaskId;
  /** Only rows whose task version is below this. */
  belowVersion?: number;
}

export interface CacheStats {
  rows: number;
  bytes: number;
  byTask: { task: TaskId; rows: number; bytes: number }[];
  byFile: { filePath: string; rows: number; bytes: number }[];
}

// ── Settings ────────────────────────────────────────────────────────────────

/** Per-book AI preferences (`book_ai_prefs`); `AISettings.defaults` applies when a book has none. */
export interface BookAIPrefs {
  titles: boolean;
  rewrite: "off" | "polish" | "concise";
  formatting: boolean;
  knowledge: boolean;
  comments: boolean;
  recapOnReopen: boolean;
  prefetchNext: boolean;
}

/** Stored under settings key `ai:settings:v1`; written only by `electron/ai/settings.ts`. */
export interface AISettings {
  version: 1;
  models: Record<ModelRole, string>;
  /** Max in-flight requests; default 4, one slot always reserved for Interactive. */
  concurrency: number;
  /** Default 40. */
  requestsPerMinute: number;
  /** Optional hard stop; jobs then fail with "budget_exceeded". */
  dailyBudgetUsd?: number;
  spoilerMode: "frontier" | "position" | "off";
  /** BCP-47 tag for define/translate; default from the OS locale. */
  targetLanguage: string;
  /** TTS reads the displayed variant, or the original text with no rewrite/format layers. */
  readAloud: "displayed" | "original";
  defaults: BookAIPrefs;
}

/** What renderers see. The API key never leaves main. */
export type PublicAISettings = AISettings & {
  hasKey: boolean;
  keyHealth: "unknown" | "ok" | "invalid";
};

// ── Chapter artifacts + orchestrator (WS-D, AI_AUDIT §4.4.6) ────────────────

/** Kinds stored as `chapter_artifacts` rows. */
export type ArtifactKind = "title" | "rewrite" | "format" | "comments" | "recap";

/** Kinds the orchestrator tracks per chapter ("knowledge" is a run, not an artifact). */
export type ChapterKind = "title" | "rewrite" | "format" | "comments" | "knowledge";

export const CHAPTER_KINDS: readonly ChapterKind[] = ["title", "rewrite", "format", "comments", "knowledge"];

export type KindState = "off" | "missing" | "queued" | "running" | "ready" | "stale" | "error" | "skipped";

export interface EnsureRequest {
  filePath: string;
  chapterIndex: number;
  priority: Priority;
  /** Default: the kinds enabled in the book's prefs. `[]` queues nothing (pure status read). */
  kinds?: ChapterKind[];
  group?: string;
  /** Re-run `kinds` for THIS chapter even when ready, skipping the AI cache read (↻). Additive (WS-D, Phase 1). */
  refresh?: boolean;
}

export interface ChapterStatus {
  filePath: string;
  chapterIndex: number;
  chapterId: ChapterId;
  kinds: Record<ChapterKind, KindState>;
  errors?: Partial<Record<ChapterKind, AIErrorInfo>>;
}

export interface BookAIStatus {
  filePath: string;
  totals: Record<ChapterKind, { ready: number; total: number }>;
  running: { kind: ChapterKind; chapterIndex: number }[];
}

export interface AIComment {
  paraId: ParaId;
  text: string;
}

/** Everything the reader needs to build a chapter's variants (`chapters:artifacts`).
 *  Stale layers are omitted. */
export interface ChapterArtifacts {
  chapterId: ChapterId;
  title?: string;
  rewrite?: RewriteLayer;
  format?: FormatLayer;
  comments?: AIComment[];
}

export interface BulkRequest {
  filePath: string;
  kinds: ChapterKind[];
  /** Inclusive 0-based chapter range. */
  from: number;
  to: number;
}

export interface BulkStatus {
  runId: string;
  filePath: string;
  state: "running" | "done" | "cancelled" | "error";
  perKind: Record<ChapterKind, { done: number; total: number; failed: number; skipped: number }>;
  active: { kind: ChapterKind; chapterIndex: number }[];
  etaMs?: number;
  startedAt: number;
  endedAt?: number;
}

/** One `chapter_artifacts` row. */
export interface ChapterArtifact<T> {
  filePath: string;
  chapterId: ChapterId;
  chapterIndex: number;
  kind: ArtifactKind;
  /** e.g. "" (default), "concise", "polish", "base:rewrite", "upTo:<frontier>". */
  variant: string;
  sourceHash: string;
  /** Hash of the layer this one was built on ("" when built on source). */
  baseHash: string;
  taskVersion: number;
  model: string;
  artifactHash: string;
  data: T;
  createdAt: number;
}

/** Main-side store (WS-D). Writes are synchronous single-row upserts and emit `artifact` events. */
export interface ArtifactStore {
  get<T>(filePath: string, chapterId: ChapterId, kind: ArtifactKind, variant?: string): ChapterArtifact<T> | null;
  put<T>(a: ChapterArtifact<T>): void;
  clear(filePath: string, kind: ArtifactKind | "all", chapterId?: ChapterId): number;
}

// ── Style dictionary (moved from src/lib/ai-style-dictionary.ts) ────────────

export interface StyleRule {
  id: string;
  /** Semantic trigger, e.g. "XP gains", "Health stat". */
  pattern: string;
  /** CSS component class, e.g. "ai-fmt-xp-badge". */
  component: string;
  /** Rendered example; sanitized (`ai-format` policy) before storage. */
  exampleHtml: string;
  /** Free-form: "stat", "badge", "dialogue", "item", … */
  category: string;
}

export interface StyleDictionary {
  rules: StyleRule[];
  /** characterName (lowercase) → dialogue CSS class, for consistency across chapters. */
  characterStyles?: Record<string, string>;
  bookTitle: string;
  updatedAt: string;
}

// ── Events ──────────────────────────────────────────────────────────────────

export type AIHealthState = "ok" | "no_key" | "auth_failed" | "rate_limited" | "offline";

/** `ai:health`: the current state behind the single health banner (matrix scenario 9). */
export interface AIHealthStatus {
  state: AIHealthState;
  /** While `rate_limited`: epoch ms when requests resume. */
  retryAt?: number;
  /** The error that tripped the breaker (`no_key` / `auth_failed`), if any. */
  message?: string;
}

/** The single broadcast stream (`"ai:event"`) to every window. Consumers switch on `type`. */
export type AIEvent =
  | {
      type: "job"; jobId: string; task: TaskId; scope?: JobScope; group?: string; state: JobState;
      progress?: { done: number; total: number }; error?: AIErrorInfo;
    }
  | { type: "delta"; jobId: string; text: string }
  | { type: "artifact"; filePath: string; chapterIndex: number; chapterId: ChapterId; kind: ArtifactKind; variant: string }
  | { type: "bulk"; status: BulkStatus }
  | { type: "knowledge"; filePath: string; chapters: number[]; reason: "ingest" | "edit" | "clear" | "merge" }
  | { type: "frontier"; filePath: string; frontier: Frontier }
  | { type: "settings"; settings: PublicAISettings }
  | { type: "lexicon"; version: string }
  | { type: "health"; state: AIHealthState; retryAt?: number }
  /** `book:reveal`: sent only to the reader window of `filePath` (citation chips in other windows). */
  | { type: "reveal"; filePath: string; ref: ParaRef };

export type AIEventType = AIEvent["type"];
export type AIEventOf<T extends AIEventType> = Extract<AIEvent, { type: T }>;
