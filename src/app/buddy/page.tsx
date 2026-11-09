"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BuddyWindow } from "./components/BuddyWindow";

function LoadingScreen() {
  return (
    <div className="app-canvas flex h-screen items-center justify-center">
      <Loader2 className="size-5 animate-spin text-label-tertiary" strokeWidth={1.75} />
    </div>
  );
}

function BuddyPage() {
  const searchParams = useSearchParams();
  const filePath = searchParams.get("filePath") || "";
  const bookTitle = searchParams.get("title") || "Untitled";
  const currentChapter = parseInt(searchParams.get("currentChapter") || "0", 10);
  const totalChapters = parseInt(searchParams.get("totalChapters") || "1", 10);
  const threadId = searchParams.get("threadId");

  return (
    <BuddyWindow
      filePath={filePath}
      bookTitle={bookTitle}
      currentChapter={currentChapter}
      totalChapters={totalChapters}
      threadId={threadId}
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
