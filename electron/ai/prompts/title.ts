/**
 * `chapter.title` prompt (owner: WS-D). Ported from `src/lib/ai-prompts.ts`.
 * Batched: up to 20 chapters per call, keyed by short aliases the model echoes back.
 *
 * Reconcile in Phase 2: structural/generic-title detection moves to WS-C's
 * `shared/pipeline/classify.ts`; this copy is kept so the orchestrator compiles on its own.
 */

import type { ChatMessage } from "../../shared/ai/types";

export const TITLE_BATCH_MAX = 20;
export const TITLE_PREVIEW_CHARS = 800;

const SKIP_PATTERNS = [
  /^(table\s+of\s+)?contents$/i,
  /^toc$/i,
  /^cover(\s+page)?$/i,
  /^title\s+page$/i,
  /^copyright/i,
  /^(about\s+the\s+)?author/i,
  /^dedication$/i,
  /^acknowledgements?$/i,
  /^(preface|foreword|introduction|prologue|epilogue|afterword)$/i,
  /^appendix/i,
  /^glossary$/i,
  /^index$/i,
  /^bibliography$/i,
  /^also\s+by/i,
  /^notes?$/i,
];

const GENERIC_PATTERNS = [
  /^(chapter|part|story|volume|book|section)\s+(\d+|[ivxlcdm]+)$/i,
  /^\d+$/,
  /^ch(apter)?[-_.]?\d+(\.\w+)?$/i,
  /^(part|section|vol)[-_.]?\d+(\.\w+)?$/i,
  /^(chapter|part|section)\d+$/i,
];

/** Structural/meta page (cover, TOC, copyright…). Never sent to chapter tasks. */
export function isStructuralTitle(title: string): boolean {
  const t = title.trim();
  return !!t && SKIP_PATTERNS.some((p) => p.test(t));
}

/** True for generic titles ("Chapter 3", "ch003.xml", "42") that benefit from an AI title. */
export function needsTitle(title: string): boolean {
  const t = title.trim();
  if (!t || isStructuralTitle(t)) return false;
  return GENERIC_PATTERNS.some((p) => p.test(t));
}

function extractChapterNumber(title: string): string | null {
  const t = title.trim();
  const prefixed = t.match(/^(?:chapter|part|story|volume|book|section)\s+(\d+|[ivxlcdm]+)$/i);
  if (prefixed) return prefixed[1];
  if (/^\d+$/.test(t)) return t;
  const filestyle = t.match(/^ch(?:apter)?[-_.]?(\d+)(?:\.\w+)?$/i);
  if (filestyle) return String(parseInt(filestyle[1], 10));
  const partStyle = t.match(/^(?:part|section|vol)[-_.]?(\d+)(?:\.\w+)?$/i);
  if (partStyle) return partStyle[1];
  const noSpace = t.match(/^(?:chapter|part|section)(\d+)$/i);
  if (noSpace) return noSpace[1];
  return null;
}

/** "Chapter 3" + "The Final War" → "Chapter 3 The Final War". */
export function formatRenamedTitle(originalTitle: string, aiTitle: string): string {
  const clean = cleanTitle(aiTitle);
  if (!clean) return originalTitle;
  const num = extractChapterNumber(originalTitle);
  return num ? `Chapter ${num} ${clean}` : `${originalTitle.trim()} ${clean}`;
}

/** Strip quotes, "Chapter N:" prefixes and trailing punctuation; cap at 8 words. */
export function cleanTitle(raw: string): string {
  let t = raw.trim().replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  t = t.replace(/^(chapter|ch\.?)\s*[\divxlcdm]+\s*[:.\-–—]?\s*/i, "").trim();
  t = t.replace(/[.\s]+$/, "");
  return t.split(/\s+/).slice(0, 8).join(" ");
}

const SYSTEM = `You are a literary assistant naming chapters in an ebook library.
For each chapter you receive its current generic title and the beginning of its text.
Write a clean, spoiler-free title for each one:
- Capture the mood, setting or theme of the opening without revealing twists.
- 2–5 words. No chapter number, no "Chapter" prefix, no quotes.
- Avoid generic filler like "A New Beginning" or "The Journey Continues"; be specific.

Reply with ONLY a JSON object mapping each chapter key to its title, e.g. {"titles":{"a":"Ash Over Greywater","b":"The Locked Archive"}}.`;

export interface TitlePromptChapter {
  key: string;
  original: string;
  preview: string;
}

export function buildTitleMessages(book: string, chapters: TitlePromptChapter[]): ChatMessage[] {
  const body = chapters
    .map((c) => `## ${c.key}\nCurrent title: ${c.original}\n---\n${c.preview}\n---`)
    .join("\n\n");
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Book: "${book}"\n\n${body}\n\nReturn {"titles":{…}} with exactly these keys: ${chapters.map((c) => c.key).join(", ")}.` },
  ];
}
