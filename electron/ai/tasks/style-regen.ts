/**
 * `style.regenerate`, owner WS-D. Re-formats every paragraph that uses one component class with a
 * fresh treatment (optional user instruction). Replaces `ai-formatting.regenerateRule`, which
 * rewrote the whole-book `formattedChapters` blob from another window (AI_AUDIT S1-2).
 *
 * The orchestrator gathers the occurrences from the format artifacts and applies the returned
 * updates through the ArtifactStore (single-row upserts in main), so nothing is lost to races.
 * Not cacheable (it is meant to produce something new each time).
 */

import type { ChapterId, ParaId } from "../../shared/pipeline/types";
import { buildRegenMessages } from "../prompts/format";
import { hashOf } from "../prompts/util";
import { cleanFormattedHtml, preservesText } from "./format";
import {
  isCancellation, isTruncation, isUnusableReply, objectField, type ChapterTaskContext, type ChapterTaskDefinition,
} from "./chapter-task";

export const STYLE_REGEN_TASK_VERSION = 1;

export interface StyleRegenOccurrence {
  chapterId: ChapterId;
  chapterIndex: number;
  /** Format artifact variant this occurrence belongs to (one per base). */
  variant: string;
  /** Host paragraph → base html of the host and everything merged into it, in order. */
  base: Record<ParaId, string[]>;
  /** Host paragraph → current formatted html (contains the component). */
  previous: Record<ParaId, string>;
}

export interface StyleRegenInput {
  book: string;
  component: string;
  instruction?: string;
  styleRules: string;
  occurrences: StyleRegenOccurrence[];
}

export interface StyleRegenOutput {
  updates: { chapterId: ChapterId; chapterIndex: number; variant: string; paras: Record<ParaId, string> }[];
}

async function regenChapter(input: StyleRegenInput, occ: StyleRegenOccurrence, ctx: ChapterTaskContext): Promise<Record<ParaId, string>> {
  const ids = Object.keys(occ.previous);
  const alias = new Map(ids.map((id, i) => [String(i + 1), id]));
  const base: Record<string, string> = {};
  const previous: Record<string, string> = {};
  ids.forEach((id, i) => {
    base[String(i + 1)] = (occ.base[id] ?? []).join("\n");
    previous[String(i + 1)] = occ.previous[id];
  });
  let raw: Record<string, unknown>;
  try {
    const { value } = await ctx.completeJson({
      role: "format",
      messages: buildRegenMessages({ book: input.book, component: input.component, instruction: input.instruction, base, previous, styleRules: input.styleRules }),
      temperature: 0.9,
      check: (v) => (objectField(v, "paras") ? undefined : ['Expected {"paras": {...}}']),
    });
    raw = objectField(value, "paras")!;
  } catch (err) {
    if (isCancellation(err, ctx.signal)) throw err;
    if (!isTruncation(err) && !isUnusableReply(err)) throw err;
    ctx.log("warn", "style.regenerate: unusable reply; chapter skipped", { chapterId: occ.chapterId });
    return {};
  }
  const out: Record<ParaId, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = alias.get(key);
    if (!id || typeof value !== "string" || !value.trim()) continue; // no new merges in regeneration
    const cleaned = cleanFormattedHtml(value);
    if (cleaned === occ.previous[id] || !preservesText(occ.base[id] ?? [], cleaned)) continue;
    out[id] = cleaned;
  }
  return out;
}

export async function runStyleRegen(input: StyleRegenInput, ctx: ChapterTaskContext): Promise<StyleRegenOutput> {
  const updates: StyleRegenOutput["updates"] = [];
  let done = 0;
  ctx.progress(0, input.occurrences.length);
  for (const occ of input.occurrences) {
    ctx.signal.throwIfAborted?.();
    const paras = await ctx.memo(`regen:${hashOf(input.component, input.instruction ?? "", occ)}`, () => regenChapter(input, occ, ctx));
    if (Object.keys(paras).length > 0) updates.push({ chapterId: occ.chapterId, chapterIndex: occ.chapterIndex, variant: occ.variant, paras });
    ctx.progress(++done, input.occurrences.length);
  }
  return { updates };
}

export const styleRegenTask: ChapterTaskDefinition<StyleRegenInput, StyleRegenOutput> = {
  id: "style.regenerate",
  version: STYLE_REGEN_TASK_VERSION,
  role: "format",
  temperature: 0.9,
  maxTokens: 8192,
  cacheable: false,
  key: (input) => hashOf("regen", input.component, input.instruction ?? "", input.occurrences.map((o) => [o.chapterId, o.variant])),
  run: runStyleRegen,
};
