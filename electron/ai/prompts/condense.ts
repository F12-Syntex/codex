/**
 * `chapter.condense` (rewrite layer) prompts (owner: WS-D). Ported from `src/lib/ai-condense.ts`
 * and the "light prose cleanup" rules 3–5 that used to live in the formatting prompt
 * (AI_AUDIT S3-11): formatting is now markup-only; all prose edits happen here.
 *
 * Two modes:
 *  - `polish`:  fixes only (grammar, typos, translation artefacts), ~100% retention.
 *  - `concise`: tighter prose, 75–95% retention; may drop a paragraph (never dialogue).
 *
 * Paragraphs are keyed by short per-chunk aliases ("1", "2", …) that the model must echo back
 * exactly; the task maps them back to ParaIds and rejects any chunk whose keys differ.
 */

import type { ChatMessage } from "../../shared/ai/types";
import type { RewriteMode } from "../../shared/pipeline/types";

/** Target chunk size in characters of source text (Appendix A: ~6k). */
export const REWRITE_CHUNK_CHARS = 6000;

/** Allowed word-retention ratio per chunk (AI_AUDIT §5.3 WS-D). Outside → originals kept. */
export const RETENTION: Record<RewriteMode, { min: number; max: number }> = {
  concise: { min: 0.75, max: 0.95 },
  polish: { min: 0.97, max: 1.08 },
};

/** Chunks with fewer source words than this are too small for a meaningful ratio check. */
export const RETENTION_MIN_WORDS = 40;

const COMMON = `OUTPUT: a JSON object {"paras": {...}} with EXACTLY the same keys as the input, in the same order.
Each value is the rewritten paragraph as plain text (no HTML, no markdown, no commentary).
Never merge, split, reorder or renumber paragraphs. Never add content.
Dialogue (text inside quotation marks) stays EXACTLY as written — same words, same punctuation.`;

const POLISH = `You are a careful copy editor. Fix only clear errors; the reader must not notice any edit.

Fix: grammar, spelling, punctuation, spacing, obvious translation artefacts, missing or doubled words, broken sentences.
Keep: every word that is not an error, the author's voice, dialect, slang, tense, POV and style. Do not shorten, embellish or paraphrase.
If a paragraph has no errors, return it unchanged.

${COMMON}`;

const CONCISE = `You are a book editor. Refine the prose — same voice, same content, tighter sentences.

GOAL: keep 80–90% of the original word count. Every piece of information, emotion and atmosphere must survive.
1. Same style, POV, tense and voice. Do NOT summarise.
2. Keep plot events, actions, names, numbers, abilities, items, reveals, emotional beats, descriptions, inner thoughts, humour and tone.
3. Only tighten: wordy phrases, redundant words ("nodded his head" → "nodded"), filler ("just", "really", "very"), run-on sentences.
4. You may set a paragraph to null ONLY if it is pure filler that repeats the previous paragraph. Never null a paragraph containing dialogue.
5. When in doubt, keep the original wording. Under-editing beats over-editing.

${COMMON}`;

export function buildRewriteMessages(
  mode: RewriteMode,
  book: string,
  paras: Record<string, string>,
): ChatMessage[] {
  return [
    { role: "system", content: mode === "polish" ? POLISH : CONCISE },
    {
      role: "user",
      content: `Book: "${book}"\n\nRewrite these ${Object.keys(paras).length} paragraphs (${mode}). Return {"paras": {…}} with the same keys:\n${JSON.stringify({ paras })}`,
    },
  ];
}
