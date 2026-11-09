/**
 * Legacy chat / Simulate import (owner: WS-E, Phase 2d). Moves the pre-rebuild data into the
 * assistant tables so nothing is lost when the old chat UIs are removed:
 *
 * - Chats lived in the `settings` key-value table:
 *     `buddyMessages:<filePath>`            the Buddy panel/window's current conversation
 *     `chatHistory:<filePath>`              summaries `{id, title, timestamp, …}[]` (max 50)
 *     `chatMessages:<filePath>:<convId>`    one saved conversation (`""` when "deleted", S7-20)
 *   Each distinct conversation becomes an `assistant_threads` row; assistant html (buddy-* classes,
 *   `<a data-entity>` links) is converted to the assistant Markdown dialect (`[Name](entity:id)`).
 *   A conversation whose message ids are a prefix of another's is the same chat saved earlier and
 *   is folded into the longer one. The legacy keys are then DELETED (rows were never removed
 *   before), in the same transaction.
 * - Simulate branches lived in `sim_branches` / `sim_segments`, anchored by chapter index +
 *   paragraph index. They need the parsed book to become a ParaRef, so they are imported lazily,
 *   per book, the first time its branches are listed (`AssistantService.listBranches`). The legacy
 *   paragraph index is the index into the same parser's paragraph list (`paragraphs[i]` mirrors
 *   `paras[i]`), clamped to the chapter. Imported legacy rows are deleted; rows whose chapter no
 *   longer exists are left untouched for a later attempt.
 *
 * Depends on `SqlDb` only (sql.js in tests). Every import is idempotent: a second run finds no
 * legacy rows.
 */

import { randomUUID } from "crypto";
import type { SqlDb } from "../db/sql";
import type { BookContentV2 } from "../shared/pipeline/types";
import { DEFAULT_THREAD_TITLE, titleFromText } from "./store";
import { decodeEntities, toSafeParagraphs } from "./text";

// ── Helpers ─────────────────────────────────────────────────────────────────

export function tableExists(db: SqlDb, name: string): boolean {
  return !!db.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", [name]);
}

function safeJson<T>(s: string | null | undefined): T | undefined {
  if (!s) return undefined;
  try {
    return JSON.parse(s) as T;
  } catch {
    return undefined;
  }
}

/** Every settings key starting with `prefix` (range scan on the primary key, so no LIKE wildcards). */
function keysWithPrefix(db: SqlDb, prefix: string): { key: string; value: string }[] {
  return db.all<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key >= ? AND key < ? ORDER BY key",
    [prefix, `${prefix}￿`],
  );
}

/** SQLite `datetime('now')` text ("2024-05-01 12:34:56", UTC) → epoch ms. */
export function sqliteTimeToMs(t: unknown, fallback: number): number {
  if (typeof t === "number" && Number.isFinite(t)) return t;
  if (typeof t !== "string" || !t) return fallback;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t) ? `${t.replace(" ", "T")}Z` : t;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : fallback;
}

// ── Legacy html → assistant Markdown ────────────────────────────────────────

/**
 * Converts the old Buddy html (buddy-text paragraphs, cards, grids, ai-fmt spans, entity links) to
 * the assistant Markdown subset. Returns the entity ids that were linked.
 */
export function legacyHtmlToMarkdown(html: string): { text: string; entityIds: string[] } {
  const ids: string[] = [];
  let s = String(html ?? "").replace(/\r\n?/g, "\n");
  s = s.replace(/<(script|style|iframe|svg)[\s\S]*?<\/\1>/gi, " ");
  // Entity links first (their inner text may contain emphasis we drop).
  s = s.replace(/<a\b[^>]*\bdata-entity\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, id: string, inner: string) => {
    const name = decodeEntities(inner.replace(/<[^>]*>/g, "")).replace(/[[\]\n]/g, " ").trim();
    const cleanId = decodeEntities(id).trim();
    if (!name) return "";
    if (!cleanId || /[\s()]/.test(cleanId)) return name;
    if (!ids.includes(cleanId)) ids.push(cleanId);
    return `[${name}](entity:${cleanId})`;
  });
  s = s
    .replace(/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_m, _t, inner: string) => (inner.trim() ? `**${inner.trim()}**` : ""))
    .replace(/<\s*(em|i)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_m, _t, inner: string) => (inner.trim() ? `*${inner.trim()}*` : ""))
    .replace(/<\s*h[1-3]\b[^>]*>/gi, "\n\n### ")
    .replace(/<\s*h[4-6]\b[^>]*>/gi, "\n\n#### ")
    .replace(/<\s*\/\s*h\d\s*>/gi, "\n\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(/<\s*\/\s*(ul|ol)\s*>/gi, "\n\n")
    .replace(/<\s*blockquote\b[^>]*>/gi, "\n\n> ")
    .replace(/<br\s*\/?>/gi, "\n")
    // Grid / card cells: keep "Label Value" pairs readable on one line.
    .replace(/<\s*\/\s*span\s*>\s*<\s*span\b[^>]*>/gi, " ")
    .replace(/<\s*\/\s*(p|div|section|article|header|footer|table|tr)\s*>/gi, "\n\n")
    .replace(/<\s*\/\s*(td|th)\s*>/gi, " ")
    .replace(/<[^>]*>/g, "");
  s = decodeEntities(s);
  const text = s
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, entityIds: ids };
}

