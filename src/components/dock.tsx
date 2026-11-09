"use client";

/**
 * Dock — Codex's floating glass pill.
 *
 * Fisheye magnification adapted from 21st.dev "Mac-Style Floating Dock"
 * (themeocean, id 43047 — bell-curve neighbour spread, active dot, name
 * tooltip) and "Magnetic Dock" (harshjadhavconnect, id 19178 — motion-value
 * springs). Tuned way down for toolbar-sized glyphs (max 1.35×).
 *
 * Its Appearance / Shortcuts panels are centred glass sheets that spring up
 * out of the dock (conventions §7).
 */

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Palette,
  Search,
  Keyboard,
  X,
  ImagePlus,
  Sun,
  Moon,
  MoonStar,
  PanelLeft,
  Check,
} from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { ACCENT_OPTIONS } from "@/lib/accent";
import { SHORTCUT_REGISTRY } from "@/lib/shortcuts";
import {
  APPEARANCE_OPTIONS,
  FONT_OPTIONS,
  type ThemeConfig,
  type CursorStyle,
  type AppearanceMode,
  type FontFamily,
  type CoverStyle,
} from "@/lib/theme";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils";

type DockModal = "theme" | "shortcuts" | null;

interface DockProps {
  theme: ThemeConfig;
  onThemeChange: (patch: Partial<ThemeConfig>) => void;
  onSearchOpen: () => void;
  /** Optional: show a sidebar toggle in the dock. */
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
}

const SHEET_SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const;

/* ═══ Shortcut keys → keycaps ═════════════════════════════════════════ */

function Keys({ keys, className }: { keys: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.split("+").map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </span>
  );
}

const keysFor = (id: string) => SHORTCUT_REGISTRY.find((s) => s.id === id)?.keys;

/* ═══ Panel shell ═════════════════════════════════════════════════════ */

function DockPanel({
  title,
  subtitle,
  onClose,
  toolbar,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      role="dialog"
      aria-label={title}
      className="glass-thick grain relative flex origin-bottom flex-col overflow-hidden rounded-2xl text-label"
      style={{ width: 404, height: 540, maxHeight: "calc(100vh - 150px)" }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.94, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97, filter: "blur(4px)" }}
      transition={reduce ? { duration: 0 } : SHEET_SPRING}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-start gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-display text-label">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-label-secondary">{subtitle}</p>}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="focus-ring pressable -mt-0.5 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary hover:bg-fill-secondary hover:text-label"
        >
          <X className="size-3.5" strokeWidth={2.25} />
        </button>
      </div>
      {toolbar && <div className="shrink-0 px-5 pb-4">{toolbar}</div>}
      <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
    </motion.div>
  );
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

/* ═══ Appearance panel ════════════════════════════════════════════════ */

type ThemeTab = "colors" | "style" | "background";

const MODE_ICONS: Record<AppearanceMode, React.ReactNode> = {
  dark: <Moon />,
  dim: <MoonStar />,
  light: <Sun />,
};

const FONT_PREVIEW: Record<FontFamily, string> = {
  geist: "var(--font-geist-sans)",
  inter: "'Inter', sans-serif",
  mono: "var(--font-geist-mono)",
  system: "var(--font-ui)",
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

function readImage(file: File | undefined, onLoad: (dataUrl: string) => void) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => onLoad(reader.result as string);
  reader.readAsDataURL(file);
}

