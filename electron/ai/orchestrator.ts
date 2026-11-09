/**
 * Chapter orchestrator, owner WS-D (AI_AUDIT §4.4.6). Main-process only.
 *
 * Decides, per chapter × kind, what is missing or stale and submits jobs to WS-A's scheduler;
 * writes results through the ArtifactStore; tracks bulk runs from job events (never UI flags).
 *
 * Invariants (each one fixes an audit finding):
 * - ONE in-flight entry per (book, chapter, kind). A second `ensure` joins it and may raise its
 *   priority (S2-1 double-fire, S2-2 prefetch never deduped).
 * - `format` waits for `rewrite` when rewrite ≠ off, and records the rewrite layer's artifactHash
 *   as `baseHash`; a mismatch makes the layer `stale` and the next ensure re-queues it (S1-8).
 * - Cancellation is per entry and per group. An entry joined by navigation (no group) is "pinned"
 *   and survives cancellation of the prefetch/bulk group that created it, so Stop cancels only
 *   the bulk group (S2-3) and a jump away cancels only stale prefetch.
 * - Clear and ↻ are per chapter and per kind (S1-1). ↻ re-runs only that chapter (`refresh`).
 * - Bulk status is computed from entries and results, and reaches "done" (S2-5).
 */

import type {
  AIErrorInfo, AIEvent, BookAIPrefs, BookAIStatus, BulkRequest, BulkStatus, CancelSelector, ChapterArtifact,
  ChapterArtifacts, ChapterKind, ChapterStatus, EnsureRequest, JobResult, JobSpec, JobTicket, KindState,
  StyleDictionary, TaskId,
} from "../shared/ai/types";
import { CHAPTER_KINDS, Priority } from "../shared/ai/types";
import type { KnowledgeReader } from "../shared/knowledge/types";
import type {
  BookContentV2, ChapterId, FormatEntry, FormatLayer, ParaId, RewriteLayer, RewriteMode, SourceChapter,
} from "../shared/pipeline/types";
import type { ArtifactMeta, SqlArtifactStore, SqlPrefsStore } from "./artifacts";
import { buildStyleContext, type SqlStyleStore } from "./style";
import { formatRenamedTitle, isStructuralTitle, needsTitle, TITLE_BATCH_MAX, TITLE_PREVIEW_CHARS } from "./prompts/title";
import { DEFAULT_COMMENT_PERSONA, COMMENTS_MAX_PER_CHAPTER } from "./prompts/comments";
import { hashOf } from "./prompts/util";
import { REWRITE_TASK_VERSION, type RewriteInput, type RewriteOutput } from "./tasks/condense";
import { FORMAT_TASK_VERSION, type FormatInput, type FormatOutput } from "./tasks/format";
import { TITLE_TASK_VERSION, type TitleInput, type TitleOutput } from "./tasks/title";
import { COMMENTS_TASK_VERSION, type CommentsInput, type CommentsOutput } from "./tasks/comments";
import type { StyleRegenInput, StyleRegenOccurrence, StyleRegenOutput } from "./tasks/style-regen";
import type { FormatSpeaker } from "./prompts/format";

// ── Ports (structural; satisfied by WS-A/B/C implementations) ───────────────

/** The slice of WS-A's `Scheduler` (§4.4.3) the orchestrator uses. Jobs are submitted with no
 *  owner: chapter work belongs to the book, not to the window that asked. */
export interface SchedulerPort {
  submit<I>(spec: JobSpec<I>): JobTicket;
  result<O>(jobId: string): Promise<JobResult<O>>;
  cancel(sel: CancelSelector): number;
  bump(jobId: string, priority: Priority): void;
  onEvent(cb: (e: AIEvent) => void): () => void;
}

/** WS-C's `BookContentReader` (§5.5), async. */
export interface ChapterContentReader {
  getChapter(filePath: string, chapterIndex: number): Promise<SourceChapter> | SourceChapter;
  getBook(filePath: string): Promise<BookContentV2> | BookContentV2;
}

/** WS-B's knowledge runs, adapted (Phase 2) from `knowledge_runs` + `knowledge:ingest`. */
export interface KnowledgePort {
  chapterState(filePath: string, chapter: { id: ChapterId; index: number }): "ready" | "missing" | "stale" | "skipped";
  ingest(filePath: string, chapterIndex: number, priority: Priority, group?: string): JobTicket;
}

export interface OrchestratorOptions {
  /** Persona for `chapter.comments` (default: the original Discord/Reddit reader). */
  commentsPersona?: string;
  /** Work items a bulk run keeps in flight at once (the scheduler still caps requests). Default 4. */
  bulkWindow?: number;
  /** A failed kind is not retried by a plain `ensure` until this long after the failure. Default 30 s. */
  errorCooldownMs?: number;
  /** Book title for prompts (default: file name without extension). */
  bookTitle?: (filePath: string) => string;
  /** Chapters larger than this (sum of html chars) are skipped. Default 500k (legacy limit). */
  maxChapterChars?: number;
}

export interface OrchestratorDeps {
  scheduler: SchedulerPort;
  books: ChapterContentReader;
  artifacts: SqlArtifactStore;
  prefs: SqlPrefsStore;
  style: SqlStyleStore;
  /** Format speakers (`getContext({purpose: "format"})`). Optional: without it, speakers come
   *  from the style dictionary only. */
  knowledgeReader?: Pick<KnowledgeReader, "getContext">;
  /** Without it, the "knowledge" kind reports "off"/"skipped" and is never queued. */
  knowledge?: KnowledgePort;
  /** Broadcast (`bulk` events). Artifact events are emitted by the ArtifactStore. */
  emit: (e: AIEvent) => void;
  now?: () => number;
  options?: OrchestratorOptions;
}

// ── Internals ───────────────────────────────────────────────────────────────

type Outcome = "done" | "error" | "cancelled" | "skipped";

