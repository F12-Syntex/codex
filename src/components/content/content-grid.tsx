import { BookOpen } from "lucide-react";
import { BookCard } from "./book-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Section, NavView } from "@/components/sidebar/app-sidebar";
import type { ViewMode } from "./content-toolbar";
import type { CoverStyle } from "@/lib/theme";
import { bookData, mangaData } from "@/lib/mock-data";

interface ContentGridProps {
  activeView: NavView;
  section: Section;
  viewMode: ViewMode;
  coverStyle: CoverStyle;
  showFormatBadge: boolean;
}

export function ContentGrid({ activeView, section, viewMode, coverStyle, showFormatBadge }: ContentGridProps) {
  const data = section === "books" ? bookData : mangaData;
  const items = data[activeView] ?? [];
  const radius = coverStyle === "rounded" ? "rounded-xl" : "rounded-none";

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

  /* ── List view — text only, no images ──────────────────── */
  if (viewMode === "list") {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-3">
          {items.map((item) => (
            <div
              key={item.title}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.author}</p>
              </div>
              {showFormatBadge && (
                <span className="shrink-0 rounded-lg bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/30">
                  {item.format}
                </span>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  }

  /* ── Detail view — wide cards with image + info ────────── */
  if (viewMode === "detail") {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3 p-5">
          {items.map((item) => (
            <div
              key={item.title}
              className="group flex gap-4 rounded-lg bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.05]"
            >
              {/* Cover */}
              <div className="relative shrink-0">
                <div
                  className={`relative h-32 w-[85px] overflow-hidden ${radius}`}
                >
                  <img
                    src={item.cover}
                    alt={item.title}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>

              {/* Info */}
              <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                <div>
                  <p className="text-sm font-semibold leading-tight">{item.title}</p>
                  <p className="mt-1 text-xs text-white/40">{item.author}</p>
                </div>
                <div className="flex items-center gap-2">
                  {showFormatBadge && (
                    <span className="rounded-lg bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/30">
                      {item.format}
                    </span>
                  )}
                  <span className="text-[11px] text-white/15">Added recently</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  }

  /* ── Grid view — standard card grid ────────────────────── */
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5 p-5">
        {items.map((item) => (
          <BookCard
            key={item.title}
            {...item}
            coverStyle={coverStyle}
            showFormatBadge={showFormatBadge}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