function ThemePanel({
  theme,
  onThemeChange,
  onClose,
}: {
  theme: ThemeConfig;
  onThemeChange: (patch: Partial<ThemeConfig>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ThemeTab>("colors");
  const reduce = useReducedMotion();
  const ambientOn = theme.ambientBackground !== false;

  const swatchBase =
    "relative size-5.5 rounded-full shadow-[inset_0_0_0_0.5px_var(--separator-strong)] outline-solid outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand transition-[transform,outline-color] duration-200 ease-spring hover:scale-110";

  return (
    <DockPanel
      title="Appearance"
      subtitle="Make Codex yours. Changes apply instantly."
      onClose={onClose}
      toolbar={
        <SegmentedControl<ThemeTab>
          fill
          value={tab}
          onValueChange={setTab}
          options={[
            { value: "colors", label: "Colors" },
            { value: "style", label: "Style" },
            { value: "background", label: "Wallpaper" },
          ]}
        />
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          className="flex flex-col gap-5"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
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
                          className={cn(swatchBase, selected ? "outline-2 outline-label" : "outline-0 outline-transparent")}
                          style={{ backgroundColor: opt.swatch }}
                        >
                          {selected && (
                            <motion.span
                              layoutId="dock-accent-dot"
                              className="absolute inset-0 m-auto size-1.5 rounded-full bg-brand-fg"
                              transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
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
                        swatchBase,
                        theme.accent === "custom" ? "outline-2 outline-label" : "outline-0 outline-transparent",
                      )}
                      style={{
                        background: theme.accent === "custom" ? theme.customAccentColor : MULTICOLOR,
                      }}
                    >
                      {theme.accent === "custom" && (
                        <motion.span
                          layoutId="dock-accent-dot"
                          className="absolute inset-0 m-auto size-1.5 rounded-full bg-brand-fg"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
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
                <ListRow label="Appearance">
                  <SegmentedControl<AppearanceMode>
                    size="sm"
                    value={theme.appearance}
                    onValueChange={(v) => onThemeChange({ appearance: v })}
                    options={APPEARANCE_OPTIONS.map((o) => ({ value: o.id, label: o.label, icon: MODE_ICONS[o.id] }))}
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
                        <span className="text-xl leading-none font-medium" style={{ fontFamily: FONT_PREVIEW[f.id] }}>
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
                  />
                </div>
              </ListGroup>

              <ListGroup title="Corner radius">
                <SliderRow
                  label="Radius"
                  value={theme.borderRadius}
                  min={0}
                  max={16}
                  suffix="px"
                  onChange={(v) => onThemeChange({ borderRadius: v })}
                />
                <div className="p-2">
                  <SegmentedControl<string>
                    fill
                    size="sm"
                    value={String(theme.borderRadius)}
                    onValueChange={(v) => onThemeChange({ borderRadius: Number(v) })}
                    options={[0, 4, 8, 12, 16].map((v) => ({ value: String(v), label: `${v}px` }))}
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
    </DockPanel>
  );
}

/* ═══ Shortcuts panel ═════════════════════════════════════════════════ */

function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  const categories = [...new Set(SHORTCUT_REGISTRY.map((s) => s.category))];

  return (
    <DockPanel title="Shortcuts" subtitle="Everything is a keystroke away." onClose={onClose}>
      <div className="flex flex-col gap-5">
        {categories.map((cat) => (
          <ListGroup key={cat} title={cat}>
            {SHORTCUT_REGISTRY.filter((s) => s.category === cat).map((s) => (
              <ListRow key={s.id} label={s.label} className="min-h-10 py-1.5">
                <Keys keys={s.keys} />
              </ListRow>
            ))}
          </ListGroup>
        ))}
      </div>
    </DockPanel>
  );
}

/* ═══ Magnifying dock item ════════════════════════════════════════════ */

const SLOT = 40; // resting slot (px)
const MAX_SCALE = 1.35;
const REACH = 96; // px either side the fisheye reaches

function DockItem({
  mouseX,
  label,
  hint,
  active,
  pressed,
  onClick,
  children,
}: {
  mouseX: MotionValue<number>;
  label: string;
  hint?: string;
  active?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  const distance = useTransform(mouseX, (x) => {
    const el = ref.current;
    if (!el || !Number.isFinite(x)) return Infinity;
    const r = el.getBoundingClientRect();
    return x - (r.left + r.width / 2);
  });
  const spring = { mass: 0.1, stiffness: 180, damping: 13 };
  const width = useSpring(useTransform(distance, [-REACH, 0, REACH], [SLOT, SLOT * MAX_SCALE, SLOT]), spring);
  const scale = useSpring(useTransform(distance, [-REACH, 0, REACH], [1, MAX_SCALE, 1]), spring);
  const lift = useTransform(scale, (s) => (s - 1) * -10);

  return (
    <motion.div className="relative flex h-10 items-center justify-center" style={{ width: reduce ? SLOT : width }}>
      <AnimatePresence>
        {hovered && !pressed && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.94, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: 4, scale: 0.96, x: "-50%" }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className="glass-thick pointer-events-none absolute bottom-full left-1/2 mb-4 flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap text-label"
          >
            {label}
            {hint && <Keys keys={hint} />}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        whileTap={reduce ? undefined : { scale: 0.88 }}
        style={reduce ? undefined : { scale, y: lift }}
        className={cn(
          "focus-ring inline-flex size-9 origin-bottom items-center justify-center rounded-full transition-colors duration-150 [&_svg]:size-5",
          pressed ? "bg-fill-secondary text-label" : "text-label-secondary hover:bg-fill-tertiary hover:text-label",
        )}
      >
        {children}
      </motion.button>

      <motion.span
        aria-hidden="true"
        className="absolute -bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-label"
        initial={false}
        animate={{ opacity: active ? 0.85 : 0, scale: active ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </motion.div>
  );
}

/* ═══ Dock ════════════════════════════════════════════════════════════ */

export function Dock({ theme, onThemeChange, onSearchOpen, sidebarVisible, onToggleSidebar }: DockProps) {
  const [activeModal, setActiveModal] = useState<DockModal>(null);
  const mouseX = useMotionValue(Infinity);

  const toggle = (modal: DockModal) => setActiveModal((v) => (v === modal ? null : modal));
  const close = () => setActiveModal(null);

  useEffect(() => {
    if (!activeModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setActiveModal(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeModal]);

  return (
    <>
      <AnimatePresence>
        {activeModal && (
          <motion.div
            key="dock-scrim"
            className="fixed inset-0 z-40 bg-[var(--scrim)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            onClick={close}
          />
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-50 flex justify-center">
        <div className="pointer-events-auto relative">
          {/* Panels spring up, centred over the dock */}
          <div className="absolute bottom-full left-1/2 mb-4 -translate-x-1/2">
            <AnimatePresence mode="wait">
              {activeModal === "theme" && (
                <ThemePanel key="theme" theme={theme} onThemeChange={onThemeChange} onClose={close} />
              )}
              {activeModal === "shortcuts" && <ShortcutsPanel key="shortcuts" onClose={close} />}
            </AnimatePresence>
          </div>

          <motion.nav
            aria-label="Dock"
            onPointerMove={(e) => mouseX.set(e.clientX)}
            onPointerLeave={() => mouseX.set(Infinity)}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.15 }}
            className="glass flex h-13 items-center gap-1 rounded-full px-1.5"
          >
            {onToggleSidebar && (
              <>
                <DockItem
                  mouseX={mouseX}
                  label={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
                  hint={keysFor("toggle-sidebar")}
                  active={sidebarVisible}
                  onClick={() => {
                    close();
                    onToggleSidebar();
                  }}
                >
                  <PanelLeft strokeWidth={1.75} />
                </DockItem>
                <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-separator-strong" />
              </>
            )}

            <DockItem
              mouseX={mouseX}
              label="Search"
              hint={keysFor("search")}
              onClick={() => {
                close();
                onSearchOpen();
              }}
            >
              <Search strokeWidth={1.75} />
            </DockItem>
            <DockItem
              mouseX={mouseX}
              label="Appearance"
              active={activeModal === "theme"}
              pressed={activeModal === "theme"}
              onClick={() => toggle("theme")}
            >
              <Palette strokeWidth={1.75} />
            </DockItem>
            <DockItem
              mouseX={mouseX}
              label="Shortcuts"
              active={activeModal === "shortcuts"}
              pressed={activeModal === "shortcuts"}
              onClick={() => toggle("shortcuts")}
            >
              <Keyboard strokeWidth={1.75} />
            </DockItem>
          </motion.nav>
        </div>
      </div>
    </>
  );
}
