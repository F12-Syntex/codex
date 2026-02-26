import type { NavView } from "@/components/sidebar/app-sidebar";

export type BookFormat = "EPUB" | "PDF" | "CBZ" | "CBR" | "MOBI";

export type MockItem = {
  id: number;
  title: string;
  author: string;
  gradient: string;
  cover: string;
  format: BookFormat;
  filePath: string;
};

export type LibraryData = Partial<Record<NavView, MockItem[]>>;

export function libraryItemToMockItem(item: LibraryItem): MockItem {
  return {
    id: item.id,
    title: item.title,
    author: item.author,
    gradient: item.gradient,
    cover: item.cover,
    format: item.format as BookFormat,
    filePath: item.filePath,
  };
}

export function groupByView(items: LibraryItem[]): LibraryData {
  const data: LibraryData = {};
  for (const item of items) {
    const view = item.view as NavView;
    if (!data[view]) data[view] = [];
    data[view]!.push(libraryItemToMockItem(item));
  }
  return data;
}

export const initialBookData: LibraryData = {};
export const initialComicData: LibraryData = {};
