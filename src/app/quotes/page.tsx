"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { QuotesView } from "./components/QuotesView";

function LoadingScreen() {
  return (
    <div className="app-canvas flex h-screen items-center justify-center">
      <Loader2 className="size-5 animate-spin text-label-tertiary" strokeWidth={1.75} />
    </div>
  );
}

function QuotesPage() {
  const searchParams = useSearchParams();
  const filePath = searchParams.get("filePath") || undefined;
  const title = searchParams.get("title") || undefined;
  return <QuotesView filePath={filePath} bookTitle={title} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <QuotesPage />
    </Suspense>
  );
}
