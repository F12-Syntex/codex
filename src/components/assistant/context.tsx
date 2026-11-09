"use client";

/**
 * Shared callbacks for everything rendered inside an AssistantPanel (citation chips, entity
 * mentions, proposal cards), so deep children don't need prop drilling.
 */

import * as React from "react";
import type { ParaRef } from "@shared/pipeline/types";
import { book } from "@/lib/book/bridge";
import { knowledge } from "@/lib/knowledge/bridge";
import { hasRpc } from "@/lib/ai/rpc";

export interface AssistantUIContext {
  filePath: string;
  /** Jump the reader to a cited paragraph (default: `book:reveal`, which focuses the reader window). */
  reveal: (ref: ParaRef) => void;
  /** Open an entity (EntityCard / wiki). Undefined → mentions are not clickable. */
  openEntity?: (entityId: string) => void;
}

const Ctx = React.createContext<AssistantUIContext | null>(null);

export function AssistantUIProvider({ value, children }: { value: AssistantUIContext; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistantUI(): AssistantUIContext {
  const v = React.useContext(Ctx);
  return v ?? { filePath: "", reveal: () => undefined };
}

export function defaultReveal(filePath: string) {
  return (ref: ParaRef) => {
    if (hasRpc()) void book.reveal(filePath, ref).catch((e) => console.error("[assistant] reveal failed", e));
  };
}

/** Resolve entity ids to display names (frontier-gated in main). Unknown ids fall back to the id. */
export function useEntityNames(filePath: string, ids: readonly string[]): Record<string, string> {
  const [names, setNames] = React.useState<Record<string, string>>({});
  const key = ids.join("\u0000");
  React.useEffect(() => {
    if (!hasRpc() || !filePath || !key) return;
    let alive = true;
    const unique = Array.from(new Set(key.split("\u0000")));
    void Promise.all(
      unique.map((id) =>
        knowledge.entity(filePath, id).then((e) => [id, e?.name ?? id] as const).catch(() => [id, id] as const),
      ),
    ).then((pairs) => {
      if (alive) setNames(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [filePath, key]);
  return names;
}
