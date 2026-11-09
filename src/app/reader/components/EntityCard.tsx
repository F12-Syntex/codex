"use client";

/**
 * EntityCard — the spoiler-safe "Who's this?" card (F2, owner WS-B).
 *
 * A `glass-thick rounded-xl p-3 w-72` popover anchored to the clicked word. Known entities come
 * from `knowledge:entity` at the frontier (instant, no AI call): name, type, the "as of chapter N"
 * description, status, up to three relationships and first/last seen. Names that are not in the
 * wiki (`name` without `entityId`) run the `entity.lookup` task over passages ≤ frontier and offer
 * "Add to wiki". Replaces the leaky `WikiTooltip` popover and `EntityContextMenu` (Phase 2c).
 *
 *   <EntityCard filePath={fp} entityId={id} frontier={frontier} anchorRect={rect}
 *               onAsk={…} onSimulate={…} onClose={close} />
 *
 * AI/wiki text passes through the display lexicon (AI_AUDIT §4.5 contracts).
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookOpen, GitBranch, MessageCircle, Plus, X } from "lucide-react";
import type { EntitySnapshot, Frontier, WikiEntryType } from "@shared/knowledge/types";
import { applyLexiconText } from "@shared/pipeline/lexicon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { useLexicon } from "@/lib/book/lexicon";
import { knowledge } from "@/lib/knowledge/bridge";
import { useEntity, useEntityLookup } from "@/lib/knowledge/useKnowledge";
import { cn } from "@/lib/utils";

/** Wiki colour names → system colour tokens (same mapping as the reader's entity highlights). */
export const ENTITY_COLOR_VAR: Record<string, string> = {
  blue: "var(--system-blue)",
  amber: "var(--system-orange)",
  emerald: "var(--system-green)",
  rose: "var(--system-pink)",
  violet: "var(--system-purple)",
};

export const entityColor = (color?: string) => ENTITY_COLOR_VAR[color ?? ""] ?? "var(--system-blue)";

const TYPE_LABEL: Record<WikiEntryType, string> = {
  character: "Character",
  item: "Item",
  location: "Place",
  event: "Event",
  concept: "Concept",
};

export interface EntityCardProps {
  filePath: string;
  /** Known wiki entry. Omit (null) and pass `name` for the "not in the wiki" lookup. */
  entityId: string | null;
  /** Name for unknown-entity lookup (selection "Who's this?"). */
  name?: string;
  /** Default: the book's frontier. */
  frontier?: Frontier | null;
  /** Viewport rect of the clicked word / selection. */
  anchorRect: { top: number; left: number; bottom: number; right: number; width?: number; height?: number } | DOMRect;
  bookTitle?: string;
  /** Label for a 0-based chapter index (default "Ch. <n+1>"). */
  chapterLabel?: (chapterIndex: number) => string;
  onAsk?: (entity: { id: string | null; name: string }) => void;
  onSimulate?: (entity: { id: string; name: string }) => void;
  /** Default: opens the wiki window at this entry. */
  onOpenWiki?: (entityId: string) => void;
  /** Open another entity (relationship chips). */
  onOpenEntity?: (entityId: string) => void;
  onClose: () => void;
}

const CARD_W = 288; // w-72
const GAP = 8;

function usePlacement(anchor: EntityCardProps["anchorRect"], ref: React.RefObject<HTMLDivElement | null>) {
  const [pos, setPos] = React.useState<{ top: number; left: number; above: boolean } | null>(null);
  React.useLayoutEffect(() => {
    const place = () => {
      const h = ref.current?.offsetHeight ?? 220;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const center = (anchor.left + anchor.right) / 2;
      const left = Math.min(Math.max(12, center - CARD_W / 2), vw - CARD_W - 12);
      const below = anchor.bottom + GAP;
      const above = below + h > vh - 12 && anchor.top - GAP - h > 12;
      setPos({ top: above ? anchor.top - GAP - h : Math.min(below, vh - h - 12), left, above });
    };
    place();
    const ro = typeof ResizeObserver !== "undefined" && ref.current ? new ResizeObserver(place) : null;
    if (ro && ref.current) ro.observe(ref.current);
    window.addEventListener("resize", place);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchor.top, anchor.left, anchor.bottom, anchor.right, ref]);
  return pos;
}

