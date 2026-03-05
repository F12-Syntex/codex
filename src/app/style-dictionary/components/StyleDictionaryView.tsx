"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, RefreshCw, BarChart3, Tag, MessageCircle, Package,
  Monitor, Wand2, Send,
} from "lucide-react";
import { WindowHeader } from "@/components/window-header";
import type { StyleDictionary, StyleRule } from "@/lib/ai-style-dictionary";
import { loadDictionary, saveDictionary, extractRulesFromFormatted } from "@/lib/ai-style-dictionary";
import { regenerateRule } from "@/lib/ai-formatting";
import { AI_FORMATTING_STYLES } from "@/lib/ai-formatting-css";

interface StyleDictionaryViewProps {
  filePath: string;
  bookTitle: string;
}

const CATEGORY_META: Record<string, { icon: React.ReactNode; label: string }> = {
  stat: { icon: <BarChart3 className="h-4 w-4" strokeWidth={1.5} />, label: "Stats" },
  badge: { icon: <Tag className="h-4 w-4" strokeWidth={1.5} />, label: "Badges" },
  dialogue: { icon: <MessageCircle className="h-4 w-4" strokeWidth={1.5} />, label: "Dialogue" },
  item: { icon: <Package className="h-4 w-4" strokeWidth={1.5} />, label: "Items" },
  system: { icon: <Monitor className="h-4 w-4" strokeWidth={1.5} />, label: "System" },
  effect: { icon: <Wand2 className="h-4 w-4" strokeWidth={1.5} />, label: "Effects" },
};

const DEFAULT_CATEGORY_META = { icon: <Wand2 className="h-4 w-4" strokeWidth={1.5} />, label: "Other" };

function getCategoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? { ...DEFAULT_CATEGORY_META, label: cat.charAt(0).toUpperCase() + cat.slice(1) };
}

