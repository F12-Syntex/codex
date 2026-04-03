/* ── useFormatting — AI visual formatting for book text ── */

import { useState, useCallback, useRef, useEffect } from "react";
import { formatChapterContent } from "@/lib/ai-formatting";
import type { StyleDictionary } from "@/lib/ai-style-dictionary";
import { loadDictionary, saveDictionary } from "@/lib/ai-style-dictionary";
import type { BookChapter } from "../lib/types";

function isChapterTooLarge(chapter: { paragraphs: string[]; htmlParagraphs: string[] }): boolean {
  const totalLen = chapter.htmlParagraphs.reduce((sum, p) => sum + p.length, 0);
  if (totalLen > 500_000) return true;
  return chapter.htmlParagraphs.some(p => p.includes("data:image/") || p.includes("base64,"));
}

export interface FormattingState {
  formattingEnabled: boolean;
  formattedChapters: Record<number, string[]>;
  formattingChapter: number | null;
  formatAllProgress: { current: number; total: number } | null;
  styleDictionary: StyleDictionary | null;
  fmtCondensedChapters: Record<number, string[]>;
}

export interface FormattingActions {
  formatChapter: (chapterIndex: number) => Promise<void>;
  formatAllChapters: (fromChapter?: number, upToChapter?: number) => Promise<void>;
  formatCondensedChapter: (chapterIndex: number) => Promise<void>;
  toggleFormattingEnabled: () => void;
  clearFormatting: () => void;
  cancelFormatAll: () => void;
}

