"use client";

import { useState, useEffect, useRef } from "react";
import { X, Sparkles, ArrowUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { ChatBubble } from "@/components/ui/chat-bubble";
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

export function ExplainPanel({ selectedText, messages, loading, onAsk, onClose }: ExplainPanelProps) {
  const reduce = useReducedMotion();
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

  // Close on Escape. Capture + stopPropagation so the Reader's own Esc chain
  // (which ends in closing the window) doesn't also run for this key press.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
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

  // The first user turn is the auto-generated "explain this passage" prompt —
  // the quote card above already shows it, so it isn't repeated as a bubble.
  const visible = messages
    .map((msg, i) => ({ msg, i }))
    .filter(({ msg, i }) => !(i === 0 && msg.role === "user"));
  const showSuggestions = !loading && messages.length > 0 && messages.length <= 2
    && messages[messages.length - 1].role === "assistant";

  return (
    // Docked in the right gutter (the AI tools slot); the Reader insets the
    // text column while it is open, so the panel never covers the page.
    <div className="pointer-events-none absolute top-2 right-2 bottom-2 z-50 flex w-72 items-center">
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-label="AI Explain"
        className="glass-thick grain relative pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-2xl text-label"
        initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.98, filter: "blur(6px)" }}
        animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 420, damping: 34, mass: 0.9 }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 px-5 pt-5 pb-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand shadow-[0_0_24px_-6px_var(--accent-brand)]">
            <Sparkles className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-title font-display leading-tight text-label">Explain</h2>
            <p className="text-2xs text-label-secondary">Answers stay within what you&rsquo;ve read</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="focus-ring pressable -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary hover:bg-fill-secondary hover:text-label"
          >
            <X className="size-3.5" strokeWidth={2.25} />
          </button>
        </div>

        {/* Selected text quote */}
        <figure className="mx-5 mb-1 shrink-0 rounded-lg bg-fill-quaternary py-2.5 pr-3.5 pl-3">
          <blockquote className="border-l-2 border-brand/60 pl-3">
            <p className="line-clamp-3 font-display text-sm leading-relaxed text-label-secondary italic">
              &ldquo;{selectedText}&rdquo;
            </p>
          </blockquote>
        </figure>

        {/* Messages */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {visible.map(({ msg, i }) => (
              msg.role === "user" ? (
                <ChatBubble key={i} variant="outgoing" maxWidth="85%" bubbleClassName="py-2 leading-snug whitespace-pre-wrap">
                  {msg.content}
                </ChatBubble>
              ) : (
                <motion.p
                  key={i}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                  className="font-display text-base leading-relaxed whitespace-pre-wrap text-label"
                >
                  {msg.content}
                </motion.p>
              )
            ))}
          {loading && (
            <div className="flex h-6 items-center gap-2 text-brand">
              <Sparkles className="size-3.5 animate-pulse" strokeWidth={1.75} />
              <ShimmerText className="text-sm">Thinking…</ShimmerText>
            </div>
          )}
          {showSuggestions && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGGESTIONS.map((q, k) => (
                <motion.button
                  key={q}
                  type="button"
                  onClick={() => onAsk(q)}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + k * 0.04, type: "spring", stiffness: 400, damping: 32 }}
                  className="focus-ring pressable inline-flex h-7 items-center rounded-full bg-fill-tertiary px-3 text-xs font-medium text-label-secondary transition-colors hover:bg-fill-secondary hover:text-label"
                >
                  {q}
                </motion.button>
              ))}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-separator p-3">
          <div className="flex h-10 items-center gap-2 rounded-full bg-fill-tertiary pr-1.5 pl-4 transition-shadow duration-150 focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-brand)_45%,transparent)]">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleSubmit(); } }}
              placeholder="Ask a follow-up…"
              disabled={loading}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-label outline-none placeholder:text-label-tertiary disabled:opacity-50"
            />
            <button
              type="button"
              aria-label="Send"
              onClick={handleSubmit}
              disabled={loading || !input.trim()}
              className="focus-ring pressable inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg shadow-xs transition-opacity disabled:bg-fill-secondary disabled:text-label-quaternary disabled:shadow-none"
            >
              <ArrowUp className="size-4" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const SUGGESTIONS = ["Explain it more simply", "Why does this matter?", "Who is involved here?"];
