"use client";

/**
 * AssistantPanel — the one assistant surface (replaces AIBuddyPanel, BuddyWindow chat, WikiAIChat
 * and ExplainPanel; AI_AUDIT §3). Glass `glass rounded-2xl` floating panel, 420×600, detachable.
 *
 *   host "reader": floating above the reader footer (positioned by AssistantLauncher)
 *   host "wiki":   floating in the wiki window
 *   host "buddy":  fills the detached Buddy window (no float, no close)
 *
 * Spoiler-safe by construction: every answer is produced in main by `assistant.turn`, whose tools
 * and citations are clamped to the reader's frontier.
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { PictureInPicture2, ShieldCheck, SquarePen, X, Quote } from "lucide-react";
import type { AssistantMode, AssistantSeed } from "@shared/assistant/types";
import type { ParaRef } from "@shared/pipeline/types";
import type { QuickActionDef } from "@shared/assistant/quick-actions";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/lib/assistant/useAssistant";
import type { OpenAssistantRequest } from "@/lib/assistant/open";
import { AssistantUIProvider, defaultReveal, useEntityNames } from "./context";
import { Composer } from "./Composer";
import { QuickActions } from "./QuickActions";
import { Thread } from "./Thread";
import { ThreadList } from "./ThreadList";

export type AssistantHost = "reader" | "buddy" | "wiki";

export interface AssistantPanelProps {
  host: AssistantHost;
  filePath: string;
  bookTitle?: string;
  /** Starting context (e.g. an Explain selection). Prefer `request` from the openAssistant bus. */
  seed?: AssistantSeed;
  /** Latest `openAssistant()` request routed to this panel (handled once per `request.id`). */
  request?: OpenAssistantRequest | null;
  /** Continue this conversation (e.g. the detached window picking up the reader's thread). */
  threadId?: string | null;
  /** Shown in the empty state: "Answers stay within what you've read · up to Chapter 12". */
  frontierLabel?: string;
  onClose?: () => void;
  /** Detach into the Buddy window; receives the active thread id. */
  onDetach?: (threadId: string | null) => void;
  /** Open an entity (EntityCard / wiki). Without it, entity mentions aren't clickable. */
  onOpenEntity?: (entityId: string) => void;
  /** Override citation navigation (default `book:reveal`). */
  onReveal?: (ref: ParaRef) => void;
  /** Glass material. Over reading text the reader passes "glass-thick" (conventions §13.6). */
  material?: "glass" | "glass-thick";
  className?: string;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="focus-ring pressable inline-flex size-7 items-center justify-center rounded-full text-label-secondary transition-colors duration-150 hover:bg-fill-tertiary hover:text-label [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function SeedChip({ seed, filePath, onClear }: { seed: AssistantSeed; filePath: string; onClear: () => void }) {
  const names = useEntityNames(filePath, seed.entityId ? [seed.entityId] : []);
  const label = seed.selection ? seed.selection.text : seed.entityId ? `About ${names[seed.entityId] ?? "…"}` : null;
  if (!label) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className="mb-2 flex items-start gap-2 rounded-lg bg-fill-quaternary py-2 pr-1.5 pl-2.5 hairline"
    >
      <Quote className="mt-0.5 size-3.5 shrink-0 text-brand" strokeWidth={2} />
      <p className={cn("line-clamp-2 min-w-0 flex-1 text-xs leading-relaxed text-label-secondary", seed.selection && "font-display italic")}>{label}</p>
      <button
        type="button"
        aria-label="Remove context"
        onClick={onClear}
        className="focus-ring inline-flex size-5 shrink-0 items-center justify-center rounded-full text-label-tertiary hover:bg-fill-tertiary hover:text-label"
      >
        <X className="size-3" strokeWidth={2.25} />
      </button>
    </motion.div>
  );
}