export function EntityCard({
  filePath, entityId, name, frontier, anchorRect, bookTitle, chapterLabel, onAsk, onSimulate, onOpenWiki, onOpenEntity, onClose,
}: EntityCardProps) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const pos = usePlacement(anchorRect, ref);
  const lex = useLexicon();
  const t = React.useCallback((s: string) => applyLexiconText(s, lex, "display"), [lex]);
  const label = chapterLabel ?? ((i: number) => `Ch. ${i + 1}`);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const { data: entity, loading } = useEntity(filePath, entityId, frontier);
  const lookup = useEntityLookup(entityId ? null : filePath);
  const lookupName = name?.trim() ?? "";
  React.useEffect(() => {
    if (!entityId && lookupName) void lookup.lookup(lookupName, frontier ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, lookupName, frontier?.chapterIndex, frontier?.paraId, frontier?.mode]);

  // Esc and outside clicks close (the card is not modal).
  React.useEffect(() => {
    // Capture phase + preventDefault: the reader's own Esc chain bails on defaultPrevented.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  const openWiki = (id: string) => {
    if (onOpenWiki) onOpenWiki(id);
    else void window.electronAPI?.openWiki?.({ filePath, title: bookTitle ?? "", entryId: id });
  };

  const [added, setAdded] = React.useState<string | null>(null);
  const addToWiki = async () => {
    const r = lookup.result;
    if (!r) return;
    const first = r.refChapters.length ? Math.min(...r.refChapters) : Math.max(0, frontier?.chapterIndex ?? 0);
    const res = await knowledge.applyEdits(filePath, [
      { op: "create", entry: { name: r.name, type: r.type, shortDescription: r.description, firstAppearance: first } },
    ]);
    if (res.applied) setAdded(r.name);
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={ref}
        role="dialog"
        aria-label={entity?.name ?? lookupName ?? "Entity"}
        className="glass-thick fixed z-[90] w-72 rounded-xl p-3 text-label"
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: pos?.above ? 4 : -4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }}
      >
        {entityId ? (
          loading && !entity ? (
            <CardSkeleton />
          ) : entity ? (
            <KnownEntity entity={entity} t={t} label={label} onOpenEntity={onOpenEntity} />
          ) : (
            <p className="py-1 text-sm text-label-secondary">Nothing about this has come up yet.</p>
          )
        ) : (
          <UnknownEntity name={lookupName} state={lookup} t={t} label={label} added={added} />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {onAsk && (entity || lookupName) && (
            <Button size="sm" variant="secondary" onClick={() => onAsk({ id: entity?.id ?? null, name: entity?.name ?? lookupName })}>
              <MessageCircle strokeWidth={1.75} />
              Ask about…
            </Button>
          )}
          {entity && (
            <Button size="sm" variant="secondary" onClick={() => openWiki(entity.id)}>
              <BookOpen strokeWidth={1.75} />
              Open in Wiki
            </Button>
          )}
          {entity && onSimulate && entity.type === "character" && (
            <Button size="sm" variant="ghost" onClick={() => onSimulate({ id: entity.id, name: entity.name })}>
              <GitBranch strokeWidth={1.75} />
              Simulate…
            </Button>
          )}
          {!entityId && lookup.result && lookup.result.confidence > 0 && !added && (
            <Button size="sm" variant="secondary" onClick={() => void addToWiki()}>
              <Plus strokeWidth={1.75} />
              Add to wiki
            </Button>
          )}
        </div>

        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="focus-ring pressable absolute top-2.5 right-2.5 inline-flex size-6 items-center justify-center rounded-full text-label-tertiary hover:bg-fill-tertiary hover:text-label"
        >
          <X className="size-3" strokeWidth={2} />
        </button>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function KnownEntity({
  entity, t, label, onOpenEntity,
}: { entity: EntitySnapshot; t: (s: string) => string; label: (i: number) => string; onOpenEntity?: (id: string) => void }) {
  const rels = entity.relationships.slice(0, 3);
  const status = entity.status && entity.status !== "active" ? entity.status : null;
  return (
    <>
      <div className="flex items-center gap-2 pr-6">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entityColor(entity.color) }} />
        <h3 className="min-w-0 truncate text-headline">{t(entity.name)}</h3>
        <Badge className="ml-auto shrink-0">{TYPE_LABEL[entity.type] ?? entity.type}</Badge>
      </div>
      {entity.aliases.length > 0 && (
        <p className="mt-0.5 truncate text-xs text-label-tertiary">aka {entity.aliases.slice(0, 3).map(t).join(", ")}</p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-label-secondary">
        {entity.shortDescription ? t(entity.shortDescription) : "No description yet."}
      </p>
      {(status || entity.significance >= 3) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {status && <Badge variant={status === "deceased" || status === "destroyed" ? "danger" : "warning"} className="capitalize">{status}</Badge>}
          {entity.significance >= 4 ? <Badge variant="accent">Main character</Badge> : entity.significance >= 3 ? <Badge variant="accent">Major</Badge> : null}
        </div>
      )}
      {rels.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {rels.map((r) => (
            <button
              key={`${r.targetId}:${r.relation}`}
              type="button"
              disabled={!onOpenEntity}
              onClick={() => onOpenEntity?.(r.targetId)}
              className="focus-ring pressable inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-fill-tertiary px-2.5 text-2xs text-label-secondary enabled:hover:bg-fill-secondary enabled:hover:text-label"
            >
              <span className="text-label-tertiary">{r.relation}</span>
              <span className="truncate font-medium">{t(r.targetName)}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-2.5 text-2xs text-label-tertiary tabular-nums">
        First seen {label(entity.firstAppearance)}
        {entity.lastSeen !== entity.firstAppearance && <> · last seen {label(entity.lastSeen)}</>}
      </p>
    </>
  );
}

function UnknownEntity({
  name, state, t, label, added,
}: {
  name: string;
  state: ReturnType<typeof useEntityLookup>;
  t: (s: string) => string;
  label: (i: number) => string;
  added: string | null;
}) {
  return (
    <>
      <div className="flex items-center gap-2 pr-6">
        <h3 className="min-w-0 truncate text-headline">{t(state.result?.name ?? name)}</h3>
        {state.result && state.result.confidence > 0 && <Badge className="ml-auto shrink-0">{TYPE_LABEL[state.result.type]}</Badge>}
      </div>
      <p className="mt-0.5 text-2xs text-label-tertiary">Not in the wiki yet</p>
      {state.loading && (
        <p className="mt-2 text-sm">
          <ShimmerText>Looking through what you’ve read…</ShimmerText>
        </p>
      )}
      {state.error && <p className="mt-2 text-sm text-danger">{state.error.message}</p>}
      {state.result && (
        <>
          <p className={cn("mt-2 text-sm leading-relaxed", state.result.confidence > 0 ? "text-label-secondary" : "text-label-tertiary")}>
            {t(state.result.description)}
          </p>
          {state.result.refChapters.length > 0 && (
            <p className="mt-2 text-2xs text-label-tertiary tabular-nums">
              Mentioned in {[...new Set(state.result.refChapters)].sort((a, b) => a - b).map(label).join(", ")}
            </p>
          )}
        </>
      )}
      {added && <p className="mt-2 text-xs text-success">Added “{t(added)}” to the wiki.</p>}
    </>
  );
}

function CardSkeleton() {
  return (
    <div aria-busy className="space-y-2 py-0.5 pr-6">
      <div className="h-4 w-1/2 rounded-xs bg-fill-tertiary" />
      <div className="h-3 w-full rounded-xs bg-fill-quaternary" />
      <div className="h-3 w-4/5 rounded-xs bg-fill-quaternary" />
    </div>
  );
}

export default EntityCard;
