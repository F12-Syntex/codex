/* ── useComments — AI inline comments and user comments ── */

import { useState, useCallback, useRef, useEffect } from "react";
import { generateAIComments, type InlineComment } from "@/lib/ai-comments";
import type { BookChapter } from "../lib/types";

const EMPTY_ARRAY: any[] = [];

function isChapterTooLarge(chapter: { paragraphs: string[]; htmlParagraphs: string[] }): boolean {
  const totalLen = chapter.htmlParagraphs.reduce((sum, p) => sum + p.length, 0);
  if (totalLen > 500_000) return true;
  return chapter.htmlParagraphs.some(p => p.includes("data:image/") || p.includes("base64,"));
}

export interface CommentsState {
  commentsEnabled: boolean;
  chapterComments: Record<number, InlineComment[]>;
  commentingChapter: number | null;
}

export interface CommentsActions {
  generateCommentsForChapter: (chapterIndex: number) => Promise<void>;
  toggleCommentsEnabled: () => void;
  addUserComment: (paraIndex: number, text: string) => void;
  deleteUserComment: (paraIndex: number, author: "ai" | "user", text: string) => void;
  clearComments: () => void;
}

export function useComments(
  chapters: BookChapter[],
  title: string,
  filePath: string,
  currentChapter: number,
): CommentsState & CommentsActions {
  const [commentsEnabled, setCommentsEnabled] = useState(false);
  const [chapterComments, setChapterComments] = useState<Record<number, InlineComment[]>>({});
  const [commentingChapter, setCommentingChapter] = useState<number | null>(null);
  const commentAbortRef = useRef(false);

  // Load persisted state from settings
  useEffect(() => {
    if (!filePath) return;
    window.electronAPI?.getSetting(`commentsEnabled:${filePath}`).then((raw) => {
      if (raw != null) {
        try { setCommentsEnabled(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
    window.electronAPI?.getSetting(`chapterComments:${filePath}`).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Record<string, InlineComment[]>;
        const comments: Record<number, InlineComment[]> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) comments[Number(k)] = v;
        }
        if (Object.keys(comments).length > 0) setChapterComments(comments);
      } catch { /* ignore */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const generateCommentsForChapter = useCallback(async (chapterIndex: number) => {
    if (!chapters[chapterIndex] || chapterComments[chapterIndex]) return;
    if (isChapterTooLarge(chapters[chapterIndex])) return;

    setCommentingChapter(chapterIndex);
    commentAbortRef.current = false;

    try {
      const ch = chapters[chapterIndex];
      const result = await generateAIComments(
        ch.paragraphs,
        title,
        ch.title,
        chapterIndex,
        () => commentAbortRef.current,
      );

      if (commentAbortRef.current) return;

      setChapterComments((prev) => {
        const existing = prev[chapterIndex] ?? EMPTY_ARRAY;
        // Keep user comments, replace AI comments
        const userComments = existing.filter((c) => c.author === "user");
        const updated = { ...prev, [chapterIndex]: [...userComments, ...result] };
        window.electronAPI?.setSetting(`chapterComments:${filePath}`, JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.error(`Failed to generate comments for chapter ${chapterIndex}:`, err);
    } finally {
      setCommentingChapter(null);
    }
  }, [chapters, title, filePath, chapterComments]);

  const toggleCommentsEnabled = useCallback(() => {
    const next = !commentsEnabled;
    setCommentsEnabled(next);
    window.electronAPI?.setSetting(`commentsEnabled:${filePath}`, JSON.stringify(next));
    if (next && !chapterComments[currentChapter] && chapters[currentChapter] && !isChapterTooLarge(chapters[currentChapter])) {
      generateCommentsForChapter(currentChapter);
    }
  }, [commentsEnabled, filePath, currentChapter, chapters, chapterComments, generateCommentsForChapter]);

  const addUserComment = useCallback((paraIndex: number, text: string) => {
    const comment: InlineComment = { paraIndex, text, author: "user" };
    setChapterComments((prev) => {
      const existing = prev[currentChapter] ?? EMPTY_ARRAY;
      const updated = { ...prev, [currentChapter]: [...existing, comment] };
      window.electronAPI?.setSetting(`chapterComments:${filePath}`, JSON.stringify(updated));
      return updated;
    });
  }, [currentChapter, filePath]);

  const deleteUserComment = useCallback((paraIndex: number, author: "ai" | "user", text: string) => {
    setChapterComments((prev) => {
      const existing = prev[currentChapter] ?? EMPTY_ARRAY;
      const idx = existing.findIndex((c) => c.paraIndex === paraIndex && c.author === author && c.text === text);
      if (idx === -1) return prev;
      const updated = { ...prev, [currentChapter]: existing.filter((_, i) => i !== idx) };
      window.electronAPI?.setSetting(`chapterComments:${filePath}`, JSON.stringify(updated));
      return updated;
    });
  }, [currentChapter, filePath]);

  const clearComments = useCallback(() => {
    commentAbortRef.current = true;
    setChapterComments({});
    setCommentingChapter(null);
    window.electronAPI?.setSetting(`chapterComments:${filePath}`, JSON.stringify({}));
  }, [filePath]);

  return {
    commentsEnabled, chapterComments, commentingChapter,
    generateCommentsForChapter, toggleCommentsEnabled, addUserComment, deleteUserComment, clearComments,
  };
}

export type { InlineComment };
