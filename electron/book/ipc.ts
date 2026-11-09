/**
 * Book content, read marks and lexicon RPC handlers (owner: WS-C).
 *
 *   book:content           → BookContentV2 (main-side cache; format resolved here)
 *   book:readMarks:get/set → ParaId-anchored read marks (read_marks table)
 *   book:annotations:*     → user comments/highlights anchored by ParaRef (annotations table)
 *   book:anchors:*         → ParaRefs of rows kept in legacy tables (quotes, bookmarks)
 *   lexicon:get/set        → word replacements; `set` broadcasts {type:"lexicon", version}
 *   book:reveal            → focus the book's reader and send it {type:"reveal", ref} (or open a
 *                            reader at the ref): citation chips in the Buddy and Wiki windows
 *
 * Every read of user anchors first awaits the book's one-time legacy migration
 * (`legacy-migrate.ts`), so old index-anchored data is never shown un-migrated.
 * Do not import `electron` at the top level; take what you need from `ctx` or inject it.
 */

import type { AreaContext } from "../ipc/context";
import { provideKnowledgeBooks } from "../knowledge/ipc";
import { configureBookContentCache, type ContentCacheDeps } from "./content-cache";
import { LexiconStore, settingsKV } from "./lexicon-store";
import { getReadMarks, setReadMark } from "./read-marks";
import { addAnnotation, deleteAnchor, deleteAnnotation, listAnchors, listAnnotations, setAnchor } from "./anchors";
import { configureLegacyMigration, ensureBookMigrated } from "./legacy-migrate";
import { revealInReader } from "./windows";
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

  configureLegacyMigration({
    db: ctx.db,
    getBook: (filePath) => cache.getBook(filePath),
    getDefaults: () => peekAIRuntime()?.settings.get().defaults,
  });

  ctx.handle("book:readMarks:get", async (_meta, filePath) => {
    await ensureBookMigrated(filePath);
    return getReadMarks(ctx.db, filePath);
  });
  ctx.handle("book:readMarks:set", (_meta, filePath, chapterId, paraId) => setReadMark(ctx.db, filePath, chapterId, paraId));

  ctx.handle("book:annotations:list", async (_meta, filePath) => {
    if (typeof filePath !== "string" || !filePath) throw new Error("book:annotations:list: filePath required");
    await ensureBookMigrated(filePath);
    return listAnnotations(ctx.db, filePath);
  });
  ctx.handle("book:annotations:add", (_meta, a) => addAnnotation(ctx.db, a));
  ctx.handle("book:annotations:delete", (_meta, id) => deleteAnnotation(ctx.db, id));
  ctx.handle("book:anchors:list", async (_meta, filePath) => {
    if (typeof filePath !== "string" || !filePath) throw new Error("book:anchors:list: filePath required");
    await ensureBookMigrated(filePath);
    return listAnchors(ctx.db, filePath);
  });
  ctx.handle("book:anchors:set", (_meta, a) => setAnchor(ctx.db, a));
  ctx.handle("book:anchors:delete", (_meta, kind, refId) => deleteAnchor(ctx.db, kind, refId));

  ctx.handle("book:reveal", (_meta, filePath, ref) => {
    if (typeof filePath !== "string" || !filePath) throw new Error("book:reveal: filePath required");
    const r = (ref ?? {}) as { chapterId?: unknown; paraId?: unknown };
    if (typeof r.chapterId !== "string" || typeof r.paraId !== "string") throw new Error("book:reveal: ref.chapterId and ref.paraId required");
    revealInReader(filePath, { filePath, chapterId: r.chapterId, paraId: r.paraId });
  });

  ctx.handle("lexicon:get", () => lexicon.get());
  ctx.handle("lexicon:set", (_meta, entries) => {
    if (!Array.isArray(entries)) throw new Error("lexicon:set: entries must be an array");
    return lexicon.set(entries);
  });
}
