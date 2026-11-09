"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Loader2, RefreshCw, BarChart3, Tag, MessageCircle, Package,
  Monitor, Wand2, ArrowUp, Plus, Layers, Sparkles, BookOpen, Paintbrush,
} from "lucide-react";
import { WindowChrome, WindowShell } from "@/components/ui/window-chrome";
import { SearchField } from "@/components/ui/search-field";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { cn } from "@/lib/utils";
import type { StyleDictionary, StyleRule } from "@shared/ai/types";
import { ai, style } from "@/lib/ai/bridge";
import { onAIEvent } from "@/lib/ai/events";
import { hasRpc } from "@/lib/ai/rpc";
import { AI_FORMATTING_STYLES } from "@/lib/ai-formatting-css";

interface StyleDictionaryViewProps {
  filePath: string;
  bookTitle: string;
}

const CATEGORY_META: Record<string, { icon: React.ReactNode; label: string }> = {
  stat: { icon: <BarChart3 strokeWidth={1.75} />, label: "Stats" },
  badge: { icon: <Tag strokeWidth={1.75} />, label: "Badges" },
  dialogue: { icon: <MessageCircle strokeWidth={1.75} />, label: "Dialogue" },
  item: { icon: <Package strokeWidth={1.75} />, label: "Items" },
  system: { icon: <Monitor strokeWidth={1.75} />, label: "System" },
  effect: { icon: <Wand2 strokeWidth={1.75} />, label: "Effects" },
};

const DEFAULT_CATEGORY_META = { icon: <Wand2 strokeWidth={1.75} />, label: "Other" };

function getCategoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? { ...DEFAULT_CATEGORY_META, label: cat.charAt(0).toUpperCase() + cat.slice(1) };
}

