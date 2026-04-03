/* ── useEnrichment — AI chapter title enrichment ── */

import { useState, useCallback, useRef, useEffect } from "react";
import { aiText, AIError } from "@/lib/ai-client";
import { needsEnrichment, buildChapterRenamePrompt, formatRenamedTitle } from "@/lib/ai-prompts";
import type { BookChapter } from "../lib/types";

export interface EnrichmentState {
  enrichedNames: Record<number, string>;
  enrichEnabled: boolean;
  enrichingChapter: number | null;
  enrichAllProgress: { current: number; total: number } | null;
}

export interface EnrichmentActions {
  enrichChapter: (chapterIndex: number) => Promise<void>;
  enrichAll: (fromChapter?: number, upToChapter?: number) => Promise<void>;
  toggleEnrichEnabled: () => void;
  clearEnrichedNames: () => void;
  cancelEnrichAll: () => void;
}

export function useEnrichment(
  chapters: BookChapter[],
  title: string,
  filePath: string,
  currentChapter: number,
  bookLoaded: boolean,
): EnrichmentState & EnrichmentActions {
  const [enrichedNames, setEnrichedNames] = useState<Record<number, string>>({});
  const [enrichEnabled, setEnrichEnabled] = useState(false);
  const [enrichingChapter, setEnrichingChapter] = useState<number | null>(null);
  const [enrichAllProgress, setEnrichAllProgress] = useState<{ current: number; total: number } | null>(null);
  const enrichAbortRef = useRef(false);

  // Load persisted state from settings
  useEffect(() => {
    if (!bookLoaded || !filePath) return;
    window.electronAPI?.getSetting(`enrichedChapters:${filePath}`).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Record<string, string>;
        const names: Record<number, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v) names[Number(k)] = v;
        }
        if (Object.keys(names).length > 0) setEnrichedNames(names);
      } catch { /* ignore */ }
    });
    window.electronAPI?.getSetting(`enrichEnabled:${filePath}`).then((raw) => {
      if (raw != null) {
        try { setEnrichEnabled(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookLoaded, filePath]);

  const enrichChapter = useCallback(async (chapterIndex: number) => {
    if (!chapters[chapterIndex]) return;

    setEnrichingChapter(chapterIndex);
    enrichAbortRef.current = false;

    try {
      const ch = chapters[chapterIndex];
      const contentPreview = ch.paragraphs.join("\n").slice(0, 2000);
      const prompt = buildChapterRenamePrompt(ch.title, contentPreview, title);

      const aiTitle = await aiText({
        preset: "quick",
        messages: [{ role: "user", content: prompt }],
      });

      if (enrichAbortRef.current) return;

      if (aiTitle) {
        setEnrichedNames((prev) => {
          const updated = { ...prev, [chapterIndex]: formatRenamedTitle(ch.title, aiTitle) };
          window.electronAPI?.setSetting(`enrichedChapters:${filePath}`, JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err) {
      console.error(`Failed to enrich chapter ${chapterIndex}:`, err);
    } finally {
      setEnrichingChapter(null);
    }
  }, [chapters, title, filePath]);

  const enrichAll = useCallback(async (fromChapter?: number, upToChapter?: number) => {
    const start = fromChapter ?? 0;
    const limit = upToChapter ?? chapters.length - 1;
    const toEnrich = chapters
      .map((ch, i) => ({ ch, i }))
      .filter(({ ch, i }) => i >= start && i <= limit && needsEnrichment(ch.title) && !enrichedNames[i]);

    if (toEnrich.length === 0) return;

    enrichAbortRef.current = false;
    setEnrichAllProgress({ current: 0, total: toEnrich.length });

    let currentNames = { ...enrichedNames };

    for (let idx = 0; idx < toEnrich.length; idx++) {
      if (enrichAbortRef.current) break;

      const { ch, i } = toEnrich[idx];
      setEnrichingChapter(i);
      setEnrichAllProgress({ current: idx, total: toEnrich.length });

      try {
        const contentPreview = ch.paragraphs.join("\n").slice(0, 2000);
        const prompt = buildChapterRenamePrompt(ch.title, contentPreview, title);

        const aiTitle = await aiText({
          preset: "quick",
          messages: [{ role: "user", content: prompt }],
        });

        if (enrichAbortRef.current) break;

        if (aiTitle) {
          currentNames = { ...currentNames, [i]: formatRenamedTitle(ch.title, aiTitle) };
          setEnrichedNames({ ...currentNames });
        }
      } catch (err) {
        if (err instanceof AIError && err.code === "aborted") break;
        console.error(`Failed to enrich chapter ${i}:`, err);
      }
    }

    await window.electronAPI?.setSetting(`enrichedChapters:${filePath}`, JSON.stringify(currentNames));
    setEnrichingChapter(null);
    setEnrichAllProgress(enrichAbortRef.current ? null : { current: toEnrich.length, total: toEnrich.length });
  }, [chapters, title, filePath, enrichedNames]);

  const toggleEnrichEnabled = useCallback(() => {
    const next = !enrichEnabled;
    if (!next) {
      enrichAbortRef.current = true;
      setEnrichingChapter(null);
      setEnrichAllProgress(null);
    } else if (needsEnrichment(chapters[currentChapter]?.title) && !enrichedNames[currentChapter]) {
      enrichChapter(currentChapter);
    }
    setEnrichEnabled(next);
    window.electronAPI?.setSetting(`enrichEnabled:${filePath}`, JSON.stringify(next));
  }, [enrichEnabled, filePath, chapters, currentChapter, enrichedNames, enrichChapter]);

  const clearEnrichedNames = useCallback(() => {
    enrichAbortRef.current = true;
    setEnrichedNames({});
    setEnrichEnabled(false);
    setEnrichingChapter(null);
    window.electronAPI?.setSetting(`enrichedChapters:${filePath}`, JSON.stringify({}));
    window.electronAPI?.setSetting(`enrichEnabled:${filePath}`, JSON.stringify(false));
  }, [filePath]);

  const cancelEnrichAll = useCallback(() => {
    enrichAbortRef.current = true;
    setEnrichingChapter(null);
    setEnrichAllProgress(null);
  }, []);

  return {
    enrichedNames, enrichEnabled, enrichingChapter, enrichAllProgress,
    enrichChapter, enrichAll, toggleEnrichEnabled, clearEnrichedNames, cancelEnrichAll,
  };
}
