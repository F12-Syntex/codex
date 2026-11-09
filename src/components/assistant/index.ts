/**
 * Assistant UI (owner WS-E). Mount points for Phase 2d:
 *   reader: <AssistantLauncher filePath bookTitle frontierLabel? onDetach? onOpenEntity? />
 *   buddy:  <AssistantPanel host="buddy" filePath bookTitle threadId? onOpenEntity? />
 *   wiki:   <AssistantPanel host="wiki" filePath bookTitle onClose onOpenEntity? />
 *   words:  <VocabularyDeck open onClose filePath? scopeLabel? />
 *   define: <DefinePopover term sentence anchorRect filePath ref? onClose onWhoIs? />
 * Open from anywhere: `openAssistant(seed, opts)` from `@/lib/assistant/open`.
 */

export { AssistantPanel, type AssistantPanelProps, type AssistantHost } from "./AssistantPanel";
export { AssistantLauncher, type AssistantLauncherProps } from "./AssistantLauncher";
export { VocabularyDeck, type VocabularyDeckProps } from "./VocabularyDeck";
export { DefinePopover, type DefinePopoverProps } from "./DefinePopover";
export { ProposalCard } from "./ProposalCard";
export { CitationChip } from "./CitationChip";
export { MessageRenderer, EntityMention } from "./MessageRenderer";
export { Composer } from "./Composer";
export { QuickActions } from "./QuickActions";
export { Thread } from "./Thread";
export { ThreadList } from "./ThreadList";
export { openAssistant, onOpenAssistant } from "@/lib/assistant/open";
