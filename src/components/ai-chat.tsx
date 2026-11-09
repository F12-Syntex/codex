"use client";

/**
 * Unified AI Chat component — used by both AI Buddy (reader) and Wiki Chat (database).
 * Supports conversation history, wiki actions, plans, entity links, and detachable windows.
 *
 * Glass redesign built from adapted 21st.dev pieces:
 *  - ChatBubble   ← "Message Bubble" (framecn, id 34988)
 *  - PromptInput  ← "Prompt Input" (tinkerers-labs, id 31882)
 *  - TypingDots   ← "Typing" (loading-ui, id 19978)
 *  - ShimmerText  ← "Text Shimmer" (ibelick, id 1641)
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Loader2, Sparkles, Check, XCircle, Plus, Pencil, Trash,
  GitMerge, Link, Eye, ListChecks, BookOpen, X, Clock, History,
  ScrollText, Users, HeartHandshake, Milestone, Wrench,
} from "lucide-react";
import type { BuddyMessage, WikiAction, BuddyPlan, ChapterReader } from "@/lib/ai-buddy";
import { sendBuddyMessage, buildBuddyWikiContext, executeWikiAction, describeWikiAction, executePlanStep } from "@/lib/ai-buddy";
import { AI_FORMATTING_STYLES } from "@/lib/ai-formatting-css";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatBubble } from "@/components/ui/chat-bubble";
import { PromptInput } from "@/components/ui/prompt-input";
import { TypingDots } from "@/components/ui/typing-dots";
import { ShimmerText } from "@/components/ui/shimmer-text";

/* ── Buddy CSS (AI-generated HTML) — semantic tokens so it follows the appearance ── */

const BUDDY_STYLES = `
.buddy-content { font-size: 13.5px; line-height: 1.75; color: var(--label); }
.buddy-content p { margin: 0.6rem 0; }
.buddy-content p:first-child { margin-top: 0; }
.buddy-content p:last-child { margin-bottom: 0; }
.buddy-content strong { color: var(--label); font-weight: 600; }
.buddy-content em { color: var(--label-secondary); font-style: italic; }
.buddy-content a { color: var(--accent-brand); text-decoration: none; }
.buddy-content ul, .buddy-content ol { margin: 0.6rem 0; padding-left: 1.4rem; }
.buddy-content li { margin: 0.3rem 0; line-height: 1.7; }

.buddy-section { padding-top: 0.9rem; margin-top: 0.9rem; border-top: 0.5px solid var(--separator); }
.buddy-section:first-child { padding-top: 0; margin-top: 0; border-top: none; }
.buddy-heading { font-family: var(--font-display, serif); font-size: 15px; font-weight: 600; color: var(--label); margin-bottom: 0.55rem; letter-spacing: -0.01em; }
.buddy-subheading { font-size: 11px; font-weight: 600; color: var(--label-tertiary); margin-bottom: 0.45rem; text-transform: uppercase; letter-spacing: 0.06em; }
.buddy-text { font-size: 13.5px; line-height: 1.75; color: var(--label); margin-bottom: 0.5rem; }
.buddy-text:last-child { margin-bottom: 0; }
.buddy-muted { font-size: 12px; color: var(--label-tertiary); }
.buddy-quote {
  border-left: 2px solid var(--accent-brand);
  padding: 0.55rem 0.9rem;
  margin: 0.7rem 0;
  background: var(--fill-quaternary);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-family: var(--font-display, serif);
  font-style: italic;
  font-size: 14px;
  color: var(--label-secondary);
  line-height: 1.75;
}
.buddy-list { list-style: none; padding: 0; margin: 0.5rem 0; }
.buddy-list > div, .buddy-list > li {
  font-size: 13.5px; line-height: 1.75; color: var(--label);
  padding: 0.15rem 0 0.15rem 1.1rem; position: relative;
}
.buddy-list > div::before, .buddy-list > li::before {
  content: ""; position: absolute; left: 0.2rem; top: 0.72rem;
  width: 4px; height: 4px; border-radius: 50%; background: var(--label-quaternary);
}
.buddy-grid {
  display: grid; grid-template-columns: auto 1fr;
  gap: 0.3rem 1rem; font-size: 13.5px; line-height: 1.7; margin: 0.5rem 0;
}
.buddy-card {
  box-shadow: inset 0 0 0 0.5px var(--separator); background: var(--fill-quaternary);
  border-radius: var(--radius-lg); padding: 0.9rem; margin: 0.7rem 0;
}
.buddy-card:first-child { margin-top: 0; }
.buddy-card-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 0.6rem; font-size: 13px; font-weight: 600;
}
.buddy-tag, .buddy-tag-accent, .buddy-tag-positive, .buddy-tag-negative, .buddy-tag-neutral {
  display: inline-flex; align-items: center; height: 20px; font-size: 11px; font-weight: 500;
  padding: 0 0.5rem; border-radius: 999px; vertical-align: middle;
}
.buddy-tag { background: var(--fill-tertiary); color: var(--label-secondary); }
.buddy-tag-accent { background: color-mix(in srgb, var(--accent-brand) 16%, transparent); color: var(--accent-brand); }
.buddy-tag-positive { background: color-mix(in srgb, var(--system-green) 15%, transparent); color: var(--system-green); }
.buddy-tag-negative { background: color-mix(in srgb, var(--system-red) 15%, transparent); color: var(--system-red); }
.buddy-tag-neutral { background: var(--fill-tertiary); color: var(--label-tertiary); }
.buddy-divider { height: 0.5px; background: var(--separator); margin: 0.75rem 0; }
.buddy-highlight {
  background: color-mix(in srgb, var(--accent-brand) 14%, transparent); padding: 0.02rem 0.3rem;
  border-radius: var(--radius-xs); color: var(--label);
}
.buddy-spoiler-warning {
  background: color-mix(in srgb, var(--system-orange) 10%, transparent);
  box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--system-orange) 30%, transparent);
  padding: 0.6rem 0.9rem; border-radius: var(--radius-md);
  font-size: 12px; color: var(--system-orange); font-weight: 500; margin: 0.7rem 0;
}
.buddy-entity-link {
  display: inline; background: color-mix(in srgb, var(--accent-brand) 12%, transparent);
  color: var(--accent-brand);
  padding: 0.02rem 0.35rem; border-radius: var(--radius-xs);
  font-size: inherit; font-weight: 500; cursor: pointer;
  text-decoration: none; transition: background 0.15s;
}
.buddy-entity-link:hover { background: color-mix(in srgb, var(--accent-brand) 22%, transparent); }
`;

