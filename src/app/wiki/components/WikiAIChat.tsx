"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles, Send, Loader2, ChevronDown, Maximize2, Minimize2,
  User, Swords, MapPin, Flame, Lightbulb,
} from "lucide-react";
import type { WikiEntryType } from "@/lib/ai-wiki";
import { chatWithPreset } from "@/lib/openrouter";
import { parseOverrides, PRESET_OVERRIDES_KEY } from "@/lib/ai-presets";

interface WikiAIChatProps {
  filePath: string;
  bookTitle: string;
  onEntryClick: (id: string) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Parsed rich blocks for assistant messages */
  blocks?: RichBlock[];
  timestamp: number;
}

// ── Rich content blocks parsed from AI responses ──

type RichBlock =
  | { type: "text"; content: string }
  | { type: "entity"; id: string; name: string; entityType: WikiEntryType; description: string }
  | { type: "heading"; content: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; content: string };

const TYPE_ICON: Record<WikiEntryType, React.ReactNode> = {
  character: <User className="h-3 w-3" strokeWidth={1.5} />,
  item: <Swords className="h-3 w-3" strokeWidth={1.5} />,
  location: <MapPin className="h-3 w-3" strokeWidth={1.5} />,
  event: <Flame className="h-3 w-3" strokeWidth={1.5} />,
  concept: <Lightbulb className="h-3 w-3" strokeWidth={1.5} />,
};

const TYPE_COLORS: Record<WikiEntryType, { color: string; bg: string }> = {
  character: { color: "rgb(147, 197, 253)", bg: "rgba(96, 165, 250, 0.12)" },
  item: { color: "rgb(252, 211, 77)", bg: "rgba(251, 191, 36, 0.12)" },
  location: { color: "rgb(110, 231, 183)", bg: "rgba(52, 211, 153, 0.12)" },
  event: { color: "rgb(253, 164, 175)", bg: "rgba(251, 113, 133, 0.12)" },
  concept: { color: "rgb(196, 181, 253)", bg: "rgba(167, 139, 250, 0.12)" },
};

const SUGGESTIONS = [
  "Who are the main characters?",
  "Summarize the story so far",
  "What are the key relationships?",
  "What mysteries are unresolved?",
];

