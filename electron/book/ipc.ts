/**
 * Book content, read marks and lexicon RPC handlers (owner: WS-C).
 *
 *   book:content           → BookContentV2 (main-side cache; format resolved here)
 *   book:readMarks:get/set → ParaId-anchored read marks (read_marks table)
 *   lexicon:get/set        → word replacements; `set` broadcasts {type:"lexicon", version}
 *
 * `book:reveal` is not registered yet: it needs the reader to listen for a navigation event,
 * which lands with the Phase 2c reader cutover.
 * Do not import `electron` at the top level; take what you need from `ctx` or inject it.
 */

import type { AreaContext } from "../ipc/context";
import { provideKnowledgeBooks } from "../knowledge/ipc";
import { configureBookContentCache, type ContentCacheDeps } from "./content-cache";
import { LexiconStore, settingsKV } from "./lexicon-store";
import { getReadMarks, setReadMark } from "./read-marks";
import { peekAIRuntime } from "../ai/runtime";

let lexiconStore: LexiconStore | null = null;

/** The process-wide lexicon store (null before `registerBook`). */
export function getLexiconStore(): LexiconStore | null {
  return lexiconStore;
}

/** `opts.parse` is injectable for tests (default: `parseBookContentV2`). */
export function registerBook(ctx: AreaContext, opts?: { parse?: ContentCacheDeps["parse"] }): void {
  const lookupFormat = (filePath: string): string | null => {
    try {
      return ctx.db.get<{ format: string }>("SELECT format FROM items WHERE filePath = ?", [filePath])?.format ?? null;
    } catch {
      return null; // items table missing (tests)
    }
  };
  const parse = opts?.parse ?? (
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("../book-parser") as typeof import("../book-parser")).parseBookContentV2
  );
  const cache = configureBookContentCache({ parse, lookupFormat });
  // TaskContext.books for every AI task (registerAI runs first in registerAll; null in unit tests).
  peekAIRuntime()?.provideServices({ books: cache });
  // Knowledge search indexing + story labels read the same content cache.
  provideKnowledgeBooks(cache);

  lexiconStore = new LexiconStore(settingsKV(ctx.db), (lex) => ctx.broadcast("ai:event", { type: "lexicon", version: lex.version }));
  const lexicon = lexiconStore;

  ctx.handle("book:content", (_meta, filePath) => {
    if (typeof filePath !== "string" || !filePath) throw new Error("book:content: filePath required");
    return cache.getBook(filePath);
  });

  ctx.handle("book:readMarks:get", (_meta, filePath) => getReadMarks(ctx.db, filePath));
  ctx.handle("book:readMarks:set", (_meta, filePath, chapterId, paraId) => setReadMark(ctx.db, filePath, chapterId, paraId));

  ctx.handle("lexicon:get", () => lexicon.get());
  ctx.handle("lexicon:set", (_meta, entries) => {
    if (!Array.isArray(entries)) throw new Error("lexicon:set: entries must be an array");
    return lexicon.set(entries);
  });
}
