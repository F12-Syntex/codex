/**
 * Test fixtures for WS-E (assistant) unit tests: a tiny book, a frontier-gated fake
 * `KnowledgeReader`, a fake `BookContentReader`, a scripted `TaskContextLike` and a synchronous
 * fake scheduler. TESTS ONLY — never imported by production code.
 *
 * WS-A's `electron/ai/testing.ts` (fake scheduler + fake provider) supersedes the scheduler and
 * context fakes here once published; these stay minimal and structural.
 */

import type { AISettings, JobResult, JobSpec, JobTicket, CancelSelector, Usage } from "../shared/ai/types";
import type {
  EntityIndexItem, EntitySnapshot, Frontier, KnowledgeContext, KnowledgeContextRequest, KnowledgeReader, SearchHit,
} from "../shared/knowledge/types";
import type { BookContentV2, SourceChapter } from "../shared/pipeline/types";
import type { Completion } from "../ai/client";
import { toAIError } from "../ai/errors";
import type { BookContentReader, SchedulerLike, TaskCompleteRequest, TaskContextLike, TaskDefinitionLike } from "./contracts";

export const FILE = "/books/test-book.epub";

/** 5 chapters × 5 paragraphs. Chapter i paragraph j text: "c{i}p{j} …"; a few distinctive words. */
export function makeBook(chapters = 5, paras = 5): BookContentV2 {
  const out: BookContentV2["chapters"] = [];
  for (let i = 0; i < chapters; i++) {
    const ps = Array.from({ length: paras }, (_, j) => {
      let text = `c${i}p${j} Ordinary sentence number ${j} of chapter ${i}.`;
      if (i === 1 && j === 2) text = `c1p2 Mira found the silver key under the stairs. "I should not be here," she said.`;
      if (i === 2 && j === 4) text = `c2p4 The silver key opened the vault of the traitor king.`; // past the fixture frontier
      if (i === 3 && j === 1) text = `c3p1 Mira learns the silver key was forged by Orren.`; // past the frontier
      return { id: `p${i}_${j}`, index: j, kind: "text" as const, html: `<p>${text}</p>`, text };
    });
    out.push({ id: `c${i}`, index: i, title: `Chapter ${i + 1}`, sourceHash: `h${i}`, paras: ps, paragraphs: ps.map((p) => p.text), htmlParagraphs: ps.map((p) => p.html) });
  }
  return { bookId: "b1", parserVersion: 1, isImageBook: false, toc: [], chapters: out };
}

export function fakeBooks(book: BookContentV2): BookContentReader & { calls: number } {
  const r = {
    calls: 0,
    async getBook() {
      r.calls++;
      return book;
    },
    async getChapter(_f: string, idx: number): Promise<SourceChapter> {
      r.calls++;
      const c = book.chapters[idx];
      if (!c) throw new Error("no chapter");
      return c;
    },
  };
  return r;
}

/** Reader finished chapter index 1 and is at paragraph index 2 of chapter index 2. */
export const FRONTIER: Frontier = { chapterIndex: 1, paraId: "p2_2", mode: "frontier" };

const ENTITIES: EntitySnapshot[] = [
  {
    id: "mira", name: "Mira", type: "character", aliases: ["the thief"], shortDescription: "A young thief.", status: "alive",
    significance: 5, firstAppearance: 0, lastSeen: 1, details: [{ chapter: 1, category: "item", content: "Carries a silver key", superseded: false }],
    relationships: [{ targetId: "orren", targetName: "Orren", relation: "rival", since: 3 }],
  },
  {
    id: "orren", name: "Orren", type: "character", aliases: [], shortDescription: "A smith.", status: "alive",
    significance: 4, firstAppearance: 3, lastSeen: 3, details: [], relationships: [],
  },
];

export interface FakeKnowledgeOptions {
  /** Hits returned regardless of frontier (to prove the tools re-clamp). */
  hits?: SearchHit[];
  /** Simulate an ungated (buggy) reader: return entities/summaries past the frontier. */
  leaky?: boolean;
}

export function fakeKnowledge(frontier: Frontier = FRONTIER, opts: FakeKnowledgeOptions = {}): KnowledgeReader & { contexts: KnowledgeContextRequest[] } {
  const visible = (e: EntitySnapshot, f: Frontier) => opts.leaky || f.mode === "off" || e.firstAppearance <= f.chapterIndex + (f.paraId ? 1 : 0);
  const summaries = [0, 1, 2, 3].map((c) => ({ chapter: c, label: String(c + 1), summary: `Summary of chapter ${c + 1}.` }));
  const k = {
    contexts: [] as KnowledgeContextRequest[],
    getFrontier: () => frontier,
    getContext(req: KnowledgeContextRequest): KnowledgeContext {
      k.contexts.push(req);
      const f = req.frontier ?? frontier;
      const sums = opts.leaky ? summaries : summaries.filter((s) => f.mode === "off" || s.chapter <= f.chapterIndex);
      const ents = ENTITIES.filter((e) => visible(e, f));
      return {
        frontier: f, entities: ents, summaries: sums, arcs: [],
        text: [...ents.map((e) => `${e.name} (${e.id}): ${e.shortDescription}`), ...sums.map((s) => `Chapter ${s.label}: ${s.summary}`)].join("\n"),
      };
    },
    getEntityIndex(_fp: string, f: Frontier): EntityIndexItem[] {
      return ENTITIES.filter((e) => visible(e, f)).map((e) => ({ id: e.id, name: e.name, aliases: e.aliases, type: e.type, color: "#888" }));
    },
    getEntity(_fp: string, id: string, f: Frontier): EntitySnapshot | null {
      const e = ENTITIES.find((x) => x.id === id);
      return e && visible(e, f) ? e : null;
    },
    search(_fp: string, query: string): SearchHit[] {
      return (opts.hits ?? []).filter((h) => h.snippet.toLowerCase().includes(query.toLowerCase()) || !h.snippet);
    },
  };
  return k;
}

