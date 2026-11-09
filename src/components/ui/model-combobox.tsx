"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";
import type { ModelInfo } from "@shared/ai/types";
import { useAIModels } from "@/lib/ai/useAISettings";

interface ModelComboboxProps {
  value: string;
  onChange: (model: string) => void;
  placeholder?: string;
  className?: string;
  /** The catalog, when the parent already has it (saves each combobox its own fetch). */
  models?: ModelInfo[];
}

/** "Google: Gemini 2.5 Flash Lite" → "Gemini 2.5 Flash Lite". */
function shortName(name: string): string {
  const i = name.indexOf(": ");
  return i > 0 ? name.slice(i + 2) : name;
}

/** A readable name for an id the catalog doesn't list: "google/gemini-2.5-flash-lite" → "Gemini 2.5 Flash Lite". */
function nameFromId(id: string): string {
  const slug = id.slice(id.lastIndexOf("/") + 1).replace(/:[a-z]+$/, "");
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => (/^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** What the user reads for a model id: the catalog name, else one derived from the id. */
export function modelDisplayName(id: string, models: ModelInfo[]): string {
  const hit = models.find((m) => m.id === id) ?? models.find((m) => m.id === id.replace(/:[a-z]+$/, ""));
  return hit ? shortName(hit.name) : nameFromId(id);
}

export function ModelCombobox({
  value,
  onChange,
  placeholder = "Select model...",
  className,
  models: modelsProp,
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The catalog comes from the main process (`ai:models`, cached there): from the parent when it
  // has it, else loaded on first open.
  const own = useAIModels(open || !modelsProp);
  const models = modelsProp && modelsProp.length > 0 ? modelsProp : own.models;
  const fetching = own.loading;
  const loading = fetching && models.length === 0;

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

  // Focus search input when opening (the search is reset by the trigger)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
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

  // Show the model's name ("Gemini 2.5 Flash Lite"); the id is in the tooltip and the list.
  const displayValue = value ? modelDisplayName(value, models) : modelDisplayName(placeholder, models);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        type="button"
        title={value || placeholder}
        onClick={() => {
          if (!open) setSearch("");
          setOpen(!open);
        }}
        className={cn(
          "pressable focus-ring flex h-8 w-56 items-center justify-between gap-2 rounded-full bg-fill-tertiary pr-2.5 pl-3.5 text-left text-xs shadow-[inset_0_1px_0_0_var(--glass-highlight),inset_0_0_0_0.5px_var(--glass-edge)] hover:bg-fill-secondary",
          open && "bg-fill-secondary",
          value ? "text-label" : "text-label-tertiary",
        )}
      >
        <span className="min-w-0 truncate">{displayValue}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-label-tertiary transition-transform duration-300 ease-spring",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="glass-thick absolute right-0 z-50 mt-2 flex w-80 origin-top-right animate-pop-in flex-col overflow-hidden rounded-xl p-1"
          style={{ maxHeight: "320px" }}
        >
          {/* Search input */}
          <div className="mb-1 flex h-7 shrink-0 items-center gap-2 rounded-full bg-fill-tertiary px-3 shadow-[inset_0_1px_2px_0_var(--bg-inset),inset_0_0_0_0.5px_var(--separator)] focus-within:shadow-[inset_0_0_0_1px_var(--accent-brand),0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_22%,transparent)]">
            <Search className="size-3.5 shrink-0 text-label-tertiary" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-transparent text-xs text-label placeholder:text-label-tertiary outline-none"
            />
          </div>

          {/* Model list */}
          <div ref={listRef} className="flex flex-col gap-px overflow-y-auto" style={{ maxHeight: "272px" }}>
            {loading && (
              <div className="px-3 py-4 text-center text-xs text-label-tertiary">
                Loading models...
              </div>
            )}

            {!loading && visible.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-label-tertiary">
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
                      "flex w-full shrink-0 flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left outline-none transition-colors duration-100 focus-visible:bg-fill-tertiary",
                      isSelected
                        ? "bg-brand/15"
                        : "hover:bg-fill-tertiary",
                    )}
                  >
                    <span
                      className={cn(
                        "truncate text-xs",
                        isSelected ? "font-medium text-brand" : "text-label",
                      )}
                    >
                      {shortName(model.name)}
                    </span>
                    <span className="truncate text-2xs text-label-tertiary">
                      {model.id}
                    </span>
                  </button>
                );
              })}

            {!loading && filtered.length > 80 && (
              <div className="px-3 py-2 text-center text-2xs text-label-quaternary">
                {filtered.length - 80} more — refine your search
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
