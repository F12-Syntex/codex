"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";
import { fetchModels, type OpenRouterModel } from "@/lib/openrouter";

interface ModelComboboxProps {
  value: string;
  onChange: (model: string) => void;
  placeholder?: string;
  className?: string;
}

export function ModelCombobox({
  value,
  onChange,
  placeholder = "Select model...",
  className,
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch models on first open
  useEffect(() => {
    if (!open || models.length > 0) return;
    setLoading(true);
    fetchModels()
      .then(setModels)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, models.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search input when opening
  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = search.trim()
    ? models.filter(
        (m) =>
          m.id.toLowerCase().includes(search.toLowerCase()) ||
          m.name.toLowerCase().includes(search.toLowerCase()),
      )
    : models;

  // Cap visible results for performance
  const visible = filtered.slice(0, 80);

  const handleSelect = useCallback(
    (modelId: string) => {
      onChange(modelId);
      setOpen(false);
    },
    [onChange],
  );

  // Format display: show the model id, truncated
  const displayValue = value || placeholder;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-56 items-center justify-between gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-left text-[11px] outline-none transition-colors hover:bg-white/[0.08]",
          value ? "text-white/70" : "text-white/25",
        )}
      >
        <span className="min-w-0 truncate">{displayValue}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-white/25 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 z-50 mt-1.5 w-80 overflow-hidden rounded-lg border border-white/[0.08] bg-[var(--bg-overlay)]/95 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.5)] backdrop-blur-xl"
          style={{ maxHeight: "320px" }}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
            <Search className="h-3 w-3 shrink-0 text-white/20" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-transparent text-[11px] text-white/70 placeholder-white/20 outline-none"
            />
          </div>

          {/* Model list */}
          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: "272px" }}>
            {loading && (
              <div className="px-3 py-4 text-center text-[11px] text-white/25">
                Loading models...
              </div>
            )}

            {!loading && visible.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px] text-white/25">
                {search ? "No models match" : "No models available"}
              </div>
            )}

            {!loading &&
              visible.map((model) => {
                const isSelected = model.id === value;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleSelect(model.id)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                      isSelected
                        ? "bg-[var(--accent-brand)]/10"
                        : "hover:bg-white/[0.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "truncate text-[11px]",
                        isSelected ? "text-[var(--accent-brand)]" : "text-white/60",
                      )}
                    >
                      {model.id}
                    </span>
                    <span className="truncate text-[10px] text-white/25">
                      {model.name}
                    </span>
                  </button>
                );
              })}

            {!loading && filtered.length > 80 && (
              <div className="px-3 py-2 text-center text-[10px] text-white/20">
                {filtered.length - 80} more — refine your search
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
