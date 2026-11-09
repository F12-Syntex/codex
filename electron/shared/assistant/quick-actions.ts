/**
 * Quick actions shown as chips in the Assistant's empty state (owner: WS-E).
 * PURE. The renderer sends `prompt` as the user text with `seed.quickAction`; the turn task uses
 * the action to pick tools/context (e.g. "recap" leans on `list_summaries`).
 */

import type { AssistantQuickAction } from "./types";

export interface QuickActionDef {
  id: AssistantQuickAction;
  label: string;
  prompt: string;
  /** Extra system guidance for the turn. */
  hint: string;
}

export const QUICK_ACTIONS: readonly QuickActionDef[] = [
  {
    id: "recap",
    label: "Recap so far",
    prompt: "Give me a recap of the story so far.",
    hint: "Call list_summaries for the recent chapters first. Answer with 4–8 bullets, most recent last, each with a citation when you saw the passage.",
  },
  {
    id: "characters",
    label: "Who's who",
    prompt: "Who are the main characters so far, and what are they up to?",
    hint: "Use the entity context; link every character with an entity marker. Group by importance.",
  },
  {
    id: "arcs",
    label: "Open threads",
    prompt: "Which plot threads are still open right now?",
    hint: "Use the arcs in the context; list unresolved threads with the latest development of each.",
  },
  {
    id: "relationships",
    label: "Relationships",
    prompt: "How are the main characters connected to each other?",
    hint: "Use get_entity for the two to four most significant characters and describe their relationships.",
  },
];

export function quickAction(id: AssistantQuickAction | undefined): QuickActionDef | undefined {
  return id ? QUICK_ACTIONS.find((q) => q.id === id) : undefined;
}
