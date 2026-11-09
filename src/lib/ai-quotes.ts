/* ── AI Quote Enrichment (compatibility shim) ───────────────
 *
 * @deprecated Use `classifyQuote` / `classifySavedQuote` from `@/lib/quotes/classify`. Kept only
 * so callers not yet cut over keep working; it now runs the `quote.classify` task in main (one
 * scheduler, cache and cost ledger) instead of calling the model from the renderer. Delete once
 * nothing imports it.
 */

import { selection } from "./assistant/bridge";
import { speakerLabel } from "./quotes/classify";

export interface QuoteEnrichment {
  speaker: string;
  kind: "dialogue" | "inner_thought" | "narration" | "description" | "quote";
}

/** Detects the speaker and classifies the quote. Never modifies the text. */
export async function enrichQuote(
  quoteText: string,
  context: {
    chapterTitle: string;
    bookTitle: string;
    surroundingText?: string;
    /** Lets the task resolve the speaker against the book's (spoiler-gated) characters. */
    filePath?: string;
  },
): Promise<QuoteEnrichment> {
  try {
    const r = await selection.classifyQuote({
      filePath: context.filePath ?? "",
      quote: quoteText,
      bookTitle: context.bookTitle,
      chapterTitle: context.chapterTitle,
      ...(context.surroundingText ? { surrounding: context.surroundingText } : {}),
    });
    return r.state === "done" && r.output ? { speaker: speakerLabel(r.output), kind: r.output.kind } : { speaker: "unknown", kind: "quote" };
  } catch {
    return { speaker: "unknown", kind: "quote" };
  }
}
