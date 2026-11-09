"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAppTheme } from "@/lib/use-app-theme";
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

function ReaderPage() {
  const searchParams = useSearchParams();
  // The library's accent, tint, cursor, radius and UI font (conventions §13.13). Appearance is
  // not taken from the library: it follows the reading paper (<Reader> sets it).
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
