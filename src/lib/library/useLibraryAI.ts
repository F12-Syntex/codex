"use client";

/**
 * Hooks for smart library tagging + series (AI_AUDIT §6 F5). State lives in main
 * (`item_tags`, `item_series`, `item_ai`); these re-read on local changes (`onLibraryChanged`) and
 * when a `library.tag` job finishes in any window (`ai:event`).
 */

import * as React from "react";
import type { ItemLibraryInfo, LibraryOverview, LibraryTagRequest, LibraryTagRun } from "@shared/library/types";
import { onAIEvent } from "@/lib/ai/events";
import { hasRpc } from "@/lib/ai/rpc";
import { libraryAI, onLibraryChanged } from "./bridge";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs `fn` (debounced) whenever a `library.tag` job settles. */
function useTagJobSettled(fn: () => void, delay = 300): void {
  const ref = React.useRef(fn);
  React.useLayoutEffect(() => {
    ref.current = fn;
  });
  React.useEffect(() => {
    if (!hasRpc()) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = onAIEvent("job", (e) => {
      if (e.task !== "library.tag" || (e.state !== "done" && e.state !== "error" && e.state !== "cancelled")) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => ref.current(), delay);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [delay]);
}

/** Accepted genres + series for every book (grid filters and the Series view). */
export function useLibraryOverview(): { overview: LibraryOverview; refresh: () => void } {
  const [overview, setOverview] = React.useState<LibraryOverview>({});
  const refresh = React.useCallback(() => {
    if (!hasRpc()) return;
    libraryAI.overview().then(setOverview).catch(() => {});
  }, []);
  React.useEffect(() => {
    refresh();
    return onLibraryChanged(refresh);
  }, [refresh]);
  useTagJobSettled(refresh);
  return { overview, refresh };
}

export interface LibraryItemState {
  info: ItemLibraryInfo | null;
  error: string | null;
  refresh: () => void;
}

/** One book's tags and series (details modal). */
export function useLibraryItem(filePath: string | null | undefined): LibraryItemState {
  const [info, setInfo] = React.useState<ItemLibraryInfo | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const refresh = React.useCallback(() => {
    if (!filePath || !hasRpc()) return;
    libraryAI
      .item(filePath)
      .then((v) => {
        setInfo(v);
        setError(null);
      })
      .catch((e) => setError(errText(e)));
  }, [filePath]);
  React.useEffect(() => {
    refresh();
    return onLibraryChanged(refresh);
  }, [refresh]);
  useTagJobSettled(refresh);
  return { info, error, refresh };
}

export interface LibraryTagRunState {
  run: LibraryTagRun | null;
  running: boolean;
  error: string | null;
  start: (req?: LibraryTagRequest) => Promise<LibraryTagRun | null>;
  cancel: () => void;
}

/** The library-wide tagging run (one at a time, shared by every window). */
export function useLibraryTagRun(): LibraryTagRunState {
  const [run, setRun] = React.useState<LibraryTagRun | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const poll = React.useCallback(() => {
    if (!hasRpc()) return;
    libraryAI.tagStatus().then(setRun).catch(() => {});
  }, []);
  React.useEffect(poll, [poll]);
  useTagJobSettled(poll, 120);

  const start = React.useCallback(async (req: LibraryTagRequest = {}) => {
    if (!hasRpc()) return null;
    setError(null);
    try {
      const r = await libraryAI.startTagging(req);
      setRun(r);
      return r;
    } catch (e) {
      setError(errText(e));
      return null;
    }
  }, []);

  const cancel = React.useCallback(() => {
    if (!hasRpc()) return;
    void libraryAI.cancelTagging().then(poll, () => {});
  }, [poll]);

  return { run, running: run?.state === "running", error, start, cancel };
}
