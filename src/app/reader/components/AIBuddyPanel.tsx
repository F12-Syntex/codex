"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, MessageCircle, Trash2, Sparkles } from "lucide-react";
import type { ThemeClasses } from "../lib/types";
import type { BuddyMessage } from "@/lib/ai-buddy";
import { sendBuddyMessage, buildBuddyWikiContext } from "@/lib/ai-buddy";

interface AIBuddyPanelProps {
  theme: ThemeClasses;
  filePath: string;
  bookTitle: string;
  currentChapter: number;
  wikiEntryCount: number;
  onEntityClick: (entityId: string) => void;
  onClose: () => void;
}

/* ── Rich Content Renderer ─────────────────────────────── */

function RichContent({
  content,
  theme,
  onEntityClick,
}: {
  content: string;
  theme: ThemeClasses;
  onEntityClick: (entityId: string) => void;
}) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <RenderBlock key={i} block={block} theme={theme} onEntityClick={onEntityClick} />
      ))}
    </div>
  );
}

interface Block {
  type: "paragraph" | "heading" | "blockquote" | "list" | "hr" | "special" | "code";
  content: string;
  level?: number; // heading level
  specialType?: string; // card, quote, info, warning, list
  specialTitle?: string;
  items?: string[];
}

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Special blocks: ```type:Title
    if (line.startsWith("```") && line.includes(":") && !line.endsWith("```")) {
      const match = line.match(/^```(\w+):(.*)$/);
      if (match) {
        const specialType = match[1];
        const specialTitle = match[2].trim();
        const contentLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) {
          contentLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        blocks.push({
          type: "special",
          content: contentLines.join("\n"),
          specialType,
          specialTitle,
        });
        continue;
      }
    }

    // Code blocks
    if (line.startsWith("```")) {
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        contentLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", content: contentLines.join("\n") });
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{2,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", content: headingMatch[2], level: headingMatch[1].length });
      i++;
      continue;
    }

    // HR
    if (line.trim() === "---" || line.trim() === "***") {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", content: quoteLines.join("\n") });
      continue;
    }

    // List
    if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].match(/^[-*]\s/) || lines[i].match(/^\d+\.\s/))) {
        items.push(lines[i].replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", content: "", items });
      continue;
    }

    // Empty line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-special lines
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") && !lines[i].startsWith("> ") && !lines[i].startsWith("```") && !lines[i].startsWith("---") && !lines[i].match(/^[-*]\s/) && !lines[i].match(/^\d+\.\s/)) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", content: paraLines.join(" ") });
    }
  }

  return blocks;
}

function RenderBlock({
  block,
  theme,
  onEntityClick,
}: {
  block: Block;
  theme: ThemeClasses;
  onEntityClick: (entityId: string) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className={`font-medium ${block.level === 2 ? "text-sm" : "text-xs"} ${theme.text}`}>
          <InlineContent text={block.content} theme={theme} onEntityClick={onEntityClick} />
        </div>
      );

    case "paragraph":
      return (
        <p className={`text-xs leading-relaxed ${theme.text}`}>
          <InlineContent text={block.content} theme={theme} onEntityClick={onEntityClick} />
        </p>
      );

    case "blockquote":
      return (
        <div className={`border-l-2 border-[var(--accent-brand)]/40 pl-3 ${theme.muted}`}>
          <p className="text-xs italic leading-relaxed">
            <InlineContent text={block.content} theme={theme} onEntityClick={onEntityClick} />
          </p>
        </div>
      );

    case "list":
      return (
        <ul className="space-y-1 pl-3">
          {block.items?.map((item, i) => (
            <li key={i} className={`text-xs leading-relaxed ${theme.text}`}>
              <span className={`mr-1.5 ${theme.muted}`}>-</span>
              <InlineContent text={item} theme={theme} onEntityClick={onEntityClick} />
            </li>
          ))}
        </ul>
      );

    case "hr":
      return <div className={`my-1 h-px ${theme.subtle}`} />;

    case "code":
      return (
        <pre className={`rounded-lg px-3 py-2 text-xs ${theme.subtle} ${theme.text} overflow-x-auto`}>
          {block.content}
        </pre>
      );

    case "special":
      return <SpecialBlock block={block} theme={theme} onEntityClick={onEntityClick} />;

    default:
      return null;
  }
}

function SpecialBlock({
  block,
  theme,
  onEntityClick,
}: {
  block: Block;
  theme: ThemeClasses;
  onEntityClick: (entityId: string) => void;
}) {
  const type = block.specialType ?? "info";

  const colors: Record<string, { border: string; bg: string; icon: string }> = {
    card: { border: "border-[var(--accent-brand)]/20", bg: "bg-[var(--accent-brand)]/5", icon: "text-[var(--accent-brand)]" },
    quote: { border: "border-amber-500/20", bg: "bg-amber-500/5", icon: "text-amber-400" },
    info: { border: "border-blue-500/20", bg: "bg-blue-500/5", icon: "text-blue-400" },
    warning: { border: "border-orange-500/20", bg: "bg-orange-500/5", icon: "text-orange-400" },
    list: { border: "border-emerald-500/20", bg: "bg-emerald-500/5", icon: "text-emerald-400" },
  };

  const style = colors[type] ?? colors.info;

  // Parse content into sub-blocks for nested rendering
  const innerBlocks = parseBlocks(block.content);

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-3`}>
      {block.specialTitle && (
        <div className={`mb-1.5 text-xs font-medium ${style.icon}`}>
          {block.specialTitle}
        </div>
      )}
      <div className="space-y-1.5">
        {innerBlocks.map((b, i) => (
          <RenderBlock key={i} block={b} theme={theme} onEntityClick={onEntityClick} />
        ))}
      </div>
    </div>
  );
}

