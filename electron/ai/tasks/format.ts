/**
 * `chapter.format` — the FORMAT layer (markup only), owner WS-D. AI_AUDIT §4.5 layer 2, Appendix A.
 *
 * Output is keyed by ParaId and sparse (only changed paragraphs): `{html}` or `{mergedInto}`.
 * Every accepted paragraph goes through, in order:
 *  1. speaker-badge normalisation: `<span class="ai-fmt-dialogue-*">Name</span>` is kept (and marked
 *     `data-tts-skip`) only when directly followed by an opening quote; otherwise it is unwrapped;
 *  2. WS-C's sanitizer (`sanitizeHtml(…, "ai-format")`);
 *  3. text preservation: visible text (badges excluded) vs the base text of the paragraph and
 *     everything merged into it must have similarity ≥ 0.97, else the paragraph (and its merges)
 *     keep their originals.
 * Merges must point at an EARLIER key of the same chunk that is itself kept as html.
 */

import type { FormatEntry, ParaId } from "../../shared/pipeline/types";
import { sanitizeHtml } from "../../shared/pipeline/sanitize";
import { FORMAT_CHUNK_CHARS, buildFormatMessages, type FormatSpeaker } from "../prompts/format";
import { chunkBySize, hashOf, textSimilarity, visibleText } from "../prompts/util";
import {
  isCancellation, isTruncation, isUnusableReply, objectField, type ChapterTaskContext, type ChapterTaskDefinition,
} from "./chapter-task";
import { fakeFormat } from "./fake-replies";

export const FORMAT_TASK_VERSION = 1;
export const TEXT_PRESERVATION_MIN = 0.97;

export interface FormatParaInput {
  id: ParaId;
  /** Base html: the rewrite layer's html when `base === "rewrite"`, else the source html. */
  html: string;
}

export interface FormatInput {
  book: string;
  base: "source" | "rewrite";
  /** `sourceHash` (base "source") or the rewrite layer's `artifactHash`. Part of the cache key. */
  baseHash: string;
  paras: FormatParaInput[];
  speakers: FormatSpeaker[];
  /** Style-dictionary prompt addendum (`buildStyleContext`). */
  styleRules: string;
}

export interface FormatStats {
  sent: number;
  changed: number;
  merged: number;
  rejected: number;
  splits: number;
}

export interface FormatOutput {
  paras: Record<ParaId, FormatEntry>;
  stats: FormatStats;
}

// ── Sanitizer (WS-C) ────────────────────────────────────────────────────────

/** AI markup through WS-C's allowlist (`ai-format` policy: ai-fmt-* classes, data-tts-skip, data:image). */
export function sanitizeFormatted(html: string): string {
  return sanitizeHtml(html, "ai-format");
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
}

// ── Speaker badges ──────────────────────────────────────────────────────────

