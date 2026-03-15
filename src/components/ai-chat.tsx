"use client";

/**
 * Unified AI Chat component — used by both AI Buddy (reader) and Wiki Chat (database).
 * Supports conversation history, wiki actions, plans, entity links, and detachable windows.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Send, Loader2, Sparkles, Trash2, Check, XCircle, Plus, Pencil, Trash,
  GitMerge, Link, Eye, ListChecks, BookOpen, ArrowUp, X, Clock, History,
  ChevronDown, ChevronRight,
} from "lucide-react";
import type { BuddyMessage, WikiAction, BuddyPlan, ChapterReader } from "@/lib/ai-buddy";
import { sendBuddyMessage, buildBuddyWikiContext, executeWikiAction, describeWikiAction, executePlanStep } from "@/lib/ai-buddy";
import { AI_FORMATTING_STYLES } from "@/lib/ai-formatting-css";

/* ── Buddy CSS ── */

const BUDDY_STYLES = `
.buddy-content { font-size: 14px; line-height: 1.85; color: oklch(0.78 0 0); }
.buddy-content p { margin: 0.65rem 0; }
.buddy-content p:first-child { margin-top: 0; }
.buddy-content p:last-child { margin-bottom: 0; }
.buddy-content strong { color: oklch(0.92 0 0); font-weight: 600; }
.buddy-content em { color: oklch(0.68 0 0); font-style: italic; }
.buddy-content a { color: var(--accent-brand, oklch(0.65 0.20 264)); text-decoration: none; }
.buddy-content ul, .buddy-content ol { margin: 0.65rem 0; padding-left: 1.5rem; }
.buddy-content li { margin: 0.35rem 0; line-height: 1.75; }

.buddy-section { padding-top: 1rem; margin-top: 1rem; border-top: 1px solid oklch(1 0 0 / 5%); }
.buddy-section:first-child { padding-top: 0; margin-top: 0; border-top: none; }
.buddy-heading { font-size: 14px; font-weight: 600; color: oklch(0.92 0 0); margin-bottom: 0.65rem; letter-spacing: -0.01em; }
.buddy-subheading { font-size: 12px; font-weight: 600; color: oklch(0.78 0 0); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.04em; }
.buddy-text { font-size: 14px; line-height: 1.85; color: oklch(0.72 0 0); margin-bottom: 0.5rem; }
.buddy-text:last-child { margin-bottom: 0; }
.buddy-muted { font-size: 12px; color: oklch(0.48 0 0); }
.buddy-quote {
  border-left: 2px solid var(--accent-brand, oklch(0.65 0.20 264));
  padding: 0.65rem 1rem;
  margin: 0.75rem 0;
  background: oklch(1 0 0 / 2%);
  border-radius: 0 8px 8px 0;
  font-style: italic;
  font-size: 14px;
  color: oklch(0.62 0 0);
  line-height: 1.85;
}
.buddy-list { list-style: none; padding: 0; margin: 0.5rem 0; }
.buddy-list > div, .buddy-list > li {
  font-size: 14px; line-height: 1.85; color: oklch(0.72 0 0);
  padding: 0.2rem 0 0.2rem 1.2rem; position: relative;
}
.buddy-list > div::before, .buddy-list > li::before {
  content: ""; position: absolute; left: 0; top: 0.75rem;
  width: 4px; height: 4px; border-radius: 50%; background: oklch(1 0 0 / 18%);
}
.buddy-grid {
  display: grid; grid-template-columns: auto 1fr;
  gap: 0.3rem 1rem; font-size: 14px; line-height: 1.75; margin: 0.5rem 0;
}
.buddy-card {
  border: 1px solid oklch(1 0 0 / 6%); background: oklch(1 0 0 / 2.5%);
  border-radius: 8px; padding: 1rem; margin: 0.75rem 0;
}
.buddy-card:first-child { margin-top: 0; }
.buddy-card-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 0.65rem; font-size: 14px;
}
.buddy-tag, .buddy-tag-accent, .buddy-tag-positive, .buddy-tag-negative, .buddy-tag-neutral {
  display: inline-block; font-size: 12px; font-weight: 500;
  padding: 0.15rem 0.55rem; border-radius: 8px; vertical-align: middle;
}
.buddy-tag { background: oklch(1 0 0 / 6%); color: oklch(0.58 0 0); }
.buddy-tag-accent { background: var(--accent-brand, oklch(0.65 0.20 264)); color: oklch(0.98 0 0); opacity: 0.85; }
.buddy-tag-positive { background: oklch(0.65 0.14 150 / 15%); color: oklch(0.65 0.14 150); }
.buddy-tag-negative { background: oklch(0.65 0.18 25 / 15%); color: oklch(0.65 0.18 25); }
.buddy-tag-neutral { background: oklch(1 0 0 / 6%); color: oklch(0.52 0 0); }
.buddy-divider { height: 1px; background: oklch(1 0 0 / 5%); margin: 0.75rem 0; }
.buddy-highlight {
  background: oklch(0.65 0.20 264 / 10%); padding: 0.02rem 0.3rem;
  border-radius: 4px; color: oklch(0.88 0 0);
}
.buddy-spoiler-warning {
  border: 1px solid oklch(0.75 0.12 80 / 18%);
  background: oklch(0.75 0.12 80 / 5%);
  padding: 0.65rem 1rem; border-radius: 8px;
  font-size: 12px; color: oklch(0.75 0.12 80); font-weight: 500; margin: 0.75rem 0;
}
.buddy-entity-link {
  display: inline; background: oklch(0.65 0.20 264 / 8%);
  color: var(--accent-brand, oklch(0.65 0.20 264));
  padding: 0.02rem 0.4rem; border-radius: 4px;
  font-size: inherit; font-weight: 500; cursor: pointer;
  text-decoration: none; transition: background 0.15s;
}
.buddy-entity-link:hover { background: oklch(0.65 0.20 264 / 16%); }
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

/* ── Sub-components ── */

function ActionIcon({ action }: { action: WikiAction["action"] }) {
  const cls = "h-3.5 w-3.5 shrink-0";
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

function WikiActionCard({ actions, onApprove, onReject, resolved }: {
  actions: WikiAction[]; onApprove: () => void; onReject: () => void; resolved: boolean;
}) {
  const descriptions = actions.map(describeWikiAction);
  const colorMap = {
    green: "border-emerald-400/10 bg-emerald-400/[0.03]",
    yellow: "border-amber-400/10 bg-amber-400/[0.03]",
    red: "border-red-400/10 bg-red-400/[0.03]",
  };

  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-white/[0.06]">
      <div className="flex items-center gap-2 border-b border-white/[0.04] bg-white/[0.02] px-3 py-2">
        <Pencil className="h-3.5 w-3.5 text-amber-400/80" strokeWidth={1.5} />
        <span className="text-xs font-medium text-white/60">
          {actions.length} wiki {actions.length === 1 ? "change" : "changes"}
        </span>
        {resolved && <span className="ml-auto text-xs text-white/20">done</span>}
      </div>
      <div className="space-y-px bg-white/[0.01] p-1.5">
        {descriptions.map((desc, i) => (
          <div key={i} className={`flex items-start gap-2 rounded-lg border ${colorMap[desc.color]} px-2.5 py-2`}>
            <div className="mt-px text-white/30"><ActionIcon action={actions[i].action} /></div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white/75">{desc.label}</div>
              <div className="text-xs leading-relaxed text-white/35">{desc.detail}</div>
            </div>
          </div>
        ))}
      </div>
      {!resolved && (
        <div className="flex gap-2 border-t border-white/[0.04] px-3 py-2">
          <button onClick={onApprove} className="flex items-center gap-1.5 rounded-lg bg-emerald-500/12 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20">
            <Check className="h-3 w-3" strokeWidth={2.5} /> Apply
          </button>
          <button onClick={onReject} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/50">
            <XCircle className="h-3 w-3" strokeWidth={2} /> Skip
          </button>
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, onApprove, onReject, resolved, executingStep }: {
  plan: BuddyPlan; onApprove: () => void; onReject: () => void; resolved: boolean; executingStep: number | null;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-white/[0.06]">
      <div className="flex items-center gap-2 border-b border-white/[0.04] bg-white/[0.02] px-3 py-2">
        <ListChecks className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
        <span className="text-xs font-medium text-white/60">Plan — {plan.steps.length} steps</span>
        {resolved && executingStep === null && <span className="ml-auto text-xs text-white/20">done</span>}
      </div>
      <div className="px-3 py-2.5">
        <p className="mb-2.5 text-sm text-white/45">{plan.goal}</p>
        <div className="space-y-1.5">
          {plan.steps.map((step, i) => {
            const active = executingStep === i;
            const done = executingStep !== null && i < executingStep;
            const toolCount = step.toolCalls?.length ?? 0;
            const actionCount = step.wikiActions?.length ?? 0;
            return (
              <div key={i} className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 ${active ? "bg-[var(--accent-brand)]/[0.06]" : done ? "bg-emerald-500/[0.03]" : ""}`}>
                <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-emerald-500/15 text-emerald-400" : active ? "bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]" : "bg-white/[0.04] text-white/25"}`}>
                  {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : active ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <span>{i + 1}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${active ? "text-white/75" : done ? "text-white/45" : "text-white/50"}`}>{step.description}</div>
                  {(toolCount > 0 || actionCount > 0) && (
                    <div className="mt-1 flex gap-2.5 text-xs text-white/20">
                      {toolCount > 0 && <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {toolCount}</span>}
                      {actionCount > 0 && <span className="flex items-center gap-1"><Pencil className="h-3 w-3" /> {actionCount}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {!resolved && executingStep === null && (
        <div className="flex gap-2 border-t border-white/[0.04] px-3 py-2">
          <button onClick={onApprove} className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-brand)]/12 px-3 py-1.5 text-xs font-medium text-[var(--accent-brand)] transition-colors hover:bg-[var(--accent-brand)]/20">
            <Check className="h-3 w-3" strokeWidth={2.5} /> Execute
          </button>
          <button onClick={onReject} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/50">
            <XCircle className="h-3 w-3" strokeWidth={2} /> Cancel
          </button>
        </div>
      )}
    </div>
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
    <div className="flex h-full w-[220px] shrink-0 flex-col border-r border-white/[0.06]" style={{ background: "var(--bg-inset)" }}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <span className="text-xs font-medium text-white/50">History</span>
        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded-lg text-white/20 hover:bg-white/[0.06] hover:text-white/40"
        >
          <X className="h-3 w-3" strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 ? (
          <p className="px-3 py-4 text-xs text-white/20 text-center">No conversations yet</p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className="group flex items-start gap-2 px-3 py-2 hover:bg-white/[0.03] cursor-pointer transition-colors"
              onClick={() => onSelect(conv.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-white/60 truncate">{conv.title}</div>
                <div className="text-xs text-white/25 truncate">{conv.firstMessage}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/15">
                  <Clock className="h-2.5 w-2.5" />
                  {new Date(conv.timestamp).toLocaleDateString()}
                  <span>&middot; {conv.messageCount} msgs</span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                className="opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded-lg text-white/15 hover:bg-red-500/15 hover:text-red-400 transition-all"
              >
                <Trash className="h-2.5 w-2.5" strokeWidth={1.5} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
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
      setMessages((p) => [...p, { id: `err-${Date.now()}`, role: "assistant", content: `<p class="buddy-text" style="color:oklch(0.65 0.18 25)">Failed: ${err instanceof Error ? err.message : "Unknown"}</p>`, timestamp: Date.now() }]);
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
      setMessages((p) => [...p, { id: `err-${Date.now()}`, role: "assistant", content: `<p class="buddy-text" style="color:oklch(0.65 0.18 25)">Plan failed: ${err instanceof Error ? err.message : "Unknown"}</p>`, timestamp: Date.now() }]);
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
      setMessages((p) => [...p, { id: `err-${Date.now()}`, role: "assistant", content: `<p class="buddy-text" style="color:oklch(0.65 0.18 25)">Error: ${err instanceof Error ? err.message : "Unknown"}</p>`, timestamp: Date.now() }]);
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
        {showHistory && (
          <ConversationHistory
            conversations={conversations}
            onSelect={loadConversation}
            onDelete={deleteConversation}
            onClose={() => setShowHistory(false)}
          />
        )}

        {/* Main chat area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-12">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-brand)]/8">
                  <Sparkles className="h-6 w-6 text-[var(--accent-brand)]/60" strokeWidth={1.5} />
                </div>
                <p className="mb-1.5 text-sm font-medium text-white/50">What would you like to know?</p>
                <p className="mb-8 text-center text-xs leading-relaxed text-white/20">
                  Ask about characters, plot, relationships, or anything about the story.
                </p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  {QUICK_ACTIONS.map((a) => (
                    <button key={a.label} onClick={() => sendMessage(a.prompt)}
                      className="rounded-lg border border-white/[0.05] px-4 py-2.5 text-xs text-white/30 transition-all hover:border-white/[0.1] hover:bg-white/[0.03] hover:text-white/50">
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto px-6 py-5" style={{ maxWidth }}>
                {messages.map((msg, idx) => (
                  <div key={msg.id} className={idx > 0 ? "mt-6" : ""}>
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[80%] rounded-lg rounded-br-sm bg-[var(--accent-brand)]/12 px-4 py-3 text-sm leading-relaxed text-white/75">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div
                          className="buddy-content"
                          data-reading-theme="dark"
                          dangerouslySetInnerHTML={{ __html: msg.content }}
                        />
                        {msg.pendingActions && msg.pendingActions.length > 0 && (
                          <WikiActionCard actions={msg.pendingActions} onApprove={() => approveActions(msg.id)} onReject={() => rejectActions(msg.id)} resolved={msg.actionsResolved ?? false} />
                        )}
                        {msg.pendingPlan && (
                          <PlanCard plan={msg.pendingPlan} onApprove={() => doExecutePlan(msg.id)} onReject={() => rejectPlan(msg.id)} resolved={msg.planResolved ?? false} executingStep={executingPlanMsgId === msg.id ? executingPlanStep : null} />
                        )}
                        {applyingActions === msg.id && (
                          <div className="mt-3 flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin text-emerald-400" strokeWidth={2} />
                            <span className="text-xs text-emerald-400/60">Applying...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-brand)]/50" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-brand)]/50" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-brand)]/50" style={{ animationDelay: "300ms" }} />
                    </div>
                    {loadingStatus && <span className="text-xs text-white/20">{loadingStatus}</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t border-white/[0.04] px-4 pb-4 pt-3">
            <div className="mx-auto" style={{ maxWidth }}>
              {/* Action buttons row */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-white/20 transition-colors hover:bg-white/[0.04] hover:text-white/40"
                  >
                    <History className="h-3 w-3" strokeWidth={1.5} />
                    History
                  </button>
                  {messages.length > 0 && (
                    <button
                      onClick={startNewChat}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-white/20 transition-colors hover:bg-white/[0.04] hover:text-white/40"
                    >
                      <Plus className="h-3 w-3" strokeWidth={1.5} />
                      New
                    </button>
                  )}
                </div>
                {wikiEntryCount > 0 && (
                  <span className="text-xs text-white/15">{wikiEntryCount} wiki entries</span>
                )}
              </div>

              {/* Input field */}
              <div className="flex items-end gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 py-3 transition-colors focus-within:border-white/[0.1] focus-within:bg-white/[0.04]">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about the story..."
                  rows={1}
                  disabled={busy}
                  className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-white/80 outline-none placeholder:text-white/20"
                  style={{ maxHeight: "120px" }}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || busy}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ${
                    input.trim() && !busy
                      ? "bg-[var(--accent-brand)] text-white shadow-sm shadow-black/20"
                      : "text-white/10"
                  }`}
                >
                  <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