/* ── Conversation History Types ── */

export interface ConversationSummary {
  id: string;
  title: string;
  firstMessage: string;
  messageCount: number;
  timestamp: number;
}

/* ── Quick Actions ── */

const QUICK_ACTIONS = [
  { label: "Recap so far", prompt: "Give me a brief recap of what's happened so far in the story." },
  { label: "Characters", prompt: "Who are the main characters and what are their current situations?" },
  { label: "Relationships", prompt: "What are the key relationships between characters right now?" },
  { label: "Story arcs", prompt: "What are the active story arcs and where do they stand?" },
];

const QUICK_ICONS: Record<string, React.ReactNode> = {
  "Recap so far": <ScrollText />,
  Characters: <Users />,
  Relationships: <HeartHandshake />,
  "Story arcs": <Milestone />,
};

/* ── Sub-components ── */

function ActionIcon({ action }: { action: WikiAction["action"] }) {
  const cls = "size-3.5 shrink-0";
  switch (action) {
    case "create_entry": return <Plus className={cls} />;
    case "update_entry": return <Pencil className={cls} />;
    case "delete_entry": return <Trash className={cls} />;
    case "add_aliases": return <Plus className={cls} />;
    case "add_relationship": return <Link className={cls} />;
    case "add_appearance": return <Eye className={cls} />;
    case "merge_entities": return <GitMerge className={cls} />;
  }
}

const ACTION_TONE = {
  green: "bg-success/15 text-success",
  yellow: "bg-warning/15 text-warning",
  red: "bg-danger/15 text-danger",
} as const;

