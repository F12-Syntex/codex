/**
 * `book.lookup` (AI_AUDIT §6 F5; owner WS-E for Phase 2d). "Fetch details" in the book details
 * modal: a `web`-role model searches for the book and returns its synopsis, genres, status,
 * alternative names and a cover URL. Replaces the renderer's direct OpenRouter call; runs through
 * the scheduler (one key in main, cache, usage ledger). Cached per title + author.
 */

import type { BookLookupInput, BookLookupResult } from "../../shared/library/types";
import { hashOf } from "../../shared/ai/hash";
import type { TaskDefinition } from "../registry";
import { AIError } from "../errors";

export const BOOK_LOOKUP_VERSION = 1;

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : undefined;
}

function strList(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => str(x, maxLen)).filter((x): x is string => !!x))].slice(0, maxItems);
}

/** Only direct image URLs or known cover CDNs (models invent URLs). */
export function plausibleCoverUrl(url: string | undefined): string | undefined {
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  if (/^https?:\/\/[^\s"'<>]+\.(jpe?g|png|webp|gif)(\?[^\s"'<>]*)?$/i.test(url)) return url;
  if (/^https?:\/\/([a-z0-9-]+\.)*(novelupdates|myanimelist|amazon|media-amazon|goodreads|gr-assets|kitsu|anilist|mangadex)\.[a-z.]+\/[^\s"'<>]+$/i.test(url)) return url;
  return undefined;
}

export function normalizeLookup(raw: unknown): BookLookupResult {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: BookLookupResult = {};
  const title = str(o.title, 200);
  if (title) out.title = title;
  const author = str(o.author, 160);
  if (author && !/^unknown$/i.test(author)) out.author = author;
  const description = str(o.description, 2000);
  if (description) out.description = description;
  const genres = strList(o.genres, 8, 40);
  if (genres.length) out.genres = genres;
  const cover = plausibleCoverUrl(str(o.coverUrl, 1000));
  if (cover) out.coverUrl = cover;
  const source = str(o.source, 120);
  if (source) out.source = source;
  const status = str(o.status, 24);
  if (status && !/^unknown$/i.test(status)) out.status = status;
  const alt = strList(o.alternativeNames, 6, 200).filter((n) => n !== out.title);
  if (alt.length) out.alternativeNames = alt;
  return out;
}

export const bookLookupTask: TaskDefinition<BookLookupInput, BookLookupResult> = {
  id: "book.lookup",
  version: BOOK_LOOKUP_VERSION,
  role: "web",
  temperature: 0.1,
  maxTokens: 1000,
  cacheable: true,
  key: (input) => hashOf((input.title ?? "").trim().toLowerCase(), (input.author ?? "").trim().toLowerCase()),
  fakeResponse: () => JSON.stringify({ description: "A book.", genres: ["Fantasy"], status: "Unknown" }),
  validate: (v): v is BookLookupResult => !!v && typeof v === "object",
  async run(input, ctx) {
    const title = str(input?.title, 200);
    if (!title) throw new AIError("bad_request", "A title is required", { retryable: false });
    const author = str(input.author, 160);
    const system = [
      "You are a book / novel lookup tool. Search the web for the given book and return details about it.",
      "1. Search for the exact title on NovelUpdates, MyAnimeList, Goodreads, Amazon or Wikipedia (web and light novels: NovelUpdates and MyAnimeList first).",
      "2. coverUrl must be the ACTUAL cover image URL from the book's page (a direct .jpg/.png/.webp or a known cover CDN). Never guess; use \"\" if you cannot find one.",
      'Return ONLY JSON: {"title": "Official English title", "author": string, "description": "synopsis, 3–5 sentences", "genres": string[], "coverUrl": string, "source": "site where found", "status": "Ongoing"|"Completed"|"Hiatus"|"Unknown", "alternativeNames": string[]}',
    ].join("\n");
    const user = `Search online for this book and return its details:\n\nTitle: "${title}"\nAuthor: "${author ?? "Unknown"}"`;
    const { value } = await ctx.completeJson<Record<string, unknown>>({
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.1,
      maxTokens: 1000,
      // Web-search models rarely support response_format; the loose parser handles fences/prose.
      jsonMode: "none",
    });
    return normalizeLookup(value);
  },
};
