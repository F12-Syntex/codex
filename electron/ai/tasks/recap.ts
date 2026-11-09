/**
 * `book.recap` (owner: WS-B) — F1 "Previously on…". AI_AUDIT §6 F1.
 *
 * Builds a recap of the chapters before the frontier from chapter summaries (`getContext`
 * purpose "recap", 6000 chars), ingesting up to 5 missing chapters inline through the knowledge
 * lane and falling back to raw excerpts (3k chars per chapter) for any still missing. Never
 * reads past the frontier. Cached (key includes frontier, window and the summaries), and stored
 * as artifact `recap` / variant `upTo:<frontier>` when an artifact store is available.
 */

import { hashOf } from "../../shared/ai/hash";
import { s } from "../../shared/ai/validate";
import type { Frontier, RecapInput, RecapOutput } from "../../shared/knowledge/types";
import type { SourceChapter } from "../../shared/pipeline/types";
import type { TaskContext, TaskDefinition } from "../registry";
import { getReadingState, recapWindow } from "../../knowledge/frontier";
import { ingestChapter, knowledgeLane, type KnowledgeLane } from "../../knowledge/ingest";
import { buildRecapSystemPrompt, buildRecapUserPrompt, RECAP_PROMPT_VERSION } from "../../knowledge/prompts";
import type { KnowledgeService } from "../../knowledge/service";
import { AIError } from "../errors";
import { KNOWLEDGE_MAX_TOKENS } from "./knowledge";

export const RECAP_BUDGET_CHARS = 6000;
export const RECAP_MAX_INGEST = 5;
export const RECAP_EXCERPT_CHARS = 3000;
export const RECAP_LAST_PARAS = 6;

const RecapSchema = s.object({
  bullets: s.array(s.string({ min: 1 }), { salvage: true, wrap: true }),
  leftOff: s.string(),
  entityIds: s.optional(s.array(s.string(), { salvage: true })),
});

interface Plan {
  frontier: Frontier;
  from: number;
  to: number;
}

function plan(svc: KnowledgeService, input: RecapInput): Plan {
  const frontier = input.frontier ?? svc.getFrontier(input.filePath);
  const state = getReadingState(svc.db, input.filePath);
  const away = input.awayMs ?? (state?.prev_session_at != null && state.session_started_at != null ? state.session_started_at - state.prev_session_at : null);
  const { from, to } = recapWindow(frontier.chapterIndex, away, state?.last_recap_chapter);
  return { frontier, from, to };
}

function summarisedChapters(svc: KnowledgeService, filePath: string, from: number, to: number): Set<number> {
  return new Set(
    svc.db
      .all<{ chapter_index: number }>("SELECT chapter_index FROM wiki_chapter_summaries WHERE file_path = ? AND chapter_index >= ? AND chapter_index <= ?", [filePath, from, to])
      .map((r) => Number(r.chapter_index)),
  );
}

function excerpt(ch: SourceChapter): string {
  const text = ch.paras.filter((p) => p.kind !== "image" && p.text.trim()).map((p) => p.text.trim()).join("\n");
  if (text.length <= RECAP_EXCERPT_CHARS) return text;
  const half = Math.floor(RECAP_EXCERPT_CHARS / 2);
  return `${text.slice(0, half)}\n[…]\n${text.slice(-half)}`;
}

/** The last paragraphs read, never past the frontier. */
async function lastParagraphs(ctx: TaskContext, filePath: string, f: Frontier): Promise<string[]> {
  const texts = (ch: SourceChapter, upToIdx: number) =>
    ch.paras.slice(0, upToIdx + 1).filter((p) => p.kind !== "image" && p.text.trim()).slice(-RECAP_LAST_PARAS).map((p) => p.text.trim());
  if (f.paraId) {
    try {
      const next = await ctx.books.getChapter(filePath, f.chapterIndex + 1);
      const i = next.paras.findIndex((p) => p.id === f.paraId);
      if (i >= 0) {
        const got = texts(next, i);
        if (got.length) return got;
      }
    } catch { /* fall back to the end of the frontier chapter */ }
  }
  if (f.chapterIndex < 0) return [];
  try {
    const ch = await ctx.books.getChapter(filePath, f.chapterIndex);
    return texts(ch, ch.paras.length - 1);
  } catch {
    return [];
  }
}

