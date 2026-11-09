/**
 * One-time, per-book migration of index-anchored legacy reader data (owner: WS-C; AI_AUDIT §4.6
 * "Legacy migration", §5.9). Runs in main the first time a book is opened after the Phase 2c
 * cutover, because mapping a legacy paragraph index to a ParaId needs that book's parse.
 *
 *   ensureBookMigrated(filePath)   // idempotent; every book:/chapters: handler awaits it
 *
 * What moves where (old keys are left in place; they are deleted one release later):
 *   chapterComments:{fp}   user half → `annotations`; AI half → `comments` artifacts
 *   quotes (table)         → `para_anchors` (re-anchored by quote text, then by index)
 *   bookmarks (table)      → `para_anchors`
 *   ttsReadMarks:{fp}      → `read_marks` (chapter granularity fallback when the index is off)
 *   sim_branches/segments  → `assistant_branches` / `assistant_branch_segments` (same ids)
 *   enrichedChapters:{fp}  → `title` artifacts
 *   condensedChapters:{fp} → `rewrite` (concise) artifacts when the paragraph count lines up
 *   formattedChapters:{fp} / fmtCondensed:{fp} → `format` artifacts (validated per paragraph)
 *   styleDictionary:{fp}   → `book_style`
 *   *Enabled:{fp}          → `book_ai_prefs`
 *
 * Legacy indices were indices into whichever variant was on screen (S2-7), so every anchor that
 * carries text (quotes) is re-anchored by that text first; the index is only a hint.
 * Every step is independent and best-effort: a broken legacy blob never blocks the others, and
 * nothing that already exists in the new tables is overwritten.
 */

import type { SqlDb } from "../db/sql";
import type { BookAIPrefs, StyleDictionary } from "../shared/ai/types";
import type {
  BookContentV2, FormatEntry, FormatLayer, ParaId, RewriteEntry, RewriteLayer, SourceChapter, SourcePara,
} from "../shared/pipeline/types";
import { sanitizeHtml } from "../shared/pipeline/sanitize";
import { DEFAULT_BOOK_PREFS, SqlArtifactStore, SqlPrefsStore } from "../ai/artifacts";
import { SqlStyleStore } from "../ai/style";
import { escapeHtml, hashOf } from "../ai/prompts/util";
import { mapFormatReply, FORMAT_TASK_VERSION } from "../ai/tasks/format";
import { REWRITE_TASK_VERSION } from "../ai/tasks/condense";
import { TITLE_TASK_VERSION } from "../ai/tasks/title";
import { COMMENTS_TASK_VERSION } from "../ai/tasks/comments";
import { setAnchor } from "./anchors";
import { setReadMark } from "./read-marks";

export const LEGACY_MIGRATION_FLAG = "bookLegacyMigrated:v1:";
const LEGACY_MODEL = "legacy";

export interface LegacyMigrationReport {
  skipped: boolean;
  userComments: number;
  aiComments: number;
  quotes: number;
  bookmarks: number;
  readMarks: number;
  branches: number;
  titles: number;
  rewrites: number;
  formats: number;
  style: boolean;
  prefs: boolean;
  errors: string[];
}

// ── Pure re-anchoring helpers (exported for tests) ──────────────────────────

/** Lowercase letters/digits only, single spaces: robust against quotes, dashes and markup. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const hasText = (p: SourcePara) => p.kind !== "image" && p.kind !== "rule" && p.text.trim() !== "";

/**
 * The source paragraph a legacy index most likely meant: the para at that index if it has text,
 * else the nearest text para after it, else before it. Out-of-range indices clamp to the last
 * text para (legacy variants could be longer than the source after a broken salvage).
 */
export function paraAtIndex(ch: SourceChapter, index: number): SourcePara | null {
  if (ch.paras.length === 0) return null;
  const i = Math.max(0, Math.min(Math.floor(Number.isFinite(index) ? index : 0), ch.paras.length - 1));
  if (hasText(ch.paras[i])) return ch.paras[i];
  for (let k = i + 1; k < ch.paras.length; k++) if (hasText(ch.paras[k])) return ch.paras[k];
  for (let k = i - 1; k >= 0; k--) if (hasText(ch.paras[k])) return ch.paras[k];
  return ch.paras[i];
}

/**
 * Re-anchor a saved quote by its text: the paragraph containing it (or, for a selection that
 * spanned paragraphs, its first ~80 characters), nearest to `hintIndex`. Falls back to a
 * word-overlap match (quotes saved from a rewritten variant), then null.
 */
