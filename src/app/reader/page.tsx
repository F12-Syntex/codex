"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Reader } from "./components/Reader";

function LoadingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-canvas">
      <div className="relative grid size-12 place-items-center">
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-brand/15" />
        <span className="size-2.5 rounded-full bg-brand shadow-[0_0_24px_-4px_var(--accent-brand)]" />
      </div>
      <span className="font-display text-sm text-label-tertiary">Opening book…</span>
    </div>
  );
}

/** Mirror the library's accent colour into the reader window. */
function useAppAccent() {
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.getSetting?.("theme").then((raw) => {
      if (cancelled || !raw) return;
      try {
        const saved = JSON.parse(raw) as { accent?: string };
        if (saved.accent) document.documentElement.dataset.accent = saved.accent;
      } catch { /* ignore invalid JSON */ }
    });
    return () => { cancelled = true; };
  }, []);
}

function ReaderPage() {
  const searchParams = useSearchParams();
  useAppAccent();

  const title = searchParams.get("title") || "Untitled";
  const author = searchParams.get("author") || "Unknown Author";
  const format = searchParams.get("format") || "EPUB";
  const filePath = searchParams.get("filePath") || "";

  return (
    <Reader
      filePath={filePath}
      format={format}
      title={title}
      author={author}
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
