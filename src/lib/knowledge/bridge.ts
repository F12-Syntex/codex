/**
 * Typed renderer wrappers for `knowledge:*` (owner WS-B). Every read is frontier-gated in main;
 * omit `frontier` to use the book's current one. Refresh on `knowledge` / `frontier` AI events.
 */

import type { Priority } from "@shared/ai/types";
import type { Frontier, KnowledgeContextRequest, ReadingPosition, WikiEdit } from "@shared/knowledge/types";
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
  ingest: (filePath: string, chapterIndex: number, priority: Priority) =>
    rpc("knowledge:ingest", filePath, chapterIndex, priority),
  clear: (filePath: string, chapterIndex?: number) => rpc("knowledge:clear", filePath, chapterIndex),
  wiki: (filePath: string, frontier?: Frontier) => rpc("knowledge:wiki", filePath, frontier),
} as const;
