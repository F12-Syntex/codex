/**
 * Book progress: the ONE formula (reader TOC, library cards, detail views).
 *
 * Progress = (completed chapters + fraction of the current chapter) / total chapters.
 * It never reaches 100% from position alone: 100% is reserved for a finished book
 * (`finished: true`, i.e. the library's Finished status).
 */

export interface BookProgressInput {
  /** 0-based chapter the reader is on. */
  chapterIndex: number;
  totalChapters: number;
  /** 0-based page within the chapter and its page count (optional; defaults to the chapter start). */
  page?: number;
  totalPages?: number;
  finished?: boolean;
}

/** 0–100. Position-only progress is capped at 99. */
export function bookProgress({ chapterIndex, totalChapters, page = 0, totalPages = 0, finished = false }: BookProgressInput): number {
  if (finished) return 100;
  if (!(totalChapters > 0)) return 0;
  const ch = Math.max(0, Math.min(chapterIndex, totalChapters - 1));
  const within = totalPages > 0 ? Math.max(0, Math.min(page, totalPages - 1)) / totalPages : 0;
  return Math.min(99, ((ch + within) / totalChapters) * 100);
}