// ── Chats ───────────────────────────────────────────────────────────────────

interface LegacyMessage {
  id?: unknown;
  role?: unknown;
  content?: unknown;
  timestamp?: unknown;
}

interface LegacySummary {
  id?: unknown;
  title?: unknown;
  timestamp?: unknown;
}

interface Conversation {
  title?: string;
  messages: LegacyMessage[];
  /** Settings keys this conversation came from. */
  keys: string[];
}

export interface ChatImportReport {
  threads: number;
  messages: number;
  /** Legacy settings rows removed (including empty "deleted" conversations). */
  removedKeys: number;
}

const BUDDY_PREFIX = "buddyMessages:";
const HISTORY_PREFIX = "chatHistory:";
const MESSAGES_PREFIX = "chatMessages:";
const CONV_KEY_RE = /^chatMessages:([\s\S]*):([^:]+)$/;

function asMessages(raw: string | undefined): LegacyMessage[] {
  const v = safeJson<unknown>(raw);
  if (!Array.isArray(v)) return [];
  return v.filter((m): m is LegacyMessage => !!m && typeof m === "object" && (m as LegacyMessage).role !== undefined);
}

function idList(c: Conversation): string[] {
  return c.messages.map((m, i) => (typeof m.id === "string" ? m.id : `#${i}:${String(m.content ?? "").slice(0, 40)}`));
}

function isPrefix(a: string[], b: string[]): boolean {
  if (a.length > b.length) return false;
  return a.every((x, i) => x === b[i]);
}

/** Drops conversations that are an earlier save of another one (their ids are its prefix). */
export function dedupeConversations<T extends Conversation>(convs: T[]): T[] {
  const lists = convs.map(idList);
  const keep: T[] = [];
  convs.forEach((c, i) => {
    if (c.messages.length === 0) return;
    const swallowedBy = convs.findIndex((o, j) => {
      if (j === i || o.messages.length === 0) return false;
      if (!isPrefix(lists[i], lists[j])) return false;
      // Identical lists: keep the first one only.
      return lists[i].length < lists[j].length || j < i;
    });
    if (swallowedBy < 0) keep.push(c);
    else convs[swallowedBy].keys.push(...c.keys);
  });
  return keep;
}

function filePathsWithLegacyChats(db: SqlDb): string[] {
  const out = new Set<string>();
  for (const { key } of keysWithPrefix(db, BUDDY_PREFIX)) out.add(key.slice(BUDDY_PREFIX.length));
  for (const { key } of keysWithPrefix(db, HISTORY_PREFIX)) out.add(key.slice(HISTORY_PREFIX.length));
  for (const { key } of keysWithPrefix(db, MESSAGES_PREFIX)) {
    const m = CONV_KEY_RE.exec(key);
    if (m) out.add(m[1]);
  }
  out.delete("");
  return [...out];
}

function messageRow(m: LegacyMessage, fallbackTs: number): { role: "user" | "assistant"; data: string; ts: number } | null {
  const role = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : null;
  if (!role) return null;
  const content = typeof m.content === "string" ? m.content : "";
  const ts = typeof m.timestamp === "number" && Number.isFinite(m.timestamp) ? m.timestamp : fallbackTs;
  if (role === "user") {
    const text = content.trim();
    if (!text) return null;
    return { role, ts, data: JSON.stringify({ blocks: [{ type: "markdown", text: text.slice(0, 8000) }], citations: [], entityLinks: [], status: "done" }) };
  }
  const { text, entityIds } = legacyHtmlToMarkdown(content);
  if (!text) return null;
  return { role, ts, data: JSON.stringify({ blocks: [{ type: "markdown", text }], citations: [], entityLinks: entityIds, status: "done" }) };
}

