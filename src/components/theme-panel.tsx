"use client";

/**
 * ThemePanel — the one Appearance UI.
 *
 * Rendered by the dock's Appearance sheet (the quick path) and by
 * Settings › Appearance, so there is never a forked preference home.
 *
 *   <ThemePanel theme={theme} onThemeChange={patch} />            — tabs + content
 *   <ThemeTabControl value onValueChange /> + <ThemeTabContent />  — split, for
 *     shells (like the dock sheet) that pin the tabs above a scrolling body.
 */

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ImagePlus, Sun, Moon, MoonStar, Check } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { ACCENT_OPTIONS } from "@/lib/accent";
import {
  APPEARANCE_OPTIONS,
  FONT_OPTIONS,
  FONT_FAMILY_CSS,
  RADIUS_STOPS,
  type ThemeConfig,
  type CursorStyle,
  type AppearanceMode,
  type CoverStyle,
} from "@/lib/theme";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils";

export type ThemeTab = "colors" | "style" | "background";

export interface ThemePanelProps {
  theme: ThemeConfig;
  onThemeChange: (patch: Partial<ThemeConfig>) => void;
}

/* ═══ Rows ════════════════════════════════════════════════════════════ */

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
    <ListRow label={label}>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
        className="w-36"
        aria-label={label}
      />
      <span className="w-9 text-right text-2xs tabular-nums text-label-tertiary">
        {value}
        {suffix}
      </span>
    </ListRow>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="px-3 pb-1.5 text-headline text-label-secondary">{children}</h3>;
}

/* ═══ Constants ═══════════════════════════════════════════════════════ */

const MODE_ICONS: Record<AppearanceMode, React.ReactNode> = {
  dark: <Moon />,
  dim: <MoonStar />,
  light: <Sun />,
};

const CURSOR_OPTIONS: { value: CursorStyle; label: string }[] = [
  { value: "default", label: "System" },
  { value: "modern", label: "Modern" },
  { value: "classic", label: "Classic" },
  { value: "dark", label: "Dark" },
];

/** macOS "multicolour" swatch — literal hues are the content here. */
const MULTICOLOR =
  "conic-gradient(from 180deg, #ff453a, #ff9f0a, #ffd60a, #30d158, #64d2ff, #0a84ff, #bf5af2, #ff375f, #ff453a)";

const SWATCH_BASE =
  "relative size-5.5 rounded-full shadow-[inset_0_0_0_0.5px_var(--separator-strong)] outline-solid outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand transition-[transform,outline-color] duration-200 ease-spring hover:scale-110";

const DOT_SPRING = { type: "spring", bounce: 0.2, duration: 0.4 } as const;

function readImage(file: File | undefined, onLoad: (dataUrl: string) => void) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => onLoad(reader.result as string);
  reader.readAsDataURL(file);
}

/* ═══ Tabs ════════════════════════════════════════════════════════════ */

export function ThemeTabControl({
  value,
  onValueChange,
}: {
  value: ThemeTab;
  onValueChange: (tab: ThemeTab) => void;
}) {
  return (
    <SegmentedControl<ThemeTab>
      fill
      value={value}
      onValueChange={onValueChange}
      options={[
        { value: "colors", label: "Colors" },
        { value: "style", label: "Style" },
        { value: "background", label: "Wallpaper" },
      ]}
      aria-label="Appearance section"
    />
  );
}

/* ═══ Content ═════════════════════════════════════════════════════════ */

