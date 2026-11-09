"use client";

/**
 * useAssistant — threads + live streaming for one book (owner WS-E).
 *
 * State lives in main (`assistant_*` tables), so every window showing the same thread (reader
 * panel, detached Buddy window, wiki window) converges: job events for group `thread:<id>` from
 * ANY window trigger a reload, and their deltas stream here too.
 */

import * as React from "react";
import type { AssistantMessage, AssistantMode, AssistantSeed, AssistantThread } from "@shared/assistant/types";
import { streamingPreview } from "@shared/assistant/markers";
import type { ApplyResult } from "@shared/knowledge/types";
import { onAnyAIEvent } from "@/lib/ai/events";
import { hasRpc } from "@/lib/ai/rpc";
import { assistant } from "./bridge";

export interface UseAssistantOptions {
  filePath: string;
  /** Open this thread first (e.g. the detached window continuing the reader's thread). */
  threadId?: string | null;
}

export interface AssistantState {
  available: boolean;
  threads: AssistantThread[];
  thread: AssistantThread | null;
  messages: AssistantMessage[];
  /** Live preview text of the answer being streamed (markers already stripped). */
  streamText: string;
  /** An answer is being produced in the active thread. */
  busy: boolean;
  error: string | null;
  selectThread: (id: string | null) => void;
  newThread: (mode?: AssistantMode, seed?: AssistantSeed) => Promise<AssistantThread | null>;
  send: (text: string, opts?: { seed?: AssistantSeed; mode?: AssistantMode }) => Promise<void>;
  stop: () => void;
  removeThread: (id: string) => Promise<void>;
  renameThread: (id: string, title: string) => Promise<void>;
  decide: (messageId: string, decision: "apply" | "reject") => Promise<ApplyResult | null>;
  refresh: () => void;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useAssistant({ filePath, threadId: initialThreadId = null }: UseAssistantOptions): AssistantState {
  const available = hasRpc();
  const [threads, setThreads] = React.useState<AssistantThread[]>([]);
  const [threadId, setThreadId] = React.useState<string | null>(initialThreadId);
  const [thread, setThread] = React.useState<AssistantThread | null>(null);
  const [messages, setMessages] = React.useState<AssistantMessage[]>([]);
  const [buffer, setBuffer] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const threadIdRef = React.useRef(threadId);
  React.useLayoutEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);
  /** Jobs whose deltas belong to the active thread. */
  const liveJobs = React.useRef(new Set<string>());

  const loadThreads = React.useCallback(async () => {
    if (!available || !filePath) return;
    try {
      setThreads(await assistant.threads(filePath));
    } catch (e) {
      setError(errText(e));
    }
  }, [available, filePath]);

  const loadThread = React.useCallback(async (id: string | null) => {
    if (!available) return;
    if (!id) {
      setThread(null);
      setMessages([]);
      return;
    }
    try {
      const r = await assistant.thread(id);
      if (threadIdRef.current !== id) return;
      setThread(r.thread);
      setMessages(r.messages);
    } catch (e) {
      setError(errText(e));
      setThread(null);
      setMessages([]);
    }
  }, [available]);

  React.useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  React.useEffect(() => {
    liveJobs.current.clear();
    setBuffer("");
    void loadThread(threadId);
  }, [threadId, loadThread]);

  React.useEffect(() => {
    if (initialThreadId) setThreadId(initialThreadId);
  }, [initialThreadId]);

  // Event stream: deltas for live jobs; job transitions for the active thread's group.
  React.useEffect(() => {
    if (!available) return;
    return onAnyAIEvent((e) => {
      const active = threadIdRef.current;
      if (e.type === "delta") {
        if (liveJobs.current.has(e.jobId)) setBuffer((b) => b + e.text);
        return;
      }
      if (e.type !== "job" || e.task !== "assistant.turn") return;
      if (!active || e.group !== `thread:${active}`) {
        if (e.scope?.filePath === filePath && (e.state === "done" || e.state === "error" || e.state === "cancelled")) void loadThreads();
        return;
      }
      if (e.state === "queued" || e.state === "running") {
        if (!liveJobs.current.has(e.jobId)) {
          liveJobs.current.add(e.jobId);
          if (e.state === "queued") {
            setBuffer("");
            void loadThread(active); // pick up the user message + placeholder sent from another window
          }
        }
        return;
      }
      liveJobs.current.delete(e.jobId);
      setBuffer("");
      void loadThread(active);
      void loadThreads();
    });
  }, [available, filePath, loadThread, loadThreads]);

  const busy = messages.some((m) => m.role === "assistant" && m.status === "streaming");

  const newThread = React.useCallback(async (mode: AssistantMode = "chat", seed?: AssistantSeed) => {
    if (!available) return null;
    try {
      const t = await assistant.create({ filePath, mode, ...(seed ? { seed } : {}) });
      setThreads((ts) => [t, ...ts.filter((x) => x.id !== t.id)]);
      threadIdRef.current = t.id;
      setThreadId(t.id);
      setThread(t);
      setMessages([]);
      return t;
    } catch (e) {
      setError(errText(e));
      return null;
    }
  }, [available, filePath]);

  const send = React.useCallback(async (text: string, opts: { seed?: AssistantSeed; mode?: AssistantMode } = {}) => {
    if (!available) return;
    setError(null);
    let id = threadIdRef.current;
    if (!id) {
      const t = await newThread(opts.mode ?? "chat", opts.seed);
      if (!t) return;
      id = t.id;
    }
    try {
      setBuffer("");
      const ticket = await assistant.send({ threadId: id, text, ...(opts.seed ? { seed: opts.seed } : {}) });
      liveJobs.current.add(ticket.jobId);
      await loadThread(id);
      void loadThreads();
    } catch (e) {
      setError(errText(e));
      void loadThread(id);
    }
  }, [available, newThread, loadThread, loadThreads]);

  const stop = React.useCallback(() => {
    const id = threadIdRef.current;
    if (id) void assistant.stop(id).catch(() => undefined);
  }, []);

  const removeThread = React.useCallback(async (id: string) => {
    try {
      await assistant.remove(id);
    } catch (e) {
      setError(errText(e));
    }
    setThreads((ts) => ts.filter((t) => t.id !== id));
    if (threadIdRef.current === id) setThreadId(null);
  }, []);

  const renameThread = React.useCallback(async (id: string, title: string) => {
    try {
      const t = await assistant.rename(id, title);
      setThreads((ts) => ts.map((x) => (x.id === id ? t : x)));
      if (threadIdRef.current === id) setThread(t);
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  const decide = React.useCallback(async (messageId: string, decision: "apply" | "reject") => {
    try {
      const r = await assistant.decideProposal(messageId, decision);
      if (threadIdRef.current) await loadThread(threadIdRef.current);
      return r;
    } catch (e) {
      setError(errText(e));
      return null;
    }
  }, [loadThread]);

  const selectThread = React.useCallback((id: string | null) => {
    threadIdRef.current = id; // synchronous, so a send right after targets the new selection
    setThreadId(id);
  }, []);

  const refresh = React.useCallback(() => {
    void loadThreads();
    void loadThread(threadIdRef.current);
  }, [loadThreads, loadThread]);

  return {
    available,
    threads,
    thread,
    messages,
    streamText: busy ? streamingPreview(buffer) : "",
    busy,
    error,
    selectThread,
    newThread,
    send,
    stop,
    removeThread,
    renameThread,
    decide,
    refresh,
  };
}
