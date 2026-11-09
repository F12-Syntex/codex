"use client";

/**
 * RecapSheet — "Previously on…" (F1, owner WS-B).
 *
 * Mounted once per reader window (Phase 2c, behind the `recapOnReopen` pref). It asks main whether
 * a recap is due (`knowledge:recapStatus`: reopened after > 8 h, or ≥ 3 chapters since the last
 * recap) and, if so, opens a centred `GlassModal` and generates the recap (`book.recap`,
 * Interactive, cached per frontier). It can also be opened on demand (`open`).
 *
 *   <RecapSheet filePath={fp} bookTitle={title} onEntityClick={(id, rect) => openCard(id, rect)} />
 *
 * Nothing after the frontier is ever shown: the task only receives summaries, excerpts and
 * entities ≤ frontier. AI text passes through the display lexicon.
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { RotateCw } from "lucide-react";
import { applyLexiconText } from "@shared/pipeline/lexicon";
import { GlassModal } from "@/components/ui/glass-modal";
import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { chapters as chaptersBridge } from "@/lib/ai/bridge";
import { useLexicon } from "@/lib/book/lexicon";
import { useEntityIndex, useRecap } from "@/lib/knowledge/useKnowledge";
import { entityColor } from "./EntityCard";

export interface RecapSheetProps {
  filePath: string;
  bookTitle?: string;
  /** Controlled open (e.g. from the reader menu / assistant quick action). When omitted the
   *  sheet opens by itself when a recap is due. */
  open?: boolean;
  onClose?: () => void;
  /** Character chip clicked: open the EntityCard there. */
  onEntityClick?: (entityId: string, rect: DOMRect) => void;
  /** Called after "Don't show for this book" (the pref is already saved). */
  onDisabled?: () => void;
}

export function RecapSheet({ filePath, bookTitle, open, onClose, onEntityClick, onDisabled }: RecapSheetProps) {
  const controlled = open !== undefined;
  const reduce = useReducedMotion();
  const recap = useRecap(filePath, { bookTitle });
  const [autoOpen, setAutoOpen] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const isOpen = controlled ? !!open : autoOpen && !dismissed;

  // Uncontrolled: open once when main says a recap is due.
  React.useEffect(() => {
    if (!controlled && recap.status?.due) setAutoOpen(true);
  }, [controlled, recap.status?.due]);

  // Generate when opened (cached in main, so reopening is instant).
  const { generate, recap: data, loading, error } = recap;
  React.useEffect(() => {
    if (isOpen && !data && !loading && !error) void generate();
  }, [isOpen, data, loading, error, generate]);

  const lex = useLexicon();
  const t = React.useCallback((s: string) => applyLexiconText(s, lex, "display"), [lex]);
  const { data: index } = useEntityIndex(isOpen ? filePath : null);
  const chips = React.useMemo(() => {
    const byId = new Map((index ?? []).map((e) => [e.id, e]));
    return (data?.entityIds ?? []).map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
  }, [index, data?.entityIds]);

  const close = React.useCallback(() => {
    recap.markSeen();
    setDismissed(true);
    onClose?.();
  }, [recap, onClose]);

  const disable = async () => {
    try {
      await chaptersBridge.setPrefs(filePath, { recapOnReopen: false });
    } catch { /* pref service unavailable: still close */ }
    close();
    onDisabled?.();
  };

  const from = data?.fromLabel ?? recap.status?.fromLabel;
  const to = data?.toLabel ?? recap.status?.toLabel;
  const subtitle = from && to ? (from === to ? `Chapter ${to}` : `Chapters ${from}–${to}`) : undefined;
  const empty = data && data.bullets.length === 0;

  return (
    <GlassModal open={isOpen} onClose={close} title="Previously on…" subtitle={subtitle} width={480} className="grain">
      <GlassModal.Body className="space-y-4">
        {loading && !data && <RecapSkeleton />}

        {error && !loading && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-fill-quaternary p-3">
            <p className="text-sm text-label-secondary">{error.message || "The recap could not be generated."}</p>
            <Button size="sm" variant="secondary" onClick={() => void generate()}>
              <RotateCw strokeWidth={1.75} />
              Retry
            </Button>
          </div>
        )}

        {empty && <p className="text-sm text-label-secondary">You haven’t finished a chapter yet — nothing to recap.</p>}

        {data && !empty && (
          <>
            <ul className="space-y-2">
              {data.bullets.map((b, i) => (
                <motion.li
                  key={i}
                  className="flex gap-2.5 text-sm leading-relaxed text-label"
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduce ? 0 : i * 0.03, type: "spring", stiffness: 400, damping: 32 }}
                >
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                  <span>{t(b)}</span>
                </motion.li>
              ))}
            </ul>

            {(data.leftOff || data.leftOffQuote) && (
              <section className="space-y-1.5">
                <h3 className="text-headline text-label">Where we left off</h3>
                {data.leftOff && <p className="text-sm text-label-secondary">{t(data.leftOff)}</p>}
                {data.leftOffQuote && (
                  <blockquote className="rounded-lg bg-fill-quaternary p-3 font-display text-sm leading-relaxed text-label-secondary italic">
                    “{t(data.leftOffQuote)}”
                  </blockquote>
                )}
              </section>
            )}

            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    disabled={!onEntityClick}
                    onClick={(ev) => onEntityClick?.(e.id, ev.currentTarget.getBoundingClientRect())}
                    className="focus-ring pressable inline-flex h-7 items-center gap-1.5 rounded-full bg-fill-tertiary px-2.5 text-xs font-medium text-label enabled:hover:bg-fill-secondary"
                  >
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: entityColor(e.color) }} />
                    {t(e.name)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </GlassModal.Body>

      <GlassModal.Footer className="justify-between">
        <Button variant="ghost" size="sm" onClick={() => void disable()}>
          Don’t show for this book
        </Button>
        <Button onClick={close}>Continue reading</Button>
      </GlassModal.Footer>
    </GlassModal>
  );
}

function RecapSkeleton() {
  return (
    <div aria-busy className="space-y-3">
      <ShimmerText className="text-sm">Catching you up…</ShimmerText>
      {[92, 78, 85, 64].map((w) => (
        <div key={w} className="h-3 rounded-xs bg-fill-quaternary" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export default RecapSheet;