export function useFormatting(
  chapters: BookChapter[],
  title: string,
  filePath: string,
  condensedChapters: Record<number, string[]>,
  condenseEnabled: boolean,
  bookLoaded: boolean,
): FormattingState & FormattingActions {
  const [formattingEnabled, setFormattingEnabled] = useState(false);
  const [formattedChapters, setFormattedChapters] = useState<Record<number, string[]>>({});
  const [formattingChapter, setFormattingChapter] = useState<number | null>(null);
  const [formatAllProgress, setFormatAllProgress] = useState<{ current: number; total: number } | null>(null);
  const formatAbortRef = useRef(false);
  const [styleDictionary, setStyleDictionary] = useState<StyleDictionary | null>(null);
  const [fmtCondensedChapters, setFmtCondensedChapters] = useState<Record<number, string[]>>({});

  // Load persisted state from settings
  useEffect(() => {
    if (!bookLoaded || !filePath) return;
    window.electronAPI?.getSetting(`formattedChapters:${filePath}`).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Record<string, string[]>;
        const ch: Record<number, string[]> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) ch[Number(k)] = v;
        }
        if (Object.keys(ch).length > 0) setFormattedChapters(ch);
      } catch { /* ignore */ }
    });
    window.electronAPI?.getSetting(`formattingEnabled:${filePath}`).then((raw) => {
      if (raw != null) {
        try { setFormattingEnabled(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
    window.electronAPI?.getSetting(`fmtCondensed:${filePath}`).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Record<string, string[]>;
        const ch: Record<number, string[]> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) ch[Number(k)] = v;
        }
        if (Object.keys(ch).length > 0) setFmtCondensedChapters(ch);
      } catch { /* ignore */ }
    });
    loadDictionary(filePath).then((dict) => {
      if (dict) setStyleDictionary(dict);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookLoaded, filePath]);

  const formatChapter = useCallback(async (chapterIndex: number) => {
    if (!chapters[chapterIndex]) return;

    setFormattingChapter(chapterIndex);
    formatAbortRef.current = false;

    try {
      const result = await formatChapterContent(
        chapters[chapterIndex], title,
        () => formatAbortRef.current,
        styleDictionary,
        filePath,
      );

      if (formatAbortRef.current || !result) return;

      setStyleDictionary(result.dictionary);
      setFormattedChapters((prev) => {
        const updated = { ...prev, [chapterIndex]: result.paragraphs };
        window.electronAPI?.setSetting(`formattedChapters:${filePath}`, JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.error(`Failed to format chapter ${chapterIndex}:`, err);
    } finally {
      setFormattingChapter(null);
    }
  }, [chapters, title, filePath, styleDictionary, condenseEnabled, condensedChapters]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatAllChapters = useCallback(async (fromChapter?: number, upToChapter?: number) => {
    const start = fromChapter ?? 0;
    const limit = upToChapter ?? chapters.length - 1;
    const toFormat = chapters
      .map((_, i) => i)
      .filter((i) => i >= start && i <= limit && !formattedChapters[i]);

    if (toFormat.length === 0) return;

    formatAbortRef.current = false;
    setFormatAllProgress({ current: 0, total: toFormat.length });

    let currentFormatted = { ...formattedChapters };
    let currentDict = styleDictionary;

    for (let idx = 0; idx < toFormat.length; idx++) {
      if (formatAbortRef.current) break;

      const i = toFormat[idx];
      setFormattingChapter(i);
      setFormatAllProgress({ current: idx, total: toFormat.length });

      try {
        const result = await formatChapterContent(
          chapters[i], title,
          () => formatAbortRef.current,
          currentDict,
          filePath,
        );

        if (formatAbortRef.current) break;

        if (result) {
          currentFormatted = { ...currentFormatted, [i]: result.paragraphs };
          currentDict = result.dictionary;
          setFormattedChapters({ ...currentFormatted });
          setStyleDictionary(currentDict);
        }
      } catch (err) {
        console.error(`Failed to format chapter ${i}:`, err);
      }
    }

    await window.electronAPI?.setSetting(`formattedChapters:${filePath}`, JSON.stringify(currentFormatted));
    setFormattingChapter(null);
    setFormatAllProgress(formatAbortRef.current ? null : { current: toFormat.length, total: toFormat.length });
  }, [chapters, title, filePath, formattedChapters, styleDictionary]);

  const formatCondensedChapter = useCallback(async (chapterIndex: number) => {
    if (!condensedChapters[chapterIndex]) return;

    setFormattingChapter(chapterIndex);
    formatAbortRef.current = false;

    try {
      const fakeChapter = {
        ...chapters[chapterIndex],
        htmlParagraphs: condensedChapters[chapterIndex],
        paragraphs: condensedChapters[chapterIndex],
      };

      const result = await formatChapterContent(
        fakeChapter, title,
        () => formatAbortRef.current,
        styleDictionary,
        filePath,
      );

      if (formatAbortRef.current || !result) return;

      setStyleDictionary(result.dictionary);
      setFmtCondensedChapters((prev) => {
        const updated = { ...prev, [chapterIndex]: result.paragraphs };
        window.electronAPI?.setSetting(`fmtCondensed:${filePath}`, JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.error(`Failed to format condensed chapter ${chapterIndex}:`, err);
    } finally {
      setFormattingChapter(null);
    }
  }, [chapters, condensedChapters, title, filePath, styleDictionary]);

  const toggleFormattingEnabled = useCallback(() => {
    const next = !formattingEnabled;
    if (!next) {
      formatAbortRef.current = true;
      setFormattingChapter(null);
      setFormatAllProgress(null);
    }
    // Let the auto-process useEffect handle formatting on toggle
    setFormattingEnabled(next);
    window.electronAPI?.setSetting(`formattingEnabled:${filePath}`, JSON.stringify(next));
  }, [formattingEnabled, filePath]);

  const clearFormatting = useCallback(() => {
    formatAbortRef.current = true;
    setFormattedChapters({});
    setFmtCondensedChapters({});
    setFormattingEnabled(false);
    setFormattingChapter(null);
    setFormatAllProgress(null);
    window.electronAPI?.setSetting(`formattedChapters:${filePath}`, JSON.stringify({}));
    window.electronAPI?.setSetting(`fmtCondensed:${filePath}`, JSON.stringify({}));
    window.electronAPI?.setSetting(`formattingEnabled:${filePath}`, JSON.stringify(false));
    saveDictionary(filePath, { rules: [], bookTitle: title, updatedAt: new Date().toISOString() });
  }, [filePath, title]);

  const cancelFormatAll = useCallback(() => {
    formatAbortRef.current = true;
    setFormattingChapter(null);
    setFormatAllProgress(null);
  }, []);

  return {
    formattingEnabled, formattedChapters, formattingChapter, formatAllProgress,
    styleDictionary, fmtCondensedChapters,
    formatChapter, formatAllChapters, formatCondensedChapter,
    toggleFormattingEnabled, clearFormatting, cancelFormatAll,
  };
}
