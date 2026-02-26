"use client";

import { useState } from "react";
import {
  Palette,
  Settings,
  Search,
  Keyboard,
  X,
  Image,
  Sun,
  Moon,
  Monitor,
  Type,
  Layers,
  Square,
  RectangleHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ACCENT_OPTIONS } from "@/lib/accent";
import { SHORTCUT_REGISTRY } from "@/lib/shortcuts";
import {
  APPEARANCE_OPTIONS,
  FONT_OPTIONS,
  type ThemeConfig,
} from "@/lib/theme";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils";

type DockModal = "theme" | "shortcuts" | "settings" | null;
type ThemeTab = "colors" | "appearance" | "background" | "layout";

interface DockProps {
  theme: ThemeConfig;
  onThemeChange: (patch: Partial<ThemeConfig>) => void;
  onSearchOpen: () => void;
}

/* ── Shared modal chrome ─────────────────────────────────── */
function ModalShell({
  title,
  onClose,
  width,
  children,
}: {
  title: string;
  onClose: () => void;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overlay-panel absolute bottom-full left-1/2 z-50 mb-[10px] -translate-x-1/2 rounded-lg border border-white/[0.08] bg-[var(--bg-overlay)] shadow-xl shadow-black/50"
      style={width ? { width } : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-0">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <button onClick={onClose} className="text-white/30 transition-colors hover:text-white/60">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

/* ── Slider row ──────────────────────────────────────────── */
function SliderRow({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-24 shrink-0 text-[13px] text-white/60">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="theme-slider h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent-brand)]"
      />
      <span className="w-8 text-right text-[11px] text-white/30">{value}{suffix}</span>
    </div>
  );
}

/* ── Toggle row ──────────────────────────────────────────── */
function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[13px] text-white/60">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          checked ? "bg-[var(--accent-brand)]" : "bg-white/10"
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-[18px]" : "left-0.5"
          )}
        />
      </button>
    </div>
  );
}