/**
 * Import one book's legacy chats (or every book's, without `filePath`). Runs in one transaction
 * per book; returns what it did. Safe to call repeatedly.
 */
export function importLegacyChats(
  db: SqlDb,
  opts: { filePath?: string; now?: () => number; newId?: () => string; onError?: (filePath: string, err: unknown) => void } = {},
): ChatImportReport {
  const report: ChatImportReport = { threads: 0, messages: 0, removedKeys: 0 };
  if (!tableExists(db, "settings")) return report;
  const now = opts.now ?? Date.now;
  const newId = opts.newId ?? randomUUID;
  const files = opts.filePath !== undefined ? [opts.filePath] : filePathsWithLegacyChats(db);

  for (const filePath of files) {
    try {
      importOneBook(filePath);
    } catch (err) {
      if (!opts.onError) throw err;
      opts.onError(filePath, err);
    }
  }
  return report;

  function importOneBook(filePath: string): void {
    db.transaction(() => {
      const buddyKey = `${BUDDY_PREFIX}${filePath}`;
      const historyKey = `${HISTORY_PREFIX}${filePath}`;
      const convPrefix = `${MESSAGES_PREFIX}${filePath}:`;
      const buddyRaw = db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [buddyKey])?.value;
      const historyRaw = db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [historyKey])?.value;
      const convRows = keysWithPrefix(db, convPrefix).filter((r) => !r.key.slice(convPrefix.length).includes(":"));
      if (buddyRaw === undefined && historyRaw === undefined && convRows.length === 0) return;

      const summaries = safeJson<LegacySummary[]>(historyRaw);
      const titleOf = new Map<string, string>();
      const order = new Map<string, number>();
      if (Array.isArray(summaries)) {
        summaries.forEach((s, i) => {
          if (s && typeof s.id === "string") {
            if (typeof s.title === "string" && s.title.trim()) titleOf.set(s.id, s.title.trim());
            order.set(s.id, i);
          }
        });
      }

      // Saved conversations (oldest summary last in the legacy list → keep their order), then the
      // live Buddy conversation, which may extend one of them.
      const convs: Conversation[] = convRows
        .map((r) => {
          const id = r.key.slice(convPrefix.length);
          return { id, conv: { title: titleOf.get(id), messages: asMessages(r.value), keys: [r.key] } as Conversation };
        })
        .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
        .map((x) => x.conv);
      if (buddyRaw !== undefined) convs.push({ messages: asMessages(buddyRaw), keys: [buddyKey] });

      const removeKeys = new Set<string>([...convRows.map((r) => r.key)]);
      if (buddyRaw !== undefined) removeKeys.add(buddyKey);
      if (historyRaw !== undefined) removeKeys.add(historyKey);

      for (const conv of dedupeConversations(convs)) {
        const rows = conv.messages
          .map((m, i) => messageRow(m, now() - (conv.messages.length - i)))
          .filter((r): r is NonNullable<typeof r> => !!r);
        if (rows.length === 0) continue;
        const firstUser = conv.messages.find((m) => m.role === "user" && typeof m.content === "string" && m.content.trim());
        const title = conv.title?.replace(/\.\.\.$/, "…") || (firstUser ? titleFromText(String(firstUser.content)) : DEFAULT_THREAD_TITLE);
        const createdAt = rows[0].ts;
        const updatedAt = Math.max(...rows.map((r) => r.ts));
        const threadId = newId();
        db.run(
          "INSERT INTO assistant_threads (id, file_path, mode, title, seed, created_at, updated_at) VALUES (?, ?, 'chat', ?, NULL, ?, ?)",
          [threadId, filePath, title.slice(0, 120), createdAt, updatedAt],
        );
        rows.forEach((r, i) => {
          db.run(
            "INSERT INTO assistant_messages (id, thread_id, role, data, created_at, seq) VALUES (?, ?, ?, ?, ?, ?)",
            [newId(), threadId, r.role, r.data, r.ts, i + 1],
          );
        });
        report.threads++;
        report.messages += rows.length;
      }

      for (const key of removeKeys) report.removedKeys += db.run("DELETE FROM settings WHERE key = ?", [key]).changes;
    });
  }
}

