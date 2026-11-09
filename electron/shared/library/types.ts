/**
 * Smart library tagging + series detection (AI_AUDIT §6 F5; owner WS-E for Phase 2d).
 *
 * PURE: no `electron`, Node or DOM imports. Shared by main (`electron/library/*`,
 * `electron/ai/tasks/library-tags.ts`) and the renderer (`src/lib/library/*`).
 *
 * Library rows are keyed by `filePath` like every other per-book table of the rebuild (ids of the
 * legacy `items` table change when a book is re-imported).
 */

// ── Taxonomy ────────────────────────────────────────────────────────────────

/** Fixed genre taxonomy the model must choose from (output is validated against it). */
export const GENRE_TAXONOMY = [
  "Action", "Adventure", "Comedy", "Coming of Age", "Cultivation", "Drama", "Dystopian", "Fantasy",
  "Game / LitRPG", "Harem", "Historical", "Horror", "Isekai", "Martial Arts", "Mecha", "Mystery",
  "Non-fiction", "Philosophical", "Post-apocalyptic", "Psychological", "Romance", "School Life",
  "Science Fiction", "Slice of Life", "Sports", "Supernatural", "Thriller", "Tragedy", "Urban Fantasy",
  "Wuxia / Xianxia", "Young Adult",
] as const;
export type Genre = (typeof GENRE_TAXONOMY)[number];

/** Content warnings the model may flag (validated). */
export const CONTENT_WARNINGS = [
  "Violence", "Gore", "Sexual content", "Abuse", "Self-harm", "Suicide", "Substance use", "Death",
  "Torture", "Strong language",
] as const;

/** Common spellings the model (or a web lookup) returns → taxonomy entry. */
export const GENRE_SYNONYMS: Readonly<Record<string, Genre>> = {
  "sci-fi": "Science Fiction", "scifi": "Science Fiction", "science-fiction": "Science Fiction", "sf": "Science Fiction",
  "litrpg": "Game / LitRPG", "gamelit": "Game / LitRPG", "game": "Game / LitRPG", "system": "Game / LitRPG",
  "xianxia": "Wuxia / Xianxia", "wuxia": "Wuxia / Xianxia", "xuanhuan": "Cultivation",
  "slice-of-life": "Slice of Life", "sol": "Slice of Life", "school": "School Life",
  "ya": "Young Adult", "young-adult": "Young Adult", "nonfiction": "Non-fiction", "non fiction": "Non-fiction",
  "post apocalyptic": "Post-apocalyptic", "apocalypse": "Post-apocalyptic", "apocalyptic": "Post-apocalyptic",
  "urban": "Urban Fantasy", "romcom": "Romance", "rom-com": "Romance", "suspense": "Thriller",
  "crime": "Mystery", "detective": "Mystery", "paranormal": "Supernatural", "martial-arts": "Martial Arts",
  "coming-of-age": "Coming of Age", "dystopia": "Dystopian", "history": "Historical", "psychology": "Psychological",
};

function genreKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const GENRE_INDEX = new Map<string, Genre>(GENRE_TAXONOMY.map((g) => [genreKey(g), g]));
for (const [k, v] of Object.entries(GENRE_SYNONYMS)) GENRE_INDEX.set(genreKey(k), v);
// "Wuxia / Xianxia" and "Game / LitRPG" are also matched by either half.
for (const g of GENRE_TAXONOMY) if (g.includes("/")) for (const half of g.split("/")) GENRE_INDEX.set(genreKey(half), g);

/** Maps a free-form genre to the taxonomy, or null. */
export function normalizeGenre(raw: unknown): Genre | null {
  if (typeof raw !== "string") return null;
  return GENRE_INDEX.get(genreKey(raw)) ?? null;
}

export function normalizeWarning(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const k = genreKey(raw);
  return CONTENT_WARNINGS.find((w) => genreKey(w) === k) ?? null;
}

// ── Stored data ─────────────────────────────────────────────────────────────

export type LibraryTagKind = "genre" | "trope" | "warning";
export type LibraryDecision = "suggested" | "accepted" | "dismissed";
/** Who proposed it: the `library.tag` task, a web lookup (`book.lookup`), the user, or filename rules. */
export type LibrarySource = "ai" | "web" | "user" | "local";

export interface LibraryTag {
  tag: string;
  kind: LibraryTagKind;
  status: LibraryDecision;
  source: LibrarySource;
}

