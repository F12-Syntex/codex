/**
 * Selections arrive from the page as DISPLAY text (word replacements applied, maybe a Concise /
 * Polish rewrite). AI inputs reason about the book as written (AI_AUDIT §4.5), so main maps the
 * selection back to its source paragraph and keeps the display text only as a hint (QA-P2-8).
 */

import { locateInSource } from "../shared/pipeline/source-selection";
import type { Lexicon, ParaRef, SourceChapter } from "../shared/pipeline/types";

/** Main's current display lexicon (null before `registerBook`, e.g. unit tests). */
export function currentLexicon(): Lexicon | null {
  try {
    // Lazy: book/ipc pulls in other areas; this module is imported by AI tasks.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("../book/ipc") as typeof import("../book/ipc")).getLexiconStore()?.get() ?? null;
  } catch {
    return null;
  }
}

export interface SourceSelectionText {
  /** The selection as written in the source (the display text when it can't be located). */
  text: string;
  /** Source text before the selection's end: the paragraph before it plus its own paragraph up
   *  to the selection's end (never text after it). */
  before: string;
  located: boolean;
}

/** Map a selection in `ch` (by ParaId) to source text. Null when the paragraph is unknown. */
export function sourceSelection(ch: SourceChapter | null | undefined, ref: Pick<ParaRef, "paraId">, displayText: string, lexicon: Lexicon | null = currentLexicon()): SourceSelectionText | null {
  if (!ch) return null;
  const at = ch.paras.findIndex((p) => p.id === ref.paraId);
  if (at < 0) return null;
  const para = ch.paras[at].text;
  const loc = locateInSource(para, displayText, lexicon);
  let prev = "";
  for (let i = at - 1; i >= 0 && !prev; i--) prev = ch.paras[i].text.trim();
  const own = loc ? para.slice(0, loc.end) : para;
  return { text: loc?.text ?? displayText, before: [prev, own].filter(Boolean).join("\n"), located: !!loc };
}
