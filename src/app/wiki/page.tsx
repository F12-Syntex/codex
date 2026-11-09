"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { WikiViewer } from "./components/WikiViewer";

function LoadingScreen() {
  return (
    <div className="app-canvas flex h-screen items-center justify-center">
      <Loader2 className="size-5 animate-spin text-label-tertiary" strokeWidth={1.75} />
    </div>
  );
}

function WikiPage() {
  const searchParams = useSearchParams();
  const filePath = searchParams.get("filePath") || "";
  const bookTitle = searchParams.get("title") || "Untitled";
  const initialEntryId = searchParams.get("entryId") || undefined;

  return <WikiViewer filePath={filePath} bookTitle={bookTitle} initialEntryId={initialEntryId} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <WikiPage />
    </Suspense>
  );
}