/** Header strip shared by the inline action / plan cards. */
function CardHeader({ icon, tone, title, done }: { icon: React.ReactNode; tone: string; title: React.ReactNode; done?: boolean }) {
  return (
    <div className="flex h-10 items-center gap-2.5 px-3">
      <span className={cn("inline-flex size-6 items-center justify-center rounded-sm [&_svg]:size-3.5", tone)}>{icon}</span>
      <span className="flex-1 text-headline text-label">{title}</span>
      {done && (
        <Badge variant="success">
          <Check strokeWidth={2.5} />
          Done
        </Badge>
      )}
    </div>
  );
}

function WikiActionCard({ actions, onApprove, onReject, resolved }: {
  actions: WikiAction[]; onApprove: () => void; onReject: () => void; resolved: boolean;
}) {
  const descriptions = actions.map(describeWikiAction);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className="mt-3 overflow-hidden rounded-xl bg-fill-quaternary hairline"
    >
      <CardHeader
        icon={<Pencil strokeWidth={2} />}
        tone="bg-warning/15 text-warning"
        title={`${actions.length} wiki ${actions.length === 1 ? "change" : "changes"}`}
        done={resolved}
      />
      <ul className="flex flex-col gap-1 px-2 pb-2">
        {descriptions.map((desc, i) => (
          <li key={i} className="flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-fill-quaternary">
            <span className={cn("mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-sm", ACTION_TONE[desc.color])}>
              <ActionIcon action={actions[i].action} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-label">{desc.label}</div>
              <div className="text-xs leading-relaxed text-label-secondary">{desc.detail}</div>
            </div>
          </li>
        ))}
      </ul>
      {!resolved && (
        <div className="flex items-center justify-end gap-2 border-t border-separator px-3 py-2.5">
          <Button variant="ghost" size="sm" onClick={onReject}>
            <XCircle className="size-3.5" /> Skip
          </Button>
          <Button size="sm" onClick={onApprove}>
            <Check className="size-3.5" strokeWidth={2.5} /> Apply
          </Button>
        </div>
      )}
    </motion.div>
  );
}

