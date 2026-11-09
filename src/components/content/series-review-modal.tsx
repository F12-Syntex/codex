"use client";

/**
 * "Detect series" review sheet (AI_AUDIT §6 F5). Suggestions come from main
 * (`library:series:detect`: filename/title rules first, AI tags for the gaps); nothing is grouped
 * until the user confirms. Unchecked groups are left alone; "Not a series" remembers the decision
 * so the same group is not proposed again.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Library, Loader2, Sparkles, X } from "lucide-react";
import type { SeriesSuggestion } from "@shared/library/types";
import { GlassModal } from "@/components/ui/glass-modal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { hasRpc } from "@/lib/ai/rpc";
import { libraryAI } from "@/lib/library/bridge";
import type { MockItem } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { SPINE_STYLE } from "./book-card";

interface SeriesReviewModalProps {
  open: boolean;
  onClose: () => void;
  /** Books on the current shelf (detection scope). */
  items: MockItem[];
  /** Every library item, so volumes on other shelves still show their covers. */
  library?: MockItem[];
  /** Called after groups were applied (e.g. switch the grid to the Series view). */
  onApplied?: (count: number) => void;
}

function Thumb({ item, i }: { item: MockItem | undefined; i: number }) {
  return (
    <span
      className="relative -ml-3 inline-block aspect-[2/3] w-7 shrink-0 overflow-hidden rounded-xs bg-fill-tertiary shadow-xs first:ml-0"
      style={{ zIndex: 10 - i }}
    >
      {item?.cover ? (
        <img src={item.cover} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="absolute inset-0" style={{ background: item?.gradient }} />
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={SPINE_STYLE} />
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xs hairline" />
    </span>
  );
}

export function SeriesReviewModal({ open, onClose, items, library, onApplied }: SeriesReviewModalProps) {
  const [suggestions, setSuggestions] = useState<SeriesSuggestion[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byPath = useMemo(
    () => new Map([...(library ?? []), ...items].map((i) => [i.filePath, i])),
    [items, library],
  );
  const scope = useMemo(() => items.map((i) => i.filePath), [items]);

  useEffect(() => {
    if (!open) return;
    setSuggestions(null);
    setDismissed(new Set());
    setError(null);
    if (!hasRpc()) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    libraryAI
      .detectSeries(scope)
      .then((s) => {
        if (!alive) return;
        setSuggestions(s);
        setChecked(new Set(s.map((g) => g.key)));
      })
      .catch((e) => {
        if (!alive) return;
        setSuggestions([]);
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [open, scope]);

  const visible = (suggestions ?? []).filter((g) => !dismissed.has(g.key));
  const selected = visible.filter((g) => checked.has(g.key));

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const apply = async () => {
    const rejected = (suggestions ?? []).filter((g) => dismissed.has(g.key));
    const assignments = [
      ...selected.flatMap((g) => g.volumes.map((v) => ({ filePath: v.filePath, name: g.name, number: v.number }))),
      ...rejected.flatMap((g) => g.volumes.map((v) => ({ filePath: v.filePath, name: g.name, status: "dismissed" as const }))),
    ];
    if (assignments.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await libraryAI.applySeries(assignments);
      onApplied?.(selected.length);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      width={560}
      title="Detect series"
      subtitle="Volumes found by their titles and file names. Nothing changes until you group them."
      className="grain"
    >
      <GlassModal.Body className="max-h-[60vh] overflow-y-auto px-5 pt-1 pb-4">
        {suggestions === null ? (
          <div className="flex h-32 items-center justify-center gap-2 text-sm text-label-secondary">
            <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
            Looking for volumes…
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Library strokeWidth={1.5} />}
            title="No new series found"
            description="Name volumes like “Title Vol. 2” or run “Suggest genres & tags” so AI can spot series in other titles."
          />
        ) : (
          <ul className="overflow-hidden rounded-lg bg-fill-quaternary hairline [&>li+li]:border-t [&>li+li]:border-separator">
            {visible.map((g) => {
              const on = checked.has(g.key);
              const numbers = g.volumes.map((v) => v.number).filter((n): n is number => n !== null);
              return (
                <li key={g.key} className="group/row flex min-h-14 items-center gap-3 px-3 py-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`Group ${g.name}`}
                    onClick={() => toggle(g.key)}
                    className={cn(
                      "focus-ring flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
                      on ? "bg-brand text-brand-fg" : "shadow-[inset_0_0_0_1.5px_var(--separator-strong)]",
                    )}
                  >
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </button>
                  {/* Fixed slot (two fanned thumbs), so every group's text starts at one x. */}
                  <span className="flex w-11 shrink-0 items-center">
                    {g.volumes.slice(0, 2).map((v, i) => <Thumb key={v.filePath} item={byPath.get(v.filePath)} i={i} />)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-headline text-label">
                      {g.name}
                      {g.source === "ai" && <Sparkles className="size-3.5 shrink-0 text-brand" strokeWidth={1.75} aria-label="Suggested by AI" />}
                    </p>
                    <p className="truncate text-xs text-label-secondary tabular-nums">
                      {g.volumes.length} {g.volumes.length === 1 ? "volume" : "volumes"}
                      {numbers.length > 0 && ` · Vol. ${numbers.join(", ")}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDismissed((prev) => new Set(prev).add(g.key))}
                    title="Not a series"
                    aria-label={`${g.name} is not a series`}
                    className="focus-ring pressable inline-flex size-7 shrink-0 items-center justify-center rounded-full text-label-tertiary opacity-0 transition-opacity duration-150 hover:bg-fill-tertiary hover:text-label focus-visible:opacity-100 group-hover/row:opacity-100"
                  >
                    <X className="size-3.5" strokeWidth={2} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
      </GlassModal.Body>
      <GlassModal.Footer className="px-5 py-3.5">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={apply} disabled={busy || suggestions === null || (selected.length === 0 && dismissed.size === 0)}>
          {busy && <Loader2 className="animate-spin" strokeWidth={1.75} />}
          {selected.length > 0 ? `Group ${selected.length} series` : "Save"}
        </Button>
      </GlassModal.Footer>
    </GlassModal>
  );
}
