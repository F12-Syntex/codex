"use client";

/**
 * MessageRenderer — assistant Markdown (the subset in `@shared/assistant/markdown`) rendered as
 * React elements. Never innerHTML: the model's text can only become text nodes, emphasis, lists,
 * citation chips and entity mentions.
 */

import * as React from "react";
import type { Citation } from "@shared/assistant/types";
import { parseInline, parseMarkdown, type MdBlock, type MdInline } from "@shared/assistant/markdown";
import { applyLexiconText } from "@shared/pipeline/lexicon";
import { useLexicon } from "@/lib/book/lexicon";
import { cn } from "@/lib/utils";
import { CitationChip } from "./CitationChip";
import { useAssistantUI } from "./context";

export function EntityMention({ id, name: rawName }: { id: string; name: string }) {
  const { openEntity } = useAssistantUI();
  // AI text shown to the reader passes through the display lexicon (word replacements).
  const name = applyLexiconText(rawName, useLexicon(), "display");
  const cls = "rounded-xs bg-brand/10 px-1 font-medium text-brand decoration-brand/40 underline-offset-2";
  if (!openEntity) return <span className={cls}>{name}</span>;
  return (
    <button
      type="button"
      onClick={() => openEntity(id)}
      className={cn(cls, "focus-ring cursor-pointer transition-colors duration-150 hover:bg-brand/18 hover:underline")}
    >
      {name}
    </button>
  );
}

function Inline({ nodes, citations = [] }: { nodes: MdInline[]; citations?: Citation[] }) {
  const lex = useLexicon();
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            return <React.Fragment key={i}>{applyLexiconText(n.v, lex, "display")}</React.Fragment>;
          case "strong":
            return <strong key={i} className="font-semibold text-label"><Inline nodes={n.c} citations={citations} /></strong>;
          case "em":
            return <em key={i}><Inline nodes={n.c} citations={citations} /></em>;
          case "code":
            return <code key={i} className="rounded-xs bg-fill-tertiary px-1 py-px font-mono text-xs">{n.v}</code>;
          case "br":
            return <br key={i} />;
          case "entity":
            return <EntityMention key={i} id={n.id} name={n.name} />;
          case "cite": {
            // In prose a citation is a small numbered chip; "Ch 1 ¶3" lives in its tooltip.
            const c = citations[n.n - 1];
            return c ? <CitationChip key={i} citation={c} n={n.n} compact /> : null;
          }
        }
      })}
    </>
  );
}

function Block({ b, citations }: { b: MdBlock; citations: Citation[] }) {
  switch (b.t) {
    case "p":
      return <p className="leading-relaxed"><Inline nodes={b.c} citations={citations} /></p>;
    case "h":
      return b.level === 3 ? (
        <h3 className="pt-1 font-display text-base font-semibold text-label"><Inline nodes={b.c} citations={citations} /></h3>
      ) : (
        <h4 className="pt-0.5 text-headline text-label"><Inline nodes={b.c} citations={citations} /></h4>
      );
    case "list": {
      const L = b.ordered ? "ol" : "ul";
      return (
        <L className={cn("space-y-1 pl-5 leading-relaxed marker:text-label-tertiary", b.ordered ? "list-decimal" : "list-disc")}>
          {b.items.map((it, i) => (
            <li key={i} className="pl-0.5"><Inline nodes={it} citations={citations} /></li>
          ))}
        </L>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-2 border-brand/40 pl-3 font-display text-label-secondary italic">
          <div className="space-y-2">{b.c.map((x, i) => <Block key={i} b={x} citations={citations} />)}</div>
        </blockquote>
      );
    case "code":
      return <pre className="overflow-x-auto rounded-sm bg-fill-tertiary p-2.5 font-mono text-xs leading-relaxed">{b.v}</pre>;
  }
}

/**
 * One line of model text with inline Markdown (emphasis, code, entities): for bullets and
 * captions outside a message, so a stray `**` from the model never prints.
 */
export function InlineMarkdown({ text, citations }: { text: string; citations?: Citation[] }) {
  // A bullet may arrive with its own "- " marker; parse just the inline content.
  const nodes = React.useMemo(() => parseInline(text.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()), [text]);
  return <Inline nodes={nodes} citations={citations} />;
}

export interface MessageRendererProps {
  text: string;
  citations?: Citation[];
  className?: string;
}

export const MessageRenderer = React.memo(function MessageRenderer({ text, citations = [], className }: MessageRendererProps) {
  const blocks = React.useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={cn("space-y-2.5 text-sm text-label", className)}>
      {blocks.map((b, i) => <Block key={i} b={b} citations={citations} />)}
    </div>
  );
});

export default MessageRenderer;
