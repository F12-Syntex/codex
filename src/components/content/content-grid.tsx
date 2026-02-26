import { BookOpen } from "lucide-react";
import { BookCard } from "./book-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Section, NavView } from "@/components/sidebar/app-sidebar";
import type { ViewMode } from "./content-toolbar";
import { bookData, mangaData } from "@/lib/mock-data";

interface ContentGridProps {
  activeView: NavView;
  section: Section;
  viewMode: ViewMode;
}

export function ContentGrid({ activeView, section, viewMode }: ContentGridProps) {
  const data = section === "books" ? bookData : mangaData;
  const items = data[activeView] ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
          <BookOpen className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">Nothing here yet</p>
          <p className="text-[11px] text-muted-foreground/60">Import items to get started</p>
        </div>
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-3">
          {items.map((item) => (
            <div
              key={item.title}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
            >
              <div
                className="relative h-10 w-7 shrink-0 overflow-hidden rounded-lg"
                style={{ background: item.gradient }}
              >
                <img src={item.cover} alt={item.title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                <div className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-black/20" />
                <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.author}</p>
              </div>
              <span className="shrink-0 rounded-lg bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/30">
                {item.format}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5 p-5">
        {items.map((item) => (
          <BookCard key={item.title} {...item} />
        ))}
      </div>
    </ScrollArea>
  );
}
