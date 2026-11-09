/**
 * `chapter.condense` — the REWRITE layer (polish | concise), owner WS-D. AI_AUDIT §5.3, Appendix A.
 *
 * Contract: output is keyed by SOURCE ParaId and strictly 1:1 with the input (every para gets an
 * entry; a dropped para is explicit). Guards, in order:
 *  1. Non-text, empty and dialogue-only paragraphs are passed through without being sent.
 *  2. Chunks of ~6k chars are sent as {alias: text}; the reply must have EXACTLY the same keys,
 *     otherwise the whole chunk keeps its originals.
 *  3. `truncated` → the chunk is split in half and each half retried (recursively); a single
 *     paragraph that still truncates keeps its original.
 *  4. Per-chunk word-retention ratio (concise 0.75–0.95, polish 0.97–1.08); outside → originals.
 *  5. Per paragraph: dialogue text must be identical; `null` (drop) only in concise mode and never
 *     for a paragraph with dialogue.
 */

import type { ParaId, RewriteEntry, RewriteMode, SourceParaKind } from "../../shared/pipeline/types";
import { RETENTION, RETENTION_MIN_WORDS, REWRITE_CHUNK_CHARS, buildRewriteMessages } from "../prompts/condense";
import { chunkBySize, escapeHtml, hashOf, isDialogueOnly, quotedSegments, wordCount } from "../prompts/util";
import {
  isCancellation, isTruncation, isUnusableReply, objectField, type ChapterTaskContext, type ChapterTaskDefinition,
} from "./chapter-task";
import { fakeRewrite } from "./fake-replies";

export const REWRITE_TASK_VERSION = 1;

export interface RewriteParaInput {
  id: ParaId;
  kind: SourceParaKind;
  /** Visible text (source layer, pre-lexicon). */
  text: string;
  /** Source html, used verbatim for paragraphs that are passed through or left unchanged. */
  html: string;
}

export interface RewriteInput {
  mode: RewriteMode;
  book: string;
  /** Part of the cache key; the paras are not hashed again. */
  sourceHash: string;
  paras: RewriteParaInput[];
}

export interface RewriteStats {
  sent: number;
  rewritten: number;
  kept: number;
  dropped: number;
  rejectedChunks: number;
  splits: number;
}

export interface RewriteOutput {
  paras: Record<ParaId, RewriteEntry>;
  stats: RewriteStats;
}

/** Result for one sent paragraph: rewritten text, `null` = drop, `undefined` = keep original. */
type ParaOutcome = string | null | undefined;

function sameDialogue(a: string, b: string): boolean {
  const norm = (s: string) => quotedSegments(s).map((q) => q.replace(/\s+/g, " ").trim());
  const qa = norm(a);
  const qb = norm(b);
  return qa.length === qb.length && qa.every((q, i) => q === qb[i]);
}

