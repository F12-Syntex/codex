"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, MessageCircle, Trash2, Sparkles, User } from "lucide-react";
import type { ThemeClasses } from "../lib/types";
import type { BuddyMessage } from "@/lib/ai-buddy";
import { sendBuddyMessage, buildBuddyWikiContext } from "@/lib/ai-buddy";
import { AI_FORMATTING_STYLES } from "@/lib/ai-formatting-css";

/* ── Buddy-specific CSS ───────────────────────────────────── */

const BUDDY_STYLES = `
/* ── Buddy layout classes ── */
.buddy-section { padding-top: 0.75rem; border-top: 1px solid oklch(1 0 0 / 6%); margin-top: 0.75rem; }
.buddy-section:first-child { padding-top: 0; border-top: none; margin-top: 0; }
.buddy-heading { font-size: 13px; font-weight: 600; color: oklch(0.90 0 0); margin-bottom: 0.5rem; }
.buddy-subheading { font-size: 12px; font-weight: 600; color: oklch(0.75 0 0); margin-bottom: 0.35rem; }
.buddy-text { font-size: 12px; line-height: 1.7; color: oklch(0.70 0 0); margin-bottom: 0.35rem; }
.buddy-text:last-child { margin-bottom: 0; }
.buddy-muted { font-size: 11px; color: oklch(0.50 0 0); }
.buddy-quote {
  border-left: 2px solid var(--accent-brand, oklch(0.60 0.20 264));
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0;
  background: oklch(1 0 0 / 2%);
  border-radius: 0 8px 8px 0;
  font-style: italic;
  font-size: 12px;
  color: oklch(0.65 0 0);
  line-height: 1.7;
}
.buddy-list { list-style: none; padding: 0; margin: 0.35rem 0; }
.buddy-list > div, .buddy-list > li {
  font-size: 12px;
  line-height: 1.7;
  color: oklch(0.70 0 0);
  padding: 0.15rem 0;
  padding-left: 0.75rem;
  position: relative;
}
.buddy-list > div::before, .buddy-list > li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.65rem;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: oklch(1 0 0 / 15%);
}
.buddy-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.75rem;
  font-size: 12px;
  line-height: 1.7;
  margin: 0.35rem 0;
}
.buddy-card {
  border: 1px solid oklch(1 0 0 / 6%);
  background: oklch(1 0 0 / 2%);
  border-radius: 8px;
  padding: 0.75rem;
  margin: 0.5rem 0;
}
.buddy-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 13px;
}
.buddy-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 0.1rem 0.4rem;
  border-radius: 8px;
  background: oklch(1 0 0 / 6%);
  color: oklch(0.60 0 0);
}
.buddy-tag-accent {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 0.1rem 0.4rem;
  border-radius: 8px;
  background: var(--accent-brand, oklch(0.60 0.20 264));
  color: oklch(0.98 0 0);
  opacity: 0.85;
}
.buddy-tag-positive {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 0.1rem 0.4rem;
  border-radius: 8px;
  background: oklch(0.65 0.14 150 / 15%);
  color: oklch(0.65 0.14 150);
}
.buddy-tag-negative {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 0.1rem 0.4rem;
  border-radius: 8px;
  background: oklch(0.65 0.18 25 / 15%);
  color: oklch(0.65 0.18 25);
}
.buddy-tag-neutral {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 0.1rem 0.4rem;
  border-radius: 8px;
  background: oklch(1 0 0 / 6%);
  color: oklch(0.55 0 0);
}
.buddy-divider { height: 1px; background: oklch(1 0 0 / 6%); margin: 0.5rem 0; }
.buddy-highlight {
  background: var(--accent-brand, oklch(0.60 0.20 264));
  background: oklch(0.60 0.20 264 / 12%);
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  color: oklch(0.85 0 0);
}
.buddy-spoiler-warning {
  border: 1px solid oklch(0.75 0.12 80 / 20%);
  background: oklch(0.75 0.12 80 / 6%);
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  font-size: 11px;
  color: oklch(0.75 0.12 80);
  font-weight: 500;
  margin: 0.5rem 0;
}

/* ── Entity links ── */
.buddy-entity-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--accent-brand, oklch(0.60 0.20 264));
  background: oklch(0.60 0.20 264 / 10%);
  color: var(--accent-brand, oklch(0.60 0.20 264));
  padding: 0.05rem 0.35rem;
  border-radius: 8px;
  font-size: inherit;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s;
}
.buddy-entity-link:hover {
  background: oklch(0.60 0.20 264 / 18%);
}

/* ── Buddy panel resets (scope ai-fmt styles) ── */
.buddy-content p { margin: 0.25rem 0; font-size: 12px; line-height: 1.7; color: oklch(0.70 0 0); }
.buddy-content p:first-child { margin-top: 0; }
.buddy-content p:last-child { margin-bottom: 0; }
.buddy-content strong { color: oklch(0.85 0 0); font-weight: 600; }
.buddy-content em { color: oklch(0.65 0 0); }
.buddy-content a { color: var(--accent-brand, oklch(0.60 0.20 264)); text-decoration: none; }
`;

