/**
 * The `selectionActions` contract WS-E provides for the reader's SelectionToolbar (Phase 2d).
 * TextContent passes a `SelectionPayload` (ParaRef + the selected text + the sentence around it);
 * `createSelectionActions` turns it into Assistant / Define / vocabulary calls.
 */

import type { ParaRef } from "@shared/pipeline/types";
import type { QuoteClassifyResult } from "@shared/assistant/types";
import { openAssistant } from "./open";
import { selection as selectionTasks, vocab } from "./bridge";

export interface SelectionPayload {
  ref: ParaRef;
  /** Exactly what the user selected. */
  text: string;
  /** The sentence containing the selection (never text after the selection's paragraph). */
  sentence: string;
  /** Viewport rect of the selection, for anchoring popovers. */
  rect: { x: number; y: number; width: number; height: number };
  chapterIndex: number;
}

/** Props the SelectionToolbar receives (all optional: a missing handler hides the action). */
export interface SelectionActions {
  onAsk?: (s: SelectionPayload) => void;
  onExplain?: (s: SelectionPayload) => void;
  onDefine?: (s: SelectionPayload) => void;
  onWhoIs?: (s: SelectionPayload) => void;
  onSaveQuote?: (s: SelectionPayload) => void;
  onSaveWord?: (s: SelectionPayload) => void;
}

export interface SelectionActionHost {
  filePath: string;
  bookTitle?: string;
  /** Open the DefinePopover (host-owned state). */
  showDefine?: (s: SelectionPayload) => void;
  /** Open WS-B's EntityCard / "Who's this?" for a name. */
  showWhoIs?: (s: SelectionPayload) => void;
  /** Persist the quote (legacy quotes store until WS-C moves quotes to ParaRef) and get its id. */
  saveQuote?: (s: SelectionPayload) => Promise<void> | void;
  onQuoteClassified?: (s: SelectionPayload, r: QuoteClassifyResult) => void;
}

export function createSelectionActions(host: SelectionActionHost): SelectionActions {
  return {
    onAsk: (s) => openAssistant({ selection: { ref: s.ref, text: s.text } }, { mode: "chat", filePath: host.filePath }),
    onExplain: (s) =>
      openAssistant({ selection: { ref: s.ref, text: s.text } }, { mode: "explain", prompt: "Explain this passage.", autoSend: true, filePath: host.filePath }),
    ...(host.showDefine ? { onDefine: host.showDefine } : {}),
    ...(host.showWhoIs ? { onWhoIs: host.showWhoIs } : {}),
    onSaveQuote: async (s) => {
      await host.saveQuote?.(s);
      const r = await selectionTasks.classifyQuote({ filePath: host.filePath, quote: s.text, ref: s.ref, bookTitle: host.bookTitle, surrounding: s.sentence });
      if (r.state === "done" && r.output) host.onQuoteClassified?.(s, r.output);
    },
    onSaveWord: (s) => {
      void vocab.add({ filePath: host.filePath, ref: s.ref, term: s.text.trim(), context: s.sentence });
    },
  };
}
