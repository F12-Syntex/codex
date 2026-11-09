"use client";

/**
 * ProposalCard — wiki edits the assistant proposed (`propose_wiki_edits`). Nothing changes until
 * the user presses Apply; Skip rejects. Inner card `bg-fill-quaternary rounded-lg` (no glass in
 * glass), Apply / Skip are `<Button>`s, status morphs with a spring.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, GitMerge, Link2, PencilLine, Plus, Tag, Trash2, Undo2 } from "lucide-react";
import type { WikiProposal } from "@shared/assistant/types";
import type { WikiEdit } from "@shared/knowledge/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssistantUI, useEntityNames } from "./context";

function idsOf(edits: WikiEdit[]): string[] {
  return edits.flatMap((e) => {
    switch (e.op) {
      case "update": case "delete": case "alias": return [e.id];
      case "relate": case "merge": return [e.sourceId, e.targetId];
      default: return [];
    }
  });
}

function describe(e: WikiEdit, name: (id: string) => string): { icon: React.ReactNode; text: React.ReactNode } {
  const b = (s: string) => <span className="font-medium text-label">{s}</span>;
  switch (e.op) {
    case "create":
      return { icon: <Plus />, text: <>Add {b(e.entry.name)} <span className="text-label-tertiary">({e.entry.type})</span>{e.entry.shortDescription ? <> — {e.entry.shortDescription}</> : null}</> };
    case "update": {
      const fields = Object.entries(e.fields).map(([k, v]) => `${k === "shortDescription" ? "description" : k} → ${String(v)}`);
      return { icon: <PencilLine />, text: <>Update {b(name(e.id))}: {fields.join(", ")}</> };
    }
    case "delete":
      return { icon: <Trash2 />, text: <>Remove {b(name(e.id))}</> };
    case "alias":
      return { icon: <Tag />, text: <>Also call {b(name(e.id))} {e.aliases.map((a) => `“${a}”`).join(", ")}</> };
    case "relate":
      return { icon: <Link2 />, text: <>{b(name(e.sourceId))} is {e.relation} of {b(name(e.targetId))}</> };
    case "merge":
      return { icon: <GitMerge />, text: <>Merge {b(name(e.sourceId))} into {b(name(e.targetId))}</> };
  }
}

export interface ProposalCardProps {
  proposal: WikiProposal;
  onDecide: (decision: "apply" | "reject") => Promise<unknown> | void;
  className?: string;
}

export function ProposalCard({ proposal, onDecide, className }: ProposalCardProps) {
  const reduce = useReducedMotion();
  const { filePath } = useAssistantUI();
  const names = useEntityNames(filePath, idsOf(proposal.edits));
  const [busy, setBusy] = React.useState<"apply" | "reject" | null>(null);
  const name = (id: string) => names[id] ?? id;

  const decide = async (d: "apply" | "reject") => {
    setBusy(d);
    try {
      await onDecide(d);
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className={cn("mt-2.5 rounded-lg bg-fill-quaternary p-3 hairline", className)}
    >
      <div className="flex items-center gap-2">
        <span className="text-headline text-label">Suggested wiki changes</span>
        <span className="rounded-full bg-fill-tertiary px-1.5 text-2xs tabular-nums text-label-secondary">{proposal.edits.length}</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {proposal.edits.map((e, i) => {
          const d = describe(e, name);
          return (
            <li key={i} className="flex gap-2 text-xs leading-relaxed text-label-secondary">
              <span className="mt-0.5 shrink-0 text-label-tertiary [&_svg]:size-3.5" aria-hidden>{d.icon}</span>
              <span className="min-w-0">{d.text}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex h-7 items-center justify-end gap-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {proposal.status === "pending" ? (
            <motion.div key="actions" className="flex gap-2" exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.15 }}>
              <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => decide("reject")}>Skip</Button>
              <Button size="sm" disabled={!!busy} onClick={() => decide("apply")}>
                <Check strokeWidth={2.25} />
                {busy === "apply" ? "Applying…" : "Apply"}
              </Button>
            </motion.div>
          ) : (
            <motion.span
              key={proposal.status}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium",
                proposal.status === "applied" ? "bg-success/15 text-success" : "bg-fill-tertiary text-label-secondary",
              )}
            >
              {proposal.status === "applied" ? <Check className="size-3.5" strokeWidth={2.25} /> : <Undo2 className="size-3.5" />}
              {proposal.status === "applied" ? "Applied to the wiki" : "Skipped"}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default ProposalCard;
