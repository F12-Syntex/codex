"use client";

/**
 * useAppTheme — mirror the library's saved theme onto `<html>` in any window (conventions §13.13).
 *
 * Every secondary window boots through it via `WindowShell`, so accent (custom accent included),
 * tint, cursor, radius, UI font, surface glass and — with `{ appearance: true }` — Light/Dim and
 * `color-scheme` apply exactly as in the main window (`src/app/page.tsx`). Attributes and vars sit
 * on `<html>` so portals (menus, modals, tooltips) inherit them.
 *
 * Source of truth is the `theme` setting (the main window writes it). There is no theme broadcast
 * channel, so the hook re-reads it whenever the window regains focus or becomes visible — changing
 * the theme in the library and switching back to a Wiki/Buddy window picks it up. The last theme
 * seen is cached in localStorage (same origin for every window) and applied in a layout effect, so
 * windows opened later paint the right theme on their first frame instead of flashing dark.
 */

import { useEffect, useLayoutEffect, useState } from "react";
import { FONT_FAMILY_CSS, type ThemeConfig } from "@/lib/theme";

export type SavedTheme = Partial<Pick<ThemeConfig,
  "accent" | "customAccentColor" | "appearance" | "tintSurfaces" | "cursorStyle" | "fontFamily" | "borderRadius" | "surfaceOpacity"
>>;

export interface UseAppThemeOptions {
  /**
   * Also apply `data-appearance` and `color-scheme`. Off for the reader, whose appearance follows
   * the reading paper.
   */
  appearance?: boolean;
}

const CACHE_KEY = "codex:theme";

function readCache(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}

function writeCache(raw: string) {
  try {
    localStorage.setItem(CACHE_KEY, raw);
  } catch { /* storage unavailable */ }
}

function parse(raw: string | null): SavedTheme | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as unknown;
    return t && typeof t === "object" ? (t as SavedTheme) : null;
  } catch {
    return null;
  }
}

/** Apply `theme` to `<html>`; returns a function that removes exactly what was set. */
export function applyAppTheme(theme: SavedTheme, { appearance = false }: UseAppThemeOptions = {}): () => void {
  const root = document.documentElement;
  const attrs: Record<string, string | undefined> = {
    "data-accent": theme.accent,
    "data-tint": theme.tintSurfaces ? "true" : undefined,
    "data-cursor": theme.cursorStyle && theme.cursorStyle !== "default" ? theme.cursorStyle : undefined,
  };
  if (appearance) attrs["data-appearance"] = theme.appearance ?? "dark";

  const fontFamily = theme.fontFamily ? FONT_FAMILY_CSS[theme.fontFamily] : undefined;
  const vars: Record<string, string> = {};
  if (typeof theme.borderRadius === "number") vars["--radius"] = `${theme.borderRadius / 16}rem`;
  if (typeof theme.surfaceOpacity === "number") {
    vars["--surface-opacity"] = String(Math.min(100, Math.max(50, theme.surfaceOpacity)) / 100);
  }
  if (fontFamily) vars["--font-ui"] = fontFamily;
  if (theme.accent === "custom" && theme.customAccentColor) {
    const hex = theme.customAccentColor;
    vars["--accent-brand"] = hex;
    vars["--accent-brand-dim"] = `${hex}26`;
    vars["--accent-brand-subtle"] = `${hex}14`;
    vars["--accent-brand-fg"] = "#fafafa";
  }

  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) root.removeAttribute(name);
    else root.setAttribute(name, value);
  }
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  if (fontFamily) root.style.fontFamily = fontFamily;
  if (appearance) root.style.colorScheme = theme.appearance === "light" ? "light" : "dark";

  return () => {
    for (const name of Object.keys(attrs)) root.removeAttribute(name);
    for (const name of Object.keys(vars)) root.style.removeProperty(name);
    if (fontFamily) root.style.removeProperty("font-family");
    if (appearance) root.style.removeProperty("color-scheme");
  };
}

export function useAppTheme({ appearance = false }: UseAppThemeOptions = {}): void {
  useLayoutEffect(() => {
    let alive = true;
    let current: string | null = null;
    let undo: (() => void) | null = null;

    const apply = (raw: string | null) => {
      if (!alive || !raw || raw === current) return;
      const theme = parse(raw);
      if (!theme) return;
      current = raw;
      undo?.();
      undo = applyAppTheme(theme, { appearance });
    };

    // First frame: the last theme any window saw (no dark flash in a Light library).
    apply(readCache());

    const load = () => {
      const get = window.electronAPI?.getSetting;
      if (!get) return;
      get("theme")
        .then((raw) => {
          if (!alive) return;
          // Nothing saved yet: the defaults (dark, blue), even if a stale cache said otherwise.
          const value = raw || "{}";
          writeCache(value);
          apply(value);
        })
        .catch(() => { /* keep the cached theme */ });
    };
    load();

    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    const onStorage = (e: StorageEvent) => { if (e.key === CACHE_KEY) apply(e.newValue); };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);

    return () => {
      alive = false;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      undo?.();
    };
  }, [appearance]);
}

/**
 * The library's Light/Dark appearance, live (same sources as `useAppTheme`). The reader uses it
 * to pick its paper when "Match app" is on, so the two windows read as one program.
 */
export function useAppAppearance(): "light" | "dark" {
  const [appearance, setAppearance] = useState<"light" | "dark">("dark");

  useEffect(() => {
    let alive = true;
    const apply = (raw: string | null) => {
      if (!alive) return;
      setAppearance(parse(raw)?.appearance === "light" ? "light" : "dark");
    };
    apply(readCache());

    const load = () => {
      window.electronAPI?.getSetting("theme")
        .then((raw) => apply(raw || "{}"))
        .catch(() => { /* keep the cached appearance */ });
    };
    load();

    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    const onStorage = (e: StorageEvent) => { if (e.key === CACHE_KEY) apply(e.newValue); };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return appearance;
}
