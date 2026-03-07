"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkles, Loader2, Send } from "lucide-react";
import type { ThemeClasses } from "../lib/types";

export interface ExplainMessage {
  role: "user" | "assistant";
  content: string;
}

interface ExplainPanelProps {
  theme: ThemeClasses;
  selectedText: string;
  messages: ExplainMessage[];
  loading: boolean;
  onAsk: (question: string) => void;
  onClose: () => void;
}

export function ExplainPanel({ theme, selectedText, messages, loading, onAsk, onClose }: ExplainPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when not loading
  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  // Close on Escape (only when input is not focused or empty)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  const handleSubmit = () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    onAsk(q);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div
        ref={panelRef}
        className={`pointer-events-auto w-full max-w-md rounded-lg border ${theme.border} shadow-lg shadow-black/40 overflow-hidden flex flex-col`}
        style={{ backgroundColor: "var(--bg-overlay)", backdropFilter: "blur(24px)", maxHeight: "70vh" }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${theme.border} shrink-0`}>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--accent-brand)]" strokeWidth={1.5} />
            <span className="text-sm font-medium">AI Explain</span>
          </div>
          <button
            onClick={onClose}
            className={`rounded-lg p-1 transition-colors ${theme.btn}`}
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Selected text quote */}
        <div className={`px-4 py-2.5 border-b ${theme.border} shrink-0`} style={{ backgroundColor: "var(--bg-inset)" }}>
          <p className="text-xs text-white/40 mb-1">Selected text</p>
          <p className="text-xs leading-relaxed text-white/70 line-clamp-3 italic">
            &ldquo;{selectedText}&rdquo;
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" && i > 0 && (
                <p className="text-xs font-medium text-[var(--accent-brand)] mb-1">You</p>
              )}
              <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "assistant" ? "text-white/80" : "text-white/60 italic"
              }`}>
                {msg.content}
              </p>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-brand)]" strokeWidth={1.5} />
              <span className="text-xs text-white/50">Thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={`px-3 py-2.5 border-t ${theme.border} shrink-0`}>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleSubmit(); } }}
              placeholder="Ask a follow-up..."
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/30 outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !input.trim()}
              className={`rounded-lg p-1.5 transition-colors ${theme.btn} disabled:opacity-30`}
            >
              <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