/* ── Theme modal ─────────────────────────────────────────── */
function ThemeModal({
  theme,
  onThemeChange,
  onClose,
}: {
  theme: ThemeConfig;
  onThemeChange: (patch: Partial<ThemeConfig>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ThemeTab>("colors");

  const tabs: { id: ThemeTab; label: string }[] = [
    { id: "colors", label: "Colors" },
    { id: "appearance", label: "Style" },
    { id: "background", label: "Wallpaper" },
    { id: "layout", label: "Layout" },
  ];

  return (
    <ModalShell title="Appearance" onClose={onClose} width="380px">
      {/* Tab bar */}
      <div className="flex gap-0.5 px-4 pt-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all",
              tab === t.id
                ? "bg-[var(--bg-elevated)] text-foreground"
                : "text-white/30 hover:text-white/50"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[260px] p-4">
        {/* ── Colors tab ──────────────────────────── */}
        {tab === "colors" && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/20">Accent</p>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => onThemeChange({ accent: opt.id })}
                    className={cn(
                      "h-6 w-6 rounded-full transition-all",
                      theme.accent === opt.id
                        ? "scale-110 ring-2 ring-white/80 ring-offset-2 ring-offset-[var(--bg-overlay)]"
                        : "hover:scale-105"
                    )}
                    style={{ backgroundColor: opt.swatch }}
                    title={opt.label}
                  />
                ))}
                {/* Custom color picker */}
                <div className="relative">
                  <button
                    onClick={() => onThemeChange({ accent: "custom" })}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-white/20 transition-all",
                      theme.accent === "custom"
                        ? "scale-110 ring-2 ring-white/80 ring-offset-2 ring-offset-[var(--bg-overlay)]"
                        : "hover:scale-105 hover:border-white/40"
                    )}
                    style={theme.accent === "custom" ? { backgroundColor: theme.customAccentColor, borderStyle: "solid" } : undefined}
                    title="Custom"
                  >
                    {theme.accent !== "custom" && (
                      <span className="text-[10px] text-white/40">+</span>
                    )}
                  </button>
                </div>
              </div>
              {theme.accent === "custom" && (
                <div className="mt-3 flex flex-col gap-2">
                  <HexColorPicker
                    color={theme.customAccentColor}
                    onChange={(color) => onThemeChange({ customAccentColor: color })}
                    style={{ width: "100%", height: "140px" }}
                  />
                  <div className="flex items-center gap-2">
                    <div
                      className="h-5 w-5 shrink-0 rounded-full"
                      style={{ backgroundColor: theme.customAccentColor }}
                    />
                    <input
                      type="text"
                      value={theme.customAccentColor}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onThemeChange({ customAccentColor: v });
                      }}
                      className="w-20 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-white/60 outline-none"
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/20">Mode</p>
              <div className="flex gap-1">
                {APPEARANCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => onThemeChange({ appearance: opt.id })}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all",
                      theme.appearance === opt.id
                        ? "bg-[var(--bg-elevated)] text-foreground shadow-sm"
                        : "text-white/30 hover:text-white/50"
                    )}
                  >
                    {opt.id === "dark" && <Moon className="h-3 w-3" />}
                    {opt.id === "dim" && <Monitor className="h-3 w-3" />}
                    {opt.id === "light" && <Sun className="h-3 w-3" />}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <ToggleRow
              label="Tint surfaces with accent"
              checked={theme.tintSurfaces}
              onChange={(v) => onThemeChange({ tintSurfaces: v })}
            />
          </div>
        )}

        {/* ── Style tab ───────────────────────────── */}
        {tab === "appearance" && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/20">Font</p>
              <div className="grid grid-cols-2 gap-1">
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => onThemeChange({ fontFamily: f.id })}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-all",
                      theme.fontFamily === f.id
                        ? "bg-[var(--bg-elevated)] text-foreground shadow-sm"
                        : "text-white/30 hover:text-white/50"
                    )}
                  >
                    <Type className="h-3 w-3" />
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/20">Covers</p>
              <div className="flex gap-1">
                <button
                  onClick={() => onThemeChange({ coverStyle: "rounded" })}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all",
                    theme.coverStyle === "rounded"
                      ? "bg-[var(--bg-elevated)] text-foreground shadow-sm"
                      : "text-white/30 hover:text-white/50"
                  )}
                >
                  <RectangleHorizontal className="h-3 w-3" />
                  Rounded
                </button>
                <button
                  onClick={() => onThemeChange({ coverStyle: "sharp" })}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all",
                    theme.coverStyle === "sharp"
                      ? "bg-[var(--bg-elevated)] text-foreground shadow-sm"
                      : "text-white/30 hover:text-white/50"
                  )}
                >
                  <Square className="h-3 w-3" />
                  Sharp
                </button>
              </div>
              <div className="mt-2">
                <ToggleRow
                  label="Show format badge"
                  checked={theme.showFormatBadge}
                  onChange={(v) => onThemeChange({ showFormatBadge: v })}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Wallpaper tab ───────────────────────── */}
        {tab === "background" && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/20">Image</p>
              {theme.backgroundImage ? (
                <div className="flex items-center gap-3">
                  <div
                    className="h-16 w-28 rounded-lg border border-white/10 bg-cover bg-center"
                    style={{ backgroundImage: `url(${theme.backgroundImage})` }}
                  />
                  <div className="flex flex-col gap-1">
                    <label className="cursor-pointer text-xs text-white/50 transition-colors hover:text-white/70">
                      Change
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = () => onThemeChange({ backgroundImage: reader.result as string });
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                    <button
                      onClick={() => onThemeChange({ backgroundImage: null })}
                      className="text-left text-xs text-white/30 transition-colors hover:text-white/50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/10 px-4 py-4 text-xs text-white/40 transition-colors hover:border-white/20 hover:text-white/60">
                  <Image className="h-4 w-4" />
                  Choose an image...
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => onThemeChange({ backgroundImage: reader.result as string });
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              )}
            </div>

            {theme.backgroundImage && (
              <>
                <SliderRow
                  label="Blur"
                  value={theme.backgroundBlur}
                  min={0}
                  max={20}
                  suffix="px"
                  onChange={(v) => onThemeChange({ backgroundBlur: v })}
                />
                <SliderRow
                  label="Darkness"
                  value={theme.backgroundOpacity}
                  min={0}
                  max={95}
                  suffix="%"
                  onChange={(v) => onThemeChange({ backgroundOpacity: v })}
                />
                <SliderRow
                  label="Surface glass"
                  value={theme.surfaceOpacity}
                  min={30}
                  max={100}
                  suffix="%"
                  onChange={(v) => onThemeChange({ surfaceOpacity: v })}
                />
              </>
            )}
          </div>
        )}

        {/* ── Layout tab ──────────────────────────── */}
        {tab === "layout" && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/20">Sidebar</p>
              <SliderRow
                label="Width"
                value={theme.sidebarWidth}
                min={15}
                max={35}
                suffix="%"
                onChange={(v) => onThemeChange({ sidebarWidth: v })}
              />
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/* ── Shortcuts modal ─────────────────────────────────────── */
function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const categories = [...new Set(SHORTCUT_REGISTRY.map((s) => s.category))];

  return (
    <ModalShell title="Keyboard shortcuts" onClose={onClose} width="320px">
      <div className="flex flex-col gap-3 p-4">
        {categories.map((cat) => (
          <div key={cat}>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/20">{cat}</p>
            <div className="flex flex-col gap-1">
              {SHORTCUT_REGISTRY.filter((s) => s.category === cat).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1">
                  <span className="text-[13px] text-white/60">{s.label}</span>
                  <kbd className="rounded-lg bg-[var(--bg-inset)] px-2 py-0.5 text-[11px] text-white/40">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

/* ── Settings modal ──────────────────────────────────────── */
function SettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Settings" onClose={onClose} width="320px">
      <div className="flex flex-col gap-3 p-4">
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/20">Library</p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between py-1">
              <span className="text-[13px] text-white/60">Library path</span>
              <span className="text-[11px] text-white/30">~/Documents/Codex</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[13px] text-white/60">Auto-scan</span>
              <div className="relative h-4 w-7 cursor-pointer rounded-full bg-[var(--bg-elevated)]">
                <div className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white/40 transition-all" />
              </div>
            </div>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/20">Reader</p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between py-1">
              <span className="text-[13px] text-white/60">Default zoom</span>
              <span className="text-[11px] text-white/30">Fit page</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[13px] text-white/60">Reading direction</span>
              <span className="text-[11px] text-white/30">LTR</span>
            </div>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/20">About</p>
          <div className="flex items-center justify-between py-1">
            <span className="text-[13px] text-white/60">Version</span>
            <span className="text-[11px] text-white/30">0.1.0</span>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/* ── Dock ─────────────────────────────────────────────────── */
export function Dock({ theme, onThemeChange, onSearchOpen }: DockProps) {
  const [activeModal, setActiveModal] = useState<DockModal>(null);

  const toggle = (modal: DockModal) => setActiveModal((v) => (v === modal ? null : modal));
  const close = () => setActiveModal(null);

  return (
    <>
      {activeModal && (
        <div className="overlay-backdrop absolute inset-0 z-40 bg-black/20" onClick={close} />
      )}

      <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2">
        {activeModal === "theme" && (
          <ThemeModal theme={theme} onThemeChange={onThemeChange} onClose={close} />
        )}
        {activeModal === "shortcuts" && <ShortcutsModal onClose={close} />}
        {activeModal === "settings" && <SettingsModal onClose={close} />}

        <div className="relative flex items-center gap-1 rounded-full border border-white/[0.06] bg-[var(--bg-surface)] px-2 py-1.5 shadow-lg shadow-black/30">
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8 rounded-full", activeModal === "theme" && "bg-white/10")}
                onClick={() => toggle("theme")}
              >
                <Palette className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Appearance</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => { close(); onSearchOpen(); }}
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Search</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8 rounded-full", activeModal === "shortcuts" && "bg-white/10")}
                onClick={() => toggle("shortcuts")}
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Shortcuts</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8 rounded-full", activeModal === "settings" && "bg-white/10")}
                onClick={() => toggle("settings")}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Settings</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </>
  );
}
