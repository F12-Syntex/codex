"use client";

import { useState } from "react";
import { Palette, Settings, Search, Keyboard, X, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ACCENT_OPTIONS, type AccentId } from "@/lib/accent";
import { SHORTCUT_REGISTRY } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

type DockModal = "theme" | "shortcuts" | "settings" | null;

interface DockProps {
  accent: AccentId;
  onAccentChange: (accent: AccentId) => void;
  onSearchOpen: () => void;
  backgroundImage: string | null;
  onBackgroundImageChange: (url: string | null) => void;
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
      className="overlay-panel absolute bottom-full left-1/2 z-50 mb-[10px] -translate-x-1/2 rounded-lg border border-white/[0.08] bg-[var(--bg-overlay)] p-4 shadow-xl shadow-black/50"
      style={width ? { width } : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <button onClick={onClose} className="text-white/30 transition-colors hover:text-white/60">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

/* ── Theme modal ─────────────────────────────────────────── */
function ThemeModal({
  accent,
  onAccentChange,
  backgroundImage,
  onBackgroundImageChange,
  onClose,
}: {
  accent: AccentId;
  onAccentChange: (a: AccentId) => void;
  backgroundImage: string | null;
  onBackgroundImageChange: (url: string | null) => void;
  onClose: () => void;
}) {
  return (
    <ModalShell title="Accent color" onClose={onClose}>
      <div className="flex items-center gap-3">
        {ACCENT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onAccentChange(opt.id)}
            className={cn(
              "h-7 w-7 rounded-full transition-all",
              accent === opt.id
                ? "scale-110 ring-2 ring-white/80 ring-offset-2 ring-offset-[var(--bg-overlay)]"
                : "hover:scale-105"
            )}
            style={{ backgroundColor: opt.swatch }}
            title={opt.label}
          />
        ))}
      </div>

      <div className="mt-4 border-t border-white/[0.04] pt-3">
        <span className="text-xs font-medium text-muted-foreground">Background</span>
        <div className="mt-2 flex items-center gap-2">
          {backgroundImage ? (
            <div className="flex items-center gap-2">
              <div
                className="h-8 w-14 rounded-lg border border-white/10 bg-cover bg-center"
                style={{ backgroundImage: `url(${backgroundImage})` }}
              />
              <button
                onClick={() => onBackgroundImageChange(null)}
                className="text-xs text-white/40 transition-colors hover:text-white/70"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs text-white/40 transition-colors hover:border-white/20 hover:text-white/60">
              <Image className="h-3.5 w-3.5" />
              Add image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => onBackgroundImageChange(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

/* ── Shortcuts modal ─────────────────────────────────────── */
function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const categories = [...new Set(SHORTCUT_REGISTRY.map((s) => s.category))];

  return (
    <ModalShell title="Keyboard shortcuts" onClose={onClose} width="320px">
      <div className="flex flex-col gap-3">
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
      <div className="flex flex-col gap-3">
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
export function Dock({ accent, onAccentChange, onSearchOpen, backgroundImage, onBackgroundImageChange }: DockProps) {
  const [activeModal, setActiveModal] = useState<DockModal>(null);

  const toggle = (modal: DockModal) => setActiveModal((v) => (v === modal ? null : modal));
  const close = () => setActiveModal(null);

  return (
    <>
      {/* Backdrop — closes modal on click outside */}
      {activeModal && (
        <div className="overlay-backdrop absolute inset-0 z-40 bg-black/20" onClick={close} />
      )}

      {/* Dock + modals share a single positioned wrapper so modals are centered to dock */}
      <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2">
        {/* Modal renders above the dock pill */}
        {activeModal === "theme" && (
          <ThemeModal
            accent={accent}
            onAccentChange={onAccentChange}
            backgroundImage={backgroundImage}
            onBackgroundImageChange={onBackgroundImageChange}
            onClose={close}
          />
        )}
        {activeModal === "shortcuts" && <ShortcutsModal onClose={close} />}
        {activeModal === "settings" && <SettingsModal onClose={close} />}

        {/* Dock pill */}
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
            <TooltipContent side="top">Theme</TooltipContent>
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
