"use client";

/**
 * DefinePopover — in-place Define / Translate for a selected word (AI_AUDIT §6 F4), replacing the
 * "open Wiktionary in the browser" action. `glass-menu rounded-xl p-3 w-80` anchored to the
 * selection; Define | Translate segmented control; "Save word" adds it to the vocabulary deck.
 * Proper nouns from the story are handed to "Who's this?" instead.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookmarkPlus, Check, UserRound, Volume2 } from "lucide-react";
import type { ParaRef } from "@shared/pipeline/types";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDefineLookup } from "@/lib/assistant/useVocab";
import { vocab } from "@/lib/assistant/bridge";

const WIDTH = 320;
const GAP = 8;

export interface DefinePopoverProps {
  term: string;
  /** The sentence the term is in (no text after the selection's paragraph). */
  sentence: string;
  anchorRect: { x: number; y: number; width: number; height: number };
  filePath?: string;
  bookTitle?: string;
  ref?: ParaRef;
  /** BCP-47; default from AI settings in main. */
  targetLanguage?: string;
  initialTab?: "define" | "translate";
  onClose: () => void;
  /** Route proper nouns to the "Who's this?" card. */
  onWhoIs?: (name: string) => void;
}

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* unsupported */ }
}

export function DefinePopover({
  term, sentence, anchorRect, filePath, bookTitle, ref, targetLanguage, initialTab = "define", onClose, onWhoIs,
}: DefinePopoverProps) {
  const reduce = useReducedMotion();
  const [tab, setTab] = React.useState<"define" | "translate">(initialTab);
  const [saved, setSaved] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const panel = React.useRef<HTMLDivElement>(null);
  const look = useDefineLookup({ term, sentence, bookTitle, filePath, targetLanguage });

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    if (tab === "define" && look.define.status === "idle") look.runDefine();
    if (tab === "translate" && look.translate.status === "idle") look.runTranslate();
  }, [tab, look]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  // Below the selection, flipped above when there is no room; clamped to the viewport.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.max(12, Math.min(anchorRect.x + anchorRect.width / 2 - WIDTH / 2, vw - WIDTH - 12));
  const below = anchorRect.y + anchorRect.height + GAP;
  const above = vh - anchorRect.y + GAP;
  const placeAbove = below + 280 > vh && anchorRect.y > 300;

  const def = look.define.status === "done" ? look.define.value : null;
  const tr = look.translate.status === "done" ? look.translate.value : null;

  const save = async () => {
    await vocab.add({
      ...(filePath ? { filePath } : {}),
      ...(ref ? { ref } : {}),
      term,
      context: sentence,
      ...(def ? { lemma: def.lemma, definition: def.inContext || def.general } : {}),
      ...(def?.translation ? { translation: def.translation.text } : tr ? { translation: tr.text } : {}),
    });
    setSaved(true);
  };

  if (!mounted) return null;
  return createPortal(
    <motion.div
      ref={panel}
      role="dialog"
      aria-label={`Define ${term}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: placeAbove ? 6 : -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 460, damping: 32 }}
      style={{ position: "fixed", left, width: WIDTH, ...(placeAbove ? { bottom: above } : { top: below }), transformOrigin: placeAbove ? "bottom center" : "top center" }}
      className="glass-menu z-[110] rounded-xl p-3 text-label"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-display text-lg font-semibold">{def?.lemma ?? term}</span>
            {def?.pos && <span className="shrink-0 text-xs text-label-tertiary italic">{def.pos}</span>}
          </div>
          {def?.ipa && <span className="text-xs text-label-tertiary">{def.ipa}</span>}
        </div>
        <button
          type="button"
          aria-label="Pronounce"
          onClick={() => speak(def?.lemma ?? term)}
          className="focus-ring inline-flex size-7 shrink-0 items-center justify-center rounded-full text-label-tertiary hover:bg-fill-tertiary hover:text-label"
        >
          <Volume2 className="size-4" />
        </button>
      </div>

      <SegmentedControl
        size="sm"
        fill
        className="mt-2.5"
        value={tab}
        onValueChange={setTab}
        options={[{ value: "define", label: "Define" }, { value: "translate", label: "Translate" }]}
      />

      <div className="mt-3 min-h-16">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {tab === "define" ? (
              look.define.status === "loading" || look.define.status === "idle" ? (
                <ShimmerText className="text-sm">Looking it up…</ShimmerText>
              ) : look.define.status === "error" ? (
                <p className="text-xs text-danger">{look.define.error.message}</p>
              ) : def?.properNoun ? (
                <div className="space-y-2">
                  <p className="text-sm text-label-secondary">“{term}” looks like a name from the story.</p>
                  {onWhoIs && (
                    <Button size="sm" variant="secondary" onClick={() => onWhoIs(term)}>
                      <UserRound /> Who&apos;s this?
                    </Button>
                  )}
                </div>
              ) : def ? (
                <div className="space-y-2">
                  <p className="border-l-2 border-brand/50 pl-2.5 text-sm leading-relaxed">{def.inContext}</p>
                  {def.general && def.general !== def.inContext && (
                    <p className="text-xs leading-relaxed text-label-secondary">{def.general}</p>
                  )}
                  {def.example && <p className="font-display text-xs text-label-tertiary italic">“{def.example}”</p>}
                  {def.translation && (
                    <p className="text-xs text-label-secondary">
                      <span className="text-label-tertiary uppercase">{def.translation.lang}</span> · {def.translation.text}
                    </p>
                  )}
                </div>
              ) : null
            ) : look.translate.status === "loading" || look.translate.status === "idle" ? (
              <ShimmerText className="text-sm">Translating…</ShimmerText>
            ) : look.translate.status === "error" ? (
              <p className="text-xs text-danger">{look.translate.error.message}</p>
            ) : tr ? (
              <div className="space-y-1.5">
                <p className="font-display text-base leading-snug">{tr.text}</p>
                <p className="text-2xs text-label-tertiary uppercase">
                  {tr.sourceLang ? `${tr.sourceLang} → ` : ""}{tr.lang}
                </p>
                {tr.note && <p className="text-xs leading-relaxed text-label-secondary">{tr.note}</p>}
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-end">
        <Button size="sm" variant={saved ? "ghost" : "secondary"} disabled={saved || !!def?.properNoun} onClick={() => void save()} className={cn(saved && "text-success")}>
          {saved ? <Check strokeWidth={2.25} /> : <BookmarkPlus />}
          {saved ? "Saved to Words" : "Save word"}
        </Button>
      </div>
    </motion.div>,
    document.body,
  );
}

export default DefinePopover;
