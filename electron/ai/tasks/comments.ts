/**
 * `chapter.comments`, owner WS-D. Appendix A:
 *   in per chunk: { paras: Record<ParaId, string>; persona; max }  →  out: { comments: {paraId, text}[] }
 * Covers the whole chapter in chunks (the legacy version saw only the first 6000 chars), anchored
 * to ParaIds so comments survive rewrite/format layers (AI_AUDIT S2-7). AI comments are artifacts;
 * user comments live in WS-C's `annotations` table and are never touched here (S1-6).
 */

import type { AIComment } from "../../shared/ai/types";
import type { ParaId } from "../../shared/pipeline/types";
import { COMMENTS_CHUNK_CHARS, COMMENTS_MAX_PER_CHAPTER, buildCommentsMessages } from "../prompts/comments";
import { chunkBySize, hashOf } from "../prompts/util";
import { isCancellation, isTruncation, isUnusableReply, type ChapterTaskContext, type ChapterTaskDefinition } from "./chapter-task";
import { fakeComments } from "./fake-replies";

export const COMMENTS_TASK_VERSION = 1;

export interface CommentsInput {
  book: string;
  /** e.g. "Chapter 12 “The Locked Archive”" (1-based story label). */
  chapterLabel: string;
  persona: string;
  /** Max comments for the whole chapter (default COMMENTS_MAX_PER_CHAPTER). */
  max?: number;
  paras: { id: ParaId; text: string }[];
}

export interface CommentsOutput {
  comments: AIComment[];
}

async function commentChunk(input: CommentsInput, chunk: CommentsInput["paras"], max: number, ctx: ChapterTaskContext): Promise<AIComment[]> {
  const payload: Record<string, string> = {};
  chunk.forEach((p, i) => (payload[String(i + 1)] = p.text));
  let list: unknown[];
  try {
    const { value } = await ctx.completeJson({
      role: "fast",
      messages: buildCommentsMessages({ book: input.book, chapterLabel: input.chapterLabel, persona: input.persona, max, paras: payload }),
      temperature: 0.9,
    });
    const c = value && typeof value === "object" ? (value as { comments?: unknown }).comments : undefined;
    list = Array.isArray(c) ? c : [];
  } catch (err) {
    if (isCancellation(err, ctx.signal)) throw err;
    if (isTruncation(err) || isUnusableReply(err)) return []; // comments are optional
    throw err;
  }
  const out: AIComment[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const p = (item as { p?: unknown }).p;
    const c = (item as { c?: unknown }).c;
    const idx = typeof p === "number" ? p - 1 : typeof p === "string" ? Number(p) - 1 : NaN;
    if (!Number.isInteger(idx) || idx < 0 || idx >= chunk.length || typeof c !== "string" || !c.trim()) continue;
    out.push({ paraId: chunk[idx].id, text: c.trim().slice(0, 400) });
    if (out.length >= max) break;
  }
  return out;
}

export async function runComments(input: CommentsInput, ctx: ChapterTaskContext): Promise<CommentsOutput> {
  const max = Math.max(0, input.max ?? COMMENTS_MAX_PER_CHAPTER);
  const paras = input.paras.filter((p) => p.text.trim().length > 0);
  const chunks = chunkBySize(paras, (p) => p.text.length, COMMENTS_CHUNK_CHARS);
  const comments: AIComment[] = [];
  let done = 0;
  ctx.progress(0, chunks.length);
  for (const chunk of chunks) {
    if (comments.length >= max) break;
    // Spread the budget: at most 1 per chunk on long chapters, the whole budget on short ones.
    const perChunk = chunks.length === 1 ? max : Math.max(1, Math.min(2, max - comments.length));
    const got = await ctx.memo(`comments:${hashOf(chunk, input.persona, perChunk)}`, () => commentChunk(input, chunk, perChunk, ctx));
    for (const c of got) {
      if (comments.length < max && !comments.some((x) => x.paraId === c.paraId)) comments.push(c);
    }
    ctx.progress(++done, chunks.length);
  }
  return { comments };
}

export const commentsTask: ChapterTaskDefinition<CommentsInput, CommentsOutput> = {
  id: "chapter.comments",
  version: COMMENTS_TASK_VERSION,
  role: "fast",
  temperature: 0.9,
  maxTokens: 1024,
  cacheable: true,
  key: (input) => hashOf("comments", input.chapterLabel, input.persona, input.max ?? COMMENTS_MAX_PER_CHAPTER, input.paras),
  run: runComments,
  // Offline demo output under CODEX_AI_PROVIDER=fake (QA-P2-3).
  fakeResponse: fakeComments,
};
