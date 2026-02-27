"use client";

import { useState } from "react";
import {
  Palette,
  Search,
  Keyboard,
  X,
  Image,
  Sun,
  Moon,
  Monitor,
  Type,
  Square,
  RectangleHorizontal,
  MousePointer2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ACCENT_OPTIONS } from "@/lib/accent";
import { SHORTCUT_REGISTRY } from "@/lib/shortcuts";
import {
  APPEARANCE_OPTIONS,
  FONT_OPTIONS,
  type ThemeConfig,
  type CursorStyle,
} from "@/lib/theme";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils";

type DockModal = "theme" | "shortcuts" | null;

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
      {label && <Label className="w-24 shrink-0 text-[13px] font-normal text-white/60">{label}</Label>}
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
        className="flex-1"
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
      <Label className="text-[13px] font-normal text-white/60">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
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
  return (
    <ModalShell title="Appearance" onClose={onClose} width="380px">
      <Tabs defaultValue="colors" className="gap-0">
        <TabsList className="mx-4 mt-3 w-fit gap-0.5 bg-transparent p-0">
          <TabsTrigger
            value="colors"
            className="h-auto rounded-lg border-none px-2.5 py-1 text-[11px] font-medium data-[state=active]:bg-[var(--bg-elevated)] data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-white/30 data-[state=inactive]:hover:text-white/50"
          >
            Colors
          </TabsTrigger>
          <TabsTrigger
            value="appearance"
            className="h-auto rounded-lg border-none px-2.5 py-1 text-[11px] font-medium data-[state=active]:bg-[var(--bg-elevated)] data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-white/30 data-[state=inactive]:hover:text-white/50"
          >
            Style
          </TabsTrigger>
          <TabsTrigger
            value="background"
            className="h-auto rounded-lg border-none px-2.5 py-1 text-[11px] font-medium data-[state=active]:bg-[var(--bg-elevated)] data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-white/30 data-[state=inactive]:hover:text-white/50"
          >
            Wallpaper
          </TabsTrigger>
        </TabsList>

        <div className="h-[340px] overflow-y-auto p-4">
          {/* ── Colors tab ──────────────────────────── */}
          <TabsContent value="colors" className="mt-0">
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
          </TabsContent>

          {/* ── Style tab ───────────────────────────── */}
          <TabsContent value="appearance" className="mt-0">
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

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/20">Cursor</p>
                <div className="grid grid-cols-4 gap-1">
                  {([
                    { id: "default" as CursorStyle, label: "System" },
                    { id: "modern" as CursorStyle, label: "Modern" },
                    { id: "classic" as CursorStyle, label: "Classic" },
                    { id: "dark" as CursorStyle, label: "Dark" },
                  ]).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onThemeChange({ cursorStyle: c.id })}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg py-2.5 text-[10px] transition-all",
                        theme.cursorStyle === c.id
                          ? "bg-[var(--bg-elevated)] text-foreground shadow-sm"
                          : "text-white/30 hover:text-white/50"
                      )}
                    >
                      <MousePointer2 className="h-4 w-4" strokeWidth={1.5} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/20">Border Radius</p>
                <SliderRow
                  label=""
                  value={theme.borderRadius}
                  min={0}
                  max={16}
                  suffix="px"
                  onChange={(v) => onThemeChange({ borderRadius: v })}
                />
                <div className="mt-1.5 flex gap-1.5">
                  {[0, 4, 8, 12, 16].map((v) => (
                    <button
                      key={v}
                      onClick={() => onThemeChange({ borderRadius: v })}
                      className={cn(
                        "flex-1 rounded-lg py-1.5 text-[10px] transition-all",
                        theme.borderRadius === v
                          ? "bg-[var(--bg-elevated)] text-foreground shadow-sm"
                          : "text-white/25 hover:text-white/40"
                      )}
                    >
                      {v}px
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Wallpaper tab ───────────────────────── */}
          <TabsContent value="background" className="mt-0">
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
          </TabsContent>
        </div>
      </Tabs>
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

        </div>
      </div>
    </>
  );
}
