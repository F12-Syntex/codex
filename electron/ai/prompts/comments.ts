/**
 * `chapter.comments` prompt (owner: WS-D). Ported from `src/lib/ai-comments.ts`, but:
 *  - covers the whole chapter in chunks (the old version saw only the first 6000 chars);
 *  - anchors to paragraph keys mapped back to ParaIds (not raw indices, AI_AUDIT S2-7);
 *  - the persona is a parameter (orchestrator option), defaulting to the original one.
 */

import type { ChatMessage } from "../../shared/ai/types";

export const COMMENTS_CHUNK_CHARS = 9000;
/** Hard cap per chapter, across chunks. */
export const COMMENTS_MAX_PER_CHAPTER = 3;

export const DEFAULT_COMMENT_PERSONA = `You're around 20 years old and spend a lot of time on Discord and Reddit. Your comments sound EXACTLY like real comments from those platforms: lowercase, abbreviations, slang, not always perfect grammar. Some are short ("bruh", "nah wtf"), some a sentence or two.`;

export function buildCommentsMessages(opts: {
  book: string;
  chapterLabel: string;
  persona: string;
  max: number;
  paras: Record<string, string>;
}): ChatMessage[] {
  const system = `You are reading "${opts.book}" for the first time and leaving comments as you go.
${opts.persona}

Rules:
- Comment on AT MOST ${opts.max} paragraph${opts.max === 1 ? "" : "s"}. ZERO is fine and usual: only react when something truly hits (a twist, a great line, something genuinely funny or shocking).
- React genuinely (funny, shocked, confused, hyped, sad, suspicious) and reference what actually happened in that paragraph.
- No spoilers, no guesses presented as facts about later chapters. Never say "as an AI". Never break character.
- Vary how comments start. Don't try too hard.

OUTPUT: only JSON {"comments":[{"p":"<paragraph key>","c":"<comment>"}]} (empty array if nothing stands out).`;
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `${opts.chapterLabel} of "${opts.book}". Paragraphs keyed by number:\n${JSON.stringify(opts.paras)}`,
    },
  ];
}