export const SETTINGS: AISettings = {
  version: 1,
  models: { fast: "m-fast", rewrite: "m", format: "m", analysis: "m", chat: "m-chat", creative: "m-creative", web: "m-web" },
  concurrency: 4, requestsPerMinute: 40, spoilerMode: "frontier", targetLanguage: "en", readAloud: "displayed",
  defaults: { titles: false, rewrite: "off", formatting: false, knowledge: false, comments: false, recapOnReopen: false, prefetchNext: false },
};

export type ScriptStep = Partial<Completion> | ((req: TaskCompleteRequest, i: number) => Partial<Completion>);

const USAGE: Usage = { model: "m-chat", promptTokens: 10, completionTokens: 5 };

/** A TaskContext whose `complete()` replays `script` (the last step repeats). Streams `text` in two chunks. */
export function scriptedContext(script: ScriptStep[], over: Partial<TaskContextLike> & { book?: BookContentV2; frontier?: Frontier } = {}) {
  const requests: TaskCompleteRequest[] = [];
  const deltas: string[] = [];
  const logs: { level: string; msg: string }[] = [];
  const controller = new AbortController();
  const ctx: TaskContextLike = {
    jobId: "job-1",
    signal: controller.signal,
    settings: SETTINGS,
    model: "m-chat",
    async complete(req) {
      const i = requests.length;
      requests.push(req);
      const step = script[Math.min(i, script.length - 1)];
      const c = typeof step === "function" ? step(req, i) : step;
      const text = c.text ?? "";
      if (req.stream && text) {
        const mid = Math.ceil(text.length / 2);
        req.stream(text.slice(0, mid));
        req.stream(text.slice(mid));
      }
      return { text, toolCalls: c.toolCalls ?? [], finishReason: c.finishReason ?? (c.toolCalls?.length ? "tool_calls" : "stop"), usage: c.usage ?? USAGE, model: "m-chat" };
    },
    delta: (t) => deltas.push(t),
    books: fakeBooks(over.book ?? makeBook()),
    knowledge: fakeKnowledge(over.frontier ?? FRONTIER),
    log: (level, msg) => logs.push({ level, msg }),
    ...over,
  };
  return { ctx, requests, deltas, logs, controller };
}

/** Runs submitted jobs immediately against `makeCtx()` with the given task definitions. */
export function fakeScheduler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defs: TaskDefinitionLike<any, any>[],
  makeCtx: () => TaskContextLike,
): SchedulerLike & { submitted: JobSpec[]; cancelled: (CancelSelector | { owner: number })[] } {
  const results = new Map<string, Promise<JobResult>>();
  let n = 0;
  const s = {
    submitted: [] as JobSpec[],
    cancelled: [] as (CancelSelector | { owner: number })[],
    submit<I>(spec: JobSpec<I>): JobTicket {
      s.submitted.push(spec as JobSpec);
      const jobId = `job-${++n}`;
      const def = defs.find((d) => d.id === spec.task);
      const started = Date.now();
      const p: Promise<JobResult> = (async () => {
        if (!def) return { jobId, state: "error", error: { code: "bad_request", message: "no task", retryable: false }, usage: [], cached: false, durationMs: 0 };
        try {
          const output = await def.run(spec.input, { ...makeCtx(), jobId });
          return { jobId, state: "done", output, usage: [], cached: false, durationMs: Date.now() - started };
        } catch (err) {
          const e = toAIError(err);
          return { jobId, state: e.code === "cancelled" ? "cancelled" : "error", error: e.toInfo(), usage: [], cached: false, durationMs: Date.now() - started };
        }
      })();
      results.set(jobId, p);
      return { jobId, joined: false, cached: false };
    },
    result<O>(jobId: string): Promise<JobResult<O>> {
      return (results.get(jobId) ?? Promise.reject(new Error("unknown job"))) as Promise<JobResult<O>>;
    },
    cancel(sel: CancelSelector | { owner: number }): number {
      s.cancelled.push(sel);
      return 0;
    },
  };
  return s;
}

export const toolCall = (name: string, args: unknown, id = `call_${name}`) => ({ id, name, arguments: JSON.stringify(args) });