const OPEN_QUOTE_RE = /^(?:\s|&nbsp;|&#160;|<(?:em|i|strong|b)\b[^>]*>)*(?:["“‘«「『]|&ldquo;|&quot;|&#8220;)/i;

/**
 * Speaker badges become `<span class="ai-fmt-dialogue-x" data-tts-skip>Name</span>` when directly
 * followed by an opening quote, and are unwrapped otherwise. A badge that swallowed the quote
 * (`<span …>Name “Hi”</span>`) is split first.
 */
export function normalizeSpeakerBadges(html: string): string {
  // 1. Split badges that wrapped the quoted speech too.
  let s = html.replace(
    /<span\b([^>]*\bclass\s*=\s*"[^"]*\bai-fmt-dialogue-[^"]*"[^>]*)>([^<]*?)(["“‘][^<]*)<\/span>/gi,
    (_m, attrs: string, name: string, quote: string) => (name.trim() ? `<span${attrs}>${name.trimEnd()}</span> ${quote}` : quote),
  );
  // 2. Keep (and mark) or unwrap each simple badge.
  const re = /<span\b([^>]*)>([^<]*)<\/span>/gi;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const cls = (attr(m[1], "class") ?? "").split(/\s+/).find((c) => /^ai-fmt-dialogue-[a-z0-9-]+$/i.test(c));
    if (!cls) continue;
    const after = s.slice(m.index + m[0].length);
    out += s.slice(last, m.index);
    out += OPEN_QUOTE_RE.test(after) && m[2].trim() ? `<span class="${cls}" data-tts-skip>${m[2].trim()}</span>` : m[2];
    last = m.index + m[0].length;
  }
  s = out + s.slice(last);
  return s;
}

// ── Task ────────────────────────────────────────────────────────────────────

/** Process one paragraph's AI html: badges → sanitize. Exported for style regeneration. */
export function cleanFormattedHtml(html: string): string {
  return sanitizeFormatted(normalizeSpeakerBadges(html));
}

/** True when `formatted` shows the same text as the base paragraphs it replaces. */
export function preservesText(baseHtmls: string[], formatted: string): boolean {
  const expected = baseHtmls.map(visibleText).join(" ");
  return textSimilarity(expected, visibleText(formatted)) >= TEXT_PRESERVATION_MIN;
}

async function formatChunk(
  input: FormatInput,
  chunk: FormatParaInput[],
  ctx: ChapterTaskContext,
  stats: FormatStats,
): Promise<Record<ParaId, FormatEntry>> {
  const aliases = chunk.map((_, i) => String(i + 1));
  const byAlias = new Map(aliases.map((a, i) => [a, i]));
  const payload: Record<string, string> = {};
  chunk.forEach((p, i) => (payload[aliases[i]] = p.html));

  let raw: Record<string, unknown>;
  try {
    const { value } = await ctx.completeJson({
      role: "format",
      messages: buildFormatMessages({ book: input.book, paras: payload, speakers: input.speakers, styleRules: input.styleRules }),
      temperature: 0.3,
      check: (v) => (objectField(v, "paras") ? undefined : ['Expected {"paras": {...}}']),
    });
    raw = objectField(value, "paras")!;
  } catch (err) {
    if (isCancellation(err, ctx.signal)) throw err;
    if (isUnusableReply(err)) {
      ctx.log("warn", "format: unusable reply; chunk left unformatted");
      return {};
    }
    if (!isTruncation(err)) throw err;
    if (chunk.length === 1) return {};
    stats.splits++;
    const mid = Math.ceil(chunk.length / 2);
    return {
      ...(await formatChunk(input, chunk.slice(0, mid), ctx, stats)),
      ...(await formatChunk(input, chunk.slice(mid), ctx, stats)),
    };
  }

  return mapFormatReply(chunk, raw, byAlias, stats);
}

/**
 * Turn a parsed `{alias: html | {mergedInto}}` reply into validated FormatEntries keyed by ParaId.
 * Exported for tests.
 */
export function mapFormatReply(
  chunk: FormatParaInput[],
  raw: Record<string, unknown>,
  byAlias: Map<string, number> = new Map(chunk.map((_, i) => [String(i + 1), i])),
  stats: FormatStats = { sent: 0, changed: 0, merged: 0, rejected: 0, splits: 0 },
): Record<ParaId, FormatEntry> {
  const html = new Map<number, string>();
  const mergedInto = new Map<number, number>();
  const blanks: number[] = [];
  for (const [alias, value] of Object.entries(raw)) {
    const i = byAlias.get(alias);
    if (i === undefined) continue;
    if (typeof value === "string") {
      if (value.trim() === "") blanks.push(i);
      else html.set(i, value);
    } else if (value && typeof value === "object" && typeof (value as { mergedInto?: unknown }).mergedInto === "string") {
      const t = byAlias.get((value as { mergedInto: string }).mergedInto);
      if (t !== undefined && t < i) mergedInto.set(i, t);
    }
  }
  // Legacy "consumed" marker (""): merge into the nearest earlier paragraph that has html.
  for (const i of blanks.sort((a, b) => a - b)) {
    for (let j = i - 1; j >= 0; j--) {
      if (html.has(j)) {
        mergedInto.set(i, j);
        break;
      }
      if (!blanks.includes(j) && !mergedInto.has(j)) break; // an unchanged paragraph in between
    }
  }

  // Merge hosts must be kept as html and not merged themselves.
  for (const [i, t] of [...mergedInto]) {
    if (!html.has(t) || mergedInto.has(t)) mergedInto.delete(i);
  }
  for (const i of mergedInto.keys()) html.delete(i);

  const out: Record<ParaId, FormatEntry> = {};
  for (const [i, rawHtml] of [...html].sort((a, b) => a[0] - b[0])) {
    const members = [i, ...[...mergedInto].filter(([, t]) => t === i).map(([m]) => m).sort((a, b) => a - b)];
    const cleaned = cleanFormattedHtml(rawHtml);
    if (!preservesText(members.map((k) => chunk[k].html), cleaned)) {
      stats.rejected++;
      continue;
    }
    if (members.length === 1 && cleaned === chunk[i].html) continue;
    out[chunk[i].id] = { html: cleaned };
    stats.changed++;
    for (const k of members.slice(1)) {
      out[chunk[k].id] = { mergedInto: chunk[i].id };
      stats.merged++;
    }
  }
  return out;
}

export async function runFormat(input: FormatInput, ctx: ChapterTaskContext): Promise<FormatOutput> {
  const stats: FormatStats = { sent: input.paras.length, changed: 0, merged: 0, rejected: 0, splits: 0 };
  const chunks = chunkBySize(input.paras, (p) => p.html.length, FORMAT_CHUNK_CHARS);
  const paras: Record<ParaId, FormatEntry> = {};
  let done = 0;
  ctx.progress(0, chunks.length);
  for (const chunk of chunks) {
    ctx.signal.throwIfAborted?.();
    const subKey = `format:${hashOf(chunk, input.speakers, input.styleRules)}`;
    Object.assign(paras, await ctx.memo(subKey, () => formatChunk(input, chunk, ctx, stats)));
    ctx.progress(++done, chunks.length);
  }
  return { paras, stats };
}

export const formatTask: ChapterTaskDefinition<FormatInput, FormatOutput> = {
  id: "chapter.format",
  version: FORMAT_TASK_VERSION,
  role: "format",
  temperature: 0.3,
  maxTokens: 8192,
  maxConcurrency: 3,
  cacheable: true,
  key: (input) => hashOf("format", input.base, input.baseHash, input.speakers, input.styleRules),
  run: runFormat,
  // Offline demo output under CODEX_AI_PROVIDER=fake (QA-P2-3).
  fakeResponse: fakeFormat,
};
