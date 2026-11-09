/**
 * Default model per role + role labels (owner: WS-A). PURE: shared by main (`electron/ai/models.ts`)
 * and the renderer (Settings → Intelligence).
 *
 * The legacy default `google/gemini-2.5-flash-lite-preview-09-2025` is retired on OpenRouter
 * (checked 2026-11-09); these are stable ids.
 */

import type { ModelRole, TaskId } from "./types";

export const DEFAULT_MODELS: Record<ModelRole, string> = {
  fast: "google/gemini-2.5-flash-lite",
  rewrite: "google/gemini-2.5-flash-lite",
  format: "google/gemini-2.5-flash-lite",
  analysis: "google/gemini-3.1-flash-lite",
  chat: "google/gemini-3.1-flash-lite",
  creative: "google/gemini-3.1-flash-lite",
  web: "perplexity/sonar",
};

export const MODEL_ROLE_INFO: Record<ModelRole, { label: string; description: string }> = {
  fast: { label: "Fast", description: "Titles, quick lookups and tagging" },
  rewrite: { label: "Rewrite", description: "Polished and concise chapter rewrites" },
  format: { label: "Format", description: "Chapter formatting and styles" },
  analysis: { label: "Analysis", description: "Wiki knowledge, recaps and comments" },
  chat: { label: "Chat", description: "The assistant, Define and Translate" },
  creative: { label: "Creative", description: "Branch simulation and long-form writing" },
  web: { label: "Web", description: "Book lookups that search the web" },
};

export const TASK_LABELS: Record<TaskId, string> = {
  "chapter.title": "Chapter titles",
  "chapter.condense": "Rewrites",
  "chapter.format": "Formatting",
  "chapter.comments": "Comments",
  "chapter.knowledge": "Wiki knowledge",
  "style.regenerate": "Style regeneration",
  "book.recap": "Recaps",
  "entity.lookup": "Who's this?",
  "assistant.turn": "Assistant",
  "selection.define": "Define",
  "selection.translate": "Translate",
  "quote.classify": "Quotes",
  "branch.continue": "Simulate",
  "book.lookup": "Book lookup",
  "library.tag": "Library tagging",
  "legacy.complete": "Other AI features",
};
