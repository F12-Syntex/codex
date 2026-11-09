"use client";

/**
 * useChapterPipeline(filePath, chapterIndex) — the reader's single source of rendered text
 * (owner: WS-C). Mounted by the reader since Phase 2c; the logic lives in the framework-free
 * controller `electron/shared/pipeline/controller.ts` (electron/pipeline-controller.test.ts).
 *
 * It loads `book:content` (sanitized, ParaId-anchored), the chapter's artifacts
 * (`chapters:artifacts`), the lexicon and the frontier-gated entity index, builds the
 * `RenderedChapter` with the fixed layer order, and refreshes on `ai:event`s.
 *
 *   const { status, chapter, source, book, layers } = useChapterPipeline(filePath, chapterIndex, {
 *     showRewrite: prefs.rewrite !== "off", showFormat: prefs.formatting, annotations, blocks,
 *   });
 *   chapter.visible.map(i => chapter.paras[i])   // page: html (+ marker), speed reader: text,
 *                                                // TTS: speech.text / speech.tokens[j].domWord
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import type { BookContentV2, EntityMatcher } from "@shared/pipeline/types";
import type { EntityIndexItem } from "@shared/knowledge/types";
import {
  createChapterPipeline,
  type ChapterPipeline,
  type ChapterPipelineOptions,
  type ChapterPipelineSources,
  type ChapterPipelineState,
} from "@shared/pipeline/controller";
import { rpc } from "@/lib/ai/rpc";
import { onAnyAIEvent } from "@/lib/ai/events";
import { book as bookRpc } from "@/lib/book/bridge";
import { getLexicon } from "@/lib/book/lexicon";

// One parsed book per window is enough (the reader shows one book); avoids re-fetching a
// multi-MB payload when the hook remounts.
let bookCache: { filePath: string; promise: Promise<BookContentV2> } | null = null;

function getBookCached(filePath: string): Promise<BookContentV2> {
  if (bookCache?.filePath === filePath) return bookCache.promise;
  const promise = bookRpc.content(filePath);
  bookCache = { filePath, promise };
  promise.catch(() => {
    if (bookCache?.promise === promise) bookCache = null;
  });
  return promise;
}

export function toEntityMatchers(items: EntityIndexItem[]): EntityMatcher[] {
  return items.map((e) => ({ id: e.id, names: [e.name, ...(e.aliases ?? [])], color: e.color, type: e.type }));
}

/** RPC-backed sources. Exported for tests and for secondary windows that want the same wiring. */
export const rpcPipelineSources: ChapterPipelineSources = {
  getBook: getBookCached,
  getLexicon,
  getArtifacts: (filePath, chapterIndex) => rpc("chapters:artifacts", filePath, chapterIndex),
  getEntities: async (filePath) => toEntityMatchers(await rpc("knowledge:entityIndex", filePath)),
  subscribe: onAnyAIEvent,
  onError: (what, err) => {
    // Artifacts/knowledge may legitimately be unavailable (feature off, handler not registered yet).
    if (what === "book") console.error("[useChapterPipeline] book:content failed", err);
  },
};

export type UseChapterPipelineOptions = Partial<ChapterPipelineOptions> & {
  /** Override the data sources (tests, alternative hosts). Read once on mount. */
  sources?: ChapterPipelineSources;
};

export type ChapterPipelineResult = ChapterPipelineState & {
  /** Re-fetch one input, e.g. after clearing artifacts. */
  refresh: ChapterPipeline["refresh"];
};

const IDLE: ChapterPipelineState = {
  status: "idle", error: null, filePath: null, chapterIndex: -1, book: null, source: null, chapter: null,
  original: null, artifacts: null, layers: { rewrite: "none", format: "none" },
  lexicon: { version: "", entries: [] },
};

export function useChapterPipeline(
  filePath: string | null | undefined,
  chapterIndex: number,
  options: UseChapterPipelineOptions = {},
): ChapterPipelineResult {
  const { sources, ...opts } = options;
  const [pipeline] = useState(() => createChapterPipeline(sources ?? rpcPipelineSources, opts));

  // attach/detach (not dispose) so StrictMode's mount → unmount → mount keeps working.
  useEffect(() => {
    pipeline.attach();
    return () => pipeline.detach();
  }, [pipeline]);

  useEffect(() => {
    pipeline.setTarget(filePath ?? null, chapterIndex);
  }, [pipeline, filePath, chapterIndex]);

  // Options are compared by identity inside the controller; pass memoised arrays.
  const { showRewrite, showFormat, entities, withOriginal, annotations, blocks } = opts;
  useEffect(() => {
    const patch: Partial<ChapterPipelineOptions> = {};
    if (showRewrite !== undefined) patch.showRewrite = showRewrite;
    if (showFormat !== undefined) patch.showFormat = showFormat;
    if (entities !== undefined) patch.entities = entities;
    if (withOriginal !== undefined) patch.withOriginal = withOriginal;
    if (annotations !== undefined) patch.annotations = annotations;
    if (blocks !== undefined) patch.blocks = blocks;
    pipeline.setOptions(patch);
  }, [pipeline, showRewrite, showFormat, entities, withOriginal, annotations, blocks]);

  const state = useSyncExternalStore(pipeline.subscribe, pipeline.getState, () => IDLE);
  return { ...state, refresh: pipeline.refresh };
}
