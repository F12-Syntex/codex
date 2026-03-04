"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Loader2, Link2, Clock, User, Swords, MapPin, Flame, Lightbulb, MessageCircle } from "lucide-react";
import type { ThemeClasses } from "../lib/types";
import type { WikiEntry, WikiEntryType } from "@/lib/ai-wiki";
import { fetchWikiEntry, getEntryAtChapter } from "@/lib/ai-wiki";
import { chatWithPreset } from "@/lib/openrouter";
import { parseOverrides, PRESET_OVERRIDES_KEY } from "@/lib/ai-presets";

interface WikiSidebarProps {
  filePath: string;
  entryId: string;
  currentChapter: number;
  bookTitle: string;
  theme: ThemeClasses;
  onClose: () => void;
  onEntryClick: (id: string) => void;
}

const TYPE_META: Record<WikiEntryType, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  character: { icon: <User className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Character", color: "rgb(147, 197, 253)", bg: "rgba(96, 165, 250, 0.15)" },
  item: { icon: <Swords className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Item", color: "rgb(252, 211, 77)", bg: "rgba(251, 191, 36, 0.15)" },
  location: { icon: <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Location", color: "rgb(110, 231, 183)", bg: "rgba(52, 211, 153, 0.15)" },
  event: { icon: <Flame className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Event", color: "rgb(253, 164, 175)", bg: "rgba(251, 113, 133, 0.15)" },
  concept: { icon: <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.5} />, label: "Concept", color: "rgb(196, 181, 253)", bg: "rgba(167, 139, 250, 0.15)" },
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function WikiSidebar({ filePath, entryId, currentChapter, bookTitle, theme, onClose, onEntryClick }: WikiSidebarProps) {
  const [entry, setEntry] = useState<WikiEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Load entry from DB
  useEffect(() => {
    setIsLoading(true);
    setChatMessages([]);
    fetchWikiEntry(filePath, entryId, currentChapter).then((e) => {
      setEntry(e);
      setIsLoading(false);
    });
  }, [filePath, entryId, currentChapter]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Build wiki context for AI chat
  const buildWikiContext = useCallback(async (): Promise<string> => {
    if (!entry) return "";
    const api = window.electronAPI;
    if (!api) return "";

    // Get all entries for context
    const allEntries = await api.wikiGetEntries(filePath);
    const entityNames = new Map(allEntries.map((e) => [e.id, e.name]));

    let context = `Book: "${bookTitle}"\nCurrent Chapter: ${currentChapter + 1}\n\n`;
    context += `## Current Entity: ${entry.name}\n`;
    context += `Type: ${entry.type} | Status: ${entry.status} | Significance: ${entry.significance}/4\n`;
    if (entry.shortDescription) context += `Summary: ${entry.shortDescription}\n`;
    if (entry.description) context += `Description: ${entry.description}\n`;

    if (entry.aliases.length > 0) {
      context += `Aliases: ${entry.aliases.join(", ")}\n`;
    }

    if (entry.details.length > 0) {
      context += `\nDetails:\n`;
      for (const d of entry.details) {
        context += `- [Ch.${d.chapterIndex + 1}, ${d.category}] ${d.content}\n`;
      }
    }

    if (entry.relationships.length > 0) {
      context += `\nRelationships:\n`;
      for (const r of entry.relationships) {
        const targetName = entityNames.get(r.targetId) ?? r.targetId;
        context += `- ${r.relation} → ${targetName} (since Ch.${r.since + 1})\n`;
      }
    }

    // Add related entity info
    const relatedIds = new Set(entry.relationships.map((r) => r.targetId));
    if (relatedIds.size > 0) {
      context += `\n## Related Entities:\n`;
      for (const rid of relatedIds) {
        const related = allEntries.find((e) => e.id === rid);
        if (related) {
          context += `- ${related.name} [${related.type}]: ${related.short_description}\n`;
        }
      }
    }

    // Recent chapter summaries
    const summaries = await api.wikiGetChapterSummaries(filePath, Math.max(0, currentChapter - 3), currentChapter);
    if (summaries.length > 0) {
      context += `\n## Recent Chapters:\n`;
      for (const s of summaries) {
        context += `- Ch.${s.chapter_index + 1}: ${s.summary}\n`;
      }
    }

    return context;
  }, [entry, filePath, bookTitle, currentChapter]);

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsChatLoading(true);

    try {
      const apiKey = await window.electronAPI?.getSetting("openrouterApiKey");
      if (!apiKey) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: "No API key configured. Set it in Settings → AI." }]);
        return;
      }

      const wikiContext = await buildWikiContext();
      const overrides = parseOverrides(
        (await window.electronAPI?.getSetting(PRESET_OVERRIDES_KEY)) ?? null,
      );

      const messages = [
        {
          role: "system" as const,
          content: `You are a knowledgeable wiki assistant for the book "${bookTitle}". Answer questions ONLY based on the wiki data provided below. If the information isn't in the wiki data, say so. Be concise and spoiler-aware — only reference information up to Chapter ${currentChapter + 1}.\n\n${wikiContext}`,
        },
        ...chatMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: userMessage },
      ];

      const response = await chatWithPreset(apiKey, "quick", messages, overrides, { max_tokens: 1024 });
      const reply = response.choices?.[0]?.message?.content?.trim() ?? "No response.";
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      console.error("Wiki chat error:", err);
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Failed to get a response." }]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, chatMessages, buildWikiContext, bookTitle, currentChapter]);

  if (isLoading) {
    return (
      <div
        ref={sidebarRef}
        className="absolute right-0 top-0 z-30 flex h-full w-[340px] flex-col items-center justify-center border-l border-white/[0.06] bg-[var(--bg-surface)] shadow-lg shadow-black/30"
        style={{ animation: "slideInRight 0.2s ease" }}
      >
        <Loader2 className="h-5 w-5 animate-spin text-white/30" strokeWidth={1.5} />
      </div>
    );
  }

  if (!entry) {
    onClose();
    return null;
  }

  const chapterData = getEntryAtChapter(entry, currentChapter);
  const typeMeta = TYPE_META[entry.type] ?? TYPE_META.concept;

  // Group details by category
  const detailsByCategory: Record<string, { chapterIndex: number; content: string }[]> = {};
  for (const d of chapterData.details) {
    const cat = d.category || "info";
    if (!detailsByCategory[cat]) detailsByCategory[cat] = [];
    detailsByCategory[cat].push({ chapterIndex: d.chapterIndex, content: d.content });
  }

  return (
    <div
      ref={sidebarRef}
      className="absolute right-0 top-0 z-30 flex h-full w-[340px] flex-col border-l border-white/[0.06] bg-[var(--bg-surface)] shadow-lg shadow-black/30"
      style={{ animation: "slideInRight 0.2s ease" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex items-center gap-1 shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] font-medium"
            style={{ background: typeMeta.bg, color: typeMeta.color }}
          >
            {typeMeta.icon}
            {typeMeta.label}
          </span>
          <span className="text-[13px] font-semibold text-white/90 truncate">{entry.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowChat(!showChat)}
            className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${
              showChat ? "bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]" : "text-white/40 hover:bg-white/[0.06] hover:text-white/60"
            }`}
            title="Ask about this entity"
          >
            <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/60"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {!showChat ? (
          <div className="px-3 py-3 space-y-4">
            {/* Aliases */}
            {entry.aliases.length > 0 && (
              <p className="text-[11px] text-white/30">
                aka {entry.aliases.join(", ")}
              </p>
            )}

            {/* Short description */}
            <p className="text-[12px] leading-relaxed text-white/60">
              {chapterData.shortDescription || entry.shortDescription}
            </p>

            {/* Status & significance */}
            <div className="flex items-center gap-2">
              <span className="rounded-lg px-1.5 py-0.5 text-[11px] font-medium capitalize" style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}>
                {entry.status}
              </span>
              <span className="text-[11px] text-white/25">·</span>
              <span className="text-[11px] text-white/30">
                Significance: {"★".repeat(entry.significance)}{"☆".repeat(4 - entry.significance)}
              </span>
            </div>

            {/* Chapter appearances */}
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-white/25" strokeWidth={1.5} />
              <span className="text-[11px] text-white/30">
                First: Ch. {entry.firstAppearance + 1} · {entry.chapterAppearances.length} appearances
              </span>
            </div>

            {/* Details by category */}
            {Object.entries(detailsByCategory).map(([category, items]) => (
              <div key={category}>
                <h4 className="text-[11px] font-medium uppercase tracking-wider text-white/30 mb-1.5">
                  {category.replace(/_/g, " ")}
                </h4>
                <div className="space-y-1.5">
                  {items.map((item, i) => (
                    <div key={i} className="flex gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-inset)" }}>
                      <span className="shrink-0 text-[11px] tabular-nums text-white/20">
                        {item.chapterIndex + 1}
                      </span>
                      <p className="text-[11px] leading-relaxed text-white/50">
                        {item.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Relationships */}
            {chapterData.relationships.length > 0 && (
              <div>
                <h4 className="text-[11px] font-medium uppercase tracking-wider text-white/30 mb-1.5">
                  Relationships
                </h4>
                <div className="space-y-1">
                  {chapterData.relationships.map((rel, i) => (
                    <button
                      key={i}
                      onClick={() => onEntryClick(rel.targetId)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                      style={{ background: "var(--bg-inset)" }}
                    >
                      <Link2 className="h-3 w-3 shrink-0 text-white/25" strokeWidth={1.5} />
                      <span className="text-[11px] font-medium capitalize text-white/60 truncate">
                        {rel.targetId.replace(/-/g, " ")}
                      </span>
                      <span className="text-[11px] capitalize text-white/30 shrink-0">{rel.relation}</span>
                      <span className="text-[11px] tabular-nums text-white/20 shrink-0 ml-auto">
                        Ch. {rel.since + 1}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Description (full) */}
            {entry.description && (
              <div>
                <h4 className="text-[11px] font-medium uppercase tracking-wider text-white/30 mb-1.5">
                  Overview
                </h4>
                <p className="text-[11px] leading-relaxed text-white/50 whitespace-pre-wrap">
                  {entry.description}
                </p>
              </div>
            )}

            <div className="h-4" />
          </div>
        ) : (
          /* Chat mode */
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MessageCircle className="h-6 w-6 text-white/15 mb-2" strokeWidth={1.5} />
                  <p className="text-[12px] text-white/30">Ask anything about {entry.name}</p>
                  <p className="text-[11px] text-white/20 mt-1">Answers based on wiki data up to Ch. {currentChapter + 1}</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-[12px] leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[var(--accent-brand)]/15 text-white/80"
                        : "text-white/60"
                    }`}
                    style={msg.role === "assistant" ? { background: "var(--bg-inset)" } : undefined}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-inset)" }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-white/30" strokeWidth={1.5} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Chat input — always visible when chat is open */}
      {showChat && (
        <div className="border-t border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-inset)" }}>
            <input
              ref={inputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(); }}
              placeholder={`Ask about ${entry.name}...`}
              className="flex-1 bg-transparent text-[12px] text-white/80 placeholder:text-white/25 outline-none"
              disabled={isChatLoading}
            />
            <button
              onClick={sendChatMessage}
              disabled={!chatInput.trim() || isChatLoading}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-white/40 transition-colors hover:text-[var(--accent-brand)] disabled:opacity-30"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
