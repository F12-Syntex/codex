"use client";

/**
 * VocabularyDeck — review saved words with SM-2 (AI_AUDIT §6 F4), as a GlassModal.
 *
 * Adapted from 21st.dev "Spaced Repetition Flashcards" (klyv-ui, id 38653: SM-2 session queue,
 * per-button interval previews, 1–4 keyboard grading, cards below "Good" repeat in-session without
 * being rescheduled twice) and "Tilt Flip Card" (cesaroeduardo, id 12635: 3D front/back flip),
 * rebuilt on Codex Glass tokens with motion springs. Scheduling is `@shared/srs` in main.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookOpen, Check, Trash2 } from "lucide-react";
import type { VocabItem } from "@shared/assistant/types";
import { formatInterval, previewIntervals, SRS_GRADES, type SrsGrade } from "@shared/srs";
import { GlassModal } from "@/components/ui/glass-modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useVocabDeck } from "@/lib/assistant/useVocab";

const GRADE_LABEL: Record<SrsGrade, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

interface Turn {
  id: number;
  /** A repeat of a card already graded this session (not rescheduled again). */
  drill: boolean;
}

/** Context sentence with the term emphasised (React nodes, never html). */
function Highlighted({ text, term }: { text: string; term: string }) {
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (!term || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-xs bg-brand/15 px-0.5 text-label">{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  );
}

function Flashcard({ item, revealed, onReveal }: { item: VocabItem; revealed: boolean; onReveal: () => void }) {
  const reduce = useReducedMotion();
  const face = "absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-fill-quaternary px-6 py-5 text-center hairline [backface-visibility:hidden]";
  return (
    <div className="relative h-60 w-full [perspective:1200px]">
      <motion.button
        type="button"
        onClick={onReveal}
        disabled={revealed}
        aria-label={revealed ? undefined : "Show answer"}
        className="focus-ring relative h-full w-full rounded-2xl [transform-style:preserve-3d] disabled:cursor-default"
        initial={false}
        animate={{ rotateY: revealed && !reduce ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        {/* Front */}
        <div className={cn(face, reduce && revealed && "invisible")}>
          <span className="font-display text-2xl font-semibold text-label">{item.term}</span>
          {item.context && (
            <p className="line-clamp-3 max-w-sm font-display text-sm leading-relaxed text-label-secondary italic">
              <Highlighted text={item.context} term={item.term} />
            </p>
          )}
          <span className="mt-1 inline-flex items-center gap-1.5 text-2xs text-label-tertiary">
            <Kbd>Space</Kbd> to reveal
          </span>
        </div>
        {/* Back */}
        <div className={cn(face, !reduce && "[transform:rotateY(180deg)]", reduce && !revealed && "invisible")}>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl font-semibold text-label">{item.lemma ?? item.term}</span>
          </div>
          {item.definition ? (
            <p className="max-w-sm text-sm leading-relaxed text-label">{item.definition}</p>
          ) : (
            <p className="text-sm text-label-tertiary">No definition saved.</p>
          )}
          {item.translation && <p className="font-display text-base text-brand">{item.translation}</p>}
          {item.context && (
            <p className="line-clamp-2 max-w-sm text-xs leading-relaxed text-label-tertiary">
              <Highlighted text={item.context} term={item.term} />
            </p>
          )}
        </div>
      </motion.button>
    </div>
  );
}

export interface VocabularyDeckProps {
  open: boolean;
  onClose: () => void;
  /** Limit to one book; omit for every saved word. */
  filePath?: string;
  /** Shown in the subtitle, e.g. the book title. */
  scopeLabel?: string;
}

export function VocabularyDeck({ open, onClose, filePath, scopeLabel }: VocabularyDeckProps) {
  const reduce = useReducedMotion();
  const deck = useVocabDeck(filePath, open);
  const [view, setView] = React.useState<"review" | "words">("review");
  const [queue, setQueue] = React.useState<Turn[] | null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [done, setDone] = React.useState(0);
  const [now, setNow] = React.useState(0);

  React.useEffect(() => {
    if (!open) {
      setQueue(null);
      setRevealed(false);
      setDone(0);
    } else setNow(Date.now());
  }, [open]);

  const turn = queue?.[0];
  const card = turn ? deck.items.find((i) => i.id === turn.id) : undefined;

  const startSession = React.useCallback(() => {
    setQueue(deck.due.map((d) => ({ id: d.id, drill: false })));
    setDone(0);
    setRevealed(false);
    setNow(Date.now());
  }, [deck.due]);

  const grade = React.useCallback(async (g: SrsGrade) => {
    if (!card || !turn || !queue) return;
    let rest = queue.slice(1);
    if (!turn.drill) await deck.review(card.id, g);
    // SM-2: anything below "good" comes back at the end of this session (once rescheduled).
    if (g === "again" || g === "hard") rest = [...rest, { id: card.id, drill: true }];
    setQueue(rest);
    setDone((d) => d + 1);
    setRevealed(false);
  }, [card, turn, queue, deck]);

  // Keyboard: Space reveals, 1–4 grade.
  React.useEffect(() => {
    if (!open || view !== "review" || !card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        void grade(SRS_GRADES[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, view, card, revealed, grade]);

  const previews = card && !turn?.drill ? previewIntervals(card.srs, now || Date.now()) : null;
  const total = queue ? done + queue.length : 0;
  const subtitle = `${deck.stats.due} due · ${deck.stats.total} ${deck.stats.total === 1 ? "word" : "words"}${scopeLabel ? ` · ${scopeLabel}` : ""}`;

  return (
    <GlassModal open={open} onClose={onClose} title="Vocabulary" subtitle={subtitle} width={520}>
      <GlassModal.Body className="pt-1">
        <SegmentedControl
          size="sm"
          className="mb-4"
          value={view}
          onValueChange={setView}
          options={[
            { value: "review", label: "Review", badge: deck.stats.due || undefined },
            { value: "words", label: "All words" },
          ]}
        />

        {view === "review" ? (
          card && queue ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-2xs tabular-nums text-label-tertiary">
                <div className="h-1 flex-1 overflow-hidden rounded-xs bg-fill-tertiary">
                  <motion.div
                    className="h-full rounded-xs bg-brand"
                    initial={false}
                    animate={{ width: `${total ? (done / total) * 100 : 0}%` }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
                  />
                </div>
                <span>{done} / {total}{turn?.drill ? " · repeat" : ""}</span>
              </div>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={`${card.id}:${done}`}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40, rotate: 2 }}
                  animate={{ opacity: 1, x: 0, rotate: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -40, rotate: -2 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                  <Flashcard item={card} revealed={revealed} onReveal={() => setRevealed(true)} />
                </motion.div>
              </AnimatePresence>
              <div className="h-12">
                {revealed ? (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="grid grid-cols-4 gap-2"
                    role="group"
                    aria-label="How well did you remember?"
                  >
                    {SRS_GRADES.map((g, i) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => void grade(g)}
                        aria-keyshortcuts={String(i + 1)}
                        className={cn(
                          "focus-ring pressable flex h-12 flex-col items-center justify-center rounded-lg text-xs font-medium transition-colors duration-150",
                          g === "again" && "bg-danger/12 text-danger hover:bg-danger/20",
                          g === "hard" && "bg-fill-tertiary text-label hover:bg-fill-secondary",
                          g === "good" && "bg-brand text-brand-fg shadow-[0_0_20px_-8px_var(--accent-brand)]",
                          g === "easy" && "bg-success/15 text-success hover:bg-success/22",
                        )}
                      >
                        {GRADE_LABEL[g]}
                        <span className="text-2xs tabular-nums opacity-75">{previews ? formatInterval(previews[g]) : "repeat"}</span>
                      </button>
                    ))}
                  </motion.div>
                ) : (
                  <Button variant="secondary" className="h-12 w-full" onClick={() => setRevealed(true)}>Show answer</Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className={cn("flex size-12 items-center justify-center rounded-full", queue ? "bg-success/15 text-success" : "bg-fill-tertiary text-label-tertiary")}
              >
                {queue ? <Check className="size-5" strokeWidth={2.25} /> : <BookOpen className="size-5" />}
              </motion.div>
              <div className="space-y-1">
                <p className="text-title font-display text-label">
                  {queue ? "All caught up" : deck.stats.total === 0 ? "No words yet" : deck.due.length ? `${deck.due.length} ${deck.due.length === 1 ? "word is" : "words are"} due` : "Nothing due right now"}
                </p>
                <p className="text-xs text-label-secondary">
                  {deck.stats.total === 0
                    ? "Select a word while reading and choose Define → Save word."
                    : queue
                      ? `You reviewed ${done} ${done === 1 ? "card" : "cards"}.`
                      : "Come back later; cards return on their SM-2 schedule."}
                </p>
              </div>
              {deck.due.length > 0 && <Button onClick={startSession}>{queue ? "Review again" : "Start review"}</Button>}
            </div>
          )
        ) : deck.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-label-tertiary">No saved words yet.</p>
        ) : (
          <ul className="divide-y divide-separator overflow-hidden rounded-lg bg-fill-quaternary hairline">
            {deck.items.map((it, i) => {
              const due = it.srs.dueAt <= now;
              return (
                <motion.li
                  key={it.id}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.025, duration: 0.2 }}
                  className="group flex min-h-11 items-center gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-headline text-label">{it.term}</span>
                      {it.translation && <span className="truncate text-xs text-brand">{it.translation}</span>}
                    </div>
                    {it.definition && <p className="truncate text-xs text-label-secondary">{it.definition}</p>}
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-2xs tabular-nums", due ? "bg-brand/15 text-brand" : "bg-fill-tertiary text-label-tertiary")}>
                    {due ? "Due" : formatInterval(Math.max(1, Math.round((it.srs.dueAt - now) / 86_400_000)))}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${it.term}`}
                    onClick={() => void deck.remove(it.id)}
                    className="focus-ring inline-flex size-7 shrink-0 items-center justify-center rounded-full text-label-tertiary opacity-0 transition-[opacity,colors] duration-150 group-hover:opacity-100 hover:bg-danger/15 hover:text-danger focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </GlassModal.Body>
    </GlassModal>
  );
}

export default VocabularyDeck;