interface Entry {
  key: string;
  filePath: string;
  chapterIndex: number;
  chapterId: ChapterId;
  kind: ChapterKind;
  state: "queued" | "running";
  priority: Priority;
  /** Groups whose requests this entry serves. */
  groups: Set<string>;
  /** Requested without a group (navigation / ↻): never cancelled by a group cancel. */
  pinned: boolean;
  aborted: boolean;
  refresh: boolean;
  jobIds: Set<string>;
  deps: Entry[];
  promise: Promise<Outcome>;
}

interface BulkRun {
  status: BulkStatus;
  group: string;
  cancelled: boolean;
  durations: number[];
  remaining: number;
  /** Settles when every worker has returned. */
  finished: Promise<void>;
}

const TASK_OF: Record<Exclude<ChapterKind, "knowledge">, TaskId> = {
  title: "chapter.title",
  rewrite: "chapter.condense",
  format: "chapter.format",
  comments: "chapter.comments",
};

const VERSION_OF: Record<Exclude<ChapterKind, "knowledge">, number> = {
  title: TITLE_TASK_VERSION,
  rewrite: REWRITE_TASK_VERSION,
  format: FORMAT_TASK_VERSION,
  comments: COMMENTS_TASK_VERSION,
};

export const ERROR_DEPENDENCY: AIErrorInfo = { code: "unknown", message: "The rewrite layer is not available", retryable: true };

/** Format artifact variant for a rewrite mode ("" = formatted on the source). */
export function formatVariant(mode: BookAIPrefs["rewrite"]): string {
  return mode === "off" ? "" : `base:${mode}`;
}

export function enabledKinds(prefs: BookAIPrefs): ChapterKind[] {
  const out: ChapterKind[] = [];
  if (prefs.titles) out.push("title");
  if (prefs.rewrite !== "off") out.push("rewrite");
  if (prefs.formatting) out.push("format");
  if (prefs.comments) out.push("comments");
  if (prefs.knowledge) out.push("knowledge");
  return out;
}

function isEnabled(prefs: BookAIPrefs, kind: ChapterKind): boolean {
  switch (kind) {
    case "title": return prefs.titles;
    case "rewrite": return prefs.rewrite !== "off";
    case "format": return prefs.formatting;
    case "comments": return prefs.comments;
    case "knowledge": return prefs.knowledge;
  }
}

function emptyPerKind(): BulkStatus["perKind"] {
  const o = {} as BulkStatus["perKind"];
  for (const k of CHAPTER_KINDS) o[k] = { done: 0, total: 0, failed: 0, skipped: 0 };
  return o;
}

type MetaIndex = Map<string, ArtifactMeta>;
const metaKey = (chapterId: string, kind: string, variant: string) => `${chapterId}\u0000${kind}\u0000${variant}`;

function defaultTitle(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  return base.replace(/\.[^.]+$/, "");
}

