/**
 * Task contracts + registry (owner: WS-A). FROZEN for Phase 1 consumers (WS-B, WS-D, WS-E):
 * additive changes only.
 *
 * A task is a pure-ish async function `run(input, ctx)` that the scheduler executes. Everything a
 * task needs from the outside world comes through `TaskContext`; tasks never import `electron`,
 * never touch the DB directly for AI caching, and never retry transport errors (the scheduler's
 * `ctx.complete` already does: AI_AUDIT §4.4.3 retry table).
 *
 * Writing a task (see `electron/ai/testing.ts` for test helpers):
 *
 *   export const titleTask: TaskDefinition<TitleInput, TitleOutput> = {
 *     id: "chapter.title", version: 1, role: "fast", cacheable: true, maxConcurrency: 2,
 *     key: (input) => hashOf(input.book, input.chapters.map((c) => [c.id, c.preview])),
 *     async run(input, ctx) {
 *       const { value } = await ctx.completeJson({ messages: buildPrompt(input), schema: TitleSchema });
 *       return value;
 *     },
 *   };
 *   getAIRuntime().registry.register(titleTask);   // in your area's register*() function
 *
 * Submitting: `scheduler.submit({ task: "chapter.title", input, priority: Priority.Visible, scope })`.
 */

import type {
  AISettings, ArtifactStore, JobScope, JobSpec, ModelRole, Priority, TaskId,
} from "../shared/ai/types";
import type { KnowledgeReader } from "../shared/knowledge/types";
import type { BookContentV2, SourceChapter } from "../shared/pipeline/types";
import type { Schema, Issue } from "../shared/ai/validate";
import type { Completion, CompletionRequest, ModelCapabilities } from "./client";

// ── Services provided by other streams ──────────────────────────────────────

/**
 * Main-side book content (WS-C implements it; AI_AUDIT §5.5). Async because PDF parsing is.
 * Structural: WS-C's implementation only needs to match these two methods.
 */
export interface BookContentReader {
  getChapter(filePath: string, chapterIndex: number): Promise<SourceChapter>;
  getBook(filePath: string): Promise<BookContentV2>;
}

/** What `TaskContext` exposes from other areas. Provided to the runtime with `provideServices`. */
export interface TaskServices {
  books: BookContentReader;
  knowledge: KnowledgeReader;
  artifacts: ArtifactStore;
}

// ── Task definition ─────────────────────────────────────────────────────────

export interface KeyContext {
  /** The model the job will run on (settings.models[def.role]). */
  model: string;
  settings: AISettings;
  scope?: JobScope;
}

export interface TaskDefinition<I = any, O = any> {
  id: TaskId;
  /** Bump → old cache entries (and artifacts recording `taskVersion`) become stale. */
  version: number;
  role: ModelRole;
  temperature?: number;
  maxTokens?: number;
  /** Per-task cap on concurrently running jobs (e.g. format 3, condense 2). */
  maxConcurrency?: number;
  /** Jobs that return the same lane run strictly one at a time, in priority order
   *  (e.g. `knowledge:<filePath>`). */
  lane?(spec: JobSpec<I>): string | undefined;
  /** Whether the final output is stored in the AI cache (sub-call `memo` works regardless). */
  cacheable: boolean;
  /**
   * Everything that affects the output: input text hashes, prompt version, frontier, options.
   * The scheduler prefixes it with `${task}@v${version}|${model}|` and hashes the result; jobs
   * with the same key are deduplicated (joined) while in flight.
   */
  key(input: I, ctx: KeyContext): string;
  run(input: I, ctx: TaskContext): Promise<O>;
  /** Final output guard; `false` fails the job with `validation` (and nothing is cached). */
  validate?(output: unknown): output is O;
  /**
   * Fake-provider hook (`CODEX_AI_PROVIDER=fake`): return the raw model text for a request this
   * task makes, so the app runs deterministically without a key. Optional; without it the fake
   * provider echoes JSON found in the last user message.
   */
  fakeResponse?(req: CompletionRequest): string | undefined;
}

// ── Task context ────────────────────────────────────────────────────────────

/** `ctx.complete` request: like `CompletionRequest` minus what the scheduler fills in. */
export type TaskCompletionRequest = Omit<CompletionRequest, "model" | "signal" | "meta"> & {
  /** Use another role's model for this call (default: the task's role). */
  role?: ModelRole;
};