export interface ItemSeries {
  name: string;
  /** Volume / issue number; null when the item belongs to the series without a number. */
  number: number | null;
  status: LibraryDecision;
  source: LibrarySource;
}

export interface ItemLibraryInfo {
  filePath: string;
  tags: LibraryTag[];
  series: ItemSeries | null;
  /** From the last `library.tag` run. */
  language?: string;
  oneLine?: string;
  taggedAt?: number;
}

/** Light per-book summary for the grid (accepted data only, plus a count of pending suggestions). */
export interface LibraryOverviewEntry {
  genres: string[];
  series?: { name: string; number: number | null };
  /** Suggested tags / series waiting for a decision. */
  pending: number;
}
export type LibraryOverview = Record<string, LibraryOverviewEntry>;

// ── Tagging runs ────────────────────────────────────────────────────────────

export interface LibraryTagRequest {
  /** Default: every library item of `section` (or the whole library). */
  filePaths?: string[];
  section?: "books" | "comic";
  /** Re-tag items that were already tagged by the current task version. */
  force?: boolean;
}

export interface LibraryTagRun {
  runId: string;
  state: "running" | "done" | "cancelled";
  /** Items queued in this run. */
  total: number;
  done: number;
  failed: number;
  startedAt: number;
  finishedAt?: number;
  /** Last job error (e.g. "No API key"). */
  error?: string;
}

// ── Series detection ────────────────────────────────────────────────────────

export interface SeriesVolume {
  filePath: string;
  title: string;
  number: number | null;
}

export interface SeriesSuggestion {
  /** Normalised series key (`seriesKey(name)`). */
  key: string;
  name: string;
  /** "local": filename/title rules; "ai": from `library.tag` results. */
  source: "local" | "ai";
  volumes: SeriesVolume[];
}

export interface SeriesAssignment {
  filePath: string;
  /** null clears / dismisses the item's series suggestion. */
  name: string | null;
  number?: number | null;
  /** Default "accepted". "dismissed" hides this name for this item in future detections. */
  status?: "accepted" | "dismissed";
}

// ── Task I/O (`library.tag`, `book.lookup`) ────────────────────────────────

export interface LibraryTagItemInput {
  filePath: string;
  title: string;
  author?: string;
  /** File name without directories. */
  filename: string;
  /** Last folder names (never the full path). */
  folder?: string;
  format?: string;
  /** File signature (mtime + size) so a changed file is re-tagged instead of answered from cache. */
  sig?: string;
}

export interface LibraryTagInput {
  items: LibraryTagItemInput[];
}

export interface LibraryTagItemResult {
  genres: string[];
  tropes: string[];
  series: { name: string; number: number | null } | null;
  warnings: string[];
  language?: string;
  oneLine?: string;
}

export interface LibraryTagOutput {
  /** filePath → result; items the model skipped are absent. */
  items: Record<string, LibraryTagItemResult>;
}

export interface BookLookupInput {
  title: string;
  author?: string;
}

export interface BookLookupResult {
  title?: string;
  author?: string;
  description?: string;
  genres?: string[];
  coverUrl?: string;
  source?: string;
  status?: string;
  alternativeNames?: string[];
}

// ── RPC (merged into `RpcMap` by `electron/shared/rpc.ts`) ──────────────────

export interface LibraryRpcMap {
  /** Accepted genres + series and pending counts for the grid (all items, or `filePaths`). */
  "library:overview": (filePaths?: string[]) => LibraryOverview;
  "library:item": (filePath: string) => ItemLibraryInfo;
  /** Accept or dismiss suggested tags (dismissed tags never come back from later runs). */
  "library:tags:decide": (filePath: string, tags: { tag: string; kind: LibraryTagKind }[], decision: "accept" | "dismiss") => ItemLibraryInfo;
  /** Store tags the user confirmed elsewhere (e.g. genres from "Fetch details") as accepted. */
  "library:tags:add": (filePath: string, kind: LibraryTagKind, tags: string[], source: LibrarySource) => ItemLibraryInfo;
  /** Batched `library.tag` jobs (Background priority, lane `library`). Joins a running run. */
  "library:tag:start": (req: LibraryTagRequest) => LibraryTagRun;
  "library:tag:status": () => LibraryTagRun | null;
  "library:tag:cancel": () => void;
  /** Local filename/title rules first, then series names from tagging results. */
  "library:series:detect": (filePaths?: string[]) => SeriesSuggestion[];
  "library:series:apply": (assignments: SeriesAssignment[]) => LibraryOverview;
}
