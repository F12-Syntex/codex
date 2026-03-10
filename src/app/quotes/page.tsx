"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { QuotesView } from "./components/QuotesView";

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg-inset)]">
      <Loader2 className="h-6 w-6 animate-spin text-white/40" strokeWidth={1.5} />
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