export interface JsonCompletionRequest<T> extends Omit<TaskCompletionRequest, "json"> {
  /** Validates (and normalises) the parsed value. Without it, any JSON value is accepted. */
  schema?: Schema<T>;
  /** Extra semantic check after the schema; return issues to trigger the one re-ask. */
  check?(value: T): Issue[] | string[] | undefined;
  /** Default "object". "schema" sends `schema.jsonSchema()` as `json_schema` when supported. */
  jsonMode?: "object" | "schema" | "none";
  /** Re-ask once (default) with the issues fed back on parse/validation failure. Set 0 to disable. */
  reasks?: 0 | 1;
}

export interface JsonCompletion<T> {
  value: T;
  completion: Completion;
  /** JSON had to be repaired (fences, quotes, control chars…). */
  repaired: boolean;
  /** Input was truncated and closed by the repairer (only possible with `allowTruncated`). */
  truncated: boolean;
  /** Non-fatal issues (e.g. salvaged/dropped array items). */
  issues: Issue[];
}

export interface TaskContext {
  jobId: string;
  task: TaskId;
  signal: AbortSignal;
  settings: AISettings;
  /** Model for the task's role. */
  model: string;
  scope?: JobScope;
  priority: Priority;
  group?: string;
  /** Model call through the limiter with the scheduler's retry policy. Throws `AIError`. */
  complete(req: TaskCompletionRequest): Promise<Completion>;
  /**
   * `complete` + loose JSON parsing (`shared/ai/json.ts`) + schema validation, with at most one
   * re-ask that feeds the issues back. Throws `AIError("parse" | "validation" | "truncated")`.
   */
  completeJson<T = unknown>(req: JsonCompletionRequest<T>): Promise<JsonCompletion<T>>;
  /** Known capabilities of the model behind `role` (default: the task's role); undefined if unknown. */
  capabilities(role?: ModelRole): ModelCapabilities | undefined;
  /** Model id configured for a role. */
  modelFor(role: ModelRole): string;
  /** Sub-call cache, e.g. per chunk, so cancelled jobs resume where they stopped. */
  memo<T>(subKey: string, fn: () => Promise<T>): Promise<T>;
  progress(done: number, total: number): void;
  /** Streamed text for `delta` events (only emitted when the job was submitted with `stream`). */
  delta(text: string): void;
  books: BookContentReader;
  knowledge: KnowledgeReader;
  artifacts: ArtifactStore;
  log(level: "debug" | "info" | "warn", msg: string, data?: unknown): void;
}

// ── Registry ────────────────────────────────────────────────────────────────

export interface TaskRegistry {
  /** Throws if the id is already registered (use `replace` in tests). */
  register(def: TaskDefinition): void;
  /** Throws `Error("unknown task …")` if missing. */
  get(id: TaskId): TaskDefinition;
  has(id: TaskId): boolean;
  list(): TaskDefinition[];
  /** Register or overwrite (tests, hot reload). */
  replace(def: TaskDefinition): void;
}

export function createTaskRegistry(defs: TaskDefinition[] = []): TaskRegistry {
  const map = new Map<TaskId, TaskDefinition>();
  const check = (def: TaskDefinition) => {
    if (!def || typeof def.id !== "string") throw new Error("registry: task definition without id");
    if (!Number.isInteger(def.version) || def.version < 1) throw new Error(`registry: task ${def.id} needs an integer version ≥ 1`);
    if (typeof def.run !== "function" || typeof def.key !== "function") throw new Error(`registry: task ${def.id} needs run() and key()`);
  };
  const reg: TaskRegistry = {
    register(def) {
      check(def);
      if (map.has(def.id)) throw new Error(`registry: task ${def.id} registered twice`);
      map.set(def.id, def);
    },
    get(id) {
      const def = map.get(id);
      if (!def) throw new Error(`registry: unknown task ${id}`);
      return def;
    },
    has: (id) => map.has(id),
    list: () => [...map.values()],
    replace(def) {
      check(def);
      map.set(def.id, def);
    },
  };
  for (const d of defs) reg.register(d);
  return reg;
}

/** Services that throw a clear error when a task uses one nobody provided yet. */
export function missingServices(): TaskServices {
  const missing = (name: string) =>
    new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") return undefined; // not a thenable
        throw new Error(`TaskContext.${name}.${String(prop)}: service not provided (call provideServices first)`);
      },
    });
  return {
    books: missing("books") as BookContentReader,
    knowledge: missing("knowledge") as KnowledgeReader,
    artifacts: missing("artifacts") as ArtifactStore,
  };
}
