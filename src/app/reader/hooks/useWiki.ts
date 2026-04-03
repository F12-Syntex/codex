/* ── useWiki — AI wiki entity extraction and management ── */

import { useState, useCallback, useRef, useEffect } from "react";
import { isStructuralChapter } from "@/lib/ai-prompts";
import type { WikiEntryType } from "@/lib/ai-wiki";
import { generateWikiForChapter, generateWikiForChapterBatch, buildEntityIndexFromDB, attemptMigration } from "@/lib/ai-wiki";
import type { BookChapter } from "../lib/types";

export interface WikiState {
  wikiEnabled: boolean;
  wikiProcessingChapter: number | null;
  wikiAllProgress: { current: number; total: number } | null;
  wikiEntityIndex: Array<{ id: string; name: string; type: WikiEntryType; color: string }>;
  wikiProcessedChapters: Set<number>;
  wikiEntryCount: number;
}

export interface WikiActions {
  processWikiChapter: (chapterIndex: number) => Promise<void>;
  retryWikiChapter: (chapterIndex: number) => Promise<void>;
  toggleWikiEnabled: () => void;
  cancelWikiAll: () => void;
  refreshWikiState: () => Promise<void>;
  setWikiEnabled: (v: boolean) => void;
  setWikiProcessedChapters: React.Dispatch<React.SetStateAction<Set<number>>>;
  setWikiEntryCount: (v: number) => void;
  setWikiEntityIndex: (v: Array<{ id: string; name: string; type: WikiEntryType; color: string }>) => void;
  setWikiAllProgress: (v: { current: number; total: number } | null) => void;
  setWikiProcessingChapter: (v: number | null) => void;
  wikiAbortRef: React.MutableRefObject<boolean>;
}

