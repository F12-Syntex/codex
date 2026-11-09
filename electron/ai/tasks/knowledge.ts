/**
 * `chapter.knowledge` (owner: WS-B): extract wiki knowledge from one chapter and apply it in one
 * transaction (`electron/knowledge/ingest.ts`). Runs on the per-book lane `knowledge:<filePath>`;
 * not cached (idempotency lives in `knowledge_runs`), but identical in-flight jobs join.
 *
 * Register with `getAIRuntime().registry.register(createKnowledgeTask(service))`.
 */

import { hashOf } from "../../shared/ai/hash";
import type { KnowledgeIngestInput, KnowledgeIngestOutput } from "../../shared/knowledge/types";
import { AIError } from "../errors";
import type { TaskDefinition } from "../registry";
import { ingestChapter, KNOWLEDGE_TASK_VERSION, knowledgeLane, type KnowledgeLane } from "../../knowledge/ingest";
import type { KnowledgeService } from "../../knowledge/service";

export const KNOWLEDGE_MAX_TOKENS = 16_000;

export function knowledgeLaneOf(filePath: string): string {
  return `knowledge:${filePath}`;
}

export function createKnowledgeTask(
  svc: KnowledgeService,
  opts: { lane?: KnowledgeLane } = {},
): TaskDefinition<KnowledgeIngestInput, KnowledgeIngestOutput> {
  return {
    id: "chapter.knowledge",
    version: KNOWLEDGE_TASK_VERSION,
    role: "analysis",
    temperature: 0.2,
    maxTokens: KNOWLEDGE_MAX_TOKENS,
    cacheable: false,
    lane: (spec) => knowledgeLaneOf(spec.input.filePath),
    key: (input) => hashOf(input.filePath, input.chapterIndex, input.force ? "force" : ""),
    validate: (o): o is KnowledgeIngestOutput => !!o && typeof o === "object" && typeof (o as KnowledgeIngestOutput).status === "string",
    async run(input, ctx) {
      return ingestChapter(
        {
          db: svc.db,
          lane: opts.lane ?? knowledgeLane,
          getChapter: (fp, idx) => ctx.books.getChapter(fp, idx),
          labelOf: svc.labelsFor(input.filePath),
          emit: svc.emit,
          log: ctx.log,
          async complete({ system, user }) {
            const c = await ctx.complete({
              messages: [{ role: "system", content: system }, { role: "user", content: user }],
              json: { mode: "object" },
              maxTokens: KNOWLEDGE_MAX_TOKENS,
              temperature: 0.2,
              allowTruncated: true,
            });
            if (c.finishReason === "length") throw new AIError("truncated", "Knowledge response truncated", { partial: c });
            return c.text;
          },
        },
        { filePath: input.filePath, chapterIndex: input.chapterIndex, bookTitle: input.bookTitle, force: input.force, signal: ctx.signal },
      );
    },
    fakeResponse(req) {
      // Deterministic offline output: a summary only, echoing the requested chapter_index.
      const last = req.messages[req.messages.length - 1]?.content ?? "";
      const m = /chapter_index: (\d+)\)/.exec(last);
      const ch = m ? Number(m[1]) : 0;
      return JSON.stringify({ batch: [{ chapter_index: ch, chapter_summary: { summary: `Events of chapter ${ch + 1}.`, mood: "calm", key_events: [] }, new_entries: [], updates: [] }] });
    },
  };
}