/* ── Inline content: bold, italic, code, wiki links ──── */

function InlineContent({
  text,
  theme,
  onEntityClick,
}: {
  text: string;
  theme: ThemeClasses;
  onEntityClick: (entityId: string) => void;
}) {
  // Parse inline elements: **bold**, *italic*, `code`, [[entity-id|Display Name]]
  const parts: React.ReactNode[] = [];
  // Combined regex for all inline patterns
  const regex = /\[\[([^\]|]+)\|([^\]]+)\]\]|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      // Wiki entity link: [[id|name]]
      const entityId = match[1];
      const displayName = match[2];
      parts.push(
        <button
          key={`entity-${match.index}`}
          onClick={() => onEntityClick(entityId)}
          className="font-medium text-[var(--accent-brand)] transition-colors hover:underline"
        >
          {displayName}
        </button>
      );
    } else if (match[3]) {
      // Bold
      parts.push(<strong key={`bold-${match.index}`} className={theme.text}>{match[3]}</strong>);
    } else if (match[4]) {
      // Italic
      parts.push(<em key={`italic-${match.index}`}>{match[4]}</em>);
    } else if (match[5]) {
      // Inline code
      parts.push(
        <code key={`code-${match.index}`} className={`rounded px-1 py-0.5 text-xs ${theme.subtle}`}>
          {match[5]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

/* ── Quick Action Buttons ──────────────────────────────── */

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

  // Load wiki context on mount and when chapter changes
  useEffect(() => {
    buildBuddyWikiContext(filePath, currentChapter).then(setWikiContext);
  }, [filePath, currentChapter]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
        bookTitle,
        currentChapter,
        wikiContext,
        messages,
        text.trim(),
      );

      const assistantMsg: BuddyMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: BuddyMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Something went wrong: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
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

  const clearChat = () => {
    setMessages([]);
  };

  const hasMessages = messages.length > 0;

  return (
    <div
      className={`absolute bottom-14 right-4 z-50 flex w-[420px] flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-[var(--bg-overlay)] shadow-lg shadow-black/40 backdrop-blur-xl`}
      style={{ height: "min(560px, calc(100vh - 120px))" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-brand)]/15">
            <MessageCircle className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          </div>
          <span className="text-sm font-medium text-white/80">AI Buddy</span>
          {wikiEntryCount > 0 && (
            <span className="rounded-lg bg-[var(--accent-brand)]/10 px-1.5 py-0.5 text-xs text-[var(--accent-brand)]">
              {wikiEntryCount} entries
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasMessages && (
            <button
              onClick={clearChat}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-white/20 transition-colors hover:text-white/50"
              title="Clear chat"
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/20 transition-colors hover:text-white/50"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {!hasMessages ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent-brand)]/10">
              <Sparkles className="h-6 w-6 text-[var(--accent-brand)]" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white/60">Ask me anything</p>
              <p className="mt-1 text-xs text-white/30">
                I know everything from the wiki — characters, events, arcs, and more.
              </p>
            </div>
            {/* Quick actions */}
            <div className="flex flex-wrap justify-center gap-1.5">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.prompt)}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    msg.role === "user"
                      ? "bg-[var(--accent-brand)] text-white"
                      : `${theme.subtle}`
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="text-xs leading-relaxed">{msg.content}</p>
                  ) : (
                    <RichContent
                      content={msg.content}
                      theme={theme}
                      onEntityClick={onEntityClick}
                    />
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${theme.subtle}`}>
                  <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-brand)]" strokeWidth={2} />
                  <span className={`text-xs ${theme.muted}`}>Thinking...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] px-3 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the book..."
            rows={1}
            className="flex-1 resize-none rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/80 outline-none placeholder:text-white/25 focus:bg-white/[0.06]"
            style={{ maxHeight: "80px" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              input.trim() && !isLoading
                ? "bg-[var(--accent-brand)] text-white"
                : "bg-white/[0.04] text-white/20"
            }`}
          >
            <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
