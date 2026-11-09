/**
 * Typed renderer wrappers for `library:*` (smart tagging + series, AI_AUDIT §6 F5) and the
 * `book.lookup` task ("Fetch details"). Mutations announce themselves on a window-local event so
 * the grid and an open details modal stay in step without polling.
 */

import type {
  BookLookupInput, BookLookupResult, LibraryTagKind, LibrarySource, LibraryTagRequest, SeriesAssignment,
} from "@shared/library/types";
import type { JobResult } from "@shared/ai/types";
import { Priority } from "@shared/ai/types";
import { rpc } from "@/lib/ai/rpc";

const CHANGED = "codex:library-ai-changed";

/** Notify listeners in this window that library tags / series changed. */
export function emitLibraryChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

/** Subscribe to local library-AI changes; returns an unsubscriber. */
export function onLibraryChanged(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}

async function changed<T>(p: Promise<T>): Promise<T> {
  const v = await p;
  emitLibraryChanged();
  return v;
}

export const libraryAI = {
  overview: (filePaths?: string[]) => rpc("library:overview", filePaths),
  item: (filePath: string) => rpc("library:item", filePath),
  decide: (filePath: string, tags: { tag: string; kind: LibraryTagKind }[], decision: "accept" | "dismiss") =>
    changed(rpc("library:tags:decide", filePath, tags, decision)),
  addTags: (filePath: string, kind: LibraryTagKind, tags: string[], source: LibrarySource = "user") =>
    changed(rpc("library:tags:add", filePath, kind, tags, source)),
  startTagging: (req: LibraryTagRequest = {}) => rpc("library:tag:start", req),
  tagStatus: () => rpc("library:tag:status"),
  cancelTagging: () => rpc("library:tag:cancel"),
  detectSeries: (filePaths?: string[]) => rpc("library:series:detect", filePaths),
  applySeries: (assignments: SeriesAssignment[]) => changed(rpc("library:series:apply", assignments)),
} as const;

/** "Fetch details": web lookup through the scheduler (Interactive, cached per title + author). */
export async function lookupBook(input: BookLookupInput, filePath?: string): Promise<JobResult<BookLookupResult>> {
  const ticket = await rpc("ai:submit", { task: "book.lookup", input, priority: Priority.Interactive, ...(filePath ? { scope: { filePath } } : {}) });
  return (await rpc("ai:result", ticket.jobId)) as JobResult<BookLookupResult>;
}