function modelOf(r: JobResult): string {
  return r.usage.find((u) => !u.cached)?.model ?? r.usage[0]?.model ?? "";
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export class ChapterOrchestrator {
  private readonly inflight = new Map<string, Entry>();
  private readonly byJob = new Map<string, Set<Entry>>();
  private readonly errors = new Map<string, { info: AIErrorInfo; at: number }>();
  private readonly runs = new Map<string, BulkRun>();
  private readonly lastRunByBook = new Map<string, string>();
  private readonly now: () => number;
  private readonly opts: Required<Omit<OrchestratorOptions, "bookTitle">> & { bookTitle: (f: string) => string };
  private readonly unsubscribe: () => void;
  private seq = 0;

  constructor(private readonly deps: OrchestratorDeps) {
    this.now = deps.now ?? Date.now;
    const o = deps.options ?? {};
    this.opts = {
      commentsPersona: o.commentsPersona ?? DEFAULT_COMMENT_PERSONA,
      bulkWindow: Math.max(1, o.bulkWindow ?? 4),
      errorCooldownMs: o.errorCooldownMs ?? 30_000,
      bookTitle: o.bookTitle ?? defaultTitle,
      maxChapterChars: o.maxChapterChars ?? 500_000,
    };
    this.unsubscribe = deps.scheduler.onEvent((e) => this.onSchedulerEvent(e));
  }

  dispose(): void {
    this.unsubscribe();
    for (const e of this.inflight.values()) this.abort(e);
  }

  // ── Prefs ────────────────────────────────────────────────────────────────

  getPrefs(filePath: string): BookAIPrefs {
    return this.deps.prefs.get(filePath);
  }

  /** Saves the patch. Turning a kind off cancels that kind's queued work for the book. */
  setPrefs(filePath: string, patch: Partial<BookAIPrefs>): BookAIPrefs {
    const before = this.deps.prefs.get(filePath);
    const after = this.deps.prefs.set(filePath, patch);
    for (const e of [...this.inflight.values()]) {
      if (e.filePath !== filePath) continue;
      const turnedOff = isEnabled(before, e.kind) && !isEnabled(after, e.kind);
      const modeChanged = e.kind === "rewrite" && before.rewrite !== after.rewrite;
      if (turnedOff || modeChanged) this.abort(e);
    }
    return after;
  }

  // ── Status ───────────────────────────────────────────────────────────────

  private metaIndex(filePath: string): MetaIndex {
    const idx: MetaIndex = new Map();
    for (const m of this.deps.artifacts.listMeta(filePath)) idx.set(metaKey(m.chapterId, m.kind, m.variant), m);
    return idx;
  }

  private eligible(ch: SourceChapter, kind: ChapterKind): boolean {
    if (kind === "knowledge") return true; // decided by the knowledge port
    const textParas = ch.paras.filter((p) => p.kind === "text" && p.text.trim() !== "");
    if (kind === "title") return needsTitle(ch.title) && textParas.length > 0;
    if (textParas.length === 0 || isStructuralTitle(ch.title)) return false;
    const size = ch.paras.reduce((n, p) => n + p.html.length, 0);
    return size <= this.opts.maxChapterChars;
  }

  /** Valid rewrite layer meta for the current mode, or null. */
  private validRewrite(ch: SourceChapter, mode: RewriteMode, idx: MetaIndex): ArtifactMeta | null {
    const m = idx.get(metaKey(ch.id, "rewrite", mode));
    return m && m.sourceHash === ch.sourceHash && m.taskVersion === REWRITE_TASK_VERSION ? m : null;
  }

  /** "ready" | "stale" | "missing" from stored artifacts only. */
  private artifactState(ch: SourceChapter, kind: Exclude<ChapterKind, "knowledge">, prefs: BookAIPrefs, idx: MetaIndex): "ready" | "stale" | "missing" {
    if (kind === "rewrite") {
      const mode = prefs.rewrite === "off" ? null : prefs.rewrite;
      if (!mode) return "missing";
      const m = idx.get(metaKey(ch.id, "rewrite", mode));
      if (!m) return "missing";
      return m.sourceHash === ch.sourceHash && m.taskVersion === REWRITE_TASK_VERSION ? "ready" : "stale";
    }
    if (kind === "format") {
      const m = idx.get(metaKey(ch.id, "format", formatVariant(prefs.rewrite)));
      if (!m) return "missing";
      let baseHash: string | null = ch.sourceHash;
      if (prefs.rewrite !== "off") baseHash = this.validRewrite(ch, prefs.rewrite, idx)?.artifactHash ?? null;
      const ok = m.sourceHash === ch.sourceHash && m.taskVersion === FORMAT_TASK_VERSION && baseHash !== null && m.baseHash === baseHash;
      return ok ? "ready" : "stale";
    }
    const m = idx.get(metaKey(ch.id, kind, ""));
    if (!m) return "missing";
    return m.sourceHash === ch.sourceHash && m.taskVersion === VERSION_OF[kind] ? "ready" : "stale";
  }

  private kindState(filePath: string, ch: SourceChapter, kind: ChapterKind, prefs: BookAIPrefs, idx: MetaIndex): KindState {
    if (!isEnabled(prefs, kind)) return "off";
    const entry = this.inflight.get(this.key(filePath, ch.id, kind));
    if (entry && !entry.aborted) return entry.state;
    if (kind === "knowledge") {
      const k = this.deps.knowledge?.chapterState(filePath, { id: ch.id, index: ch.index }) ?? "skipped";
      if (k === "ready" || k === "skipped") return k;
      return this.recentError(filePath, ch.id, kind) ? "error" : k;
    }
    if (!this.eligible(ch, kind)) return "skipped";
    const s = this.artifactState(ch, kind, prefs, idx);
    if (s !== "ready" && this.recentError(filePath, ch.id, kind)) return "error";
    return s;
  }

  private recentError(filePath: string, chapterId: string, kind: ChapterKind): boolean {
    const e = this.errors.get(this.key(filePath, chapterId, kind));
    return !!e && this.now() - e.at < this.opts.errorCooldownMs;
  }

  private chapterStatus(filePath: string, ch: SourceChapter, prefs: BookAIPrefs, idx: MetaIndex): ChapterStatus {
    const kinds = {} as Record<ChapterKind, KindState>;
    const errors: Partial<Record<ChapterKind, AIErrorInfo>> = {};
    for (const k of CHAPTER_KINDS) {
      kinds[k] = this.kindState(filePath, ch, k, prefs, idx);
      const err = this.errors.get(this.key(filePath, ch.id, k));
      if (kinds[k] === "error" && err) errors[k] = err.info;
    }
    const status: ChapterStatus = { filePath, chapterIndex: ch.index, chapterId: ch.id, kinds };
    if (Object.keys(errors).length > 0) status.errors = errors;
    return status;
  }

  async bookStatus(filePath: string): Promise<BookAIStatus> {
    const book = await this.deps.books.getBook(filePath);
    const prefs = this.deps.prefs.get(filePath);
    const idx = this.metaIndex(filePath);
    const totals = {} as BookAIStatus["totals"];
    for (const k of CHAPTER_KINDS) totals[k] = { ready: 0, total: 0 };
    for (const ch of book.chapters) {
      for (const k of CHAPTER_KINDS) {
        if (k === "knowledge") {
          const s = this.deps.knowledge?.chapterState(filePath, { id: ch.id, index: ch.index });
          if (!s || s === "skipped") continue;
          totals.knowledge.total++;
          if (s === "ready") totals.knowledge.ready++;
          continue;
        }
        if (!this.eligible(ch, k)) continue;
        totals[k].total++;
        if (k === "rewrite" && prefs.rewrite === "off") {
          if (this.validRewrite(ch, "concise", idx) || this.validRewrite(ch, "polish", idx)) totals[k].ready++;
        } else if (this.artifactState(ch, k, prefs, idx) === "ready") {
          totals[k].ready++;
        }
      }
    }
    const running: BookAIStatus["running"] = [];
    for (const e of this.inflight.values()) {
      if (e.filePath === filePath && !e.aborted && e.state === "running") running.push({ kind: e.kind, chapterIndex: e.chapterIndex });
    }
    running.sort((a, b) => a.chapterIndex - b.chapterIndex);
    return { filePath, totals, running };
  }

  /** Valid layers for the book's current prefs (stale or disabled layers are omitted). */
  async chapterArtifacts(filePath: string, chapterIndex: number): Promise<ChapterArtifacts> {
    const ch = await this.deps.books.getChapter(filePath, chapterIndex);
    const prefs = this.deps.prefs.get(filePath);
    const idx = this.metaIndex(filePath);
    const out: ChapterArtifacts = { chapterId: ch.id };
    const a = this.deps.artifacts;
    if (prefs.titles && this.artifactState(ch, "title", prefs, idx) === "ready") {
      out.title = a.get<{ title: string }>(filePath, ch.id, "title")?.data.title;
    }
    if (prefs.rewrite !== "off" && this.artifactState(ch, "rewrite", prefs, idx) === "ready") {
      out.rewrite = a.get<RewriteLayer>(filePath, ch.id, "rewrite", prefs.rewrite)?.data;
    }
    if (prefs.formatting && this.artifactState(ch, "format", prefs, idx) === "ready") {
      out.format = a.get<FormatLayer>(filePath, ch.id, "format", formatVariant(prefs.rewrite))?.data;
    }
    if (prefs.comments && this.artifactState(ch, "comments", prefs, idx) === "ready") {
      out.comments = a.get<{ comments: ChapterArtifacts["comments"] }>(filePath, ch.id, "comments")?.data.comments;
    }
    return out;
  }

  // ── Ensure ───────────────────────────────────────────────────────────────

  private key(filePath: string, chapterId: string, kind: ChapterKind): string {
    return `${filePath}\u0000${chapterId}\u0000${kind}`;
  }

  /**
   * Queue whatever is missing/stale for one chapter and return its status right after queueing.
   * `kinds: []` queues nothing (pure status read). `refresh: true` re-runs the requested kinds
   * for THIS chapter only, bypassing the AI cache read.
   */
  async ensure(req: EnsureRequest): Promise<ChapterStatus> {
    const ch = await this.deps.books.getChapter(req.filePath, req.chapterIndex);
    const prefs = this.deps.prefs.get(req.filePath);
    const idx = this.metaIndex(req.filePath);

    if (req.priority <= Priority.Visible && !req.group) this.cancelDistantPrefetch(req.filePath, req.chapterIndex);

    const asked = req.kinds ?? enabledKinds(prefs);
    // Dependency order (rewrite before format), whatever order the caller used.
    const requested = CHAPTER_KINDS.filter((k) => asked.includes(k) && isEnabled(prefs, k));
    const want = new Set<ChapterKind>(requested);
    for (const kind of requested) this.ensureKind(req, ch, kind, prefs, idx);
    // A rewrite that is (re)running invalidates the format layer built on it: re-queue format too.
    if (want.has("rewrite") && !want.has("format") && prefs.formatting && this.inflight.has(this.key(req.filePath, ch.id, "rewrite"))) {
      this.ensureKind({ ...req, refresh: false }, ch, "format", prefs, idx);
    }
    return this.chapterStatus(req.filePath, ch, prefs, idx);
  }

  private ensureKind(req: EnsureRequest, ch: SourceChapter, kind: ChapterKind, prefs: BookAIPrefs, idx: MetaIndex): Entry | null {
    const existing = this.inflight.get(this.key(req.filePath, ch.id, kind));
    if (existing && !existing.aborted) {
      this.join(existing, req.priority, req.group);
      return existing;
    }
    const state = this.kindState(req.filePath, ch, kind, prefs, idx);
    if (state === "off" || state === "skipped") return null;
    if (state === "ready" && !req.refresh) {
      // Format is ready only relative to the current rewrite; a rewrite being re-run makes it stale.
      if (!(kind === "format" && this.inflight.has(this.key(req.filePath, ch.id, "rewrite")))) return null;
    }
    // Prefetch never re-hammers a chapter that just failed; navigation and bulk do retry.
    if (state === "error" && !req.refresh && req.priority === Priority.Prefetch) return null;
    return this.start(req.filePath, ch, kind, prefs, req.priority, req.group, !!req.refresh);
  }

  private join(e: Entry, priority: Priority, group?: string): void {
    if (group) e.groups.add(group);
    else e.pinned = true;
    if (priority < e.priority) {
      e.priority = priority;
      for (const id of e.jobIds) this.deps.scheduler.bump(id, priority);
    }
    for (const d of e.deps) this.join(d, priority, group);
  }

  private newEntry(filePath: string, ch: SourceChapter, kind: ChapterKind, priority: Priority, group: string | undefined, refresh: boolean): Entry {
    const e: Entry = {
      key: this.key(filePath, ch.id, kind),
      filePath, chapterIndex: ch.index, chapterId: ch.id, kind,
      state: "queued", priority, groups: new Set(group ? [group] : []), pinned: !group,
      aborted: false, refresh, jobIds: new Set(), deps: [],
      promise: Promise.resolve<Outcome>("cancelled"),
    };
    this.inflight.set(e.key, e);
    return e;
  }

  private launch(e: Entry, run: () => Promise<Outcome>): Entry {
    e.promise = Promise.resolve()
      .then(run)
      .catch((err: unknown): Outcome => {
        this.recordError(e, {
          code: "unknown",
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        });
        return "error";
      })
      .then((outcome) => {
        if (outcome === "done") this.errors.delete(e.key);
        return outcome;
      })
      .finally(() => {
        if (this.inflight.get(e.key) === e) this.inflight.delete(e.key);
        for (const id of e.jobIds) this.unmapJob(id, e);
      });
    return e;
  }

  private start(filePath: string, ch: SourceChapter, kind: ChapterKind, prefs: BookAIPrefs, priority: Priority, group: string | undefined, refresh: boolean): Entry {
    const e = this.newEntry(filePath, ch, kind, priority, group, refresh);
    switch (kind) {
      case "title": return this.launch(e, async () => (await this.runTitleBatch(filePath, [{ ch, entry: e }])).get(e) ?? "error");
      case "rewrite": return this.launch(e, () => this.runRewrite(e, ch, prefs.rewrite as RewriteMode));
      case "format": return this.launch(e, () => this.runFormat(e, ch));
      case "comments": return this.launch(e, () => this.runComments(e, ch));
      case "knowledge": return this.launch(e, () => this.runKnowledge(e, ch));
    }
  }

  private recordError(e: Entry, info: AIErrorInfo): void {
    this.errors.set(e.key, { info, at: this.now() });
  }

  // ── Jobs ─────────────────────────────────────────────────────────────────

  private mapJob(jobId: string, e: Entry): void {
    let set = this.byJob.get(jobId);
    if (!set) this.byJob.set(jobId, (set = new Set()));
    set.add(e);
    e.jobIds.add(jobId);
  }

  private unmapJob(jobId: string, e: Entry): void {
    const set = this.byJob.get(jobId);
    if (!set) return;
    set.delete(e);
    if (set.size === 0) this.byJob.delete(jobId);
  }

  /** Submit for one or more entries (a title batch shares one job) and wait for the result. */
  private async submit<I, O>(entries: Entry[], task: TaskId, input: I, ch: SourceChapter): Promise<JobResult<O> | null> {
    const live = entries.filter((e) => !e.aborted);
    if (live.length === 0) return null;
    const lead = live[0];
    const priority = Math.min(...live.map((e) => e.priority)) as Priority;
    const group = live.every((e) => !e.pinned) ? [...lead.groups][0] : undefined;
    const ticket = this.deps.scheduler.submit<I>({
      task,
      input,
      priority,
      group,
      scope: { filePath: lead.filePath, chapterIndex: ch.index, chapterId: ch.id },
      cache: live.some((e) => e.refresh) ? "refresh" : "use",
    });
    for (const e of live) this.mapJob(ticket.jobId, e);
    return this.deps.scheduler.result<O>(ticket.jobId);
  }

  /** Common result handling: null → cancelled; error → recorded. */
  private settle<O>(entries: Entry[], r: JobResult<O> | null): O | Outcome {
    if (!r || r.state === "cancelled" || entries.every((e) => e.aborted)) return "cancelled";
    if (r.state === "error" || r.output === undefined) {
      const info = r.error ?? { code: "unknown" as const, message: "No output", retryable: true };
      for (const e of entries) this.recordError(e, info);
      return "error";
    }
    return r.output;
  }

  private onSchedulerEvent(e: AIEvent): void {
    if (e.type !== "job") return;
    const entries = this.byJob.get(e.jobId);
    if (!entries) return;
    let changed = false;
    for (const entry of entries) {
      if (e.state === "running" && entry.state !== "running") {
        entry.state = "running";
        changed = true;
      } else if (e.state === "queued" && entry.state !== "queued") {
        entry.state = "queued";
        changed = true;
      }
    }
    if (changed) {
      for (const entry of entries) for (const g of entry.groups) this.touchRun(g);
    }
  }

  // ── Kind pipelines ───────────────────────────────────────────────────────

  private bookTitle(filePath: string): string {
    return this.opts.bookTitle(filePath);
  }

  /** One job for a batch of chapters; per-entry outcomes. */
  private async runTitleBatch(filePath: string, items: { ch: SourceChapter; entry: Entry }[]): Promise<Map<Entry, Outcome>> {
    const res = new Map<Entry, Outcome>();
    const input: TitleInput = {
      book: this.bookTitle(filePath),
      chapters: items.map(({ ch }) => ({
        id: ch.id,
        original: ch.title,
        preview: ch.paras.filter((p) => p.kind === "text").map((p) => p.text).join("\n").slice(0, TITLE_PREVIEW_CHARS),
      })),
    };
    const entries = items.map((i) => i.entry);
    const r = await this.submit<TitleInput, TitleOutput>(entries, "chapter.title", input, items[0].ch);
    const out = this.settle(entries, r);
    if (typeof out === "string") {
      for (const e of entries) res.set(e, e.aborted ? "cancelled" : out);
      return res;
    }
    for (const { ch, entry } of items) {
      if (entry.aborted) { res.set(entry, "cancelled"); continue; }
      const raw = out.titles[ch.id];
      if (!raw) {
        this.recordError(entry, { code: "validation", message: "The model returned no title for this chapter", retryable: true });
        res.set(entry, "error");
        continue;
      }
      const title = formatRenamedTitle(ch.title, raw);
      this.deps.artifacts.put({
        filePath, chapterId: ch.id, chapterIndex: ch.index, kind: "title", variant: "",
        sourceHash: ch.sourceHash, baseHash: "", taskVersion: TITLE_TASK_VERSION, model: modelOf(r!),
        artifactHash: hashOf(title), data: { title, raw }, createdAt: this.now(),
      });
      this.errors.delete(entry.key);
      res.set(entry, "done");
    }
    return res;
  }

  private async runRewrite(e: Entry, ch: SourceChapter, mode: RewriteMode): Promise<Outcome> {
    const input: RewriteInput = {
      mode,
      book: this.bookTitle(e.filePath),
      sourceHash: ch.sourceHash,
      paras: ch.paras.map((p) => ({ id: p.id, kind: p.kind, text: p.text, html: p.html })),
    };
    const r = await this.submit<RewriteInput, RewriteOutput>([e], "chapter.condense", input, ch);
    const out = this.settle([e], r);
    if (typeof out === "string") return out;
    const layer: RewriteLayer = { mode, artifactHash: hashOf(mode, ch.sourceHash, out.paras), sourceHash: ch.sourceHash, paras: out.paras };
    this.deps.artifacts.put({
      filePath: e.filePath, chapterId: ch.id, chapterIndex: ch.index, kind: "rewrite", variant: mode,
      sourceHash: ch.sourceHash, baseHash: "", taskVersion: REWRITE_TASK_VERSION, model: modelOf(r!),
      artifactHash: layer.artifactHash, data: layer, createdAt: this.now(),
    });
    return "done";
  }

  private speakers(filePath: string, ch: SourceChapter, style: StyleDictionary): FormatSpeaker[] {
    const cls = style.characterStyles ?? {};
    const out = new Map<string, FormatSpeaker>();
    try {
      const ctx = this.deps.knowledgeReader?.getContext({
        filePath,
        purpose: "format",
        budgetChars: 3000,
        focusText: ch.paras.map((p) => p.text).join("\n").slice(0, 20_000),
      });
      for (const ent of ctx?.entities ?? []) {
        if (ent.type !== "character") continue;
        out.set(ent.name.toLowerCase(), { name: ent.name, class: cls[ent.name.toLowerCase()] });
      }
    } catch { /* speakers are a hint; formatting works without them */ }
    for (const [name, c] of Object.entries(cls)) if (!out.has(name)) out.set(name, { name, class: c });
    return [...out.values()].slice(0, 40);
  }

  private async runFormat(e: Entry, ch: SourceChapter): Promise<Outcome> {
    const prefs = this.deps.prefs.get(e.filePath);
    let base: FormatInput["base"] = "source";
    let baseHash = ch.sourceHash;
    let rewrite: RewriteLayer | null = null;

    if (prefs.rewrite !== "off") {
      const mode = prefs.rewrite;
      base = "rewrite";
      const rKey = this.key(e.filePath, ch.id, "rewrite");
      let dep = this.inflight.get(rKey);
      if (!dep && !this.validRewrite(ch, mode, this.metaIndex(e.filePath))) {
        dep = this.start(e.filePath, ch, "rewrite", prefs, e.priority, [...e.groups][0], false);
        if (e.pinned) dep.pinned = true;
        for (const g of e.groups) dep.groups.add(g);
      }
      if (dep) {
        if (!e.deps.includes(dep)) e.deps.push(dep);
        if (e.pinned) this.join(dep, e.priority);
        for (const g of e.groups) this.join(dep, e.priority, g);
        await dep.promise;
      }
      if (e.aborted) return "cancelled";
      const meta = this.validRewrite(ch, mode, this.metaIndex(e.filePath));
      rewrite = meta ? this.deps.artifacts.get<RewriteLayer>(e.filePath, ch.id, "rewrite", mode)?.data ?? null : null;
      if (!rewrite) {
        this.recordError(e, ERROR_DEPENDENCY);
        return "error";
      }
      baseHash = rewrite.artifactHash;
    }

    const paras: FormatInput["paras"] = [];
    for (const p of ch.paras) {
      if (p.kind === "image" || p.kind === "rule" || p.html.includes("data:image/")) continue;
      if (rewrite) {
        const r = rewrite.paras[p.id];
        if (!r || "dropped" in r) continue;
        paras.push({ id: p.id, html: r.html });
      } else {
        paras.push({ id: p.id, html: p.html });
      }
    }
    const dict = this.deps.style.get(e.filePath, this.bookTitle(e.filePath));
    const input: FormatInput = {
      book: this.bookTitle(e.filePath),
      base,
      baseHash,
      paras,
      speakers: this.speakers(e.filePath, ch, dict),
      styleRules: buildStyleContext(dict),
    };
    const r = await this.submit<FormatInput, FormatOutput>([e], "chapter.format", input, ch);
    const out = this.settle([e], r);
    if (typeof out === "string") return out;

    // The base may have changed while the job ran (e.g. a rewrite ↻): don't write a stale layer.
    if (rewrite) {
      const current = this.validRewrite(ch, prefs.rewrite as RewriteMode, this.metaIndex(e.filePath));
      if (current?.artifactHash !== baseHash) return "cancelled";
    }
    const layer: FormatLayer = { artifactHash: hashOf(base, baseHash, out.paras), base, baseHash, paras: out.paras };
    this.deps.artifacts.put({
      filePath: e.filePath, chapterId: ch.id, chapterIndex: ch.index, kind: "format", variant: formatVariant(prefs.rewrite),
      sourceHash: ch.sourceHash, baseHash, taskVersion: FORMAT_TASK_VERSION, model: modelOf(r!),
      artifactHash: layer.artifactHash, data: layer, createdAt: this.now(),
    });
    const changed = Object.values(out.paras).flatMap((p: FormatEntry) => ("html" in p ? [p.html] : []));
    if (changed.length > 0) this.deps.style.mergeFormatted(e.filePath, changed, this.bookTitle(e.filePath));
    return "done";
  }

  private async runComments(e: Entry, ch: SourceChapter): Promise<Outcome> {
    const input: CommentsInput = {
      book: this.bookTitle(e.filePath),
      chapterLabel: `Chapter ${ch.index + 1}${ch.title ? ` "${ch.title}"` : ""}`,
      persona: this.opts.commentsPersona,
      max: COMMENTS_MAX_PER_CHAPTER,
      paras: ch.paras.filter((p) => p.kind === "text" && p.text.trim()).map((p) => ({ id: p.id, text: p.text })),
    };
    const r = await this.submit<CommentsInput, CommentsOutput>([e], "chapter.comments", input, ch);
    const out = this.settle([e], r);
    if (typeof out === "string") return out;
    this.deps.artifacts.put({
      filePath: e.filePath, chapterId: ch.id, chapterIndex: ch.index, kind: "comments", variant: "",
      sourceHash: ch.sourceHash, baseHash: "", taskVersion: COMMENTS_TASK_VERSION, model: modelOf(r!),
      artifactHash: hashOf(out.comments), data: { comments: out.comments }, createdAt: this.now(),
    });
    return "done";
  }

  private async runKnowledge(e: Entry, ch: SourceChapter): Promise<Outcome> {
    const port = this.deps.knowledge;
    if (!port) return "skipped";
    const group = e.pinned ? undefined : [...e.groups][0];
    const ticket = port.ingest(e.filePath, ch.index, e.priority, group);
    this.mapJob(ticket.jobId, e);
    const r = await this.deps.scheduler.result<object>(ticket.jobId);
    const out = this.settle([e], r.state === "done" ? { ...r, output: r.output ?? {} } : r);
    return typeof out === "string" ? out : "done";
  }

  // ── Cancellation ─────────────────────────────────────────────────────────

  private abort(e: Entry): void {
    if (e.aborted) return;
    e.aborted = true;
    for (const id of e.jobIds) {
      // Only cancel a shared job (title batch) when every entry on it is aborted.
      const others = [...(this.byJob.get(id) ?? [])].filter((x) => x !== e && !x.aborted);
      if (others.length === 0) this.deps.scheduler.cancel({ jobId: id });
    }
    if (this.inflight.get(e.key) === e) this.inflight.delete(e.key);
  }

  /** Cancel every entry that serves ONLY `group` (pinned/navigation entries keep running). */
  cancelGroup(group: string): number {
    let n = 0;
    for (const e of [...this.inflight.values()]) {
      if (!e.groups.has(group)) continue;
      e.groups.delete(group);
      if (!e.pinned && e.groups.size === 0) {
        this.abort(e);
        n++;
      }
    }
    return n;
  }

  /** Navigation moved more than one chapter away from a prefetched chapter: drop that prefetch. */
  private cancelDistantPrefetch(filePath: string, chapterIndex: number): void {
    for (const e of [...this.inflight.values()]) {
      if (e.filePath !== filePath || e.pinned || Math.abs(e.chapterIndex - chapterIndex) <= 1) continue;
      for (const g of [...e.groups]) {
        if (g.startsWith("prefetch:")) {
          e.groups.delete(g);
          if (e.groups.size === 0) this.abort(e);
        }
      }
    }
  }

  // ── Clear ────────────────────────────────────────────────────────────────

  /** Per chapter and per kind ("all" = every artifact kind). Cancels matching in-flight work first. */
  clear(filePath: string, kind: ChapterKind | "all" | "recap", chapterIndex?: number): number {
    for (const e of [...this.inflight.values()]) {
      if (e.filePath !== filePath) continue;
      if (kind !== "all" && e.kind !== kind) continue;
      if (chapterIndex !== undefined && e.chapterIndex !== chapterIndex) continue;
      if (e.kind === "knowledge") continue;
      this.abort(e);
    }
    for (const key of [...this.errors.keys()]) {
      if (key.startsWith(`${filePath}\u0000`) && (kind === "all" || key.endsWith(`\u0000${kind}`))) this.errors.delete(key);
    }
    if (kind === "knowledge") return 0; // WS-B: knowledge:clear
    const n = this.deps.artifacts.clearByIndex(filePath, kind, chapterIndex);
    if (chapterIndex === undefined && (kind === "all" || kind === "format")) this.deps.style.clear(filePath);
    return n;
  }

  // ── Bulk ─────────────────────────────────────────────────────────────────

  bulkStatus(filePath: string): BulkStatus | null {
    const id = this.lastRunByBook.get(filePath);
    return id ? this.snapshotRun(this.runs.get(id)!) : null;
  }

  private snapshotRun(run: BulkRun): BulkStatus {
    const s = run.status;
    const active: BulkStatus["active"] = [];
    if (s.state === "running") {
      for (const e of this.inflight.values()) {
        if (e.groups.has(run.group) && e.state === "running" && !e.aborted) active.push({ kind: e.kind, chapterIndex: e.chapterIndex });
      }
      active.sort((a, b) => a.chapterIndex - b.chapterIndex);
    }
    const perKind = {} as BulkStatus["perKind"];
    for (const k of CHAPTER_KINDS) perKind[k] = { ...s.perKind[k] };
    const out: BulkStatus = { ...s, perKind, active };
    if (s.state === "running" && run.durations.length > 0 && run.remaining > 0) {
      const avg = run.durations.reduce((a, b) => a + b, 0) / run.durations.length;
      out.etaMs = Math.round((avg * run.remaining) / Math.min(this.opts.bulkWindow, run.remaining));
    } else {
      delete out.etaMs;
    }
    return out;
  }

  private emitRun(run: BulkRun): void {
    this.deps.emit({ type: "bulk", status: this.snapshotRun(run) });
  }

  private touchRun(group: string): void {
    if (!group.startsWith("bulk:")) return;
    const run = this.runs.get(group.slice(5));
    if (run && run.status.state === "running") this.emitRun(run);
  }

  /** Start a bulk run over an inclusive chapter range. Only kinds enabled in the book's prefs run. */
  async startBulk(req: BulkRequest): Promise<{ runId: string }> {
    const prev = this.lastRunByBook.get(req.filePath);
    if (prev && this.runs.get(prev)?.status.state === "running") throw new Error("A bulk run is already active for this book");

    const book = await this.deps.books.getBook(req.filePath);
    const prefs = this.deps.prefs.get(req.filePath);
    const idx = this.metaIndex(req.filePath);
    const runId = `r${this.now().toString(36)}${(++this.seq).toString(36)}`;
    const group = `bulk:${runId}`;
    const from = Math.max(0, Math.min(req.from, req.to));
    const to = Math.min(book.chapters.length - 1, Math.max(req.from, req.to));
    const kinds = CHAPTER_KINDS.filter((k) => req.kinds.includes(k) && isEnabled(prefs, k));

    const run: BulkRun = {
      status: { runId, filePath: req.filePath, state: "running", perKind: emptyPerKind(), active: [], startedAt: this.now() },
      group, cancelled: false, durations: [], remaining: 0, finished: Promise.resolve(),
    };
    this.runs.set(runId, run);
    this.lastRunByBook.set(req.filePath, runId);

    // Work items, chapter-major so early chapters finish completely first. Titles are batched.
    type Item = { kind: ChapterKind; chapters: SourceChapter[] };
    const items: Item[] = [];
    let titleBatch: SourceChapter[] = [];
    const flushTitles = () => {
      if (titleBatch.length) items.push({ kind: "title", chapters: titleBatch });
      titleBatch = [];
    };
    for (let i = from; i <= to; i++) {
      const ch = book.chapters[i];
      for (const k of kinds) {
        const st = this.kindState(req.filePath, ch, k, prefs, idx);
        const pk = run.status.perKind[k];
        if (st === "skipped" || st === "off") { pk.skipped++; continue; }
        pk.total++;
        if (st === "ready") { pk.done++; continue; }
        if (k === "title") {
          titleBatch.push(ch);
          if (titleBatch.length >= TITLE_BATCH_MAX) flushTitles();
        } else {
          items.push({ kind: k, chapters: [ch] });
        }
      }
    }
    flushTitles();
    run.remaining = items.length;
    this.emitRun(run);

    const runItem = async (item: Item): Promise<void> => {
      const t0 = this.now();
      let outcomes: Outcome[];
      if (item.kind === "title") {
        const entries: { ch: SourceChapter; entry: Entry }[] = [];
        const waits: Promise<Outcome>[] = [];
        for (const ch of item.chapters) {
          const existing = this.inflight.get(this.key(req.filePath, ch.id, "title"));
          if (existing && !existing.aborted) {
            this.join(existing, Priority.Background, group);
            waits.push(existing.promise);
          } else {
            entries.push({ ch, entry: this.newEntry(req.filePath, ch, "title", Priority.Background, group, false) });
          }
        }
        if (entries.length > 0) {
          const batch = this.runTitleBatch(req.filePath, entries);
          for (const { entry } of entries) {
            this.launch(entry, async () => (await batch).get(entry) ?? "error");
            waits.push(entry.promise);
          }
        }
        outcomes = await Promise.all(waits);
      } else {
        const ch = item.chapters[0];
        const e = this.ensureKind(
          { filePath: req.filePath, chapterIndex: ch.index, priority: Priority.Background, group },
          ch, item.kind, prefs, this.metaIndex(req.filePath),
        );
        if (e) {
          outcomes = [await e.promise];
        } else {
          // Nothing to queue: became ready meanwhile (e.g. via navigation), or is not eligible.
          const st = this.kindState(req.filePath, ch, item.kind, prefs, this.metaIndex(req.filePath));
          outcomes = [st === "ready" ? "done" : st === "skipped" || st === "off" ? "skipped" : "error"];
        }
      }
      if (run.cancelled) return;
      const pk = run.status.perKind[item.kind];
      for (const o of outcomes) {
        if (o === "done") pk.done++;
        else if (o === "skipped") { pk.skipped++; pk.total--; }
        else pk.failed++;
      }
      run.remaining--;
      if (outcomes.some((o) => o === "done")) run.durations.push(this.now() - t0);
      this.emitRun(run);
    };

    let next = 0;
    const worker = async () => {
      while (!run.cancelled && next < items.length) await runItem(items[next++]);
    };
    run.finished = Promise.all(Array.from({ length: Math.min(this.opts.bulkWindow, items.length) }, worker)).then(() => {
      if (run.cancelled) return;
      const pks = Object.values(run.status.perKind);
      const failed = pks.reduce((n, p) => n + p.failed, 0);
      const done = pks.reduce((n, p) => n + p.done, 0);
      run.status.state = failed > 0 && done === 0 ? "error" : "done";
      run.status.endedAt = this.now();
      run.remaining = 0;
      this.emitRun(run);
    });
    return { runId };
  }

  /** Stop: cancels only this run's group. Work also requested by navigation keeps running. */
  cancelBulk(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || run.status.state !== "running") return;
    run.cancelled = true;
    this.cancelGroup(run.group);
    run.status.state = "cancelled";
    run.status.endedAt = this.now();
    this.emitRun(run);
  }

  /** Resolves when the run is no longer running (tests, shutdown). */
  async waitForRun(runId: string): Promise<BulkStatus | null> {
    const run = this.runs.get(runId);
    if (!run) return null;
    if (!run.cancelled) await run.finished;
    return this.snapshotRun(run);
  }

  // ── Style ────────────────────────────────────────────────────────────────

  getStyle(filePath: string): StyleDictionary {
    return this.deps.style.get(filePath, this.bookTitle(filePath));
  }

  /**
   * Re-format every paragraph using `component`, across all of the book's format artifacts.
   * Updates are applied through the ArtifactStore when the job finishes.
   */
  async regenerateStyle(filePath: string, component: string, instruction?: string): Promise<JobTicket> {
    const occurrences: StyleRegenOccurrence[] = [];
    const formats = this.deps.artifacts.list<FormatLayer>(filePath, "format");
    for (const art of formats) {
      const hosts = Object.entries(art.data.paras).filter(([, p]) => "html" in p && p.html.includes(component));
      if (hosts.length === 0) continue;
      const ch = await this.deps.books.getChapter(filePath, art.chapterIndex);
      if (ch.id !== art.chapterId || ch.sourceHash !== art.sourceHash) continue;
      let baseHtml = new Map<ParaId, string>(ch.paras.map((p) => [p.id, p.html]));
      if (art.data.base === "rewrite") {
        const mode = art.variant.replace(/^base:/, "");
        const rw = this.deps.artifacts.get<RewriteLayer>(filePath, ch.id, "rewrite", mode);
        if (!rw || rw.data.artifactHash !== art.baseHash) continue;
        baseHtml = new Map(Object.entries(rw.data.paras).flatMap(([id, p]) => ("html" in p ? [[id, p.html] as [string, string]] : [])));
      }
      const occ: StyleRegenOccurrence = { chapterId: ch.id, chapterIndex: ch.index, variant: art.variant, base: {}, previous: {} };
      for (const [id, p] of hosts) {
        const merged = Object.entries(art.data.paras).filter(([, q]) => "mergedInto" in q && q.mergedInto === id).map(([mid]) => mid);
        const order = new Map(ch.paras.map((sp, i) => [sp.id, i]));
        merged.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
        occ.base[id] = [id, ...merged].map((pid) => baseHtml.get(pid) ?? "");
        occ.previous[id] = (p as { html: string }).html;
      }
      occurrences.push(occ);
    }
    const input: StyleRegenInput = {
      book: this.bookTitle(filePath),
      component,
      instruction,
      styleRules: buildStyleContext(this.deps.style.get(filePath)),
      occurrences,
    };
    const ticket = this.deps.scheduler.submit<StyleRegenInput>({
      task: "style.regenerate", input, priority: Priority.Interactive, group: `style:${filePath}`, scope: { filePath }, cache: "bypass",
    });
    void this.deps.scheduler.result<StyleRegenOutput>(ticket.jobId).then((r) => {
      if (r.state === "done" && r.output) this.applyStyleUpdates(filePath, r.output);
    });
    return ticket;
  }

  /** Exported for tests: apply regenerated paragraphs as single-row upserts. */
  applyStyleUpdates(filePath: string, out: StyleRegenOutput): number {
    let n = 0;
    const htmls: string[] = [];
    for (const u of out.updates) {
      const art = this.deps.artifacts.get<FormatLayer>(filePath, u.chapterId, "format", u.variant);
      if (!art) continue;
      const paras = { ...art.data.paras };
      for (const [id, html] of Object.entries(u.paras)) {
        if (!paras[id] || !("html" in paras[id])) continue;
        paras[id] = { html };
        htmls.push(html);
        n++;
      }
      const data: FormatLayer = { ...art.data, paras, artifactHash: hashOf(art.data.base, art.data.baseHash, paras) };
      const next: ChapterArtifact<FormatLayer> = { ...art, data, artifactHash: data.artifactHash, createdAt: this.now() };
      this.deps.artifacts.put(next);
    }
    if (htmls.length > 0) this.deps.style.mergeFormatted(filePath, htmls, this.bookTitle(filePath));
    return n;
  }
}
