"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StyleDictionaryView } from "./components/StyleDictionaryView";

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg-inset)]">
      <Loader2 className="h-6 w-6 animate-spin text-white/40" strokeWidth={1.5} />
    </div>
  );
}

function StyleDictionaryPage() {
  const searchParams = useSearchParams();
  const filePath = searchParams.get("filePath") || "";
  const bookTitle = searchParams.get("title") || "Untitled";

  return <StyleDictionaryView filePath={filePath} bookTitle={bookTitle} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <StyleDictionaryPage />
    </Suspense>
  );
}
