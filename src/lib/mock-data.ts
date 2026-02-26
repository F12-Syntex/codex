import type { NavView } from "@/components/sidebar/app-sidebar";

export type BookFormat = "EPUB" | "PDF" | "CBZ" | "CBR" | "MOBI";

export type MockItem = {
  title: string;
  author: string;
  gradient: string;
  cover: string;
  format: BookFormat;
};

export type LibraryData = Partial<Record<NavView, MockItem[]>>;

// Gradient palette for imported items (cycles through these)
const GRADIENTS = [
  "linear-gradient(135deg, #667eea, #764ba2)",
  "linear-gradient(135deg, #f093fb, #f5576c)",
  "linear-gradient(135deg, #4facfe, #00f2fe)",
  "linear-gradient(135deg, #43e97b, #38f9d7)",
  "linear-gradient(135deg, #fa709a, #fee140)",
  "linear-gradient(135deg, #a18cd1, #fbc2eb)",
  "linear-gradient(135deg, #ff9a9e, #fad0c4)",
  "linear-gradient(135deg, #84fab0, #8fd3f4)",
];

let gradientIndex = 0;

export function fileToMockItem(file: ImportedFile): MockItem {
  const gradient = GRADIENTS[gradientIndex % GRADIENTS.length];
  gradientIndex++;
  return {
    title: file.name,
    author: "Unknown",
    gradient,
    cover: "",
    format: file.format as BookFormat,
  };
}

export const initialBookData: LibraryData = {};
export const initialComicData: LibraryData = {};
