"use client";

/**
 * Thread — the conversation. User turns are accent bubbles (`bg-brand`), assistant turns sit on
 * `bg-fill-quaternary`; both rise in with a spring (ChatBubble, adapted from 21st.dev "Message
 * Bubble"). While an answer streams: ShimmerText until the first delta, then live Markdown with a
 * soft caret. Finished answers carry inline citation chips plus a collapsible "passages" list
 * (adapted from 21st.dev "AI Citations"). Sticks to the bottom unless the reader scrolled up.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, ChevronDown, Quote, RotateCcw, UserRound } from "lucide-react";
import type { AssistantMessage, Citation, MessageBlock } from "@shared/assistant/types";
import { ChatBubble } from "@/components/ui/chat-bubble";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { cn } from "@/lib/utils";
import { MessageRenderer } from "./MessageRenderer";
import { ProposalCard } from "./ProposalCard";
import { useAssistantUI, useEntityNames } from "./context";

const markdownOf = (blocks: MessageBlock[]) => blocks.map((b) => (b.type === "markdown" ? b.text : "")).filter(Boolean).join("\n\n");

function Sources({ citations }: { citations: Citation[] }) {
  const reduce = useReducedMotion();
  const { reveal } = useAssistantUI();
  const [open, setOpen] = React.useState(false);
  if (citations.length < 2) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="focus-ring -ml-1 inline-flex h-6 items-center gap-1 rounded-full px-1.5 text-2xs font-medium text-label-tertiary transition-colors duration-150 hover:bg-fill-tertiary hover:text-label-secondary"
      >
        {citations.length} passages
        <ChevronDown className={cn("size-3 transition-transform duration-200 ease-apple", open && "rotate-180")} strokeWidth={2.25} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            {citations.map((c, i) => (
              <li key={`${c.ref.chapterId}:${c.ref.paraId}`}>
                <button
                  type="button"
                  onClick={() => reveal(c.ref)}
                  className="focus-ring flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-fill-tertiary"
                >
                  <span className="mt-px w-3 shrink-0 text-right text-2xs tabular-nums text-label-tertiary">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-2xs font-medium tabular-nums text-label-secondary">{c.label}</span>
                    {c.snippet && <span className="line-clamp-2 font-display text-xs text-label-tertiary">{c.snippet}</span>}
                  </span>
                </button>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserTurn({ m }: { m: AssistantMessage }) {
  const { filePath } = useAssistantUI();
  const entityIds = m.blocks.flatMap((b) => (b.type === "entity" ? [b.entityId] : []));
  const names = useEntityNames(filePath, entityIds);
  const text = markdownOf(m.blocks);
  return (
    <div className="flex flex-col items-end gap-1.5">
      {m.blocks.map((b, i) =>
        b.type === "passage" ? (
          <div key={i} className="max-w-[85%] rounded-lg bg-fill-quaternary px-3 py-2 hairline">
            <div className="mb-0.5 flex items-center gap-1 text-2xs font-medium text-label-tertiary">
              <Quote className="size-3" strokeWidth={2} /> Selection
            </div>
            <p className="line-clamp-4 font-display text-xs leading-relaxed text-label-secondary italic">{b.text}</p>
          </div>
        ) : b.type === "entity" ? (
          <span key={i} className="inline-flex h-6 items-center gap-1 rounded-full bg-brand/10 px-2 text-2xs font-medium text-brand">
            <UserRound className="size-3" strokeWidth={2} /> About {names[b.entityId] ?? "…"}
          </span>
        ) : null,
      )}
      {text && (
        <ChatBubble variant="outgoing" maxWidth="85%">
          <span className="whitespace-pre-wrap">{text}</span>
        </ChatBubble>
      )}
    </div>
  );
}

function AssistantTurn({
  m, streamText, onDecide, onRetry,
}: {
  m: AssistantMessage;
  streamText?: string;
  onDecide: (messageId: string, d: "apply" | "reject") => Promise<unknown>;
  onRetry?: () => void;
}) {
  const reduce = useReducedMotion();
  if (m.status === "streaming") {
    return (
      <ChatBubble variant="incoming" maxWidth="92%">
        {streamText ? (
          <div className="relative">
            <MessageRenderer text={streamText} />
            <motion.span
              aria-hidden
              className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-brand align-baseline"
              animate={reduce ? undefined : { opacity: [1, 0.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          </div>
        ) : (
          <ShimmerText className="text-sm">Reading the book…</ShimmerText>
        )}
      </ChatBubble>
    );
  }
  if (m.status === "error") {
    const cancelled = m.error?.code === "cancelled";
    return (
      <ChatBubble variant="incoming" maxWidth="92%">
        {markdownOf(m.blocks) && <MessageRenderer text={markdownOf(m.blocks)} citations={m.citations} className="mb-2" />}
        <div className={cn("flex items-start gap-2 text-xs", cancelled ? "text-label-tertiary" : "text-danger")}>
          <AlertCircle className="mt-px size-3.5 shrink-0" strokeWidth={2} />
          <span className="min-w-0 flex-1">{cancelled ? "Stopped." : m.error?.message ?? "Something went wrong."}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="focus-ring -my-0.5 inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-fill-tertiary px-2 text-2xs font-medium text-label-secondary hover:bg-fill-secondary hover:text-label"
            >
              <RotateCcw className="size-3" strokeWidth={2.25} /> Retry
            </button>
          )}
        </div>
      </ChatBubble>
    );
  }
  const text = markdownOf(m.blocks);
  return (
    <ChatBubble variant="incoming" maxWidth="92%">
      {text && <MessageRenderer text={text} citations={m.citations} />}
      {m.proposal && <ProposalCard proposal={m.proposal} onDecide={(d) => onDecide(m.id, d)} />}
      <Sources citations={m.citations} />
    </ChatBubble>
  );
}

export interface ThreadProps {
  messages: AssistantMessage[];
  streamText: string;
  onDecide: (messageId: string, d: "apply" | "reject") => Promise<unknown>;
  onRetry?: (text: string) => void;
  className?: string;
  /** Classes for the message column inside the scroller (e.g. Buddy's `mx-auto max-w-2xl` measure). */
  contentClassName?: string;
  children?: React.ReactNode;
}

export function Thread({ messages, streamText, onDecide, onRetry, className, contentClassName, children }: ThreadProps) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const stick = React.useRef(true);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, streamText]);

  // A new question always scrolls to the bottom.
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.id;
  React.useEffect(() => {
    stick.current = true;
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lastUser]);

  return (
    <div ref={scroller} onScroll={onScroll} className={cn("min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-3", className)}>
      <div className={cn("flex flex-col gap-3", contentClassName)}>
        {messages.map((m, i) =>
          m.role === "user" ? (
            <UserTurn key={m.id} m={m} />
          ) : (
            <AssistantTurn
              key={m.id}
              m={m}
              streamText={m.status === "streaming" ? streamText : undefined}
              onDecide={onDecide}
              onRetry={(() => {
                const prev = messages.slice(0, i).reverse().find((x) => x.role === "user");
                const t = prev ? markdownOf(prev.blocks) : "";
                return onRetry && t && i === messages.length - 1 ? () => onRetry(t) : undefined;
              })()}
            />
          ),
        )}
        {children}
      </div>
    </div>
  );
}

export default Thread;