async function rewriteChunk(
  input: RewriteInput,
  chunk: RewriteParaInput[],
  ctx: ChapterTaskContext,
  stats: RewriteStats,
): Promise<Record<ParaId, ParaOutcome>> {
  const keep = (): Record<ParaId, ParaOutcome> => Object.fromEntries(chunk.map((p) => [p.id, undefined]));
  const aliases = chunk.map((_, i) => String(i + 1));
  const payload: Record<string, string> = {};
  chunk.forEach((p, i) => (payload[aliases[i]] = p.text));

  const keyIssues = (v: unknown): string[] => {
    const paras = objectField(v, "paras");
    if (!paras) return ['Expected {"paras": {...}}'];
    const got = Object.keys(paras);
    const missing = aliases.filter((a) => !Object.prototype.hasOwnProperty.call(paras, a));
    const extra = got.filter((k) => !aliases.includes(k));
    const issues: string[] = [];
    if (missing.length) issues.push(`Missing keys: ${missing.join(", ")}`);
    if (extra.length) issues.push(`Unexpected keys: ${extra.join(", ")}`);
    return issues;
  };

  let out: Record<string, unknown>;
  try {
    const { value } = await ctx.completeJson({
      role: "rewrite",
      messages: buildRewriteMessages(input.mode, input.book, payload),
      temperature: input.mode === "polish" ? 0.2 : 0.4,
      check: keyIssues,
    });
    out = objectField(value, "paras")!;
  } catch (err) {
    if (isCancellation(err, ctx.signal)) throw err;
    if (isUnusableReply(err)) {
      // Keys still differ (or no JSON) after the one re-ask: keep originals for this chunk.
      ctx.log("warn", "rewrite: reply keys differ from input; keeping originals for this chunk", { chunk: aliases.length });
      stats.rejectedChunks++;
      return keep();
    }
    if (!isTruncation(err)) throw err;
    if (chunk.length === 1) {
      ctx.log("warn", "rewrite: single paragraph still truncated; keeping original", { paraId: chunk[0].id });
      return keep();
    }
    stats.splits++;
    const mid = Math.ceil(chunk.length / 2);
    const left = await rewriteChunk(input, chunk.slice(0, mid), ctx, stats);
    const right = await rewriteChunk(input, chunk.slice(mid), ctx, stats);
    return { ...left, ...right };
  }

  // Proposed outcome per paragraph (before the chunk-level ratio check).
  const proposed: ParaOutcome[] = chunk.map((p, i) => {
    const v = out[aliases[i]];
    if (v === null) {
      if (input.mode !== "concise" || quotedSegments(p.text).length > 0) return undefined;
      return null;
    }
    if (typeof v !== "string") return undefined;
    const t = v.replace(/\s+/g, " ").trim();
    if (!t) return undefined;
    if (!sameDialogue(p.text, t)) return undefined;
    return t;
  });

  const inWords = chunk.reduce((n, p) => n + wordCount(p.text), 0);
  const outWords = proposed.reduce<number>((n, o, i) => n + (o === null ? 0 : wordCount(o ?? chunk[i].text)), 0);
  if (inWords >= RETENTION_MIN_WORDS) {
    const ratio = outWords / inWords;
    const { min, max } = RETENTION[input.mode];
    if (ratio < min || ratio > max) {
      ctx.log("warn", "rewrite: retention ratio out of range; keeping originals for this chunk", { ratio, min, max, mode: input.mode });
      stats.rejectedChunks++;
      return keep();
    }
  }
  return Object.fromEntries(chunk.map((p, i) => [p.id, proposed[i]]));
}

export async function runRewrite(input: RewriteInput, ctx: ChapterTaskContext): Promise<RewriteOutput> {
  const stats: RewriteStats = { sent: 0, rewritten: 0, kept: 0, dropped: 0, rejectedChunks: 0, splits: 0 };
  const sendable = input.paras.filter((p) => p.kind === "text" && p.text.trim() !== "" && !isDialogueOnly(p.text));
  stats.sent = sendable.length;
  const chunks = chunkBySize(sendable, (p) => p.text.length, REWRITE_CHUNK_CHARS);

  const outcomes: Record<ParaId, ParaOutcome> = {};
  let done = 0;
  ctx.progress(0, chunks.length);
  for (const chunk of chunks) {
    ctx.signal.throwIfAborted?.();
    const subKey = `rewrite:${input.mode}:${hashOf(chunk.map((p) => [p.id, p.text]))}`;
    Object.assign(outcomes, await ctx.memo(subKey, () => rewriteChunk(input, chunk, ctx, stats)));
    ctx.progress(++done, chunks.length);
  }

  const paras: Record<ParaId, RewriteEntry> = {};
  for (const p of input.paras) {
    const o = outcomes[p.id];
    if (o === null) {
      paras[p.id] = { dropped: true };
      stats.dropped++;
    } else if (typeof o === "string" && o !== p.text.replace(/\s+/g, " ").trim()) {
      paras[p.id] = { html: `<p>${escapeHtml(o)}</p>` };
      stats.rewritten++;
    } else {
      paras[p.id] = { html: p.html };
      if (Object.prototype.hasOwnProperty.call(outcomes, p.id)) stats.kept++;
    }
  }
  return { paras, stats };
}

export const rewriteTask: ChapterTaskDefinition<RewriteInput, RewriteOutput> = {
  id: "chapter.condense",
  version: REWRITE_TASK_VERSION,
  role: "rewrite",
  maxTokens: 4096,
  maxConcurrency: 2,
  cacheable: true,
  key: (input) => hashOf("rewrite", input.mode, input.sourceHash, input.paras.length),
  run: runRewrite,
  // Offline demo output under CODEX_AI_PROVIDER=fake (QA-P2-3).
  fakeResponse: fakeRewrite,
};
