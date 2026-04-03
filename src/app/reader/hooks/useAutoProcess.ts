/* ── useAutoProcess — Queue-based auto-processing on chapter navigation ── */

import { useCallback, useRef, useEffect } from "react";
import { needsEnrichment } from "@/lib/ai-prompts";
import type { BookChapter, BookContent } from "../lib/types";

function isChapterTooLarge(chapter: { paragraphs: string[]; htmlParagraphs: string[] }): boolean {
  const totalLen = chapter.htmlParagraphs.reduce((sum, p) => sum + p.length, 0);
  if (totalLen > 500_000) return true;
  return chapter.htmlParagraphs.some(p => p.includes("data:image/") || p.includes("base64,"));
}

interface AutoProcessDeps {
  chapters: BookChapter[];
  bookContent: BookContent | null;
  filePath: string;
  currentChapter: number;

  // Feature states
  enrichEnabled: boolean;
  enrichedNames: Record<number, string>;
  condenseEnabled: boolean;
  condensedChapters: Record<number, string[]>;
  formattingEnabled: boolean;
  formattedChapters: Record<number, string[]>;
  fmtCondensedChapters: Record<number, string[]>;
  wikiEnabled: boolean;
  wikiProcessedChapters: Set<number>;
  commentsEnabled: boolean;
  chapterComments: Record<number, unknown[]>;

  // Feature functions
  enrichChapter: (idx: number) => Promise<void>;
  condenseChapter: (idx: number) => Promise<void>;
  formatChapter: (idx: number) => Promise<void>;
  formatCondensedChapter: (idx: number) => Promise<void>;
  processWikiChapter: (idx: number) => Promise<void>;
  generateCommentsForChapter: (idx: number) => Promise<void>;
}

export function useAutoProcess(deps: AutoProcessDeps) {
  const {
    chapters, bookContent, filePath, currentChapter,
    enrichEnabled, enrichedNames,
    condenseEnabled, condensedChapters,
    formattingEnabled, formattedChapters, fmtCondensedChapters,
    wikiEnabled, wikiProcessedChapters,
    commentsEnabled, chapterComments,
    enrichChapter, condenseChapter,
    formatChapter, formatCondensedChapter,
    processWikiChapter, generateCommentsForChapter,
  } = deps;

  const autoProcessTargetRef = useRef<number | null>(null);
  const autoProcessingRef = useRef(false);

  const autoProcessChapter = useCallback(async (chapterIdx: number) => {
    if (!chapters[chapterIdx] || isChapterTooLarge(chapters[chapterIdx])) return;

    // Enrich current chapter if needed
    if (enrichEnabled && needsEnrichment(chapters[chapterIdx].title) && !enrichedNames[chapterIdx]) {
      await enrichChapter(chapterIdx);
    }

    // Pre-enrich next chapter (fire and forget)
    const nextIdx = chapterIdx + 1;
    if (enrichEnabled && nextIdx < chapters.length && chapters[nextIdx] && needsEnrichment(chapters[nextIdx].title) && !enrichedNames[nextIdx]) {
      enrichChapter(nextIdx);
    }

    // Condense current chapter if needed
    if (condenseEnabled && !condensedChapters[chapterIdx]) {
      await condenseChapter(chapterIdx);
    }

    // Pre-condense next chapter (fire and forget)
    if (condenseEnabled && nextIdx < chapters.length && !condensedChapters[nextIdx] && chapters[nextIdx] && !isChapterTooLarge(chapters[nextIdx])) {
      condenseChapter(nextIdx);
    }

    // Format based on current mode
    if (formattingEnabled) {
      if (condenseEnabled && condensedChapters[chapterIdx] && !fmtCondensedChapters[chapterIdx]) {
        await formatCondensedChapter(chapterIdx);
      } else if (!condenseEnabled && !formattedChapters[chapterIdx]) {
        await formatChapter(chapterIdx);
      }

      // Pre-format next chapter
      if (condenseEnabled && nextIdx < chapters.length && condensedChapters[nextIdx] && !fmtCondensedChapters[nextIdx]) {
        formatCondensedChapter(nextIdx);
      } else if (!condenseEnabled && nextIdx < chapters.length && !formattedChapters[nextIdx] && chapters[nextIdx] && !isChapterTooLarge(chapters[nextIdx])) {
        formatChapter(nextIdx);
      }
    }

    // Wiki processing if enabled
    if (wikiEnabled && !wikiProcessedChapters.has(chapterIdx)) {
      await processWikiChapter(chapterIdx);
    }

    // AI Comments if enabled
    if (commentsEnabled && !chapterComments[chapterIdx]) {
      await generateCommentsForChapter(chapterIdx);
    }
  }, [chapters, enrichEnabled, enrichedNames, enrichChapter,
      condenseEnabled, condensedChapters, condenseChapter,
      formattingEnabled, formattedChapters, formatChapter,
      fmtCondensedChapters, formatCondensedChapter,
      wikiEnabled, wikiProcessedChapters, processWikiChapter,
      commentsEnabled, chapterComments, generateCommentsForChapter]);

  const runAutoProcessQueue = useCallback(async () => {
    if (autoProcessingRef.current) return;
    autoProcessingRef.current = true;

    while (autoProcessTargetRef.current !== null) {
      const target = autoProcessTargetRef.current;
      await autoProcessChapter(target);
      if (autoProcessTargetRef.current === target) {
        autoProcessTargetRef.current = null;
      }
    }

    autoProcessingRef.current = false;
  }, [autoProcessChapter]);

  // Trigger auto-processing when chapter changes
  useEffect(() => {
    if (!bookContent || !filePath) return;
    if (!enrichEnabled && !formattingEnabled && !wikiEnabled && !commentsEnabled && !condenseEnabled) return;

    autoProcessTargetRef.current = currentChapter;
    runAutoProcessQueue();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, bookContent, enrichEnabled, formattingEnabled, wikiEnabled, commentsEnabled, condenseEnabled]);
}
