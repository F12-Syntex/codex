"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FONT_FAMILY_CSS, type ThemeConfig } from "@/lib/theme";
import { Reader } from "./components/Reader";

function LoadingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-canvas">
      <div className="relative grid size-12 place-items-center">
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-brand/15" />
        <span className="size-2.5 rounded-full bg-brand shadow-[0_0_24px_-4px_var(--accent-brand)]" />
      </div>
      <span className="font-display text-sm text-label-secondary">Opening book…</span>
    </div>
  );
}

type SavedTheme = Partial<Pick<ThemeConfig,
  "accent" | "customAccentColor" | "tintSurfaces" | "cursorStyle" | "fontFamily" | "borderRadius"
>>;

/**
 * Mirror the library's theme onto <html> in the reader window, as the main
 * window does (src/app/page.tsx), so portals (modals, menus, tooltips) get it
 * too: accent (custom accent included), tint, cursor, radius and UI font.
 * `data-appearance` follows the reading paper and is set by <Reader>.
 */
function useAppTheme() {
  const [theme, setTheme] = useState<SavedTheme | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.getSetting?.("theme").then((raw) => {
      if (cancelled || !raw) return;
      try {
        setTheme(JSON.parse(raw) as SavedTheme);
      } catch { /* ignore invalid JSON */ }
    });
    return () => { cancelled = true; };
  }, []);

  useLayoutEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const custom = theme.accent === "custom" && !!theme.customAccentColor;
    const attrs: Record<string, string | undefined> = {
      "data-accent": theme.accent,
      "data-tint": theme.tintSurfaces ? "true" : undefined,
      "data-cursor": theme.cursorStyle && theme.cursorStyle !== "default" ? theme.cursorStyle : undefined,
    };
    const fontFamily = theme.fontFamily ? FONT_FAMILY_CSS[theme.fontFamily] : undefined;
    const vars: Record<string, string> = {};
    if (typeof theme.borderRadius === "number") vars["--radius"] = `${theme.borderRadius / 16}rem`;
    if (fontFamily) vars["--font-ui"] = fontFamily;
    if (custom) {
      const hex = theme.customAccentColor!;
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

    return () => {
      for (const name of Object.keys(attrs)) root.removeAttribute(name);
      for (const name of Object.keys(vars)) root.style.removeProperty(name);
      root.style.removeProperty("font-family");
    };
  }, [theme]);
}

function ReaderPage() {
  const searchParams = useSearchParams();
  useAppTheme();

  const title = searchParams.get("title") || "Untitled";
  const author = searchParams.get("author") || "Unknown Author";
  const format = searchParams.get("format") || "EPUB";
  const filePath = searchParams.get("filePath") || "";
  // Set by main when `book:reveal` opens the reader for a citation.
  const revealChapterId = searchParams.get("revealChapterId");
  const revealParaId = searchParams.get("revealParaId");
  const initialReveal = useMemo(
    () => (revealChapterId && revealParaId ? { chapterId: revealChapterId, paraId: revealParaId } : null),
    [revealChapterId, revealParaId],
  );

  return (
    <Reader
      filePath={filePath}
      format={format}
      title={title}
      author={author}
      initialReveal={initialReveal}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ReaderPage />
    </Suspense>
  );
}