export function useWiki(
  chapters: BookChapter[],
  title: string,
  filePath: string,
  currentChapter: number,
  buddyEnabled: boolean,
  setBuddyEnabled: (v: boolean) => void,
  simulateEnabled: boolean,
  setSimulateEnabled: (v: boolean) => void,
): WikiState & WikiActions {
  const [wikiEnabled, setWikiEnabled] = useState(false);
  const [wikiProcessingChapter, setWikiProcessingChapter] = useState<number | null>(null);
  const [wikiAllProgress, setWikiAllProgress] = useState<{ current: number; total: number } | null>(null);
  const wikiAbortRef = useRef(false);
  const [wikiEntityIndex, setWikiEntityIndex] = useState<Array<{ id: string; name: string; type: WikiEntryType; color: string }>>([]);
  const [wikiProcessedChapters, setWikiProcessedChapters] = useState<Set<number>>(new Set());
  const [wikiEntryCount, setWikiEntryCount] = useState(0);

  // Load persisted state from DB
  useEffect(() => {
    if (!filePath) return;
    // Migrate old JSON wiki if exists, then load DB wiki state
    const loadWikiState = async () => {
      await attemptMigration(filePath);
      const [processed, entityIdx] = await Promise.all([
        window.electronAPI?.wikiGetProcessed(filePath),
        window.electronAPI?.wikiGetEntityIndex(filePath),
      ]);
      if (processed) setWikiProcessedChapters(new Set(processed));
      if (entityIdx) {
        setWikiEntryCount(entityIdx.length);
        setWikiEntityIndex(buildEntityIndexFromDB(entityIdx));
      }
    };
    loadWikiState();
    window.electronAPI?.getSetting(`wikiEnabled:${filePath}`).then((raw) => {
      if (raw != null) {
        try { setWikiEnabled(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const refreshWikiState = useCallback(async () => {
    const [processed, entityIdx] = await Promise.all([
      window.electronAPI?.wikiGetProcessed(filePath),
      window.electronAPI?.wikiGetEntityIndex(filePath),
    ]);
    if (processed) setWikiProcessedChapters(new Set(processed));
    if (entityIdx) {
      setWikiEntryCount(entityIdx.length);
      setWikiEntityIndex(buildEntityIndexFromDB(entityIdx));
    }
  }, [filePath]);

  const processWikiChapter = useCallback(async (chapterIndex: number) => {
    if (!chapters[chapterIndex]) return;
    if (wikiProcessedChapters.has(chapterIndex)) return;

    // Skip structural chapters (cover, TOC, copyright, etc.) — mark processed silently
    if (isStructuralChapter(chapters[chapterIndex].title)) {
      await window.electronAPI?.wikiMarkProcessed(filePath, chapterIndex);
      await refreshWikiState();
      return;
    }

    setWikiProcessingChapter(chapterIndex);
    wikiAbortRef.current = false;

    try {
      const chapterText = chapters[chapterIndex].paragraphs.join("\n");
      await generateWikiForChapter(
        chapterIndex,
        chapterText,
        title,
        filePath,
        () => wikiAbortRef.current,
      );

      if (wikiAbortRef.current) return;

      await refreshWikiState();
    } catch (err) {
      console.error(`Failed to process wiki for chapter ${chapterIndex}:`, err);
    } finally {
      setWikiProcessingChapter(null);
    }
  }, [chapters, title, filePath, wikiProcessedChapters, refreshWikiState]);

  const retryWikiChapter = useCallback(async (chapterIndex: number) => {
    if (!chapters[chapterIndex]) return;
    await window.electronAPI?.wikiUnmarkProcessed(filePath, chapterIndex);
    setWikiProcessedChapters((prev) => { const s = new Set(prev); s.delete(chapterIndex); return s; });
    setWikiProcessingChapter(chapterIndex);
    wikiAbortRef.current = false;
    try {
      const chapterText = chapters[chapterIndex].paragraphs.join("\n");
      await generateWikiForChapter(chapterIndex, chapterText, title, filePath, () => wikiAbortRef.current, true);
      if (wikiAbortRef.current) return;
      await refreshWikiState();
    } catch (err) {
      console.error(`Failed to retry wiki for chapter ${chapterIndex}:`, err);
    } finally {
      if (!wikiAbortRef.current) setWikiProcessingChapter(null);
    }
  }, [chapters, filePath, title, refreshWikiState]);

  const toggleWikiEnabled = useCallback(() => {
    const next = !wikiEnabled;
    if (!next) {
      wikiAbortRef.current = true;
      setWikiProcessingChapter(null);
      // Auto-disable buddy and simulate when wiki is disabled
      if (buddyEnabled) {
        setBuddyEnabled(false);
        window.electronAPI?.setSetting(`buddyEnabled:${filePath}`, JSON.stringify(false));
      }
      if (simulateEnabled) {
        setSimulateEnabled(false);
        window.electronAPI?.setSetting(`simulateEnabled:${filePath}`, JSON.stringify(false));
      }
    } else if (!wikiProcessedChapters.has(currentChapter) && chapters[currentChapter]) {
      processWikiChapter(currentChapter);
    }
    setWikiEnabled(next);
    window.electronAPI?.setSetting(`wikiEnabled:${filePath}`, JSON.stringify(next));
  }, [wikiEnabled, filePath, currentChapter, chapters, wikiProcessedChapters, processWikiChapter,
      buddyEnabled, setBuddyEnabled, simulateEnabled, setSimulateEnabled]);

  const cancelWikiAll = useCallback(() => {
    wikiAbortRef.current = true;
    setWikiProcessingChapter(null);
    setWikiAllProgress(null);
  }, []);

  return {
    wikiEnabled, wikiProcessingChapter, wikiAllProgress,
    wikiEntityIndex, wikiProcessedChapters, wikiEntryCount,
    processWikiChapter, retryWikiChapter, toggleWikiEnabled, cancelWikiAll, refreshWikiState,
    setWikiEnabled, setWikiProcessedChapters, setWikiEntryCount,
    setWikiEntityIndex, setWikiAllProgress, setWikiProcessingChapter,
    wikiAbortRef,
  };
}

// Re-export for convenience
export { generateWikiForChapterBatch, buildEntityIndexFromDB, attemptMigration };
export type { WikiEntryType };
