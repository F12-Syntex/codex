/**
 * `chapter.title` (batch), owner WS-D. Appendix A:
 *   in:  { book; chapters: { id: ChapterId; original; preview (≤ 800 chars) }[] }   (≤ 20 per call)
 *   out: { titles: Record<ChapterId, string /* 2–5 words, no number *\/> }
 * Chapters the model skipped are simply absent (the orchestrator marks them as errors). On
 * `truncated` the batch is split in half.
 */

import type { ChapterId } from "../../shared/pipeline/types";
import { TITLE_BATCH_MAX, TITLE_PREVIEW_CHARS, buildTitleMessages, cleanTitle } from "../prompts/title";
import { hashOf } from "../prompts/util";
import {
  isCancellation, isTruncation, isUnusableReply, objectField, type ChapterTaskContext, type ChapterTaskDefinition,
} from "./chapter-task";

export const TITLE_TASK_VERSION = 1;

export interface TitleInput {
  book: string;
  chapters: { id: ChapterId; original: string; preview: string }[];
}

export interface TitleOutput {
  titles: Record<ChapterId, string>;
}

function alias(i: number): string {
  // a, b, …, z, aa, ab, … (short, unambiguous keys the model echoes back reliably)
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

async function titleBatch(input: TitleInput, batch: TitleInput["chapters"], ctx: ChapterTaskContext): Promise<Record<ChapterId, string>> {
  const prompt = batch.map((c, i) => ({ key: alias(i), original: c.original, preview: c.preview.slice(0, TITLE_PREVIEW_CHARS) }));
  let titles: Record<string, unknown>;
  try {
    const { value } = await ctx.completeJson({
      role: "fast",
      messages: buildTitleMessages(input.book, prompt),
      temperature: 0.7,
      check: (v) => (objectField(v, "titles") ? undefined : ['Expected {"titles": {...}}']),
    });
    titles = objectField(value, "titles")!;
  } catch (err) {
    if (isCancellation(err, ctx.signal)) throw err;
    if (isUnusableReply(err)) return {}; // every chapter of the batch reports "no title"
    if (!isTruncation(err) || batch.length === 1) throw err;
    const mid = Math.ceil(batch.length / 2);
    return { ...(await titleBatch(input, batch.slice(0, mid), ctx)), ...(await titleBatch(input, batch.slice(mid), ctx)) };
  }
  const out: Record<ChapterId, string> = {};
  batch.forEach((c, i) => {
    const v = titles[alias(i)];
    if (typeof v === "string") {
      const t = cleanTitle(v);
      if (t) out[c.id] = t;
    }
  });
  return out;
}

export async function runTitles(input: TitleInput, ctx: ChapterTaskContext): Promise<TitleOutput> {
  const titles: Record<ChapterId, string> = {};
  const batches: TitleInput["chapters"][] = [];
  for (let i = 0; i < input.chapters.length; i += TITLE_BATCH_MAX) batches.push(input.chapters.slice(i, i + TITLE_BATCH_MAX));
  let done = 0;
  ctx.progress(0, batches.length);
  for (const batch of batches) {
    Object.assign(titles, await ctx.memo(`title:${hashOf(batch)}`, () => titleBatch(input, batch, ctx)));
    ctx.progress(++done, batches.length);
  }
  return { titles };
}

export const titleTask: ChapterTaskDefinition<TitleInput, TitleOutput> = {
  id: "chapter.title",
  version: TITLE_TASK_VERSION,
  role: "fast",
  temperature: 0.7,
  maxTokens: 1024,
  cacheable: true,
  key: (input) => hashOf("title", input.book, input.chapters),
  run: runTitles,
};
