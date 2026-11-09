/**
 * Typed renderer wrappers for `knowledge:*` (owner WS-B). Every read is frontier-gated in main;
 * omit `frontier` to use the book's current one. Refresh on `knowledge` / `frontier` AI events
 * (see `useKnowledge.ts`).
 */

import type { JobResult } from "@shared/ai/types";
import { Priority } from "@shared/ai/types";
import type {
  EntityLookupInput, EntityLookupOutput, Frontier, KnowledgeContextRequest, ReadingPosition, RecapInput, RecapOutput,
  WikiEdit,
} from "@shared/knowledge/types";
import { rpc } from "@/lib/ai/rpc";

export const knowledge = {
  reportPosition: (filePath: string, pos: ReadingPosition) => rpc("knowledge:position", filePath, pos),
  frontier: (filePath: string) => rpc("knowledge:frontier", filePath),
  context: (req: KnowledgeContextRequest) => rpc("knowledge:context", req),
  entityIndex: (filePath: string, frontier?: Frontier) => rpc("knowledge:entityIndex", filePath, frontier),
  entity: (filePath: string, id: string, frontier?: Frontier) => rpc("knowledge:entity", filePath, id, frontier),
  search: (filePath: string, query: string, opts: { frontier?: Frontier; limit?: number } = {}) =>
    rpc("knowledge:search", filePath, query, opts),
  applyEdits: (filePath: string, edits: WikiEdit[]) => rpc("knowledge:edits:apply", filePath, edits),
  /** Revert one edit by an id from `ApplyResult.undoIds`. */
  undoEdit: (filePath: string, undoId: number) => rpc("knowledge:edits:undo", filePath, undoId),
  ingest: (filePath: string, chapterIndex: number, priority: Priority) =>
    rpc("knowledge:ingest", filePath, chapterIndex, priority),
  clear: (filePath: string, chapterIndex?: number) => rpc("knowledge:clear", filePath, chapterIndex),
  wiki: (filePath: string, frontier?: Frontier) => rpc("knowledge:wiki", filePath, frontier),
  /** Should "Previously on…" be offered now? (Starts a reading session after 30 min idle.) */
  recapStatus: (filePath: string) => rpc("knowledge:recapStatus", filePath),
  /** The recap up to `chapterIndex` was shown or dismissed. */
  recapSeen: (filePath: string, chapterIndex: number) => rpc("knowledge:recapSeen", filePath, chapterIndex),

  /** F1: generate the recap (task `book.recap`, Interactive). Cached in main per frontier. */
  recap: async (input: RecapInput, group?: string): Promise<JobResult<RecapOutput>> => {
    const ticket = await rpc("ai:submit", {
      task: "book.recap", input, priority: Priority.Interactive, scope: { filePath: input.filePath }, group,
    });
    return (await rpc("ai:result", ticket.jobId)) as JobResult<RecapOutput>;
  },
  /** F2: identify a name that is not in the wiki (task `entity.lookup`, Interactive). */
  lookup: async (input: EntityLookupInput, group?: string): Promise<JobResult<EntityLookupOutput>> => {
    const ticket = await rpc("ai:submit", {
      task: "entity.lookup", input, priority: Priority.Interactive, scope: { filePath: input.filePath }, group,
    });
    return (await rpc("ai:result", ticket.jobId)) as JobResult<EntityLookupOutput>;
  },
  cancelGroup: (group: string) => rpc("ai:cancel", { group }),
} as const;
