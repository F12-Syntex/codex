/**
 * Quote classification through the `quote.classify` task (owner WS-E): speaker + kind, resolved
 * against the frontier-gated entity index in main, cached and cost-tracked by the scheduler.
 * Replaces `src/lib/ai-quotes.ts` (`enrichQuote`), which called the model from the renderer.
 */

import type { ParaRef } from "@shared/pipeline/types";
import type { QuoteClassifyResult } from "@shared/assistant/types";
import { selection } from "@/lib/assistant/bridge";

export interface ClassifyQuoteArgs {
  filePath: string;
  text: string;
  bookTitle?: string;
  chapterTitle?: string;
  /** Text before (and including) the quote's paragraph. Never text after it. */
  surrounding?: string;
  ref?: ParaRef;
}

/** Display speaker: the entity's name, "narrator", or "unknown". */
export function speakerLabel(r: QuoteClassifyResult): string {
  return r.speakerName ?? r.speaker;
}

/** Runs `quote.classify`; resolves null when the job failed (no key, offline, cancelled…). */
export async function classifyQuote(args: ClassifyQuoteArgs): Promise<QuoteClassifyResult | null> {
  const text = args.text.trim();
  if (!text || !args.filePath) return null;
  const r = await selection.classifyQuote({
    filePath: args.filePath,
    quote: text,
    ...(args.ref ? { ref: args.ref } : {}),
    ...(args.bookTitle ? { bookTitle: args.bookTitle } : {}),
    ...(args.chapterTitle ? { chapterTitle: args.chapterTitle } : {}),
    ...(args.surrounding ? { surrounding: args.surrounding } : {}),
  });
  return r.state === "done" && r.output ? r.output : null;
}

/** Classify a saved quote and store the result on it (`quotesUpdate`). Returns the stored fields. */
export async function classifySavedQuote(
  id: number,
  args: ClassifyQuoteArgs,
): Promise<{ speaker: string; kind: string; aiEnhanced: true } | null> {
  const r = await classifyQuote(args);
  if (!r) return null;
  const fields = { speaker: speakerLabel(r), kind: r.kind, aiEnhanced: true as const };
  await window.electronAPI?.quotesUpdate(id, fields);
  return fields;
}
