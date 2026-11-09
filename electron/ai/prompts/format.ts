/**
 * `chapter.format` and `style.regenerate` prompts (owner: WS-D). Ported from
 * `src/lib/ai-formatting.ts`, with prose rules 3–5 removed: formatting is MARKUP ONLY now and
 * the task rejects any paragraph whose visible text changes (AI_AUDIT S3-11, §4.5 layer 2).
 *
 * Paragraphs are keyed by short per-chunk aliases; merges are explicit `{"mergedInto": key}`.
 */

import type { ChatMessage } from "../../shared/ai/types";
import { buildClassReference } from "./format-classes";

/** Target chunk size in characters of html. */
export const FORMAT_CHUNK_CHARS = 9000;

let classReference: string | null = null;
function classRef(): string {
  classReference ??= buildClassReference();
  return classReference;
}

function systemPrompt(): string {
  return `You are a book FORMATTING engine. You receive {"paras": {key: html}} and return ONLY the paragraphs you changed, as {"paras": {key: html | {"mergedInto": key}}}.

Read the content, understand the genre and tone, and apply visual enhancements from the CLASS REFERENCE. A literary novel needs a lighter touch than a game-lit novel. Adapt.

# RULES
1. MARKUP ONLY. Never change, add, remove or reorder words. Do not fix grammar or rephrase anything — the visible text must stay identical. You may only add or change HTML tags and ai-fmt-* classes.
2. Use ONLY classes from the reference. No inline styles, no ids, no links, no scripts, no emoji.
3. Structured data (stats, skills, tables, system notices): MAY be laid out as stat blocks, windows or lists, keeping every value and label.
4. Consecutive structured paragraphs may be merged into the FIRST one: put the combined html under the first key and set each consumed key to {"mergedInto": "<first key>"}. Only merge adjacent paragraphs.
5. Dialogue: a speaker badge <span class="ai-fmt-dialogue-*">Name</span> may be inserted ONLY immediately before the opening quotation mark of that speaker's line. Never wrap names inside narration with it. Use the speaker classes listed below when given.
6. Keep enhancements compact and inline; never dominate the page.
7. Skip plain narration that needs nothing. Unchanged paragraphs must be omitted from the output.

# OUTPUT
Only JSON: {"paras":{"3":"<p>…</p>","4":{"mergedInto":"3"}}}. No fences, no commentary. {"paras":{}} if nothing needs formatting.

# CLASS REFERENCE
${classRef()}`;
}

export interface FormatSpeaker {
  name: string;
  /** Preferred dialogue class, e.g. "ai-fmt-dialogue-hero". */
  class?: string;
}

function speakerBlock(speakers: FormatSpeaker[]): string {
  if (speakers.length === 0) return "";
  const lines = speakers.map((s) => (s.class ? `- ${s.name}: ALWAYS use \`${s.class}\`` : `- ${s.name}`)).join("\n");
  return `\n\n# SPEAKERS IN THIS BOOK (as far as the reader has read)\nUse these names to identify speakers. Keep each character's class consistent:\n${lines}`;
}

export function buildFormatMessages(opts: {
  book: string;
  paras: Record<string, string>;
  speakers: FormatSpeaker[];
  styleRules: string;
}): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt() + opts.styleRules + speakerBlock(opts.speakers) },
    {
      role: "user",
      content: `Book: "${opts.book}"\n\nFormat these ${Object.keys(opts.paras).length} paragraphs. Return ONLY changed ones:\n${JSON.stringify({ paras: opts.paras })}`,
    },
  ];
}

export function buildRegenMessages(opts: {
  book: string;
  component: string;
  instruction?: string;
  base: Record<string, string>;
  previous: Record<string, string>;
  styleRules: string;
}): ChatMessage[] {
  let request = `RE-FORMAT REQUEST: these paragraphs were previously formatted with "${opts.component}". Produce a clearly DIFFERENT visual treatment (different classes, structure or grouping), still markup-only.

PREVIOUS OUTPUT (do not repeat it):
${JSON.stringify(opts.previous)}`;
  if (opts.instruction?.trim()) request += `\n\nUSER REQUEST: ${opts.instruction.trim()}`;
  return [
    { role: "system", content: systemPrompt() + opts.styleRules },
    {
      role: "user",
      content: `Book: "${opts.book}"\n\n${request}\n\nOriginal paragraphs to re-format. Return ONLY changed ones as {"paras":{…}}:\n${JSON.stringify({ paras: opts.base })}`,
    },
  ];
}