export function WikiAIChat({ filePath, bookTitle, onEntryClick }: WikiAIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [entityMap, setEntityMap] = useState<Map<string, { name: string; type: WikiEntryType }>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Load entity map for clickable references — refresh periodically
  useEffect(() => {
    if (!filePath) return;
    const refresh = () => {
      window.electronAPI?.wikiGetEntries(filePath).then((entries) => {
        const map = new Map<string, { name: string; type: WikiEntryType }>();
        for (const e of entries) {
          map.set(e.id, { name: e.name, type: e.type as WikiEntryType });
          map.set(e.name.toLowerCase(), { name: e.name, type: e.type as WikiEntryType });
        }
        setEntityMap(map);
      });
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [filePath]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Build wiki context for the AI
  const buildContext = useCallback(async (): Promise<string> => {
    const api = window.electronAPI;
    if (!api) return "";

    const [entries, summaries, arcs] = await Promise.all([
      api.wikiGetEntries(filePath),
      api.wikiGetAllChapterSummaries(filePath),
      api.wikiGetAllArcs(filePath),
    ]);

    let context = `Book: "${bookTitle}"\n\n`;

    // Entity roster
    if (entries.length > 0) {
      context += "## Known Entities\n";
      for (const e of entries) {
        context += `- [${e.type}] ${e.name} (id: ${e.id}, significance: ${e.significance}): ${e.short_description}\n`;
      }
      context += "\n";
    }

    // Chapter summaries
    if (summaries.length > 0) {
      context += "## Chapter Summaries\n";
      for (const s of summaries) {
        context += `- Ch. ${s.chapter_index + 1}: ${s.summary}\n`;
      }
      context += "\n";
    }

    // Arcs
    if (arcs.length > 0) {
      context += "## Story Arcs\n";
      for (const a of arcs) {
        context += `- "${a.name}" [${a.arc_type}, ${a.status}]: ${a.description}\n`;
      }
      context += "\n";
    }

    // Load details and relationships for main characters
    const mainChars = entries.filter(e => e.significance >= 3).slice(0, 10);
    if (mainChars.length > 0) {
      const detailLines: string[] = [];
      const relLines: string[] = [];
      for (const ch of mainChars) {
        const [details, rels] = await Promise.all([
          api.wikiGetDetails(filePath, ch.id),
          api.wikiGetRelationships(filePath, ch.id),
        ]);
        if (details.length > 0) {
          for (const d of details.slice(-5)) {
            detailLines.push(`- ${ch.name} [${d.category}]: ${d.content}`);
          }
        }
        if (rels.length > 0) {
          for (const r of rels) {
            const targetName = entries.find(e => e.id === r.target_id)?.name ?? r.target_id;
            relLines.push(`- ${ch.name} → ${targetName}: ${r.relation}`);
          }
        }
      }
      if (detailLines.length > 0) {
        context += "## Key Details\n" + detailLines.join("\n") + "\n\n";
      }
      if (relLines.length > 0) {
        context += "## Key Relationships\n" + relLines.join("\n") + "\n";
      }
    }

    return context;
  }, [filePath, bookTitle]);

  // Parse AI response into rich blocks
  const parseResponse = useCallback((text: string): RichBlock[] => {
    const blocks: RichBlock[] = [];
    const lines = text.split("\n");
    let currentList: string[] = [];

    const flushList = () => {
      if (currentList.length > 0) {
        blocks.push({ type: "list", items: [...currentList] });
        currentList = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Headings
      if (trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
        flushList();
        blocks.push({ type: "heading", content: trimmed.replace(/^#{2,3}\s+/, "") });
        continue;
      }

      // Bold headings (e.g., **Characters:**)
      const boldHeading = trimmed.match(/^\*\*([^*]+)\*\*:?\s*$/);
      if (boldHeading) {
        flushList();
        blocks.push({ type: "heading", content: boldHeading[1] });
        continue;
      }

      // List items
      if (/^[-*•]\s+/.test(trimmed)) {
        currentList.push(trimmed.replace(/^[-*•]\s+/, ""));
        continue;
      }

      // Numbered list items
      if (/^\d+[.)]\s+/.test(trimmed)) {
        currentList.push(trimmed.replace(/^\d+[.)]\s+/, ""));
        continue;
      }

      // Blockquotes
      if (trimmed.startsWith("> ")) {
        flushList();
        blocks.push({ type: "quote", content: trimmed.replace(/^>\s+/, "") });
        continue;
      }

      // Empty line
      if (trimmed === "") {
        flushList();
        continue;
      }

      // Regular text
      flushList();
      blocks.push({ type: "text", content: trimmed });
    }

    flushList();
    return blocks;
  }, []);

  const sendMessage = useCallback(async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText || isLoading) return;

    setInput("");
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const apiKey = await window.electronAPI?.getSetting("openrouterApiKey");
      if (!apiKey) {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "No API key configured. Set it in Settings.",
          blocks: [{ type: "text", content: "No API key configured. Set it in Settings." }],
          timestamp: Date.now(),
        }]);
        return;
      }

      const wikiContext = await buildContext();
      const overrides = parseOverrides(
        (await window.electronAPI?.getSetting(PRESET_OVERRIDES_KEY)) ?? null,
      );

      const systemPrompt = `You are a knowledgeable wiki assistant for the book "${bookTitle}". Answer questions based on the wiki data provided below. Be detailed but concise. Use markdown formatting: **bold** for emphasis, ## headings for sections, - bullet lists for multiple items, > blockquotes for important quotes or notes.

When referencing entities, use their exact names as they appear in the wiki. Structure your answers with clear sections when the answer is complex.

${wikiContext}`;

      const chatHistory = messages.slice(-10).map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await chatWithPreset(
        apiKey,
        "quick",
        [
          { role: "system", content: systemPrompt },
          ...chatHistory,
          { role: "user", content: messageText },
        ],
        overrides,
        { max_tokens: 2048 },
      );

      const reply = response.choices?.[0]?.message?.content?.trim() ?? "No response.";
      const blocks = parseResponse(reply);

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: reply,
        blocks,
        timestamp: Date.now(),
      }]);
    } catch (err) {
      console.error("Wiki AI chat error:", err);
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "Failed to get a response. Please try again.",
        blocks: [{ type: "text", content: "Failed to get a response. Please try again." }],
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, buildContext, bookTitle, parseResponse]);

  // Render inline text with entity highlighting
  const renderInlineText = useCallback((text: string) => {
    // Find entity names in text and make them clickable
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    // Remove markdown bold markers and track positions
    const boldRegex = /\*\*([^*]+)\*\*/g;
    const segments: { text: string; bold: boolean }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: remaining.slice(lastIndex, match.index), bold: false });
      }
      segments.push({ text: match[1], bold: true });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < remaining.length) {
      segments.push({ text: remaining.slice(lastIndex), bold: false });
    }

    for (const seg of segments) {
      // Check if this segment matches an entity name
      const entityInfo = entityMap.get(seg.text.toLowerCase());
      if (entityInfo) {
        const colors = TYPE_COLORS[entityInfo.type];
        parts.push(
          <button
            key={key++}
            onClick={() => {
              // Find the entity ID
              for (const [id, info] of entityMap.entries()) {
                if (info.name === entityInfo.name && !id.includes(" ")) {
                  onEntryClick(id);
                  break;
                }
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] font-medium transition-colors hover:brightness-125"
            style={{ background: colors.bg, color: colors.color }}
          >
            {TYPE_ICON[entityInfo.type]}
            {entityInfo.name}
          </button>
        );
      } else if (seg.bold) {
        parts.push(<strong key={key++} className="font-semibold text-white/80">{seg.text}</strong>);
      } else {
        parts.push(<span key={key++}>{seg.text}</span>);
      }
    }

    return parts;
  }, [entityMap, onEntryClick]);

  // ── Closed state: floating pill button ──
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/[0.08] px-4 py-2.5 text-[12px] font-medium text-white/50 transition-all hover:border-white/[0.12] hover:text-white/70 hover:shadow-lg hover:shadow-black/20"
        style={{
          background: "var(--bg-surface)",
          boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
        Ask about this book
      </button>
    );
  }

  // ── Open state: chat panel ──
  return (
    <div
      className={`absolute z-20 flex flex-col border-t border-white/[0.06] transition-all duration-200 ${
        isExpanded ? "inset-0 border-t-0" : "bottom-0 left-0 right-0"
      }`}
      style={{
        height: isExpanded ? "100%" : "clamp(280px, 45%, 420px)",
        background: "var(--bg-surface)",
      }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" strokeWidth={1.5} />
          <span className="text-[12px] font-medium text-white/60">Wiki AI</span>
          <span className="text-[11px] text-white/25">{bookTitle}</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="rounded-lg px-2 py-1 text-[11px] text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={() => { setIsOpen(false); setIsExpanded(false); }}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50"
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="text-center">
              <Sparkles className="mx-auto h-6 w-6 text-white/10 mb-2" strokeWidth={1.5} />
              <p className="text-[13px] text-white/30">Ask anything about the story</p>
              <p className="text-[11px] text-white/20 mt-1">Answers based on wiki data from analyzed chapters</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[11px] text-white/40 transition-colors hover:border-white/[0.12] hover:text-white/60 hover:bg-white/[0.03]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === "user" ? (
              <div className="flex justify-end">
                <div
                  className="max-w-[80%] rounded-lg rounded-br-sm px-3 py-2 text-[13px] leading-relaxed text-white/80"
                  style={{ background: "var(--accent-brand-dim, rgba(99,102,241,0.15))" }}
                >
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="max-w-[90%] space-y-2">
                {(msg.blocks ?? [{ type: "text" as const, content: msg.content }]).map((block, i) => (
                  <RichBlockRenderer key={i} block={block} renderInline={renderInlineText} />
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 py-1">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="text-[11px] text-white/25">Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-white/[0.06] px-4 py-3">
        <div
          className="flex items-end gap-2 rounded-lg border border-white/[0.06] px-3 py-2"
          style={{ background: "var(--bg-inset)" }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about characters, plot, relationships..."
            className="flex-1 resize-none bg-transparent text-[13px] text-white/80 placeholder:text-white/25 outline-none"
            style={{ height: "20px", maxHeight: "100px" }}
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-20"
            style={{
              background: input.trim() ? "var(--accent-brand)" : "transparent",
              color: input.trim() ? "white" : "rgba(255,255,255,0.3)",
            }}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rich Block Renderer ──

function RichBlockRenderer({
  block,
  renderInline,
}: {
  block: RichBlock;
  renderInline: (text: string) => React.ReactNode;
}) {
  switch (block.type) {
    case "heading":
      return (
        <h4 className="text-[12px] font-semibold text-white/70 pt-1">
          {block.content}
        </h4>
      );

    case "text":
      return (
        <p className="text-[13px] leading-relaxed text-white/55">
          {renderInline(block.content)}
        </p>
      );

    case "list":
      return (
        <div className="space-y-1 pl-1">
          {block.items.map((item, i) => (
            <div key={i} className="flex gap-2 text-[12px] leading-relaxed text-white/55">
              <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-white/20" />
              <span>{renderInline(item)}</span>
            </div>
          ))}
        </div>
      );

    case "quote":
      return (
        <div
          className="rounded-lg border-l-2 border-white/[0.12] pl-3 py-1.5"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-[12px] italic leading-relaxed text-white/45">
            {renderInline(block.content)}
          </p>
        </div>
      );

    case "entity":
      return null; // Entities are rendered inline

    default:
      return null;
  }
}
