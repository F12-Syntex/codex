"use client";

/**
 * Dock — Codex's floating glass pill.
 *
 * Three quiet glyphs at a fixed size: no magnification (a dock earns a
 * fisheye when it holds things, not utility buttons). Hover fills, press
 * squishes, and a dot appears only while a panel is open. While books are
 * multi-selected the dock sinks away and the selection bar takes its slot.
 *
 * Its Appearance / Shortcuts panels are centred glass sheets that spring up
 * out of the dock (conventions §7) and hug their content.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Palette, Keyboard, X, PanelLeft } from "lucide-react";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { Keys } from "@/components/ui/kbd";
import { ThemeTabContent, ThemeTabControl, type ThemeTab } from "@/components/theme-panel";
import { SHORTCUT_REGISTRY } from "@/lib/shortcuts";
import type { ThemeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";

type DockModal = "theme" | "shortcuts" | null;

interface DockProps {
  theme: ThemeConfig;
  onThemeChange: (patch: Partial<ThemeConfig>) => void;
  /** Sink the dock out of the way (e.g. while the selection bar owns its slot). */
  hidden?: boolean;
  /** Optional: show a sidebar toggle in the dock. */
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
}

const SHEET_SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const;

const keysFor = (id: string) => SHORTCUT_REGISTRY.find((s) => s.id === id)?.keys;

/* ═══ Focus management ════════════════════════════════════════════════ */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside an open panel: focuses its first control on
 * open, wraps Tab / Shift+Tab, and hands focus back to the opener on close.
 * (The panel floats over the dock, so it can't be a portaled Radix dialog.)
 */
function useFocusTrap(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);

    (focusables()[0] ?? node).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      const outside = !node.contains(active);
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref]);
}

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
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="glass-thick grain relative flex origin-bottom flex-col overflow-hidden rounded-2xl text-label outline-none"
      style={{ width: 404, height: "auto", maxHeight: "min(540px, calc(100vh - 150px))" }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.94, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
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

/* ═══ Appearance panel ════════════════════════════════════════════════ */

/** The dock's quick path into the shared ThemePanel (Settings renders the same). */
function AppearancePanel({
  theme,
  onThemeChange,
  onClose,
}: {
  theme: ThemeConfig;
  onThemeChange: (patch: Partial<ThemeConfig>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ThemeTab>("colors");
  return (
    <DockPanel
      title="Appearance"
      subtitle="Make Codex yours. Changes apply instantly."
      onClose={onClose}
      toolbar={<ThemeTabControl value={tab} onValueChange={setTab} />}
    >
      <ThemeTabContent tab={tab} theme={theme} onThemeChange={onThemeChange} />
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

/* ═══ Dock item ═══════════════════════════════════════════════════════ */

function DockItem({
  label,
  hint,
  active,
  pressed,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  /** Shows the dot beneath the glyph — only while its panel is open. */
  active?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  return (
    <div className="relative flex size-10 items-center justify-center">
      <AnimatePresence>
        {hovered && !pressed && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.94, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: 4, scale: 0.96, x: "-50%" }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className="glass-thick pointer-events-none absolute bottom-full left-1/2 mb-4 flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap text-label shadow-lg"
          >
            {label}
            {hint && <Keys keys={hint} />}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        whileTap={reduce ? undefined : { scale: 0.92 }}
        transition={{ type: "spring", stiffness: 600, damping: 30 }}
        className={cn(
          "focus-ring inline-flex size-9 items-center justify-center rounded-full transition-colors duration-150 [&_svg]:size-5",
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
    </div>
  );
}

/* ═══ Dock ════════════════════════════════════════════════════════════ */

const DOCK_SPRING = { type: "spring", stiffness: 260, damping: 26 } as const;

export function Dock({ theme, onThemeChange, hidden = false, sidebarVisible, onToggleSidebar }: DockProps) {
  const [activeModal, setActiveModal] = useState<DockModal>(null);
  const reduce = useReducedMotion();

  const toggle = (modal: DockModal) => setActiveModal((v) => (v === modal ? null : modal));
  const close = () => setActiveModal(null);

  // A sunk dock can't own an open panel.
  useEffect(() => {
    if (hidden) setActiveModal(null);
  }, [hidden]);

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
        <div className={cn("relative", hidden ? "pointer-events-none" : "pointer-events-auto")}>
          {/* Panels spring up, centred over the dock */}
          <div className="absolute bottom-full left-1/2 mb-4 -translate-x-1/2">
            <AnimatePresence mode="wait">
              {activeModal === "theme" && (
                <AppearancePanel key="theme" theme={theme} onThemeChange={onThemeChange} onClose={close} />
              )}
              {activeModal === "shortcuts" && <ShortcutsPanel key="shortcuts" onClose={close} />}
            </AnimatePresence>
          </div>

          {/* Outer layer sinks the dock while hidden; inner layer is the entrance. */}
          <motion.div
            initial={false}
            animate={hidden ? { opacity: 0, y: 24 } : { opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : DOCK_SPRING}
            aria-hidden={hidden || undefined}
            inert={hidden || undefined}
          >
            <motion.nav
              aria-label="Dock"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={reduce ? { duration: 0 } : { ...DOCK_SPRING, delay: 0.15 }}
              className="glass flex h-13 items-center gap-1 rounded-full px-1.5"
            >
              {onToggleSidebar && (
                <>
                  <DockItem
                    label={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
                    hint={keysFor("toggle-sidebar")}
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
                label="Appearance"
                active={activeModal === "theme"}
                pressed={activeModal === "theme"}
                onClick={() => toggle("theme")}
              >
                <Palette strokeWidth={1.75} />
              </DockItem>
              <DockItem
                label="Shortcuts"
                active={activeModal === "shortcuts"}
                pressed={activeModal === "shortcuts"}
                onClick={() => toggle("shortcuts")}
              >
                <Keyboard strokeWidth={1.75} />
              </DockItem>
            </motion.nav>
          </motion.div>
        </div>
      </div>
    </>
  );
}
