"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StyleDictionaryView } from "./components/StyleDictionaryView";

function LoadingScreen() {
  return (
    <div className="app-canvas flex h-screen items-center justify-center">
      <Loader2 className="size-5 animate-spin text-label-tertiary" strokeWidth={1.75} />
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