interface AIBuddyPanelProps {
  theme: ThemeClasses;
  filePath: string;
  bookTitle: string;
  currentChapter: number;
  wikiEntryCount: number;
  onEntityClick: (entityId: string) => void;
  onClose: () => void;
}

/* ── Quick Actions ─────────────────────────────────────── */

const QUICK_ACTIONS = [
  { label: "Recap", prompt: "Give me a brief recap of what's happened so far in the story." },
  { label: "Characters", prompt: "Who are the main characters and what are their current situations?" },
  { label: "Relationships", prompt: "What are the key relationships between characters right now?" },
  { label: "Arcs", prompt: "What are the active story arcs and where do they stand?" },
];

/* ── AI Buddy Panel ────────────────────────────────────── */

export function AIBuddyPanel({
  theme,
  filePath,
  bookTitle,
  currentChapter,
  wikiEntryCount,
  onEntityClick,
  onClose,
}: AIBuddyPanelProps) {
  const [messages, setMessages] = useState<BuddyMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [wikiContext, setWikiContext] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    buildBuddyWikiContext(filePath, currentChapter).then(setWikiContext);
  }, [filePath, currentChapter]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* Delegate clicks on entity links inside rendered HTML */
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest<HTMLElement>("[data-entity]");
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        const entityId = link.getAttribute("data-entity");
        if (entityId) onEntityClick(entityId);
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [onEntityClick]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: BuddyMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await sendBuddyMessage(
        bookTitle, currentChapter, wikiContext, messages, text.trim(),
      );
      setMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `<p class="buddy-text" style="color: oklch(0.65 0.18 25);">Something went wrong: ${err instanceof Error ? err.message : "Unknown error"}</p>`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [isLoading, bookTitle, currentChapter, wikiContext, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div
      className="absolute bottom-full right-0 z-50 mb-3 flex w-[440px] flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-[var(--bg-overlay)] shadow-lg shadow-black/40 backdrop-blur-xl"
      style={{ height: "min(600px, calc(100vh - 140px))" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Inject ai-fmt + buddy styles */}
      <style dangerouslySetInnerHTML={{ __html: AI_FORMATTING_STYLES + BUDDY_STYLES }} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-brand)]/15">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          </div>
          <div>
            <span className="text-sm font-medium text-white/80">AI Buddy</span>
            {wikiEntryCount > 0 && (
              <span className="ml-2 text-xs text-white/25">{wikiEntryCount} entries loaded</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {hasMessages && (
            <button
              onClick={() => setMessages([])}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/20 transition-colors hover:bg-white/[0.06] hover:text-white/50"
              title="Clear chat"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/20 transition-colors hover:bg-white/[0.06] hover:text-white/50"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-brand)]/10">
              <MessageCircle className="h-7 w-7 text-[var(--accent-brand)]" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white/70">Ask me anything about the book</p>
              <p className="mt-1.5 text-xs leading-relaxed text-white/30">
                Characters, plot, relationships, arcs — I have full wiki context up to your current chapter.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.prompt)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs text-white/50 transition-all hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white/70"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={contentRef} className="divide-y divide-white/[0.04]">
            {messages.map((msg) => (
              <div key={msg.id} className={`px-4 py-3 ${msg.role === "user" ? "bg-white/[0.02]" : ""}`}>
                {/* Role indicator */}
                <div className="mb-2 flex items-center gap-2">
                  {msg.role === "user" ? (
                    <>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.08]">
                        <User className="h-3 w-3 text-white/40" strokeWidth={1.5} />
                      </div>
                      <span className="text-xs font-medium text-white/40">You</span>
                    </>
                  ) : (
                    <>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-brand)]/15">
                        <Sparkles className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={1.5} />
                      </div>
                      <span className="text-xs font-medium text-[var(--accent-brand)]/70">Buddy</span>
                    </>
                  )}
                </div>

                {/* Content */}
                {msg.role === "user" ? (
                  <p className="pl-7 text-xs leading-[1.7] text-white/70">{msg.content}</p>
                ) : (
                  <div
                    className="buddy-content pl-7"
                    data-reading-theme="dark"
                    dangerouslySetInnerHTML={{ __html: msg.content }}
                  />
                )}
              </div>
            ))}

            {isLoading && (
              <div className="px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-brand)]/15">
                    <Sparkles className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={1.5} />
                  </div>
                  <span className="text-xs font-medium text-[var(--accent-brand)]/70">Buddy</span>
                </div>
                <div className="flex items-center gap-2 pl-7">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-brand)]" strokeWidth={2} />
                  <span className="text-xs text-white/30">Thinking...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-end gap-2 rounded-lg bg-white/[0.04] px-3 py-2 focus-within:bg-white/[0.06]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the book..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-xs leading-relaxed text-white/80 outline-none placeholder:text-white/20"
            style={{ maxHeight: "80px" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ${
              input.trim() && !isLoading
                ? "bg-[var(--accent-brand)] text-white hover:brightness-110"
                : "text-white/15"
            }`}
          >
            <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
