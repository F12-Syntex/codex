"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BuddyWindow } from "./components/BuddyWindow";

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg-inset)]">
      <Loader2 className="h-6 w-6 animate-spin text-white/40" strokeWidth={1.5} />
    </div>
  );
}

function BuddyPage() {
  const searchParams = useSearchParams();
  const filePath = searchParams.get("filePath") || "";
  const bookTitle = searchParams.get("title") || "Untitled";
  const currentChapter = parseInt(searchParams.get("currentChapter") || "0", 10);
  const totalChapters = parseInt(searchParams.get("totalChapters") || "1", 10);

  return (
    <BuddyWindow
      filePath={filePath}
      bookTitle={bookTitle}
      currentChapter={currentChapter}
      totalChapters={totalChapters}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <BuddyPage />
    </Suspense>
  );
}