/** True when `filePath` still has legacy chat keys (cheap; used to import lazily). */
export function hasLegacyChats(db: SqlDb, filePath: string): boolean {
  if (!tableExists(db, "settings")) return false;
  if (db.get("SELECT 1 AS x FROM settings WHERE key IN (?, ?)", [`${BUDDY_PREFIX}${filePath}`, `${HISTORY_PREFIX}${filePath}`])) return true;
  return keysWithPrefix(db, `${MESSAGES_PREFIX}${filePath}:`).length > 0;
}

// ── Simulate branches ───────────────────────────────────────────────────────

interface LegacyBranchRow {
  id: string;
  file_path: string;
  entity_id: string | null;
  entity_name: string | null;
  chapter_index: number;
  truncate_after_para: number;
  created_at: string | null;
}

interface LegacySegmentRow {
  segment_index: number;
  user_input: string;
  html_paragraphs: string;
  created_at: string | null;
}

export interface BranchImportReport {
  branches: number;
  segments: number;
  /** Legacy branches left in place (their chapter is missing from the parsed book). */
  skipped: number;
}

export function hasLegacyBranches(db: SqlDb, filePath: string): boolean {
  if (!tableExists(db, "sim_branches")) return false;
  return !!db.get("SELECT 1 AS x FROM sim_branches WHERE file_path = ? LIMIT 1", [filePath]);
}

/** Imports one book's `sim_branches` / `sim_segments` into `assistant_branches` (one transaction). */
export function importLegacyBranches(
  db: SqlDb,
  filePath: string,
  book: BookContentV2,
  opts: { now?: () => number; newId?: () => string } = {},
): BranchImportReport {
  const report: BranchImportReport = { branches: 0, segments: 0, skipped: 0 };
  if (!tableExists(db, "sim_branches")) return report;
  const now = opts.now ?? Date.now;
  const newId = opts.newId ?? randomUUID;
  const hasSegments = tableExists(db, "sim_segments");

  return db.transaction(() => {
    const rows = db.all<LegacyBranchRow>("SELECT * FROM sim_branches WHERE file_path = ? ORDER BY created_at ASC", [filePath]);
    for (const b of rows) {
      const ch = book.chapters[Number(b.chapter_index)];
      if (!ch || ch.paras.length === 0) {
        report.skipped++;
        continue;
      }
      const at = Math.max(0, Math.min(ch.paras.length - 1, Math.floor(Number(b.truncate_after_para) || 0)));
      const createdAt = sqliteTimeToMs(b.created_at, now());
      const taken = !!db.get("SELECT 1 AS x FROM assistant_branches WHERE id = ?", [b.id]);
      const id = taken || !b.id ? newId() : b.id;
      const name = b.entity_name?.trim() || "";
      const segs = hasSegments
        ? db.all<LegacySegmentRow>(
            "SELECT segment_index, user_input, html_paragraphs, created_at FROM sim_segments WHERE file_path = ? AND branch_id = ? ORDER BY segment_index ASC, id ASC",
            [filePath, b.id],
          )
        : [];
      const segTimes = segs.map((s) => sqliteTimeToMs(s.created_at, createdAt));
      db.run(
        `INSERT INTO assistant_branches (id, file_path, chapter_id, para_id, chapter_index, entity_id, entity_name, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, filePath, ch.id, ch.paras[at].id, ch.index, b.entity_id || null, name || null, name ? `What if… ${name}` : "What if…",
          createdAt, Math.max(createdAt, ...segTimes)],
      );
      segs.forEach((s, i) => {
        const html = safeJson<unknown>(s.html_paragraphs);
        const paragraphs = (Array.isArray(html) ? html : [])
          .filter((p): p is string => typeof p === "string")
          .flatMap((p) => toSafeParagraphs(p));
        db.run(
          `INSERT INTO assistant_branch_segments (branch_id, segment_index, user_input, paragraphs, choices, created_at)
           VALUES (?, ?, ?, ?, '[]', ?)`,
          [id, i, String(s.user_input ?? ""), JSON.stringify(paragraphs), segTimes[i]],
        );
        report.segments++;
      });
      if (hasSegments) db.run("DELETE FROM sim_segments WHERE file_path = ? AND branch_id = ?", [filePath, b.id]);
      db.run("DELETE FROM sim_branches WHERE file_path = ? AND id = ?", [filePath, b.id]);
      report.branches++;
    }
    return report;
  });
}
