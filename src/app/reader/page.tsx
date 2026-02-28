"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Reader } from "./components/Reader";

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg-inset)]">
      <Loader2 className="h-6 w-6 animate-spin text-white/40" strokeWidth={1.5} />
    </div>
  );
}

function ReaderPage() {
  const searchParams = useSearchParams();

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