export function ThemeTabContent({ tab, theme, onThemeChange }: ThemePanelProps & { tab: ThemeTab }) {
  const reduce = useReducedMotion();
  // Per-instance so the dock sheet and Settings never share a layout animation.
  const dotLayoutId = useId();
  const ambientOn = theme.ambientBackground !== false;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tab}
        className="flex flex-col gap-5"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(4px)" }}
        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      >
        {/* ── Colors ─────────────────────────────── */}
        {tab === "colors" && (
          <>
            <section>
              <GroupTitle>Accent</GroupTitle>
              <div className="rounded-lg bg-fill-quaternary p-3 hairline">
                <div className="grid grid-cols-7 justify-items-center gap-y-3">
                  {ACCENT_OPTIONS.map((opt) => {
                    const selected = theme.accent === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onThemeChange({ accent: opt.id })}
                        title={opt.label}
                        aria-label={opt.label}
                        aria-pressed={selected}
                        className={cn(SWATCH_BASE, selected ? "outline-2 outline-label" : "outline-0 outline-transparent")}
                        style={{ backgroundColor: opt.swatch }}
                      >
                        {selected && (
                          <motion.span
                            layoutId={dotLayoutId}
                            className="absolute inset-0 m-auto size-1.5 rounded-full bg-brand-fg"
                            transition={DOT_SPRING}
                          />
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => onThemeChange({ accent: "custom" })}
                    title="Custom"
                    aria-label="Custom accent"
                    aria-pressed={theme.accent === "custom"}
                    className={cn(
                      SWATCH_BASE,
                      theme.accent === "custom" ? "outline-2 outline-label" : "outline-0 outline-transparent",
                    )}
                    style={{
                      background: theme.accent === "custom" ? theme.customAccentColor : MULTICOLOR,
                    }}
                  >
                    {theme.accent === "custom" && (
                      <motion.span
                        layoutId={dotLayoutId}
                        className="absolute inset-0 m-auto size-1.5 rounded-full bg-brand-fg"
                        transition={DOT_SPRING}
                      />
                    )}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {theme.accent === "custom" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-2.5 pt-3">
                        <HexColorPicker
                          color={theme.customAccentColor}
                          onChange={(color) => onThemeChange({ customAccentColor: color })}
                          style={{ width: "100%", height: "132px" }}
                        />
                        <div className="flex items-center gap-2">
                          <span
                            className="size-5 shrink-0 rounded-full shadow-[inset_0_0_0_0.5px_var(--separator-strong)]"
                            style={{ backgroundColor: theme.customAccentColor }}
                          />
                          <Input
                            value={theme.customAccentColor}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onThemeChange({ customAccentColor: v });
                            }}
                            className="h-7 w-24 font-mono text-xs"
                            spellCheck={false}
                            aria-label="Custom accent hex"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            <ListGroup title="Window">
              <ListRow label="Mode">
                <SegmentedControl<AppearanceMode>
                  size="sm"
                  value={theme.appearance}
                  onValueChange={(v) => onThemeChange({ appearance: v })}
                  options={APPEARANCE_OPTIONS.map((o) => ({ value: o.id, label: o.label, icon: MODE_ICONS[o.id] }))}
                  aria-label="Mode"
                />
              </ListRow>
              <ListRow label="Tint surfaces" description="Wash the glass with your accent">
                <Switch
                  checked={theme.tintSurfaces}
                  onCheckedChange={(v) => onThemeChange({ tintSurfaces: v })}
                  aria-label="Tint surfaces with accent"
                />
              </ListRow>
              <ListRow
                label="Ambient ink background"
                description={theme.backgroundImage ? "Hidden while a wallpaper is set" : "Slow ink-in-water behind the glass"}
              >
                <Switch
                  checked={ambientOn}
                  onCheckedChange={(v) => onThemeChange({ ambientBackground: v })}
                  aria-label="Ambient ink background"
                />
              </ListRow>
            </ListGroup>
          </>
        )}

        {/* ── Style ──────────────────────────────── */}
        {tab === "style" && (
          <>
            <section>
              <GroupTitle>Typeface</GroupTitle>
              <div className="grid grid-cols-2 gap-2">
                {FONT_OPTIONS.map((f) => {
                  const selected = theme.fontFamily === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onThemeChange({ fontFamily: f.id })}
                      aria-pressed={selected}
                      className={cn(
                        "focus-ring pressable relative flex h-16 flex-col items-start justify-between rounded-lg px-3 py-2.5 text-left transition-colors duration-150",
                        selected
                          ? "bg-brand/12 text-label shadow-[inset_0_0_0_1px_var(--accent-brand)]"
                          : "bg-fill-quaternary text-label-secondary hairline hover:bg-fill-tertiary hover:text-label",
                      )}
                    >
                      <span className="text-xl leading-none font-medium" style={{ fontFamily: FONT_FAMILY_CSS[f.id] }}>
                        {f.preview}
                      </span>
                      <span className="text-2xs font-medium">{f.label}</span>
                      {selected && (
                        <span className="absolute top-2 right-2 inline-flex size-4 items-center justify-center rounded-full bg-brand text-brand-fg">
                          <Check className="size-2.5" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <ListGroup title="Covers">
              <ListRow label="Corners">
                <SegmentedControl<CoverStyle>
                  size="sm"
                  value={theme.coverStyle}
                  onValueChange={(v) => onThemeChange({ coverStyle: v })}
                  options={[
                    { value: "rounded", label: "Rounded" },
                    { value: "sharp", label: "Sharp" },
                  ]}
                  aria-label="Cover corners"
                />
              </ListRow>
              <ListRow label="Show format badge">
                <Switch
                  checked={theme.showFormatBadge}
                  onCheckedChange={(v) => onThemeChange({ showFormatBadge: v })}
                  aria-label="Show format badge"
                />
              </ListRow>
            </ListGroup>

            <ListGroup title="Pointer">
              <div className="p-2">
                <SegmentedControl<CursorStyle>
                  fill
                  size="sm"
                  value={theme.cursorStyle}
                  onValueChange={(v) => onThemeChange({ cursorStyle: v })}
                  options={CURSOR_OPTIONS}
                  aria-label="Pointer style"
                />
              </div>
            </ListGroup>

            <ListGroup title="Corner radius">
              <div className="p-2">
                <SegmentedControl<string>
                  fill
                  size="sm"
                  value={String(theme.borderRadius)}
                  onValueChange={(v) => onThemeChange({ borderRadius: Number(v) })}
                  options={RADIUS_STOPS.map((v) => ({ value: String(v), label: `${v}px` }))}
                  aria-label="Corner radius"
                />
              </div>
            </ListGroup>
          </>
        )}

        {/* ── Wallpaper ──────────────────────────── */}
        {tab === "background" && (
          <>
            <section>
              <GroupTitle>Image</GroupTitle>
              {theme.backgroundImage ? (
                <div
                  className="relative flex aspect-video w-full items-end overflow-hidden rounded-lg bg-cover bg-center hairline"
                  style={{ backgroundImage: `url(${theme.backgroundImage})` }}
                >
                  <div className="glass-thin flex w-full items-center justify-end gap-1.5 p-2">
                    <label className="focus-ring pressable inline-flex h-7 cursor-pointer items-center rounded-md bg-fill-secondary px-3 text-xs font-medium text-label hover:bg-fill">
                      Change…
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => readImage(e.target.files?.[0], (url) => onThemeChange({ backgroundImage: url }))}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => onThemeChange({ backgroundImage: null })}
                      className="focus-ring pressable inline-flex h-7 items-center rounded-md px-3 text-xs font-medium text-danger hover:bg-danger/15"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className="group/drop flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-separator-strong bg-fill-quaternary text-label-secondary transition-colors duration-150 hover:border-brand hover:bg-brand/5 hover:text-label">
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-fill-tertiary transition-transform duration-300 ease-spring group-hover/drop:scale-110">
                    <ImagePlus className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="text-sm font-medium">Choose an image…</span>
                  <span className="text-2xs text-label-tertiary">It sits behind the glass, under everything</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => readImage(e.target.files?.[0], (url) => onThemeChange({ backgroundImage: url }))}
                  />
                </label>
              )}
            </section>

            {theme.backgroundImage && (
              <ListGroup title="Adjust">
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
              </ListGroup>
            )}
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══ Stacked panel (Settings › Appearance) ═══════════════════════════ */

export function ThemePanel({
  theme,
  onThemeChange,
  className,
}: ThemePanelProps & { className?: string }) {
  const [tab, setTab] = useState<ThemeTab>("colors");
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <ThemeTabControl value={tab} onValueChange={setTab} />
      <ThemeTabContent tab={tab} theme={theme} onThemeChange={onThemeChange} />
    </div>
  );
}
