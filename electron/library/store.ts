/**
 * Library AI store (owner: WS-E for Phase 2d). `SqlDb` only, so it runs on better-sqlite3 in main
 * and sql.js in tests. Every write is one statement or one transaction.
 *
 * Decisions are sticky: a later tagging run replaces only the still-undecided AI suggestions, never
 * an accepted or dismissed tag, and a dismissed series is never proposed again for that book.
 */

import type { SqlDb } from "../db/sql";
import type {
  ItemLibraryInfo, ItemSeries, LibraryDecision, LibraryOverview, LibraryOverviewEntry, LibrarySource, LibraryTag,
  LibraryProgress, LibraryTagItemResult, LibraryTagKind, SeriesAssignment,
} from "../shared/library/types";
import { seriesKey, type SeriesGuess } from "../shared/library/series";

const KINDS: readonly LibraryTagKind[] = ["genre", "trope", "warning"];
const DECISIONS: readonly LibraryDecision[] = ["suggested", "accepted", "dismissed"];
const SOURCES: readonly LibrarySource[] = ["ai", "web", "user", "local"];

interface TagRow { file_path: string; kind: string; tag: string; source: string; status: string }
interface SeriesRow { file_path: string; name: string; series_key: string; number: number | null; source: string }
interface AIRow {
  file_path: string; version: number; language: string | null; one_line: string | null;
  ai_series: string | null; ai_series_number: number | null; tagged_at: number;
}