function PlanCard({ plan, onApprove, onReject, resolved, executingStep }: {
  plan: BuddyPlan; onApprove: () => void; onReject: () => void; resolved: boolean; executingStep: number | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className="mt-3 overflow-hidden rounded-xl bg-fill-quaternary hairline"
    >
      <CardHeader
        icon={<ListChecks strokeWidth={2} />}
        tone="bg-brand/15 text-brand"
        title={<>Plan <span className="font-normal text-label-tertiary">· {plan.steps.length} steps</span></>}
        done={resolved && executingStep === null}
      />
      <div className="px-3 pb-3">
        <p className="mb-3 font-display text-base leading-snug text-label">{plan.goal}</p>
        <ol className="relative flex flex-col gap-1">
          {plan.steps.map((step, i) => {
            const active = executingStep === i;
            const done = executingStep !== null && i < executingStep;
            const toolCount = step.toolCalls?.length ?? 0;
            const actionCount = step.wikiActions?.length ?? 0;
            return (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-200",
                  active && "bg-brand/10",
                )}
              >
                <span
                  className={cn(
                    "mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold tabular-nums transition-colors",
                    done ? "bg-success text-brand-fg" : active ? "bg-brand text-brand-fg" : "bg-fill-tertiary text-label-tertiary",
                  )}
                >
                  {done ? <Check className="size-3" strokeWidth={3} /> : active ? <Loader2 className="size-3 animate-spin" strokeWidth={2.5} /> : <span>{i + 1}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm", active ? "text-label" : done ? "text-label-tertiary" : "text-label-secondary")}>
                    {step.description}
                  </div>
                  {(toolCount > 0 || actionCount > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {toolCount > 0 && (
                        <Badge variant="outline">
                          <Wrench strokeWidth={2} />
                          {toolCount} {toolCount === 1 ? "tool" : "tools"}
                        </Badge>
                      )}
                      {actionCount > 0 && (
                        <Badge variant="outline">
                          <Pencil strokeWidth={2} />
                          {actionCount} {actionCount === 1 ? "edit" : "edits"}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {!resolved && executingStep === null && (
        <div className="flex items-center justify-end gap-2 border-t border-separator px-3 py-2.5">
          <Button variant="ghost" size="sm" onClick={onReject}>
            <XCircle className="size-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={onApprove}>
            <Check className="size-3.5" strokeWidth={2.5} /> Execute
          </Button>
        </div>
      )}
    </motion.div>
  );
}

/* ── Assistant avatar ── */

function AssistantAvatar() {
  return (
    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg shadow-[0_0_16px_-4px_var(--accent-brand)]">
      <Sparkles className="size-3.5" strokeWidth={2} />
    </span>
  );
}

/* ── Conversation History Sidebar ── */

function ConversationHistory({
  conversations,
  onSelect,
  onDelete,
  onClose,
}: {
  conversations: ConversationSummary[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ type: "spring", stiffness: 400, damping: 34 }}
      className="flex h-full w-60 shrink-0 flex-col border-r border-separator bg-fill-quaternary"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 pr-2 pl-4">
        <History className="size-3.5 text-label-tertiary" strokeWidth={2} />
        <span className="flex-1 text-headline text-label">History</span>
        <Badge>{conversations.length}</Badge>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close history">
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="scrollbar-none flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <Clock className="size-5 text-label-quaternary" strokeWidth={1.5} />
            <p className="text-xs text-label-tertiary">No conversations yet</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <div
                  role="button"
                  tabIndex={0}
                  className="group focus-ring flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 transition-colors hover:bg-fill-tertiary"
                  onClick={() => onSelect(conv.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(conv.id); } }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-label">{conv.title}</div>
                    <div className="truncate text-xs text-label-secondary">{conv.firstMessage}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-2xs text-label-tertiary tabular-nums">
                      <Clock className="size-3" strokeWidth={2} />
                      {new Date(conv.timestamp).toLocaleDateString()}
                      <span>&middot; {conv.messageCount} msgs</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    aria-label="Delete conversation"
                    className="focus-ring flex size-6 shrink-0 items-center justify-center rounded-sm text-label-tertiary opacity-0 transition-all group-hover:opacity-100 hover:bg-danger/15 hover:text-danger focus-visible:opacity-100"
                  >
                    <Trash className="size-3" strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

/* ── Main Chat Props ── */

export interface AIChatProps {
  filePath: string;
  bookTitle: string;
  currentChapter: number;
  totalChapters: number;
  /** Pre-loaded messages to restore on mount (for pop-out preservation) */
  initialMessages?: BuddyMessage[];
  /** Callback to persist messages (for pop-out preservation) */
  onMessagesChange?: (messages: BuddyMessage[]) => void;
  /** Chapter reader function (needed for buddy tools). If null, tools are disabled. */
  readChapter?: ChapterReader;
  /** Called when entity link is clicked */
  onEntityClick?: (entityId: string) => void;
  /** Wiki entry count for display */
  wikiEntryCount?: number;
  /** Called when wiki is updated by buddy actions */
  onWikiUpdated?: () => void;
  /** Whether this is a compact (panel) or full (window) view */
  variant?: "panel" | "window";
  /** Max width for the content area */
  maxWidth?: string;
}

/* ── Main Chat Component ── */

export function AIChat({
  filePath,
  bookTitle,
  currentChapter,
  totalChapters,
  initialMessages,
  onMessagesChange,
  readChapter,
  onEntityClick,
  wikiEntryCount = 0,
  onWikiUpdated,
  variant = "window",
  maxWidth = "700px",
}: AIChatProps) {
  const [messages, setMessages] = useState<BuddyMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [wikiContext, setWikiContext] = useState("");
  const [applyingActions, setApplyingActions] = useState<string | null>(null);
  const [executingPlanMsgId, setExecutingPlanMsgId] = useState<string | null>(null);
  const [executingPlanStep, setExecutingPlanStep] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationIdRef = useRef<string>(`conv-${Date.now()}`);

  const isPanel = variant === "panel";
  const reduceMotion = useReducedMotion();

  // Sync messages up to parent
  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  // Load wiki context
  useEffect(() => {
    buildBuddyWikiContext(filePath, currentChapter).then(setWikiContext);
  }, [filePath, currentChapter]);

  // Load conversation history
  useEffect(() => {
    window.electronAPI?.getSetting(`chatHistory:${filePath}`).then((raw) => {
      if (raw) {
        try { setConversations(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  }, [filePath]);

  // Scroll on new messages
  useEffect(() => {
    scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight);
  }, [messages, isLoading, executingPlanStep]);

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Entity link click handler
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest<HTMLElement>("[data-entity]");
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        const id = link.getAttribute("data-entity");
        if (id) {
          if (onEntityClick) onEntityClick(id);
          else window.electronAPI?.openWiki({ filePath, title: bookTitle, entryId: id });
        }
      }
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [filePath, bookTitle, onEntityClick]);

  const refreshWikiContext = useCallback(async () => {
    setWikiContext(await buildBuddyWikiContext(filePath, currentChapter));
    onWikiUpdated?.();
  }, [filePath, currentChapter, onWikiUpdated]);

  // Save current conversation to history
  const saveToHistory = useCallback((msgs: BuddyMessage[]) => {
    if (msgs.length < 2) return; // Need at least a Q+A

    const firstUserMsg = msgs.find(m => m.role === "user");
    if (!firstUserMsg) return;

    const summary: ConversationSummary = {
      id: conversationIdRef.current,
      title: firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? "..." : ""),
      firstMessage: firstUserMsg.content,
      messageCount: msgs.length,
      timestamp: Date.now(),
    };

    setConversations(prev => {
      const updated = [summary, ...prev.filter(c => c.id !== summary.id)].slice(0, 50);
      window.electronAPI?.setSetting(`chatHistory:${filePath}`, JSON.stringify(updated));
      // Also save full messages for this conversation
      window.electronAPI?.setSetting(`chatMessages:${filePath}:${summary.id}`, JSON.stringify(msgs));
      return updated;
    });
  }, [filePath]);

  const loadConversation = useCallback(async (convId: string) => {
    const raw = await window.electronAPI?.getSetting(`chatMessages:${filePath}:${convId}`);
    if (raw) {
      try {
        const msgs = JSON.parse(raw) as BuddyMessage[];
        setMessages(msgs);
        conversationIdRef.current = convId;
        setShowHistory(false);
      } catch { /* ignore */ }
    }
  }, [filePath]);

  const deleteConversation = useCallback(async (convId: string) => {
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== convId);
      window.electronAPI?.setSetting(`chatHistory:${filePath}`, JSON.stringify(updated));
      return updated;
    });
    window.electronAPI?.setSetting(`chatMessages:${filePath}:${convId}`, "");
  }, [filePath]);

  const approveActions = useCallback(async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.pendingActions?.length) return;
    setApplyingActions(msgId);
    try {
      for (const a of msg.pendingActions) await executeWikiAction(filePath, a);
      setMessages((p) => p.map((m) => m.id === msgId ? { ...m, actionsResolved: true } : m));
      await refreshWikiContext();
    } catch (err) {
      setMessages((p) => [...p, { id: `err-${Date.now()}`, role: "assistant", content: `<p class="buddy-text" style="color:var(--system-red)">Failed: ${err instanceof Error ? err.message : "Unknown"}</p>`, timestamp: Date.now() }]);
    } finally { setApplyingActions(null); }
  }, [messages, filePath, refreshWikiContext]);

  const rejectActions = useCallback((msgId: string) => {
    setMessages((p) => p.map((m) => m.id === msgId ? { ...m, actionsResolved: true } : m));
  }, []);

  const doExecutePlan = useCallback(async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.pendingPlan || !readChapter) return;
    const plan = msg.pendingPlan;
    setExecutingPlanMsgId(msgId);
    const prev: string[] = [];
    try {
      for (let i = 0; i < plan.steps.length; i++) {
        setExecutingPlanStep(i);
        const [html, acts] = await executePlanStep(bookTitle, currentChapter, totalChapters, wikiContext, plan, i, prev, readChapter);
        prev.push(html);
        const sid = `plan-${Date.now()}-${i}`;
        setMessages((p) => [...p, { id: sid, role: "assistant", content: html, timestamp: Date.now(), pendingActions: acts.length > 0 ? acts : undefined, actionsResolved: acts.length === 0 ? undefined : false }]);
        if (acts.length > 0) {
          for (const a of acts) await executeWikiAction(filePath, a);
          setMessages((p) => p.map((m) => m.id === sid ? { ...m, actionsResolved: true } : m));
          await refreshWikiContext();
        }
      }
      setMessages((p) => p.map((m) => m.id === msgId ? { ...m, planResolved: true } : m));
    } catch (err) {
      setMessages((p) => [...p, { id: `err-${Date.now()}`, role: "assistant", content: `<p class="buddy-text" style="color:var(--system-red)">Plan failed: ${err instanceof Error ? err.message : "Unknown"}</p>`, timestamp: Date.now() }]);
    } finally { setExecutingPlanMsgId(null); setExecutingPlanStep(null); }
  }, [messages, bookTitle, currentChapter, totalChapters, wikiContext, readChapter, filePath, refreshWikiContext]);

  const rejectPlan = useCallback((msgId: string) => {
    setMessages((p) => p.map((m) => m.id === msgId ? { ...m, planResolved: true } : m));
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: BuddyMessage = { id: `u-${Date.now()}`, role: "user", content: text.trim(), timestamp: Date.now() };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setIsLoading(true);
    setLoadingStatus(null);
    try {
      const dummyReader: ChapterReader = () => null;
      const [html, acts, plan] = await sendBuddyMessage(
        bookTitle, currentChapter, totalChapters, wikiContext,
        messages, text.trim(), readChapter ?? dummyReader,
        (s) => setLoadingStatus(s),
      );
      const assistantMsg: BuddyMessage = {
        id: `a-${Date.now()}`, role: "assistant", content: html, timestamp: Date.now(),
        pendingActions: acts.length > 0 ? acts : undefined,
        actionsResolved: acts.length === 0 ? undefined : false,
        pendingPlan: plan ?? undefined,
        planResolved: plan ? false : undefined,
      };
      setMessages((p) => {
        const updated = [...p, assistantMsg];
        // Save to history after each exchange
        saveToHistory(updated);
        return updated;
      });
    } catch (err) {
      setMessages((p) => [...p, { id: `err-${Date.now()}`, role: "assistant", content: `<p class="buddy-text" style="color:var(--system-red)">Error: ${err instanceof Error ? err.message : "Unknown"}</p>`, timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
      setLoadingStatus(null);
      inputRef.current?.focus();
    }
  }, [isLoading, bookTitle, currentChapter, totalChapters, wikiContext, messages, readChapter, saveToHistory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const startNewChat = useCallback(() => {
    // Save current conversation before starting new
    if (messages.length >= 2) saveToHistory(messages);
    conversationIdRef.current = `conv-${Date.now()}`;
    setMessages([]);
  }, [messages, saveToHistory]);

  const busy = isLoading || executingPlanMsgId !== null;

  return (
    <div className="flex h-full w-full flex-col">
      <style dangerouslySetInnerHTML={{ __html: AI_FORMATTING_STYLES + BUDDY_STYLES }} />

      <div className="flex flex-1 overflow-hidden">
        {/* History sidebar */}
        <AnimatePresence initial={false}>
          {showHistory && (
            <ConversationHistory
              key="history"
              conversations={conversations}
              onSelect={loadConversation}
              onDelete={deleteConversation}
              onClose={() => setShowHistory(false)}
            />
          )}
        </AnimatePresence>

        {/* Main chat area */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className={cn("relative flex min-h-full flex-col items-center justify-center", isPanel ? "px-5 py-6" : "px-12 py-10")}>
                <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-72 -translate-x-1/2 -translate-y-2/3 rounded-full bg-brand/10 blur-3xl" />
                <motion.div
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className="relative mb-5"
                >
                  {!reduceMotion && (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-brand"
                      animate={{ scale: [1, 1.6], opacity: [0.35, 0] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
                    />
                  )}
                  <span className="relative inline-flex size-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-[0_0_32px_-4px_var(--accent-brand)]">
                    <Sparkles className="size-6" strokeWidth={1.75} />
                  </span>
                </motion.div>
                <h2 className="relative text-center text-title font-display text-label text-balance">
                  What would you like to know?
                </h2>
                <p className="relative mt-1.5 max-w-sm text-center text-sm text-label-secondary">
                  Ask about characters, plot, relationships, or anything about{" "}
                  <span className="font-display italic text-label">{bookTitle || "the story"}</span>.
                </p>
                <div className={cn("relative mt-7 grid w-full gap-2", isPanel ? "max-w-md grid-cols-2" : "max-w-lg grid-cols-2")}>
                  {QUICK_ACTIONS.map((a, i) => (
                    <motion.button
                      key={a.label}
                      type="button"
                      onClick={() => sendMessage(a.prompt)}
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 + i * 0.04, type: "spring", stiffness: 400, damping: 30 }}
                      className="group glass-thin focus-ring pressable flex items-start gap-2.5 rounded-xl p-3 text-left"
                    >
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand transition-colors duration-150 group-hover:bg-brand group-hover:text-brand-fg [&_svg]:size-3.5">
                        {QUICK_ICONS[a.label] ?? <Sparkles />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-headline text-label">{a.label}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-label-tertiary">{a.prompt}</span>
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={cn("mx-auto flex flex-col gap-5", isPanel ? "px-4 py-4" : "px-6 py-6")} style={{ maxWidth }}>
                {messages.map((msg) => (
                  <div key={msg.id}>
                    {msg.role === "user" ? (
                      <ChatBubble variant="outgoing" maxWidth="85%">
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      </ChatBubble>
                    ) : (
                      <div className="flex items-start gap-2.5">
                        <AssistantAvatar />
                        <div className="min-w-0 flex-1">
                          <ChatBubble variant="incoming" maxWidth="100%" bubbleClassName="px-4 py-3">
                            <div
                              className="buddy-content"
                              data-reading-theme="dark"
                              dangerouslySetInnerHTML={{ __html: msg.content }}
                            />
                          </ChatBubble>
                          {msg.pendingActions && msg.pendingActions.length > 0 && (
                            <WikiActionCard actions={msg.pendingActions} onApprove={() => approveActions(msg.id)} onReject={() => rejectActions(msg.id)} resolved={msg.actionsResolved ?? false} />
                          )}
                          {msg.pendingPlan && (
                            <PlanCard plan={msg.pendingPlan} onApprove={() => doExecutePlan(msg.id)} onReject={() => rejectPlan(msg.id)} resolved={msg.planResolved ?? false} executingStep={executingPlanMsgId === msg.id ? executingPlanStep : null} />
                          )}
                          {applyingActions === msg.id && (
                            <div className="mt-2.5 flex items-center gap-2">
                              <Loader2 className="size-3.5 animate-spin text-success" strokeWidth={2} />
                              <ShimmerText className="text-xs">Applying changes…</ShimmerText>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex items-start gap-2.5">
                    <AssistantAvatar />
                    <ChatBubble variant="incoming" bubbleClassName="flex items-center gap-2.5 px-3.5 py-2.5">
                      <TypingDots className="text-brand" />
                      <ShimmerText className="text-xs">Thinking…</ShimmerText>
                    </ChatBubble>
                    <AnimatePresence mode="popLayout">
                      {loadingStatus && (
                        <motion.span
                          key={loadingStatus}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.18 }}
                          className="mt-2"
                        >
                          <Badge variant="outline" className="max-w-56">
                            <Wrench strokeWidth={2} />
                            <span className="truncate">{loadingStatus}</span>
                          </Badge>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className={cn("shrink-0", isPanel ? "px-3 pt-1 pb-3" : "px-4 pt-2 pb-4")}>
            <div className="mx-auto" style={{ maxWidth }}>
              <PromptInput
                value={input}
                onValueChange={setInput}
                onSend={() => sendMessage(input)}
                onKeyDown={handleKeyDown}
                textareaRef={inputRef}
                placeholder="Ask anything about the story..."
                disabled={busy}
                canSend={!!input.trim() && !busy}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowHistory(!showHistory)}
                      aria-pressed={showHistory}
                      className={cn("rounded-full text-label-secondary", showHistory && "bg-fill-tertiary text-label")}
                    >
                      <History className="size-3.5" strokeWidth={2} />
                      History
                    </Button>
                    {messages.length > 0 && (
                      <Button variant="ghost" size="xs" onClick={startNewChat} className="rounded-full text-label-secondary">
                        <Plus className="size-3.5" strokeWidth={2} />
                        New
                      </Button>
                    )}
                  </>
                }
                meta={
                  wikiEntryCount > 0 ? (
                    <Badge className="mr-1">
                      <BookOpen strokeWidth={2} />
                      {wikiEntryCount} wiki entries
                    </Badge>
                  ) : null
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