export function createRecapTask(svc: KnowledgeService, opts: { lane?: KnowledgeLane } = {}): TaskDefinition<RecapInput, RecapOutput> {
  return {
    id: "book.recap",
    version: RECAP_PROMPT_VERSION,
    role: "fast",
    temperature: 0.4,
    maxTokens: 900,
    cacheable: true,
    key(input) {
      const p = plan(svc, input);
      const summaries = svc.db.all<{ chapter_index: number; summary: string }>(
        "SELECT chapter_index, summary FROM wiki_chapter_summaries WHERE file_path = ? AND chapter_index >= ? AND chapter_index <= ? ORDER BY chapter_index",
        [input.filePath, p.from, p.to],
      );
      return hashOf(input.filePath, p.frontier, p.from, p.to, summaries, input.bookTitle ?? "");
    },
    async run(input, ctx) {
      const { filePath } = input;
      const { frontier, from, to } = plan(svc, input);
      const labelOf = svc.labelsFor(filePath);
      const empty: RecapOutput = { bullets: [], leftOff: "", entityIds: [], fromChapter: from, toChapter: to, fromLabel: labelOf(from), toLabel: labelOf(Math.max(0, to)), source: "summaries" };
      if (frontier.chapterIndex < 0 || to < from) return empty;

      // 1. Fill missing summaries (most recent first, at most 5) through the knowledge lane.
      const have = summarisedChapters(svc, filePath, from, to);
      const missing: number[] = [];
      for (let i = to; i >= from && missing.length < RECAP_MAX_INGEST; i--) if (!have.has(i)) missing.push(i);
      for (const ch of missing) {
        if (ctx.signal.aborted) throw new AIError("cancelled", "Cancelled");
        try {
          await ingestChapter(
            {
              db: svc.db,
              lane: opts.lane ?? knowledgeLane,
              getChapter: (fp, idx) => ctx.books.getChapter(fp, idx),
              labelOf,
              emit: svc.emit,
              log: ctx.log,
              async complete({ system, user }) {
                const c = await ctx.complete({
                  role: "analysis",
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
            { filePath, chapterIndex: ch, bookTitle: input.bookTitle, signal: ctx.signal },
          );
        } catch (err) {
          if (ctx.signal.aborted) throw err;
          ctx.log("warn", `recap: could not ingest chapter ${ch}`, err instanceof Error ? err.message : err);
        }
      }

      // 2. Raw excerpts for chapters still without a summary.
      const nowHave = summarisedChapters(svc, filePath, from, to);
      const excerpts: { label: string; text: string }[] = [];
      for (let i = from; i <= to; i++) {
        if (nowHave.has(i)) continue;
        try {
          excerpts.push({ label: labelOf(i), text: excerpt(await ctx.books.getChapter(filePath, i)) });
        } catch { /* chapter unavailable: skip */ }
      }

      // 3. Context (summaries in the window, arcs and the key entities) + the last paragraphs read.
      const lastParas = await lastParagraphs(ctx, filePath, frontier);
      const context = svc.getContext({
        filePath, frontier, purpose: "recap", budgetChars: RECAP_BUDGET_CHARS, summaryFrom: from,
        focusText: lastParas.join("\n"),
      });
      const allowed = new Set(context.entities.map((e) => e.id));
      const bookTitle = input.bookTitle ?? svc.db.get<{ book_title: string }>("SELECT book_title FROM wiki_meta WHERE file_path = ?", [filePath])?.book_title ?? "this book";

      const { value } = await ctx.completeJson({
        messages: [
          { role: "system", content: buildRecapSystemPrompt(bookTitle || "this book", labelOf(frontier.chapterIndex)) },
          { role: "user", content: buildRecapUserPrompt({ context: context.text, excerpts, lastParagraphs: lastParas }) },
        ],
        schema: RecapSchema,
        check: (v) => (v.bullets.length === 0 ? ["bullets must not be empty"] : undefined),
      });

      const out: RecapOutput = {
        bullets: value.bullets.map((b) => b.trim()).filter(Boolean).slice(0, 6),
        leftOff: value.leftOff.trim(),
        entityIds: [...new Set((value.entityIds ?? []).filter((id) => allowed.has(id)))].slice(0, 6),
        fromChapter: from,
        toChapter: to,
        fromLabel: labelOf(from),
        toLabel: labelOf(to),
        source: excerpts.length === 0 ? "summaries" : nowHave.size === 0 ? "excerpts" : "mixed",
      };
      if (lastParas.length) out.leftOffQuote = lastParas[lastParas.length - 1];

      // 4. Keep it as an artifact (best effort; the AI cache already has it).
      try {
        const ch = await ctx.books.getChapter(filePath, frontier.chapterIndex);
        ctx.artifacts.put({
          filePath, chapterId: ch.id, chapterIndex: ch.index, kind: "recap", variant: `upTo:${frontier.chapterIndex}`,
          sourceHash: ch.sourceHash, baseHash: "", taskVersion: RECAP_PROMPT_VERSION, model: ctx.model,
          artifactHash: hashOf(out), data: out, createdAt: Date.now(),
        });
      } catch (err) {
        ctx.log("debug", "recap: artifact not stored", err instanceof Error ? err.message : err);
      }
      return out;
    },
    fakeResponse() {
      return JSON.stringify({ bullets: ["The story so far continues."], leftOff: "We left off mid-scene.", entityIds: [] });
    },
  };
}