export function reanchorByQuote(ch: SourceChapter, quote: string, hintIndex: number): SourcePara | null {
  const q = normalizeForMatch(quote);
  if (!q) return null;
  const texts = ch.paras.map((p) => (hasText(p) ? normalizeForMatch(p.text) : ""));
  const nearest = (cands: number[]) =>
    cands.length === 0 ? null : ch.paras[cands.reduce((best, i) => (Math.abs(i - hintIndex) < Math.abs(best - hintIndex) ? i : best))];

  const contains = (needle: string) => texts.flatMap((t, i) => (t && t.includes(needle) ? [i] : []));
  let hit = nearest(contains(q));
  if (hit) return hit;
  if (q.length > 80) {
    const head = q.slice(0, 80).replace(/\s\S*$/, "");
    hit = nearest(contains(head));
    if (hit) return hit;
  }

  // Word overlap (a quote saved from a concise/polished variant).
  const words = new Set(q.split(" ").filter((w) => w.length > 2));
  if (words.size < 3) return null;
  let best = -1;
  let bestScore = 0;
  texts.forEach((t, i) => {
    if (!t) return;
    const tw = new Set(t.split(" "));
    let n = 0;
    for (const w of words) if (tw.has(w)) n++;
    const score = n / words.size - Math.abs(i - hintIndex) * 1e-4;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best >= 0 && bestScore >= 0.6 ? ch.paras[best] : null;
}

// ── Migration ───────────────────────────────────────────────────────────────

interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

function kvOf(db: SqlDb): KV {
  return {
    get: (key) => {
      try {
        return db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key])?.value ?? null;
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
    },
  };
}

function json<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function tableExists(db: SqlDb, name: string): boolean {
  try {
    return !!db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]);
  } catch {
    return false;
  }
}

function chapterAt(book: BookContentV2, idx: unknown): SourceChapter | null {
  const i = Number(idx);
  return Number.isInteger(i) && i >= 0 && i < book.chapters.length ? book.chapters[i] : null;
}

interface InlineCommentLike {
  paraIndex?: unknown;
  text?: unknown;
  author?: unknown;
}

export interface MigrateOptions {
  now?: () => number;
  /** Prefs defaults (AISettings.defaults); only used to fill keys the legacy toggles don't set. */
  getDefaults?: () => BookAIPrefs | undefined;
}