export function StyleDictionaryView({ filePath, bookTitle }: StyleDictionaryViewProps) {
  const [dictionary, setDictionary] = useState<StyleDictionary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [regeneratingRule, setRegeneratingRule] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (!filePath) { setIsLoading(false); return; }
    loadDictionary(filePath).then((dict) => {
      setDictionary(dict);
      setIsLoading(false);
    });
  }, [filePath]);

  const handleRegenerate = useCallback(async (componentClass: string, instruction?: string) => {
    const apiKey = await window.electronAPI?.getSetting("openrouterApiKey");
    if (!apiKey || !filePath) return;

    // Load formatted chapters
    const raw = await window.electronAPI?.getSetting(`formattedChapters:${filePath}`);
    if (!raw) return;

    let formattedChapters: Record<string, string[]>;
    try { formattedChapters = JSON.parse(raw); } catch { return; }

    // Load book content for originals
    const format = new URLSearchParams(window.location.search).get("format") || "EPUB";
    const bookContent = await window.electronAPI?.getBookContent(filePath, format);
    if (!bookContent) return;

    setRegeneratingRule(componentClass);
    try {
      const allUpdates = await regenerateRule(
        apiKey, componentClass, formattedChapters, bookContent, bookTitle,
        instruction || undefined,
      );
      if (!allUpdates) return;

      // Apply updates across all affected chapters
      for (const [chKey, updates] of Object.entries(allUpdates)) {
        const formatted = formattedChapters[chKey];
        if (!formatted) continue;
        const updated = [...formatted];
        for (const [idx, html] of Object.entries(updates)) {
          updated[Number(idx)] = html;
        }
        formattedChapters[chKey] = updated;
      }

      await window.electronAPI?.setSetting(
        `formattedChapters:${filePath}`,
        JSON.stringify(formattedChapters),
      );

      // Update the style dictionary with new examples
      if (dictionary) {
        const newDict = { ...dictionary, updatedAt: new Date().toISOString() };
        const updatedRules = [...newDict.rules];

        // Use the first updated paragraph as the new example
        const firstChKey = Object.keys(allUpdates)[0];
        const firstUpdates = allUpdates[firstChKey];
        const firstIdx = Object.keys(firstUpdates).map(Number).sort((a, b) => a - b)[0];
        const newExampleHtml = firstUpdates[firstIdx];
        const trimmedExample = newExampleHtml.length > 300
          ? newExampleHtml.slice(0, 300) + "..."
          : newExampleHtml;

        // Update the targeted rule's example
        const ruleIdx = updatedRules.findIndex(r => r.component === componentClass);
        if (ruleIdx >= 0) {
          updatedRules[ruleIdx] = { ...updatedRules[ruleIdx], exampleHtml: trimmedExample };
        }

        // Check if any NEW classes appeared that we don't track yet
        const chIdx = Number(firstChKey);
        const originals = bookContent.chapters[chIdx]?.htmlParagraphs;
        if (originals) {
          const newRules = extractRulesFromFormatted(originals, formattedChapters[firstChKey]);
          for (const nr of newRules) {
            if (!updatedRules.some(r => r.component === nr.component)) {
              updatedRules.push(nr);
            }
          }
        }

        newDict.rules = updatedRules;
        await saveDictionary(filePath, newDict);
        setDictionary(newDict);
      }
    } catch (err) {
      console.error("Regenerate failed:", err);
    } finally {
      setRegeneratingRule(null);
    }
  }, [filePath, bookTitle, dictionary]);

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col bg-[var(--bg-inset)]">
        <WindowHeader icon={<BarChart3 className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={1.5} />} title="Style Dictionary" subtitle={bookTitle} zoomKey="style-dictionary" zoom={zoom} onZoomChange={setZoom} />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" strokeWidth={1.5} />
        </div>
      </div>
    );
  }

  if (!dictionary || dictionary.rules.length === 0) {
    return (
      <div className="flex h-screen flex-col bg-[var(--bg-inset)]">
        <WindowHeader icon={<BarChart3 className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={1.5} />} title="Style Dictionary" subtitle={bookTitle} zoomKey="style-dictionary" zoom={zoom} onZoomChange={setZoom} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <BarChart3 className="h-8 w-8 text-white/20" strokeWidth={1.5} />
          <p className="text-sm text-white/40">No style rules learned yet</p>
          <p className="text-xs text-white/25">Format some chapters first to populate the style dictionary</p>
        </div>
      </div>
    );
  }

  // Group by category
  const grouped = dictionary.rules.reduce<Record<string, StyleRule[]>>((acc, rule) => {
    if (!acc[rule.category]) acc[rule.category] = [];
    acc[rule.category].push(rule);
    return acc;
  }, {});

  const categories = Object.keys(grouped);

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-inset)]">
      <WindowHeader icon={<BarChart3 className="h-3 w-3 text-[var(--accent-brand)]" strokeWidth={1.5} />} title="Style Dictionary" subtitle={bookTitle} zoomKey="style-dictionary" zoom={zoom} onZoomChange={setZoom} />

      {/* Inject AI formatting CSS so examples render correctly */}
      <style>{AI_FORMATTING_STYLES}</style>

      <div className="flex-1 overflow-y-auto" style={{ fontSize: `${zoom}%` }}>
        <div className="mx-auto max-w-[1000px] px-8 py-6">
          {/* Summary bar */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-brand)]/15">
              <BarChart3 className="h-4 w-4 text-[var(--accent-brand)]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-sm font-medium text-white/85">Style Dictionary</h2>
              <p className="text-xs text-white/40">
                {dictionary.rules.length} {dictionary.rules.length === 1 ? "rule" : "rules"} learned across {categories.length} {categories.length === 1 ? "category" : "categories"}
              </p>
            </div>
          </div>

          {/* Category groups */}
          <div className="space-y-6">
            {categories.map((cat) => (
              <div key={cat}>
                {/* Category header */}
                <div className="mb-3 flex items-center gap-2 text-white/40">
                  {getCategoryMeta(cat).icon}
                  <span className="text-xs font-medium uppercase tracking-wider">
                    {getCategoryMeta(cat).label}
                  </span>
                  <span className="text-xs text-white/25">({grouped[cat].length})</span>
                </div>

                {/* Rules grid */}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {grouped[cat].map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      isRegenerating={regeneratingRule === rule.component}
                      onRegenerate={(instruction) => handleRegenerate(rule.component, instruction)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
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
    <div
      className="rounded-lg border border-white/[0.06] p-4"
      style={{ background: "var(--bg-surface)" }}
    >
      {/* Rule header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white/85">{rule.pattern}</div>
          <div className="mt-0.5 font-mono text-xs text-white/30">{rule.component}</div>
        </div>
        <button
          onClick={() => onRegenerate()}
          disabled={isRegenerating}
          title="Regenerate with a different style"
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
            isRegenerating
              ? "text-[var(--accent-brand)]"
              : "text-white/50 hover:bg-white/[0.06] hover:text-white/80"
          }`}
        >
          {isRegenerating ? (
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
          ) : (
            <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
          )}
          Regen
        </button>
      </div>

      {/* Live preview — renders exactly like in the reader */}
      <div
        className="mt-3 overflow-hidden rounded-lg border border-white/[0.06] p-4"
        style={{ background: "var(--bg-inset)" }}
        data-reading-theme="dark"
        dangerouslySetInnerHTML={{ __html: rule.exampleHtml }}
      />

      {/* Instruction input */}
      {!showInput ? (
        <button
          onClick={() => setShowInput(true)}
          disabled={isRegenerating}
          className={`mt-2 text-xs transition-colors ${
            isRegenerating ? "text-white/15" : "text-white/30 hover:text-white/50"
          }`}
        >
          + Add instructions for regeneration
        </button>
      ) : (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") { setShowInput(false); setInstruction(""); } }}
            placeholder='e.g. "use badges instead" or "make it more compact"'
            autoFocus
            className="flex-1 rounded-lg border border-white/[0.06] bg-[var(--bg-inset)] px-2.5 py-1.5 text-xs text-white/80 placeholder-white/20 outline-none focus:border-[var(--accent-brand)]/40"
          />
          <button
            onClick={handleSubmit}
            disabled={isRegenerating}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] transition-colors hover:bg-[var(--accent-brand)]/25"
          >
            <Send className="h-3 w-3" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
