"use client";

/**
 * MessageRenderer — assistant Markdown (the subset in `@shared/assistant/markdown`) rendered as
 * React elements. Never innerHTML: the model's text can only become text nodes, emphasis, lists,
 * citation chips and entity mentions.
 */

import * as React from "react";
import type { Citation } from "@shared/assistant/types";
import { parseMarkdown, type MdBlock, type MdInline } from "@shared/assistant/markdown";
import { cn } from "@/lib/utils";
import { CitationChip } from "./CitationChip";
import { useAssistantUI } from "./context";

export function EntityMention({ id, name }: { id: string; name: string }) {
  const { openEntity } = useAssistantUI();
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

function Inline({ nodes, citations }: { nodes: MdInline[]; citations: Citation[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            return <React.Fragment key={i}>{n.v}</React.Fragment>;
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
            const c = citations[n.n - 1];
            return c ? <CitationChip key={i} citation={c} /> : null;
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