export function StyleDictionaryView({ filePath, bookTitle }: StyleDictionaryViewProps) {
  const [dictionary, setDictionary] = useState<StyleDictionary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [regeneratingRule, setRegeneratingRule] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const reduceMotion = useReducedMotion();

  const [regenError, setRegenError] = useState<string | null>(null);

  // The dictionary lives in main (`book_style`), merged by every format job of this book.
  const reload = useCallback(async () => {
    if (!filePath || !hasRpc()) {
      setIsLoading(false);
      return;
    }
    try {
      setDictionary(await style.get(filePath));
    } catch {
      setDictionary(null);
    } finally {
      setIsLoading(false);
    }
  }, [filePath]);

  useEffect(() => { void reload(); }, [reload]);

  // New rules arrive whenever a chapter of this book is formatted (reader, bulk, regeneration).
  useEffect(() => {
    if (!filePath) return;
    return onAIEvent("artifact", (e) => {
      if (e.filePath === filePath && e.kind === "format") void reload();
    });
  }, [filePath, reload]);

  /**
   * Re-formats every paragraph that uses `componentClass` through the orchestrator
   * (`style:regenerate` → `style.regenerate` task). Updates land in each chapter's format
   * artifact (every variant: plain and concise-formatted), then the rule's example is refreshed.
   */
  const handleRegenerate = useCallback(async (componentClass: string, instruction?: string) => {
    if (!filePath || !hasRpc()) return;
    setRegeneratingRule(componentClass);
    setRegenError(null);
    try {
      const ticket = await style.regenerate(filePath, componentClass, instruction || undefined);
      const r = await ai.result(ticket.jobId);
      if (r.state === "error") setRegenError(r.error?.message ?? "Regeneration failed.");
      await reload();
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Regeneration failed.");
    } finally {
      setRegeneratingRule(null);
    }
  }, [filePath, reload]);

  // View-only: category list + text filter
  const grouped = useMemo(() => (dictionary?.rules ?? []).reduce<Record<string, StyleRule[]>>((acc, rule) => {
    if (!acc[rule.category]) acc[rule.category] = [];
    acc[rule.category].push(rule);
    return acc;
  }, {}), [dictionary]);
  const categories = Object.keys(grouped);

  const visibleGroups = useMemo(() => {
    const q = query.toLowerCase().trim();
    return categories
      .filter((cat) => activeCategory === "all" || cat === activeCategory)
      .map((cat) => ({
        cat,
        rules: grouped[cat].filter((r) => !q || r.pattern.toLowerCase().includes(q) || r.component.toLowerCase().includes(q)),
      }))
      .filter((g) => g.rules.length > 0);
  }, [categories, grouped, activeCategory, query]);

  const chrome = (
    <WindowChrome icon={<Paintbrush strokeWidth={1.75} />} title="Style Dictionary" subtitle={bookTitle} zoomKey="style-dictionary" zoom={zoom} onZoomChange={setZoom} />
  );

  if (isLoading) {
    return (
      <WindowShell>
        {chrome}
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="size-5 animate-spin text-label-tertiary" strokeWidth={1.75} />
          <ShimmerText className="text-sm">Reading the style dictionary…</ShimmerText>
        </div>
      </WindowShell>
    );
  }

  if (!dictionary || dictionary.rules.length === 0) {
    return (
      <WindowShell>
        {chrome}
        <div className="flex min-h-0 flex-1 overflow-y-auto" style={{ zoom: zoom / 100 }}>
          <div className="m-auto grid w-full max-w-5xl grid-cols-1 items-center gap-12 px-10 py-12 lg:grid-cols-[1fr_1.1fr]">
            {/* Copy */}
            <div className="animate-fade-up">
              <h1 className="text-large-title font-display text-label text-balance">A house style, learned from your book.</h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-label-secondary">
                When Codex formats chapters with AI, it remembers how each recurring element looks — status screens,
                system messages, dialogue — so every chapter of <span className="text-label">{bookTitle}</span> stays consistent.
              </p>
              <ListGroup className="mt-8 max-w-md">
                <ListRow icon={<BookOpen />} label="Format a chapter" description="Turn on AI formatting in the reader." />
                <ListRow icon={<Sparkles />} label="Codex learns the patterns" description="Each element becomes a reusable rule." />
                <ListRow icon={<RefreshCw />} label="Refine them here" description="Regenerate any rule with your own instructions." />
              </ListGroup>
            </div>

            {/* Specimen sheet */}
            <div className="relative h-80" aria-hidden>
              {[
                { rot: -6, x: "4%", y: "6%", delay: 0.1, w: "w-64" },
                { rot: 4, x: "34%", y: "0%", delay: 0.18, w: "w-60" },
                { rot: -1.5, x: "16%", y: "38%", delay: 0.26, w: "w-72" },
              ].map((card, i) => (
                <motion.div
                  key={i}
                  className={cn("grain absolute rounded-2xl bg-elevated p-4 shadow-lg hairline", card.w)}
                  style={{ left: card.x, top: card.y }}
                  initial={reduceMotion ? false : { opacity: 0, y: 24, rotate: 0 }}
                  animate={{ opacity: 1, y: 0, rotate: card.rot }}
                  transition={{ type: "spring", bounce: 0.3, duration: 0.8, delay: card.delay }}
                >
                  <div className="flex items-center justify-between">
                    <span className="h-2 w-20 rounded-full bg-fill-secondary" />
                    <span className="font-mono text-2xs text-label-quaternary">.{["status-window", "system-msg", "skill-card"][i]}</span>
                  </div>
                  <div className="mt-3 space-y-2 rounded-md bg-fill-quaternary p-3">
                    {i === 1 ? (
                      <div className="flex gap-1.5">
                        <span className="h-5 w-14 rounded-full bg-brand/25" />
                        <span className="h-5 w-10 rounded-full bg-fill-tertiary" />
                        <span className="h-5 w-12 rounded-full bg-fill-tertiary" />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between"><span className="h-1.5 w-12 rounded-full bg-label-quaternary" /><span className="h-1.5 w-6 rounded-full bg-brand/60" /></div>
                        <div className="flex items-center justify-between"><span className="h-1.5 w-16 rounded-full bg-label-quaternary" /><span className="h-1.5 w-8 rounded-full bg-brand/40" /></div>
                        <div className="flex items-center justify-between"><span className="h-1.5 w-10 rounded-full bg-label-quaternary" /><span className="h-1.5 w-5 rounded-full bg-brand/50" /></div>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </WindowShell>
    );
  }

  const sidebarItems = [
    { id: "all", label: "All rules", icon: <Layers strokeWidth={1.75} />, count: dictionary.rules.length },
    ...categories.map((cat) => ({ id: cat, label: getCategoryMeta(cat).label, icon: getCategoryMeta(cat).icon, count: grouped[cat].length })),
  ];

  return (
    <WindowShell>
      {chrome}

      {/* Inject AI formatting CSS so examples render correctly */}
      <style>{AI_FORMATTING_STYLES}</style>

      <div className="flex min-h-0 flex-1 gap-2 p-2" style={{ zoom: zoom / 100 }}>
        {/* Category source list */}
        <aside className="glass-thin grain relative flex w-60 shrink-0 flex-col overflow-hidden rounded-2xl animate-slide-in-left">
          <div className="p-2">
            <SearchField value={query} onChange={setQuery} placeholder="Filter rules" />
          </div>
          <div className="px-4.5 pt-2 pb-1.5 text-section">Categories</div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {sidebarItems.map((item) => {
              const active = activeCategory === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveCategory(item.id)}
                  className={cn(
                    "focus-ring relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors",
                    active ? "text-label" : "text-label-secondary hover:bg-fill-quaternary hover:text-label",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="style-dict-selection"
                      transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.45 }}
                      className="absolute inset-0 rounded-md bg-fill-secondary"
                    />
                  )}
                  <span className={cn("relative [&_svg]:size-4", active ? "text-brand" : "text-label-tertiary")}>{item.icon}</span>
                  <span className={cn("relative min-w-0 flex-1 truncate", active && "font-medium")}>{item.label}</span>
                  <span className="relative text-2xs tabular-nums text-label-secondary">{item.count}</span>
                </button>
              );
            })}
          </nav>
          <div className="flex h-9 shrink-0 items-center border-t border-separator px-4 text-2xs text-label-secondary">
            {dictionary.updatedAt && !isNaN(Date.parse(dictionary.updatedAt))
              ? `Updated ${new Date(dictionary.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : `${categories.length} ${categories.length === 1 ? "category" : "categories"}`}
          </div>
        </aside>

        {/* Rules */}
        <main className="min-w-0 flex-1 overflow-y-auto rounded-2xl">
          <div className="mx-auto w-full max-w-3xl px-8 pt-8 pb-16">
            <header className="mb-8">
              <h1 className="text-large-title font-display text-label">
                {activeCategory === "all" ? "Style Dictionary" : getCategoryMeta(activeCategory).label}
              </h1>
              <p className="mt-2 text-sm text-label-secondary">
                <NumberTicker value={dictionary.rules.length} className="tabular-nums text-label" /> {dictionary.rules.length === 1 ? "rule" : "rules"} learned across{" "}
                {categories.length} {categories.length === 1 ? "category" : "categories"}
              </p>
              {regenError && <p role="alert" className="mt-2 text-xs text-danger">{regenError}</p>}
            </header>

            <AnimatePresence mode="popLayout" initial={false}>
              {visibleGroups.length === 0 ? (
                <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <EmptyState icon={<Wand2 />} title="No rules match" description="Try another word or category." />
                </motion.div>
              ) : visibleGroups.map(({ cat, rules }) => (
                <motion.section
                  key={cat}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
                  className="mb-8"
                >
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <span className="text-label-tertiary [&_svg]:size-3.5">{getCategoryMeta(cat).icon}</span>
                    <span className="text-section">{getCategoryMeta(cat).label}</span>
                    <Badge variant="outline" className="tabular-nums">{rules.length}</Badge>
                  </div>
                  <div className="overflow-hidden rounded-lg bg-fill-quaternary hairline [&>*+*]:border-t [&>*+*]:border-separator">
                    {rules.map((rule) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        isRegenerating={regeneratingRule === rule.component}
                        onRegenerate={(instruction) => handleRegenerate(rule.component, instruction)}
                      />
                    ))}
                  </div>
                </motion.section>
              ))}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </WindowShell>
  );
}


/* ── Rule Card ───────────────────────────────────── */

function RuleCard({
  rule,
  isRegenerating,
  onRegenerate,
}: {
  rule: StyleRule;
  isRegenerating: boolean;
  onRegenerate: (instruction?: string) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [showInput, setShowInput] = useState(false);

  const handleSubmit = () => {
    onRegenerate(instruction.trim() || undefined);
    setInstruction("");
    setShowInput(false);
  };

  return (
    <div className="group/rule px-4 py-4">
      {/* Rule header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-headline text-label">{rule.pattern}</div>
          <div className="mt-0.5 font-mono text-2xs text-label-secondary">.{rule.component}</div>
        </div>
        <button
          onClick={() => onRegenerate()}
          disabled={isRegenerating}
          title="Regenerate with a different style"
          className={cn(
            "focus-ring pressable inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium",
            isRegenerating
              ? "bg-brand/15 text-brand"
              : "bg-fill-tertiary text-label-secondary hover:bg-fill-secondary hover:text-label",
          )}
        >
          {isRegenerating ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <RefreshCw className="size-3.5" strokeWidth={1.75} />
          )}
          {isRegenerating ? "Regenerating" : "Regenerate"}
        </button>
      </div>

      {/* Live preview — renders exactly like in the reader */}
      <div className="relative mt-3">
        <span className="absolute right-2.5 top-2 z-10 text-2xs font-medium uppercase tracking-wide text-label-quaternary">Preview</span>
        <div
          className={cn("overflow-hidden rounded-md bg-inset p-4 hairline transition-opacity", isRegenerating && "animate-pulse opacity-60")}
          data-reading-theme="dark"
          dangerouslySetInnerHTML={{ __html: rule.exampleHtml }}
        />
      </div>

      {/* Instruction input */}
      {!showInput ? (
        <button
          onClick={() => setShowInput(true)}
          disabled={isRegenerating}
          className="focus-ring mt-2.5 inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-xs text-label-secondary transition-colors hover:bg-fill-quaternary hover:text-label disabled:opacity-40"
        >
          <Plus className="size-3.5" strokeWidth={2} />
          Add instructions for regeneration
        </button>
      ) : (
        <div className="mt-2.5 flex h-8 items-center gap-1.5 rounded-full bg-fill-tertiary pl-3.5 pr-1 animate-fade-in focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_25%,transparent)]">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") { setShowInput(false); setInstruction(""); } }}
            placeholder='e.g. "use badges instead" or "make it more compact"'
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm text-label outline-none placeholder:text-label-tertiary select-text"
          />
          <button
            onClick={handleSubmit}
            disabled={isRegenerating}
            title="Regenerate with instructions"
            aria-label="Regenerate with instructions"
            className="focus-ring pressable flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg disabled:opacity-40"
          >
            <ArrowUp className="size-3.5" strokeWidth={2.25} />
          </button>
        </div>
      )}
    </div>
  );
}
