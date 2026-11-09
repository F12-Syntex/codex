"use client";

/**
 * Vocabulary deck + Define/Translate hooks (owner WS-E). AI_AUDIT §6 F4.
 */

import * as React from "react";
import type { DefineResult, NewVocabItem, TranslateResult, VocabItem, VocabStats } from "@shared/assistant/types";
import type { AIErrorInfo } from "@shared/ai/types";
import type { SrsGrade } from "@shared/srs";
import { hasRpc } from "@/lib/ai/rpc";
import { selection, vocab } from "./bridge";

export interface UseVocabDeck {
  items: VocabItem[];
  /** Cards due now (oldest due first). */
  due: VocabItem[];
  stats: VocabStats;
  loading: boolean;
  review: (id: number, grade: SrsGrade) => Promise<VocabItem | null>;
  remove: (id: number) => Promise<void>;
  add: (item: NewVocabItem) => Promise<VocabItem | null>;
  reload: () => Promise<void>;
}

const EMPTY_STATS: VocabStats = { total: 0, due: 0, learned: 0, fresh: 0 };

/** All cards (optionally one book's). Reloads when `open` turns true. */
export function useVocabDeck(filePath?: string, open = true): UseVocabDeck {
  const [items, setItems] = React.useState<VocabItem[]>([]);
  const [stats, setStats] = React.useState<VocabStats>(EMPTY_STATS);
  const [loading, setLoading] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  const reload = React.useCallback(async () => {
    if (!hasRpc()) return;
    setLoading(true);
    try {
      const filter = filePath ? { filePath } : {};
      const [list, st] = await Promise.all([vocab.list(filter), vocab.stats(filePath)]);
      setItems(list);
      setStats(st);
      setNow(Date.now());
    } catch (err) {
      console.error("[vocab] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  React.useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const due = React.useMemo(() => items.filter((i) => i.srs.dueAt <= now).sort((a, b) => a.srs.dueAt - b.srs.dueAt), [items, now]);

  const review = React.useCallback(async (id: number, grade: SrsGrade) => {
    try {
      const next = await vocab.review(id, grade);
      setItems((xs) => xs.map((x) => (x.id === id ? next : x)));
      setStats((s) => ({
        ...s,
        due: Math.max(0, s.due - 1),
        learned: s.learned + (next.srs.reps > 0 && !items.find((x) => x.id === id)?.srs.reps ? 1 : 0),
        fresh: Math.max(0, s.fresh - (items.find((x) => x.id === id)?.srs.intervalDays === 0 ? 1 : 0)),
      }));
      return next;
    } catch (err) {
      console.error("[vocab] review failed", err);
      return null;
    }
  }, [items]);

  const remove = React.useCallback(async (id: number) => {
    await vocab.remove(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
    void vocab.stats(filePath).then(setStats).catch(() => undefined);
  }, [filePath]);

  const add = React.useCallback(async (item: NewVocabItem) => {
    try {
      const it = await vocab.add(item);
      setItems((xs) => [it, ...xs.filter((x) => x.id !== it.id)]);
      void vocab.stats(filePath).then(setStats).catch(() => undefined);
      return it;
    } catch (err) {
      console.error("[vocab] add failed", err);
      return null;
    }
  }, [filePath]);

  return { items, due, stats, loading, review, remove, add, reload };
}

type LookupState<T> = { status: "idle" } | { status: "loading" } | { status: "done"; value: T; cached: boolean } | { status: "error"; error: AIErrorInfo };

export interface DefineLookup {
  define: LookupState<DefineResult>;
  translate: LookupState<TranslateResult>;
  runDefine: () => void;
  runTranslate: () => void;
}

/** Lazily runs `selection.define` / `selection.translate` for one selection (each at most once). */
export function useDefineLookup(args: { term: string; sentence: string; bookTitle?: string; filePath?: string; targetLanguage?: string }): DefineLookup {
  const { term, sentence, bookTitle, filePath, targetLanguage } = args;
  const [define, setDefine] = React.useState<LookupState<DefineResult>>({ status: "idle" });
  const [translate, setTranslate] = React.useState<LookupState<TranslateResult>>({ status: "idle" });
  const key = `${term}\u0000${sentence}\u0000${targetLanguage ?? ""}`;
  const keyRef = React.useRef(key);

  React.useEffect(() => {
    keyRef.current = key;
    setDefine({ status: "idle" });
    setTranslate({ status: "idle" });
  }, [key]);

  const runDefine = React.useCallback(() => {
    if (!hasRpc()) return;
    const k = keyRef.current;
    setDefine((s) => (s.status === "idle" || s.status === "error" ? { status: "loading" } : s));
    void selection
      .define({ term, sentence, ...(bookTitle ? { bookTitle } : {}), ...(targetLanguage ? { targetLanguage } : {}) }, filePath)
      .then((r) => {
        if (keyRef.current !== k) return;
        setDefine(r.state === "done" && r.output
          ? { status: "done", value: r.output, cached: r.cached }
          : { status: "error", error: r.error ?? { code: "unknown", message: "No definition", retryable: true } });
      })
      .catch((e) => keyRef.current === k && setDefine({ status: "error", error: { code: "unknown", message: String(e), retryable: true } }));
  }, [term, sentence, bookTitle, filePath, targetLanguage]);

  const runTranslate = React.useCallback(() => {
    if (!hasRpc()) return;
    const k = keyRef.current;
    setTranslate((s) => (s.status === "idle" || s.status === "error" ? { status: "loading" } : s));
    void selection
      .translate({ text: term, sentence, ...(bookTitle ? { bookTitle } : {}), ...(targetLanguage ? { targetLanguage } : {}) }, filePath)
      .then((r) => {
        if (keyRef.current !== k) return;
        setTranslate(r.state === "done" && r.output
          ? { status: "done", value: r.output, cached: r.cached }
          : { status: "error", error: r.error ?? { code: "unknown", message: "No translation", retryable: true } });
      })
      .catch((e) => keyRef.current === k && setTranslate({ status: "error", error: { code: "unknown", message: String(e), retryable: true } }));
  }, [term, sentence, bookTitle, filePath, targetLanguage]);

  return { define, translate, runDefine, runTranslate };
}
