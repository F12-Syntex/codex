"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { NumberStepper } from "@/components/ui/number-stepper";
import type { ThemeClasses, CustomFont, ReadingTheme } from "../lib/types";
import { ALL_FONTS } from "../lib/constants";
import { dropIn, LAYOUT_SPRING, PANEL_SPRING, PAPER_SWATCHES, stopNavKeys } from "./chrome";

interface TextSettingsPanelProps {
  theme: ThemeClasses;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paraSpacing: number;
  textPadding: number;
  maxTextWidth: number;
  animatedPageTurn: boolean;
  immersiveMode: boolean;
  customFonts: CustomFont[];
  /** Paper theme — when provided the panel shows the paper picker. */
  readingTheme?: ReadingTheme;
  onThemeChange?: (theme: ReadingTheme) => void;
  onFontFamilyChange: (f: string) => void;
  onFontSizeChange: (s: number) => void;
  onLineHeightChange: (lh: number) => void;
  onParaSpacingChange: (ps: number) => void;
  onTextPaddingChange: (tp: number) => void;
  onMaxTextWidthChange: (mw: number) => void;
  onAnimatedPageTurnChange: (a: boolean) => void;
  onImmersiveModeChange: (im: boolean) => void;
  onClose: () => void;
}

/**
 * Appearance popover — Apple Books' "Aa" sheet with a Codex twist: paper
 * chips, live "Aa" typeface tiles, a rolling size stepper and fine sliders.
 */
export function TextSettingsPanel({
  fontFamily,
  fontSize,
  lineHeight,
  paraSpacing,
  textPadding,
  maxTextWidth,
  animatedPageTurn,
  immersiveMode,
  customFonts,
  readingTheme,
  onThemeChange,
  onFontFamilyChange,
  onFontSizeChange,
  onLineHeightChange,
  onParaSpacingChange,
  onTextPaddingChange,
  onMaxTextWidthChange,
  onAnimatedPageTurnChange,
  onImmersiveModeChange,
  onClose,
}: TextSettingsPanelProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const allFonts = [...ALL_FONTS, ...customFonts];

  // Click outside to close panel (ignore clicks on header toolbar buttons)
  useClickOutside(panelRef, onClose, "[data-reader-header]");

  return (
    <motion.div
      ref={panelRef}
      {...dropIn}
      initial={reduceMotion ? false : dropIn.initial}
      transition={PANEL_SPRING}
      onKeyDown={stopNavKeys}
      className="glass-thick grain absolute right-36 top-full z-50 flex w-80 origin-top-right flex-col overflow-hidden rounded-2xl"
      style={{ maxHeight: "calc(100vh - 72px)" }}
    >
      <div className="overflow-y-auto p-4">
        {/* ── Paper ─────────────────────────────────── */}
        {readingTheme && onThemeChange && (
          <section className="mb-5">
            <h3 className="mb-2.5 text-section">Page</h3>
            <div role="radiogroup" aria-label="Page colour" className="grid grid-cols-3 gap-2">
              {PAPER_SWATCHES.map((s) => {
                const selected = readingTheme === s.id;
                return (
                  <button
                    key={s.id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onThemeChange(s.id)}
                    className="focus-ring group flex flex-col items-center gap-1.5 rounded-lg py-1"
                  >
                    <span className="relative grid size-12 place-items-center">
                      {selected && (
                        <motion.span
                          layoutId="reader-paper-ring"
                          transition={reduceMotion ? { duration: 0 } : LAYOUT_SPRING}
                          className="absolute -inset-1 rounded-full ring-2 ring-brand"
                        />
                      )}
                      <span
                        className="pressable grid size-12 place-items-center rounded-full font-display text-base font-semibold hairline transition-transform duration-300 ease-spring group-hover:scale-105"
                        style={{ backgroundColor: s.paper, color: s.ink }}
                      >
                        Aa
                      </span>
                    </span>
                    <span className={cn("text-2xs font-medium", selected ? "text-label" : "text-label-secondary")}>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Typeface ──────────────────────────────── */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-section">Typeface</h3>
            <NumberStepper
              label="Font size"
              value={fontSize}
              min={14}
              max={28}
              onValueChange={onFontSizeChange}
              decrementIcon={<span className="font-display text-xs font-semibold leading-none">A</span>}
              incrementIcon={<span className="font-display text-base font-semibold leading-none">A</span>}
            />
          </div>
          <div role="radiogroup" aria-label="Typeface" className="grid grid-cols-3 gap-1.5">
            {allFonts.map((font) => {
              const selected = font.family === fontFamily;
              return (
                <button
                  key={font.name}
                  role="radio"
                  aria-checked={selected}
                  title={font.name}
                  onClick={() => onFontFamilyChange(font.family)}
                  className={cn(
                    "focus-ring pressable relative flex h-16 flex-col items-center justify-center gap-1 rounded-lg px-1 transition-colors duration-150",
                    selected ? "text-brand" : "bg-fill-quaternary text-label hover:bg-fill-tertiary",
                  )}
                >
                  {selected && (
                    <motion.span
                      layoutId="reader-font-tile"
                      transition={reduceMotion ? { duration: 0 } : LAYOUT_SPRING}
                      className="absolute inset-0 rounded-lg bg-brand/12 ring-1 ring-inset ring-brand/50"
                    />
                  )}
                  <span className="relative text-xl leading-none" style={{ fontFamily: font.family }}>
                    Aa
                  </span>
                  <span className={cn("relative w-full truncate text-center text-2xs", selected ? "font-medium text-brand" : "text-label-secondary")}>
                    {font.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="my-4 h-px bg-separator" />

        {/* ── Layout ────────────────────────────────── */}
        <section className="space-y-1">
          <h3 className="mb-2 text-section">Layout</h3>
          <SliderRow label="Line height" value={lineHeight} min={1.2} max={2.2} step={0.1} display={lineHeight.toFixed(1)} onChange={onLineHeightChange} />
          <SliderRow label="Paragraphs" value={paraSpacing} min={0} max={32} step={4} display={`${paraSpacing}`} onChange={(v) => onParaSpacingChange(Math.round(v))} />
          <SliderRow label="Margins" value={textPadding} min={16} max={96} step={8} display={`${textPadding}`} onChange={(v) => onTextPaddingChange(Math.round(v))} />
          <SliderRow label="Width" value={maxTextWidth} min={480} max={1000} step={20} display={`${maxTextWidth}`} onChange={(v) => onMaxTextWidthChange(Math.round(v))} />
        </section>

        <div className="my-4 h-px bg-separator" />

        {/* ── Behaviour ─────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex h-8 items-center justify-between gap-3">
            <span className="text-sm text-label">Page turn</span>
            <SegmentedControl
              size="sm"
              value={animatedPageTurn ? "slide" : "instant"}
              onValueChange={(v) => onAnimatedPageTurnChange(v === "slide")}
              options={[
                { value: "slide", label: "Slide" },
                { value: "instant", label: "Instant" },
              ]}
            />
          </div>
          <div className="flex min-h-8 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-label">Focus mode</div>
              <div className="text-2xs text-label-secondary">Hide the footer until the pointer nears it</div>
            </div>
            <Switch checked={immersiveMode} onCheckedChange={onImmersiveModeChange} aria-label="Focus mode" />
          </div>
        </section>
      </div>
    </motion.div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex h-8 items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-label-secondary">{label}</span>
      <Slider
        className="flex-1"
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={([v]) => onChange(Math.round(v * 100) / 100)}
      />
      <span className="w-10 shrink-0 text-right text-2xs tabular-nums text-label-secondary">{display}</span>
    </div>
  );
}