/** Synchronous core (tests call it directly). Returns `skipped` when already migrated. */
export function migrateBookLegacy(db: SqlDb, filePath: string, book: BookContentV2, opts: MigrateOptions = {}): LegacyMigrationReport {
  const now = opts.now ?? Date.now;
  const kv = kvOf(db);
  const report: LegacyMigrationReport = {
    skipped: false, userComments: 0, aiComments: 0, quotes: 0, bookmarks: 0, readMarks: 0, branches: 0,
    titles: 0, rewrites: 0, formats: 0, style: false, prefs: false, errors: [],
  };
  const flagKey = LEGACY_MIGRATION_FLAG + filePath;
  if (kv.get(flagKey)) return { ...report, skipped: true };

  const artifacts = tableExists(db, "chapter_artifacts") ? new SqlArtifactStore(db) : null;

  // Legacy comments, bookmarks and read marks stored the ON-SCREEN paragraph index: while Concise
  // was showing, that is an index into the condensed list (one entry per non-empty text source
  // paragraph, the mapping `legacyRewriteLayer` uses), not into the source (QA-P2-9).
  const condenseOn = json<unknown>(kv.get(`condenseEnabled:${filePath}`)) === true;
  const condensedLists = condenseOn ? json<Record<string, unknown>>(kv.get(`condensedChapters:${filePath}`)) : null;
  const displayedPara = (ch: SourceChapter, index: number): SourcePara | null => {
    const list = condensedLists && typeof condensedLists === "object" ? condensedLists[String(ch.index)] : undefined;
    if (Array.isArray(list) && Number.isInteger(index) && index >= 0) {
      const sendable = ch.paras.filter(hasText);
      if (list.length === sendable.length && index < sendable.length) return sendable[index];
    }
    return paraAtIndex(ch, index);
  };

  const step = (name: string, fn: () => void) => {
    try {
      db.transaction(fn);
    } catch (err) {
      report.errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ── Comments (user → annotations, AI → artifacts) ──
  step("comments", () => {
    const blob = json<Record<string, InlineCommentLike[]>>(kv.get(`chapterComments:${filePath}`));
    if (!blob || typeof blob !== "object") return;
    for (const [idx, list] of Object.entries(blob)) {
      const ch = chapterAt(book, idx);
      if (!ch || !Array.isArray(list)) continue;
      const ai: { paraId: ParaId; text: string }[] = [];
      for (const c of list) {
        if (!c || typeof c.text !== "string" || !c.text.trim()) continue;
        const p = displayedPara(ch, Number(c.paraIndex));
        if (!p) continue;
        if (c.author === "user") {
          const dup = db.get(
            "SELECT id FROM annotations WHERE file_path = ? AND chapter_id = ? AND para_id = ? AND kind = 'comment' AND text = ?",
            [filePath, ch.id, p.id, c.text],
          );
          if (dup) continue;
          db.run(
            "INSERT INTO annotations (file_path, chapter_id, para_id, kind, author, text, quote, created_at) VALUES (?, ?, ?, 'comment', 'user', ?, ?, ?)",
            [filePath, ch.id, p.id, c.text, p.text.slice(0, 200), now()],
          );
          report.userComments++;
        } else {
          ai.push({ paraId: p.id, text: c.text });
        }
      }
      if (ai.length > 0 && artifacts && !artifacts.get(filePath, ch.id, "comments")) {
        artifacts.put({
          filePath, chapterId: ch.id, chapterIndex: ch.index, kind: "comments", variant: "",
          sourceHash: ch.sourceHash, baseHash: "", taskVersion: COMMENTS_TASK_VERSION, model: LEGACY_MODEL,
          artifactHash: hashOf(ai), data: { comments: ai }, createdAt: now(),
        });
        report.aiComments += ai.length;
      }
    }
  });

  // ── Quotes (legacy table) → para_anchors ──
  step("quotes", () => {
    if (!tableExists(db, "quotes")) return;
    const rows = db.all<{ id: number; chapterIndex: number; paragraphIndex: number; text: string }>(
      "SELECT id, chapterIndex, paragraphIndex, text FROM quotes WHERE filePath = ?",
      [filePath],
    );
    for (const r of rows) {
      const ch = chapterAt(book, r.chapterIndex);
      if (!ch) continue;
      if (db.get("SELECT 1 FROM para_anchors WHERE kind = 'quote' AND ref_id = ?", [String(r.id)])) continue;
      const p = reanchorByQuote(ch, r.text ?? "", Number(r.paragraphIndex)) ?? paraAtIndex(ch, Number(r.paragraphIndex));
      if (!p) continue;
      setAnchor(db, { kind: "quote", refId: String(r.id), filePath, chapterId: ch.id, paraId: p.id, quote: r.text ?? "" });
      report.quotes++;
    }
  });

  // ── Bookmarks (legacy table) → para_anchors ──
  step("bookmarks", () => {
    if (!tableExists(db, "bookmarks")) return;
    const rows = db.all<{ id: number; chapterIndex: number; paragraphIndex: number }>(
      "SELECT id, chapterIndex, paragraphIndex FROM bookmarks WHERE filePath = ?",
      [filePath],
    );
    for (const r of rows) {
      const ch = chapterAt(book, r.chapterIndex);
      if (!ch) continue;
      if (db.get("SELECT 1 FROM para_anchors WHERE kind = 'bookmark' AND ref_id = ?", [String(r.id)])) continue;
      const p = displayedPara(ch, Number(r.paragraphIndex));
      if (!p) continue;
      setAnchor(db, { kind: "bookmark", refId: String(r.id), filePath, chapterId: ch.id, paraId: p.id });
      report.bookmarks++;
    }
  });

  // ── TTS read marks ──
  step("readMarks", () => {
    const marks = json<Record<string, number>>(kv.get(`ttsReadMarks:${filePath}`));
    if (!marks || typeof marks !== "object") return;
    for (const [idx, paraIndex] of Object.entries(marks)) {
      const ch = chapterAt(book, idx);
      if (!ch || typeof paraIndex !== "number" || paraIndex < 0) continue;
      if (db.get("SELECT 1 FROM read_marks WHERE file_path = ? AND chapter_id = ?", [filePath, ch.id])) continue;
      const p = displayedPara(ch, paraIndex);
      if (!p) continue;
      setReadMark(db, filePath, ch.id, p.id);
      report.readMarks++;
    }
  });

  // ── Simulate branches → assistant branches (same ids, so a second migrator is a no-op) ──
  step("branches", () => {
    if (!tableExists(db, "sim_branches") || !tableExists(db, "assistant_branches")) return;
    const rows = db.all<{ id: string; entity_id: string; entity_name: string; chapter_index: number; truncate_after_para: number; created_at: string }>(
      "SELECT * FROM sim_branches WHERE file_path = ?",
      [filePath],
    );
    for (const b of rows) {
      const ch = chapterAt(book, b.chapter_index);
      if (!ch) continue;
      if (db.get("SELECT 1 FROM assistant_branches WHERE id = ?", [b.id])) continue;
      const p = paraAtIndex(ch, Number(b.truncate_after_para));
      if (!p) continue;
      const created = Date.parse(String(b.created_at ?? "").replace(" ", "T") + "Z") || now();
      db.run(
        `INSERT INTO assistant_branches (id, file_path, chapter_id, para_id, chapter_index, entity_id, entity_name, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.id, filePath, ch.id, p.id, ch.index, b.entity_id || null, b.entity_name || null, b.entity_name ? `What if… ${b.entity_name}` : "What if…", created, created],
      );
      if (tableExists(db, "sim_segments")) {
        const segs = db.all<{ segment_index: number; user_input: string; html_paragraphs: string }>(
          "SELECT segment_index, user_input, html_paragraphs FROM sim_segments WHERE file_path = ? AND branch_id = ? ORDER BY segment_index ASC",
          [filePath, b.id],
        );
        for (const s of segs) {
          const paras = (json<unknown[]>(s.html_paragraphs) ?? [])
            .filter((h): h is string => typeof h === "string")
            .map((h) => sanitizeHtml(h, "ai-format"))
            .filter((h) => h.trim() !== "");
          db.run(
            `INSERT OR IGNORE INTO assistant_branch_segments (branch_id, segment_index, user_input, paragraphs, choices, created_at)
             VALUES (?, ?, ?, ?, '[]', ?)`,
            [b.id, Number(s.segment_index), String(s.user_input ?? ""), JSON.stringify(paras), created],
          );
        }
      }
      report.branches++;
    }
  });

  // ── AI titles ──
  step("titles", () => {
    if (!artifacts) return;
    const names = json<Record<string, string>>(kv.get(`enrichedChapters:${filePath}`));
    if (!names || typeof names !== "object") return;
    for (const [idx, title] of Object.entries(names)) {
      const ch = chapterAt(book, idx);
      if (!ch || typeof title !== "string" || !title.trim()) continue;
      if (artifacts.get(filePath, ch.id, "title")) continue;
      const t = title.trim().slice(0, 300);
      artifacts.put({
        filePath, chapterId: ch.id, chapterIndex: ch.index, kind: "title", variant: "",
        sourceHash: ch.sourceHash, baseHash: "", taskVersion: TITLE_TASK_VERSION, model: LEGACY_MODEL,
        artifactHash: hashOf(t), data: { title: t, raw: t }, createdAt: now(),
      });
      report.titles++;
    }
  });

  // ── Concise rewrites (+ their formatting) ──
  step("rewrites", () => {
    if (!artifacts) return;
    const condensed = json<Record<string, unknown>>(kv.get(`condensedChapters:${filePath}`));
    const fmtCondensed = json<Record<string, unknown>>(kv.get(`fmtCondensed:${filePath}`)) ?? {};
    if (!condensed || typeof condensed !== "object") return;
    for (const [idx, list] of Object.entries(condensed)) {
      const ch = chapterAt(book, idx);
      if (!ch || !Array.isArray(list)) continue;
      if (artifacts.get(filePath, ch.id, "rewrite", "concise")) continue;
      const layer = legacyRewriteLayer(ch, list);
      if (!layer) continue;
      artifacts.put({
        filePath, chapterId: ch.id, chapterIndex: ch.index, kind: "rewrite", variant: "concise",
        sourceHash: ch.sourceHash, baseHash: "", taskVersion: REWRITE_TASK_VERSION, model: LEGACY_MODEL,
        artifactHash: layer.artifactHash, data: layer, createdAt: now(),
      });
      report.rewrites++;
      const fmt = fmtCondensed[idx];
      if (Array.isArray(fmt) && !artifacts.get(filePath, ch.id, "format", "base:concise")) {
        const f = legacyFormatLayer(ch, fmt, layer);
        if (f) {
          artifacts.put({
            filePath, chapterId: ch.id, chapterIndex: ch.index, kind: "format", variant: "base:concise",
            sourceHash: ch.sourceHash, baseHash: f.baseHash, taskVersion: FORMAT_TASK_VERSION, model: LEGACY_MODEL,
            artifactHash: f.artifactHash, data: f, createdAt: now(),
          });
          report.formats++;
        }
      }
    }
  });

  // ── Formatting on the original text ──
  step("formats", () => {
    if (!artifacts) return;
    const formatted = json<Record<string, unknown>>(kv.get(`formattedChapters:${filePath}`));
    if (!formatted || typeof formatted !== "object") return;
    for (const [idx, list] of Object.entries(formatted)) {
      const ch = chapterAt(book, idx);
      if (!ch || !Array.isArray(list)) continue;
      if (artifacts.get(filePath, ch.id, "format", "")) continue;
      const f = legacyFormatLayer(ch, list, null);
      if (!f) continue;
      artifacts.put({
        filePath, chapterId: ch.id, chapterIndex: ch.index, kind: "format", variant: "",
        sourceHash: ch.sourceHash, baseHash: f.baseHash, taskVersion: FORMAT_TASK_VERSION, model: LEGACY_MODEL,
        artifactHash: f.artifactHash, data: f, createdAt: now(),
      });
      report.formats++;
    }
  });

  // ── Style dictionary ──
  step("style", () => {
    if (!tableExists(db, "book_style")) return;
    if (db.get("SELECT 1 FROM book_style WHERE file_path = ?", [filePath])) return;
    const d = json<StyleDictionary>(kv.get(`styleDictionary:${filePath}`));
    if (!d || !Array.isArray(d.rules)) return;
    const clean: StyleDictionary = {
      ...d,
      rules: d.rules
        .filter((r) => r && typeof r.component === "string")
        .map((r) => ({ ...r, exampleHtml: sanitizeHtml(String(r.exampleHtml ?? ""), "ai-format") })),
      bookTitle: typeof d.bookTitle === "string" ? d.bookTitle : "",
      updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : new Date(now()).toISOString(),
    };
    new SqlStyleStore(db, now).update(filePath, () => clean);
    report.style = true;
  });

  // ── Per-book toggles → prefs ──
  step("prefs", () => {
    if (!tableExists(db, "book_ai_prefs")) return;
    if (db.get("SELECT 1 FROM book_ai_prefs WHERE file_path = ?", [filePath])) return;
    const flag = (name: string): boolean | undefined => {
      const v = json<unknown>(kv.get(`${name}Enabled:${filePath}`));
      return typeof v === "boolean" ? v : undefined;
    };
    const patch: Partial<BookAIPrefs> = {};
    const titles = flag("enrich");
    const condense = flag("condense");
    const formatting = flag("formatting");
    const knowledge = flag("wiki");
    const comments = flag("comments");
    if (titles !== undefined) patch.titles = titles;
    if (condense !== undefined) patch.rewrite = condense ? "concise" : "off";
    if (formatting !== undefined) patch.formatting = formatting;
    if (knowledge !== undefined) patch.knowledge = knowledge;
    if (comments !== undefined) patch.comments = comments;
    if (Object.keys(patch).length === 0) return;
    new SqlPrefsStore(db, () => opts.getDefaults?.() ?? DEFAULT_BOOK_PREFS, now).set(filePath, patch);
    report.prefs = true;
  });

  // Mark the book done only when every step succeeded: each step is idempotent (comments dedupe by
  // text, anchors/read marks/artifacts/style/prefs skip existing rows), so a failed step (e.g. a
  // transient SQLITE_BUSY) is retried on the next open instead of stranding the user's data
  // (QA-P2-5). A step that keeps failing stops being retried after MAX_MIGRATION_ATTEMPTS.
  const attemptsKey = `${flagKey}:attempts`;
  const attempts = (Number(kv.get(attemptsKey)) || 0) + 1;
  if (report.errors.length === 0 || attempts >= MAX_MIGRATION_ATTEMPTS) {
    kv.set(flagKey, JSON.stringify({ at: now(), errors: report.errors.length, attempts }));
  } else {
    try {
      kv.set(attemptsKey, String(attempts));
    } catch { /* retried next open either way */ }
  }
  return report;
}

/** Failed migrations of one book are retried on later opens, at most this many times in total. */
export const MAX_MIGRATION_ATTEMPTS = 5;

/**
 * Legacy condensed text (one string per non-empty source text paragraph, empty = dropped) → a
 * 1:1 rewrite layer. Null when the counts don't line up (a salvaged/truncated legacy result):
 * that chapter is simply re-condensed on demand.
 */
export function legacyRewriteLayer(ch: SourceChapter, condensed: unknown[]): RewriteLayer | null {
  const sendable = ch.paras.filter(hasText);
  if (sendable.length === 0 || condensed.length !== sendable.length) return null;
  if (!condensed.every((c) => typeof c === "string")) return null;
  const byId = new Map<ParaId, string>(sendable.map((p, i) => [p.id, (condensed[i] as string).trim()]));
  const paras: Record<ParaId, RewriteEntry> = {};
  for (const p of ch.paras) {
    const c = byId.get(p.id);
    if (c === undefined) paras[p.id] = { html: p.html };
    else if (!c) paras[p.id] = { dropped: true };
    else if (/<[a-z][^>]*>/i.test(c)) paras[p.id] = { html: sanitizeHtml(c, "ai-format") };
    else paras[p.id] = { html: `<p>${escapeHtml(c)}</p>` };
  }
  return { mode: "concise", artifactHash: hashOf("concise", ch.sourceHash, paras), sourceHash: ch.sourceHash, paras };
}

/**
 * Legacy formatted html (1:1 with the base paragraphs; "" = merged into the previous one) → a
 * format layer, validated per paragraph exactly like fresh AI output (`mapFormatReply`: speaker
 * badges normalised, `ai-format` sanitizer, text preserved ≥ 0.97 or the paragraph is left as is).
 */
export function legacyFormatLayer(ch: SourceChapter, formatted: unknown[], rewrite: RewriteLayer | null): FormatLayer | null {
  if (formatted.length !== ch.paras.length) return null;
  const chunk: { id: ParaId; html: string }[] = [];
  const raw: Record<string, unknown> = {};
  ch.paras.forEach((p, i) => {
    const base = rewrite ? rewrite.paras[p.id] : { html: p.html };
    if (!base || "dropped" in base) return;
    const f = formatted[i];
    if (typeof f !== "string") return;
    chunk.push({ id: p.id, html: base.html });
    raw[String(chunk.length)] = f;
  });
  if (chunk.length === 0) return null;
  const paras: Record<ParaId, FormatEntry> = mapFormatReply(chunk, raw);
  if (Object.keys(paras).length === 0) return null;
  const base: FormatLayer["base"] = rewrite ? "rewrite" : "source";
  const baseHash = rewrite ? rewrite.artifactHash : ch.sourceHash;
  return { artifactHash: hashOf(base, baseHash, paras), base, baseHash, paras };
}

// ── Lazy, once-per-book runner ──────────────────────────────────────────────

interface Runner {
  db: SqlDb;
  getBook: (filePath: string) => Promise<BookContentV2>;
  getDefaults?: () => BookAIPrefs | undefined;
}

let runner: Runner | null = null;
const pending = new Map<string, Promise<void>>();

/** Wired by `registerBook`. Until then `ensureBookMigrated` is a no-op (unit tests, other areas). */
export function configureLegacyMigration(r: Runner | null): void {
  runner = r;
  pending.clear();
}

/** Idempotent; resolves once the book's legacy data has been migrated (never rejects). */
export function ensureBookMigrated(filePath: string): Promise<void> {
  if (!runner || typeof filePath !== "string" || !filePath) return Promise.resolve();
  const existing = pending.get(filePath);
  if (existing) return existing;
  const r = runner;
  const p = (async () => {
    try {
      if (kvOf(r.db).get(LEGACY_MIGRATION_FLAG + filePath)) return;
      const book = await r.getBook(filePath);
      const rep = migrateBookLegacy(r.db, filePath, book, { getDefaults: r.getDefaults });
      if (!rep.skipped && rep.errors.length > 0) {
        console.warn("[book] legacy migration finished with errors (retried next open)", filePath, rep.errors);
        pending.delete(filePath);
      }
    } catch (err) {
      // Unreadable book: nothing to anchor against. Try again next time it opens.
      pending.delete(filePath);
      console.warn("[book] legacy migration skipped", filePath, err);
    }
  })();
  pending.set(filePath, p);
  return p;
}