export function AssistantPanel({
  host, filePath, bookTitle, seed, request, threadId, frontierLabel, onClose, onDetach, onOpenEntity, onReveal, material = "glass", className,
}: AssistantPanelProps) {
  const reduce = useReducedMotion();
  const a = useAssistant({ filePath, threadId });
  const [draft, setDraft] = React.useState("");
  const [pendingSeed, setPendingSeed] = React.useState<AssistantSeed | undefined>(seed);
  const [pendingMode, setPendingMode] = React.useState<AssistantMode>("chat");
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const handled = React.useRef<number>(0);

  const ui = React.useMemo(
    () => ({ filePath, reveal: onReveal ?? defaultReveal(filePath), ...(onOpenEntity ? { openEntity: onOpenEntity } : {}) }),
    [filePath, onReveal, onOpenEntity],
  );

  const sendNow = React.useCallback(async (text: string, s?: AssistantSeed, mode?: AssistantMode) => {
    const t = text.trim();
    if (!t && !s?.selection) return;
    setDraft("");
    setPendingSeed(undefined);
    await a.send(t || "Explain this passage.", { ...(s ? { seed: s } : {}), mode: mode ?? pendingMode });
  }, [a, pendingMode]);

  // Route openAssistant() requests: a seeded/explain request starts a fresh conversation.
  React.useEffect(() => {
    if (!request || request.id === handled.current) return;
    if (request.filePath && request.filePath !== filePath) return;
    handled.current = request.id;
    if (request.threadId) {
      a.selectThread(request.threadId);
    } else if (request.seed?.selection || request.seed?.entityId || request.mode !== "chat" || a.messages.length > 0) {
      a.selectThread(null);
    }
    setPendingMode(request.mode);
    if (request.autoSend && (request.prompt || request.seed?.selection)) {
      void sendNow(request.prompt ?? "", request.seed, request.mode);
    } else {
      setPendingSeed(request.seed);
      if (request.prompt) setDraft(request.prompt);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);

  const onQuick = (qa: QuickActionDef) => {
    setPendingMode(qa.id === "recap" ? "recap" : "chat");
    void sendNow(qa.prompt, { ...(pendingSeed ?? {}), quickAction: qa.id }, qa.id === "recap" ? "recap" : "chat");
  };

  const newConversation = () => {
    a.selectThread(null);
    setPendingSeed(undefined);
    setPendingMode("chat");
    setDraft("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const floating = host !== "buddy";
  const empty = a.messages.length === 0;
  const title = a.thread?.title ?? (bookTitle ? `Ask about ${bookTitle}` : "Assistant");

  return (
    <AssistantUIProvider value={ui}>
      <motion.section
        role="dialog"
        aria-label="Reading assistant"
        onKeyDown={(e) => {
          if (e.key === "Escape" && floating && onClose && !e.defaultPrevented) {
            e.stopPropagation();
            onClose();
          }
        }}
        initial={floating ? (reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }) : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
        transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 34, mass: 0.9 }}
        style={floating ? { width: 420, height: 600, maxHeight: "calc(100vh - 96px)", transformOrigin: "bottom right" } : undefined}
        className={cn(
          material, "grain relative flex flex-col overflow-hidden text-label",
          floating ? "rounded-2xl" : "h-full w-full",
          className,
        )}
      >
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center gap-1 pr-2 pl-4">
          <div className="min-w-0 flex-1">
            <ThreadList
              threads={a.threads}
              activeId={a.thread?.id ?? null}
              title={title}
              onSelect={(id) => a.selectThread(id)}
              onNew={newConversation}
              onDelete={(id) => void a.removeThread(id)}
            />
          </div>
          {!empty && <IconButton label="New conversation" onClick={newConversation}><SquarePen /></IconButton>}
          {onDetach && <IconButton label="Open in a separate window" onClick={() => onDetach(a.thread?.id ?? null)}><PictureInPicture2 /></IconButton>}
          {onClose && <IconButton label="Close" onClick={onClose}><X /></IconButton>}
        </header>
        <div className="mx-4 h-px shrink-0 bg-separator" />

        {/* Body */}
        {!a.available ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-label-tertiary">
            The assistant is available in the Codex app.
          </div>
        ) : empty ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="space-y-1.5"
            >
              <h2 className="text-title font-display text-label text-balance">
                {bookTitle ? <>What would you like to know about <em>{bookTitle}</em>?</> : "What would you like to know?"}
              </h2>
              <p className="inline-flex items-center gap-1.5 text-xs text-label-secondary">
                <ShieldCheck className="size-3.5 text-success" strokeWidth={2} />
                Answers stay within what you&apos;ve read{frontierLabel ? ` · up to ${frontierLabel}` : ""}
              </p>
            </motion.div>
            <QuickActions onPick={onQuick} disabled={a.busy} className="mt-2" />
          </div>
        ) : (
          <Thread messages={a.messages} streamText={a.streamText} onDecide={a.decide} onRetry={(t) => void sendNow(t)} />
        )}

        {/* Composer */}
        <footer className="shrink-0 px-3 pt-1 pb-3">
          {a.error && <p className="mb-1.5 px-1 text-2xs text-danger">{a.error}</p>}
          {pendingSeed && (pendingSeed.selection || pendingSeed.entityId) && (
            <SeedChip seed={pendingSeed} filePath={filePath} onClear={() => setPendingSeed(undefined)} />
          )}
          <Composer
            inputRef={inputRef}
            value={draft}
            onValueChange={setDraft}
            onSend={() => void sendNow(draft, pendingSeed)}
            onStop={a.stop}
            busy={a.busy}
            disabled={!a.available}
            autoFocus={host === "buddy"}
            placeholder={pendingSeed?.selection ? "Ask about this passage…" : "Ask about the book…"}
          />
        </footer>
      </motion.section>
    </AssistantUIProvider>
  );
}

export default AssistantPanel;
