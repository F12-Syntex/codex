"use client";

import { useRef, useEffect, useState } from "react";
import { Minus, Eye, ChevronDown, Type, Zap } from "lucide-react";
import type { ThemeClasses, CustomFont } from "../lib/types";
import { ALL_FONTS } from "../lib/constants";

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

export function TextSettingsPanel({
  theme,
  fontFamily,
  fontSize,
  lineHeight,
  paraSpacing,
  textPadding,
  maxTextWidth,
  animatedPageTurn,
  immersiveMode,
  customFonts,
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
  const panelRef = useRef<HTMLDivElement>(null);
  const [showFontPicker, setShowFontPicker] = useState(false);

  const allFonts = [...ALL_FONTS, ...customFonts];
  const currentFont = allFonts.find(f => f.family === fontFamily);
  const currentFontName = currentFont?.name ?? "Georgia";

  // Click outside to close panel (ignore clicks on header toolbar buttons)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        const header = document.querySelector("[data-reader-header]");
        if (header?.contains(target)) return;
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const Toggle = ({ value, onChange, icon, label }: { value: boolean; onChange: (v: boolean) => void; icon: React.ReactNode; label: string }) => (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className={`text-[11px] ${theme.muted}`}>{label}</span>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-[var(--accent-brand)]" : theme.subtle}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : ""}`}
        />
      </button>
    </div>
  );

  return (
    <div
      ref={panelRef}
      className={`absolute right-24 top-full z-50 mt-2 w-[280px] rounded-lg border ${theme.border} ${theme.panel} shadow-lg shadow-black/30`}
    >
      <div className="space-y-3 p-4">
        {/* Font family selector */}
        <div className="relative">
          <span className={`mb-1.5 block text-[11px] ${theme.muted}`}>Font</span>
          <button
            onClick={() => setShowFontPicker(v => !v)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[12px] transition-colors ${theme.subtle} ${theme.text}`}
          >
            <div className="flex items-center gap-2">
              <Type className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span className="truncate" style={{ fontFamily }}>{currentFontName}</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" strokeWidth={1.5} />
          </button>

          {showFontPicker && (
            <div
              className={`absolute left-0 top-full z-50 mt-1 max-h-[200px] w-full overflow-y-auto rounded-lg border p-1 shadow-lg shadow-black/30 ${theme.border} ${theme.panel}`}
            >
              {allFonts.map((font) => (
                <button
                  key={font.name}
                  onClick={() => {
                    onFontFamilyChange(font.family);
                    setShowFontPicker(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors ${
                    font.family === fontFamily ? theme.btnActive : theme.btn
                  }`}
                  style={{ fontFamily: font.family }}
                >
                  {font.name}
                </button>
              ))}
              {customFonts.length === 0 && (
                <p className={`px-2 py-2 text-[11px] ${theme.muted}`}>
                  Add fonts to public/fonts/
                </p>
              )}
            </div>
          )}
        </div>

        {/* Font size */}
        <div className="flex items-center justify-between">
          <span className={`text-[11px] ${theme.muted}`}>Size</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onFontSizeChange(Math.max(14, fontSize - 1))}
              disabled={fontSize <= 14}
              className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
            >
              <Minus className="h-3 w-3" strokeWidth={1.5} />
            </button>
            <span className={`w-7 text-center text-[12px] tabular-nums ${theme.text}`}>{fontSize}</span>
            <button
              onClick={() => onFontSizeChange(Math.min(28, fontSize + 1))}
              disabled={fontSize >= 28}
              className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${theme.btn}`}
            >
              <span className="text-[13px] leading-none">+</span>
            </button>
          </div>
        </div>

        {/* Line height */}
        <div className="flex items-center gap-3">
          <span className={`w-16 text-[11px] ${theme.muted}`}>Line height</span>
          <input
            type="range"
            min={1.2}
            max={2.2}
            step={0.1}
            value={lineHeight}
            onChange={(e) => onLineHeightChange(parseFloat(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-[var(--accent-brand)]"
          />
          <span className={`w-[32px] text-right text-[12px] tabular-nums ${theme.text}`}>
            {lineHeight.toFixed(1)}
          </span>
        </div>

        {/* Paragraph spacing */}
        <div className="flex items-center gap-3">
          <span className={`w-16 text-[11px] ${theme.muted}`}>Spacing</span>
          <input
            type="range"
            min={0}
            max={32}
            step={4}
            value={paraSpacing}
            onChange={(e) => onParaSpacingChange(parseInt(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-[var(--accent-brand)]"
          />
          <span className={`w-[32px] text-right text-[12px] tabular-nums ${theme.text}`}>
            {paraSpacing}px
          </span>
        </div>

        {/* Text padding */}
        <div className="flex items-center gap-3">
          <span className={`w-16 text-[11px] ${theme.muted}`}>Padding</span>
          <input
            type="range"
            min={16}
            max={96}
            step={8}
            value={textPadding}
            onChange={(e) => onTextPaddingChange(parseInt(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-[var(--accent-brand)]"
          />
          <span className={`w-[32px] text-right text-[12px] tabular-nums ${theme.text}`}>
            {textPadding}px
          </span>
        </div>

        {/* Max text width */}
        <div className="flex items-center gap-3">
          <span className={`w-16 text-[11px] ${theme.muted}`}>Max width</span>
          <input
            type="range"
            min={600}
            max={1600}
            step={50}
            value={maxTextWidth}
            onChange={(e) => onMaxTextWidthChange(parseInt(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-[var(--accent-brand)]"
          />
          <span className={`w-[32px] text-right text-[12px] tabular-nums ${theme.text}`}>
            {maxTextWidth}
          </span>
        </div>

        {/* Divider */}
        <div className={`h-px ${theme.subtle}`} />

        {/* Animated page turn */}
        <Toggle
          value={animatedPageTurn}
          onChange={onAnimatedPageTurnChange}
          icon={<Zap className={`h-3.5 w-3.5 ${theme.muted}`} strokeWidth={1.5} />}
          label="Animated pages"
        />

        {/* Immersive mode */}
        <Toggle
          value={immersiveMode}
          onChange={onImmersiveModeChange}
          icon={<Eye className={`h-3.5 w-3.5 ${theme.muted}`} strokeWidth={1.5} />}
          label="Immersive mode"
        />
      </div>
    </div>
  );
}
