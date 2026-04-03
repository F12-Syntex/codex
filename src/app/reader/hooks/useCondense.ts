/* ── useCondense — AI concise reading mode ── */

import { useState, useCallback, useRef, useEffect } from "react";
import { condenseChapterContent } from "@/lib/ai-condense";
import type { BookChapter } from "../lib/types";

function isChapterTooLarge(chapter: { paragraphs: string[]; htmlParagraphs: string[] }): boolean {
  const totalLen = chapter.htmlParagraphs.reduce((sum, p) => sum + p.length, 0);
  if (totalLen > 500_000) return true;
  return chapter.htmlParagraphs.some(p => p.includes("data:image/") || p.includes("base64,"));
}

export interface CondenseState {
  condenseEnabled: boolean;
  condensedChapters: Record<number, string[]>;
  condensingChapter: number | null;
  condenseAllProgress: { current: number; total: number } | null;
}

export interface CondenseActions {
  condenseChapter: (chapterIndex: number) => Promise<void>;
  condenseAllChapters: (fromChapter?: number, upToChapter?: number) => Promise<void>;
  toggleCondenseEnabled: () => void;
  clearCondense: () => void;
  cancelCondenseAll: () => void;
}

export function useCondense(
  chapters: BookChapter[],
  title: string,
  filePath: string,
  currentChapter: number,
  bookLoaded: boolean,
): CondenseState & CondenseActions {
  const [condenseEnabled, setCondenseEnabled] = useState(false);
  const [condensedChapters, setCondensedChapters] = useState<Record<number, string[]>>({});
  const [condensingChapter, setCondensingChapter] = useState<number | null>(null);
  const [condenseAllProgress, setCondenseAllProgress] = useState<{ current: number; total: number } | null>(null);
  const condenseAbortRef = useRef(false);

  // Load persisted state from settings
  useEffect(() => {
    if (!bookLoaded || !filePath) return;
    window.electronAPI?.getSetting(`condensedChapters:${filePath}`).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Record<string, string[]>;
        const ch: Record<number, string[]> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) ch[Number(k)] = v;
        }
        // Detect stale format: old condensed text had HTML markup
        const firstVal = Object.values(ch)[0];
        if (firstVal?.[0] && /<[a-z][\s\S]*>/i.test(firstVal[0])) {
          // Stale format — clear
          window.electronAPI?.setSetting(`condensedChapters:${filePath}`, JSON.stringify({}));
        } else if (Object.keys(ch).length > 0) {
          setCondensedChapters(ch);
        }
      } catch { /* ignore */ }
    });
    window.electronAPI?.getSetting(`condenseEnabled:${filePath}`).then((raw) => {
      if (raw != null) {
        try { setCondenseEnabled(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookLoaded, filePath]);

  const condenseChapter = useCallback(async (chapterIndex: number) => {
    if (!chapters[chapterIndex]) return;

    setCondensingChapter(chapterIndex);
    condenseAbortRef.current = false;

    try {
      const result = await condenseChapterContent(
        chapters[chapterIndex],
        title,
        () => condenseAbortRef.current,
      );

      if (condenseAbortRef.current || !result) return;

      setCondensedChapters((prev) => {
        const updated = { ...prev, [chapterIndex]: result.paragraphs };
        window.electronAPI?.setSetting(`condensedChapters:${filePath}`, JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.error(`Failed to condense chapter ${chapterIndex}:`, err);
    } finally {
      setCondensingChapter(null);
    }
  }, [chapters, title, filePath]);

  const condenseAllChapters = useCallback(async (fromChapter?: number, upToChapter?: number) => {
    const start = fromChapter ?? 0;
    const limit = upToChapter ?? chapters.length - 1;
    const toCondense = chapters
      .map((_, i) => i)
      .filter((i) => i >= start && i <= limit && !condensedChapters[i] && chapters[i] && !isChapterTooLarge(chapters[i]));

    if (toCondense.length === 0) return;

    condenseAbortRef.current = false;
    setCondenseAllProgress({ current: 0, total: toCondense.length });

    let currentCondensed = { ...condensedChapters };

    for (let idx = 0; idx < toCondense.length; idx++) {
      if (condenseAbortRef.current) break;

      const i = toCondense[idx];
      setCondensingChapter(i);
      setCondenseAllProgress({ current: idx, total: toCondense.length });

      try {
        const result = await condenseChapterContent(
          chapters[i], title,
          () => condenseAbortRef.current,
        );

        if (condenseAbortRef.current) break;

        if (result) {
          currentCondensed = { ...currentCondensed, [i]: result.paragraphs };
          setCondensedChapters({ ...currentCondensed });
        }
      } catch (err) {
        console.error(`Failed to condense chapter ${i}:`, err);
      }
    }

    await window.electronAPI?.setSetting(`condensedChapters:${filePath}`, JSON.stringify(currentCondensed));
    setCondensingChapter(null);
    setCondenseAllProgress(condenseAbortRef.current ? null : { current: toCondense.length, total: toCondense.length });
  }, [chapters, title, filePath, condensedChapters]);

  const toggleCondenseEnabled = useCallback(() => {
    const next = !condenseEnabled;
    if (!next) {
      condenseAbortRef.current = true;
      setCondensingChapter(null);
      setCondenseAllProgress(null);
    } else if (!condensedChapters[currentChapter] && chapters[currentChapter] && !isChapterTooLarge(chapters[currentChapter])) {
      condenseChapter(currentChapter);
    }
    setCondenseEnabled(next);
    window.electronAPI?.setSetting(`condenseEnabled:${filePath}`, JSON.stringify(next));
  }, [condenseEnabled, filePath, condensedChapters, currentChapter, chapters, condenseChapter]);

  const clearCondense = useCallback(() => {
    condenseAbortRef.current = true;
    setCondensedChapters({});
    setCondenseEnabled(false);
    setCondensingChapter(null);
    setCondenseAllProgress(null);
    window.electronAPI?.setSetting(`condensedChapters:${filePath}`, JSON.stringify({}));
    window.electronAPI?.setSetting(`condenseEnabled:${filePath}`, JSON.stringify(false));
  }, [filePath]);

  const cancelCondenseAll = useCallback(() => {
    condenseAbortRef.current = true;
    setCondensingChapter(null);
    setCondenseAllProgress(null);
  }, []);

  return {
    condenseEnabled, condensedChapters, condensingChapter, condenseAllProgress,
    condenseChapter, condenseAllChapters, toggleCondenseEnabled, clearCondense, cancelCondenseAll,
  };
}
