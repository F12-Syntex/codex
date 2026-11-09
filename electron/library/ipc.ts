/**
 * Library AI RPC handlers (`library:*` new-style channels; owner WS-E for Phase 2d, AI_AUDIT §6 F5).
 *
 * `registerLibrary(ctx)` is called by `electron/ipc/registry.ts` after `registerAI` and
 * `registerBook`. It runs this area's own migrations (area "library"), registers the
 * `library.tag` and `book.lookup` tasks in WS-A's registry and wires the scheduler.
 * Legacy `library:*` channels in main.ts (items, settings) are unrelated `ipcMain` handlers.
 *
 * No top-level `electron` import.
 */

import fs from "fs";
import type { AreaContext } from "../ipc/context";
import { runMigrations } from "../db/migrate";
import { peekAIRuntime } from "../ai/runtime";
import { libraryTagTask } from "../ai/tasks/library-tags";
import { bookLookupTask } from "../ai/tasks/book-lookup";
import type { LibraryTagKind, LibrarySource } from "../shared/library/types";
import { libraryMigrations } from "./schema";
import { LibraryService } from "./service";

let service: LibraryService | null = null;

export function getLibraryService(): LibraryService | null {
  return service;
}

function fileSignature(filePath: string): string | undefined {
  try {
    const st = fs.statSync(filePath);
    return `${Math.round(st.mtimeMs)}-${st.size}`;
  } catch {
    return undefined;
  }
}

const KINDS: readonly LibraryTagKind[] = ["genre", "trope", "warning"];

function filePathArg(v: unknown): string {
  if (typeof v !== "string" || !v) throw new Error("library: filePath required");
  return v;
}

export function registerLibrary(ctx: AreaContext): LibraryService {
  const report = runMigrations(ctx.db, [{ area: "library", migrations: libraryMigrations }]);
  if (report.errors.length) console.error("[library] migrations failed", report.errors);

  const ai = peekAIRuntime();
  for (const task of [libraryTagTask, bookLookupTask]) {
    try {
      if (ai && !ai.registry.has(task.id)) ai.registry.register(task);
    } catch (err) {
      console.error(`[library] could not register ${task.id}`, err);
    }
  }

  const svc = new LibraryService(ctx.db, {
    scheduler: ai?.scheduler ?? null,
    signature: fileSignature,
    log: (msg, err) => console.error(msg, err ?? ""),
  });
  service = svc;
  const store = svc.store;

  ctx.handle("library:overview", (_m, filePaths) => store.overview(Array.isArray(filePaths) ? filePaths : undefined));
  ctx.handle("library:item", (_m, filePath) => store.item(filePathArg(filePath)));
  ctx.handle("library:tags:decide", (_m, filePath, tags, decision) => {
    const fp = filePathArg(filePath);
    if (decision !== "accept" && decision !== "dismiss") throw new Error("library: decision must be accept or dismiss");
    const list = Array.isArray(tags) ? tags.filter((t) => t && typeof t.tag === "string" && KINDS.includes(t.kind)) : [];
    store.decide(fp, list, decision);
    return store.item(fp);
  });
  ctx.handle("library:tags:add", (_m, filePath, kind, tags, source) => {
    const fp = filePathArg(filePath);
    if (!KINDS.includes(kind)) throw new Error("library: unknown tag kind");
    store.addAccepted(fp, kind, Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [], (source ?? "user") as LibrarySource);
    return store.item(fp);
  });
  ctx.handle("library:tag:start", (_m, req) => svc.startTagging(req ?? {}));
  ctx.handle("library:tag:status", () => svc.status());
  ctx.handle("library:tag:cancel", () => svc.cancel());
  ctx.handle("library:series:detect", (_m, filePaths) => svc.detectSeries(Array.isArray(filePaths) ? filePaths : undefined));
  ctx.handle("library:series:apply", (_m, assignments) => {
    const list = Array.isArray(assignments) ? assignments.filter((a) => a && typeof a.filePath === "string") : [];
    store.applySeries(list);
    return store.overview();
  });

  ctx.handle("library:progress", () => store.readingProgress());

  return svc;
}