function pick<T extends string>(v: string, list: readonly T[], fallback: T): T {
  return (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

function toTag(r: TagRow): LibraryTag {
  return {
    tag: r.tag,
    kind: pick(r.kind, KINDS, "trope"),
    status: pick(r.status, DECISIONS, "suggested"),
    source: pick(r.source, SOURCES, "ai"),
  };
}

const num = (v: unknown): number | null => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

export class LibraryStore {
  constructor(private readonly db: SqlDb, private readonly now: () => number = Date.now) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  tags(filePath: string): LibraryTag[] {
    return this.db
      .all<TagRow>("SELECT * FROM item_tags WHERE file_path = ? ORDER BY kind, updated_at, tag", [filePath])
      .map(toTag);
  }

  aiRow(filePath: string): AIRow | undefined {
    return this.db.get<AIRow>("SELECT * FROM item_ai WHERE file_path = ?", [filePath]);
  }

  isDismissed(filePath: string, key: string): boolean {
    return !!this.db.get("SELECT 1 AS x FROM item_series_dismissed WHERE file_path = ? AND series_key = ?", [filePath, key]);
  }

  /** Accepted series, else the AI suggestion (unless dismissed). */
  series(filePath: string): ItemSeries | null {
    const r = this.db.get<SeriesRow>("SELECT * FROM item_series WHERE file_path = ?", [filePath]);
    if (r) return { name: r.name, number: num(r.number), status: "accepted", source: pick(r.source, SOURCES, "user") };
    const ai = this.aiRow(filePath);
    if (ai?.ai_series && !this.isDismissed(filePath, seriesKey(ai.ai_series))) {
      return { name: ai.ai_series, number: num(ai.ai_series_number), status: "suggested", source: "ai" };
    }
    return null;
  }

  item(filePath: string): ItemLibraryInfo {
    const ai = this.aiRow(filePath);
    return {
      filePath,
      tags: this.tags(filePath),
      series: this.series(filePath),
      ...(ai?.language ? { language: ai.language } : {}),
      ...(ai?.one_line ? { oneLine: ai.one_line } : {}),
      ...(ai ? { taggedAt: Number(ai.tagged_at) } : {}),
    };
  }

  /** Files tagged by `version` (or newer). */
  taggedFiles(version: number): Set<string> {
    return new Set(this.db.all<{ file_path: string }>("SELECT file_path FROM item_ai WHERE version >= ?", [version]).map((r) => r.file_path));
  }

  /** filePath → AI series guess (for series detection). */
  aiSeries(): Map<string, SeriesGuess> {
    const out = new Map<string, SeriesGuess>();
    for (const r of this.db.all<AIRow>("SELECT * FROM item_ai WHERE ai_series IS NOT NULL AND ai_series != ''")) {
      out.set(r.file_path, { name: r.ai_series!, number: num(r.ai_series_number) });
    }
    return out;
  }

  /** Accepted series key per file. */
  acceptedSeriesKeys(): Map<string, string> {
    return new Map(this.db.all<SeriesRow>("SELECT file_path, series_key FROM item_series").map((r) => [r.file_path, r.series_key]));
  }

  overview(filePaths?: readonly string[]): LibraryOverview {
    const want = filePaths ? new Set(filePaths) : null;
    const out: LibraryOverview = {};
    const entry = (fp: string): LibraryOverviewEntry | null => {
      if (want && !want.has(fp)) return null;
      return (out[fp] ??= { genres: [], pending: 0 });
    };
    for (const r of this.db.all<TagRow>("SELECT file_path, kind, tag, status FROM item_tags WHERE status != 'dismissed' ORDER BY updated_at, tag")) {
      const e = entry(r.file_path);
      if (!e) continue;
      if (r.status === "accepted" && r.kind === "genre") e.genres.push(r.tag);
      else if (r.status === "suggested") e.pending++;
    }
    const accepted = new Set<string>();
    for (const r of this.db.all<SeriesRow>("SELECT * FROM item_series")) {
      accepted.add(r.file_path);
      const e = entry(r.file_path);
      if (e) e.series = { name: r.name, number: num(r.number) };
    }
    for (const [fp, g] of this.aiSeries()) {
      if (accepted.has(fp) || this.isDismissed(fp, seriesKey(g.name))) continue;
      const e = entry(fp);
      if (e) e.pending++;
    }
    return out;
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  /** Stores one `library.tag` result: undecided AI suggestions are replaced; decisions stay. */
  applyTagResult(filePath: string, r: LibraryTagItemResult, version: number): void {
    const now = this.now();
    this.db.transaction(() => {
      this.db.run("DELETE FROM item_tags WHERE file_path = ? AND status = 'suggested' AND source = 'ai'", [filePath]);
      const add = (kind: LibraryTagKind, tags: readonly string[]) => {
        for (const tag of tags) {
          this.db.run(
            `INSERT INTO item_tags (file_path, kind, tag, source, status, updated_at) VALUES (?, ?, ?, 'ai', 'suggested', ?)
             ON CONFLICT (file_path, kind, tag) DO NOTHING`,
            [filePath, kind, tag, now],
          );
        }
      };
      add("genre", r.genres);
      add("trope", r.tropes);
      add("warning", r.warnings);
      this.db.run(
        `INSERT INTO item_ai (file_path, version, language, one_line, ai_series, ai_series_number, tagged_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (file_path) DO UPDATE SET version = excluded.version, language = excluded.language, one_line = excluded.one_line,
           ai_series = excluded.ai_series, ai_series_number = excluded.ai_series_number, tagged_at = excluded.tagged_at`,
        [filePath, version, r.language ?? null, r.oneLine ?? null, r.series?.name ?? null, r.series?.number ?? null, now],
      );
    });
  }

  decide(filePath: string, tags: readonly { tag: string; kind: LibraryTagKind }[], decision: "accept" | "dismiss"): void {
    const status: LibraryDecision = decision === "accept" ? "accepted" : "dismissed";
    const now = this.now();
    this.db.transaction(() => {
      for (const t of tags) {
        const tag = t.tag.trim();
        if (!tag || !KINDS.includes(t.kind)) continue;
        this.db.run(
          `INSERT INTO item_tags (file_path, kind, tag, source, status, updated_at) VALUES (?, ?, ?, 'user', ?, ?)
           ON CONFLICT (file_path, kind, tag) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
          [filePath, t.kind, tag, status, now],
        );
      }
    });
  }

  /** Accepted tags from another source (e.g. "Fetch details" genres); keeps earlier dismissals. */
  addAccepted(filePath: string, kind: LibraryTagKind, tags: readonly string[], source: LibrarySource): void {
    const now = this.now();
    this.db.transaction(() => {
      for (const raw of tags) {
        const tag = raw.trim().slice(0, 60);
        if (!tag) continue;
        this.db.run(
          `INSERT INTO item_tags (file_path, kind, tag, source, status, updated_at) VALUES (?, ?, ?, ?, 'accepted', ?)
           ON CONFLICT (file_path, kind, tag) DO UPDATE SET status = 'accepted', updated_at = excluded.updated_at
           WHERE item_tags.status != 'dismissed'`,
          [filePath, kind, tag, pick(source, SOURCES, "user"), now],
        );
      }
    });
  }

  applySeries(assignments: readonly SeriesAssignment[]): void {
    const now = this.now();
    this.db.transaction(() => {
      for (const a of assignments) {
        if (!a.filePath) continue;
        const name = a.name?.replace(/\s+/g, " ").trim().slice(0, 160) ?? "";
        if (a.status === "dismissed" || !name) {
          // Dismiss what was suggested (or the given name) and drop any accepted membership.
          const current = name || this.series(a.filePath)?.name;
          if (current) {
            this.db.run("INSERT OR IGNORE INTO item_series_dismissed (file_path, series_key) VALUES (?, ?)", [a.filePath, seriesKey(current)]);
          }
          this.db.run("DELETE FROM item_series WHERE file_path = ?", [a.filePath]);
          continue;
        }
        const n = a.number === undefined || a.number === null || !Number.isFinite(a.number) ? null : a.number;
        this.db.run(
          `INSERT INTO item_series (file_path, name, series_key, number, source, updated_at) VALUES (?, ?, ?, ?, 'user', ?)
           ON CONFLICT (file_path) DO UPDATE SET name = excluded.name, series_key = excluded.series_key, number = excluded.number,
             source = excluded.source, updated_at = excluded.updated_at`,
          [a.filePath, name, seriesKey(name), n, now],
        );
        this.db.run("DELETE FROM item_series_dismissed WHERE file_path = ? AND series_key = ?", [a.filePath, seriesKey(name)]);
      }
    });
  }

  /** `readProgress:<filePath>` settings rows (range scan on the key, no LIKE wildcards). */
  readingProgress(): Record<string, LibraryProgress> {
    const prefix = "readProgress:";
    const out: Record<string, LibraryProgress> = {};
    let rows: { key: string; value: string }[] = [];
    try {
      rows = this.db.all<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key >= ? AND key < ?", [prefix, `${prefix}\uffff`]);
    } catch {
      return out; // no settings table (tests)
    }
    for (const r of rows) {
      try {
        const p = JSON.parse(r.value) as { chapter?: unknown; totalChapters?: unknown };
        if (typeof p.chapter === "number" && typeof p.totalChapters === "number" && p.totalChapters > 0) {
          out[r.key.slice(prefix.length)] = { chapter: p.chapter, totalChapters: p.totalChapters };
        }
      } catch { /* malformed row */ }
    }
    return out;
  }

  /** Remove everything for a book (e.g. deleted from the library). */
  forget(filePath: string): void {
    this.db.transaction(() => {
      for (const t of ["item_tags", "item_series", "item_series_dismissed", "item_ai"]) {
        this.db.run(`DELETE FROM ${t} WHERE file_path = ?`, [filePath]);
      }
    });
  }
}
