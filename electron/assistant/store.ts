/**
 * Assistant thread store and Simulate branch store (owner: WS-E). Depends on `SqlDb` only, so it
 * runs on better-sqlite3 in main and on sql.js in tests. All writes are synchronous single
 * statements (or one transaction), so concurrent windows never lose updates (fixes S1-4).
 */

import { randomUUID } from "crypto";
import type { SqlDb } from "../db/sql";
import type {
  AssistantMessage, AssistantMode, AssistantSeed, AssistantThread, BranchChoice, CreateBranchRequest, SimBranch,
  SimSegment,
} from "../shared/assistant/types";

export interface StoreClock {
  now(): number;
  newId(): string;
}

export const systemClock: StoreClock = { now: () => Date.now(), newId: () => randomUUID() };

export const DEFAULT_THREAD_TITLE = "New conversation";
const MODES: readonly AssistantMode[] = ["chat", "explain", "recap", "lookup"];

interface ThreadRow {
  id: string; file_path: string; mode: string; title: string; seed: string | null; created_at: number; updated_at: number;
}
interface MessageRow { id: string; thread_id: string; role: string; data: string; created_at: number; seq: number }

function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function toThread(r: ThreadRow): AssistantThread {
  return {
    id: r.id,
    filePath: r.file_path,
    mode: (MODES as readonly string[]).includes(r.mode) ? (r.mode as AssistantMode) : "chat",
    title: r.title,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

/** Everything but the id/thread/role columns is stored in `data` (forward compatible). */
type MessageData = Omit<AssistantMessage, "id" | "threadId" | "role" | "createdAt">;

function toMessage(r: MessageRow): AssistantMessage {
  const data = safeJson<Partial<MessageData>>(r.data, {});
  return {
    id: r.id,
    threadId: r.thread_id,
    role: r.role === "user" ? "user" : "assistant",
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
    citations: Array.isArray(data.citations) ? data.citations : [],
    entityLinks: Array.isArray(data.entityLinks) ? data.entityLinks : [],
    ...(data.proposal ? { proposal: data.proposal } : {}),
    status: data.status ?? "done",
    ...(data.error ? { error: data.error } : {}),
    ...(data.usage ? { usage: data.usage } : {}),
    createdAt: Number(r.created_at),
  };
}

function dataOf(m: AssistantMessage): string {
  const { id: _i, threadId: _t, role: _r, createdAt: _c, ...data } = m;
  return JSON.stringify(data);
}

export function titleFromText(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean || DEFAULT_THREAD_TITLE;
  const cut = clean.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:!?-]+$/, "")}…`;
}

export type NewMessage = Omit<AssistantMessage, "id" | "threadId" | "createdAt"> & { id?: string };

export class ThreadStore {
  constructor(private readonly db: SqlDb, private readonly clock: StoreClock = systemClock) {}

  listThreads(filePath: string): AssistantThread[] {
    return this.db
      .all<ThreadRow>("SELECT * FROM assistant_threads WHERE file_path = ? ORDER BY updated_at DESC, created_at DESC", [filePath])
      .map(toThread);
  }

  getThread(id: string): AssistantThread | null {
    const r = this.db.get<ThreadRow>("SELECT * FROM assistant_threads WHERE id = ?", [id]);
    return r ? toThread(r) : null;
  }

  getSeed(id: string): AssistantSeed | undefined {
    const r = this.db.get<{ seed: string | null }>("SELECT seed FROM assistant_threads WHERE id = ?", [id]);
    return r ? safeJson<AssistantSeed | undefined>(r.seed, undefined) : undefined;
  }

  createThread(req: { filePath: string; mode: AssistantMode; seed?: AssistantSeed; title?: string }): AssistantThread {
    const now = this.clock.now();
    const mode = (MODES as readonly string[]).includes(req.mode) ? req.mode : "chat";
    const title = req.title?.trim() || (req.seed?.selection ? titleFromText(req.seed.selection.text) : DEFAULT_THREAD_TITLE);
    const row: ThreadRow = {
      id: this.clock.newId(), file_path: req.filePath, mode, title,
      seed: req.seed ? JSON.stringify(req.seed) : null, created_at: now, updated_at: now,
    };
    this.db.run(
      "INSERT INTO assistant_threads (id, file_path, mode, title, seed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [row.id, row.file_path, row.mode, row.title, row.seed, row.created_at, row.updated_at],
    );
    return toThread(row);
  }

  renameThread(id: string, title: string): void {
    this.db.run("UPDATE assistant_threads SET title = ?, updated_at = ? WHERE id = ?", [title, this.clock.now(), id]);
  }

  /** Deletes the thread and (FK cascade, plus an explicit delete for connections without FKs) its messages. */
  deleteThread(id: string): boolean {
    return this.db.transaction(() => {
      this.db.run("DELETE FROM assistant_messages WHERE thread_id = ?", [id]);
      return this.db.run("DELETE FROM assistant_threads WHERE id = ?", [id]).changes > 0;
    });
  }

  messages(threadId: string): AssistantMessage[] {
    return this.db
      .all<MessageRow>("SELECT * FROM assistant_messages WHERE thread_id = ? ORDER BY seq ASC", [threadId])
      .map(toMessage);
  }

  getMessage(id: string): AssistantMessage | null {
    const r = this.db.get<MessageRow>("SELECT * FROM assistant_messages WHERE id = ?", [id]);
    return r ? toMessage(r) : null;
  }

  /** Appends a message and bumps the thread; the first user message names a default-titled thread. */
  appendMessage(threadId: string, m: NewMessage): AssistantMessage {
    return this.db.transaction(() => {
      const thread = this.db.get<ThreadRow>("SELECT * FROM assistant_threads WHERE id = ?", [threadId]);
      if (!thread) throw new Error(`assistant: thread ${threadId} not found`);
      const now = this.clock.now();
      const seqRow = this.db.get<{ s: number | null }>("SELECT MAX(seq) AS s FROM assistant_messages WHERE thread_id = ?", [threadId]);
      const seq = Number(seqRow?.s ?? 0) + 1;
      const msg: AssistantMessage = { ...m, id: m.id ?? this.clock.newId(), threadId, createdAt: now };
      this.db.run(
        "INSERT INTO assistant_messages (id, thread_id, role, data, created_at, seq) VALUES (?, ?, ?, ?, ?, ?)",
        [msg.id, threadId, msg.role, dataOf(msg), now, seq],
      );
      let title = thread.title;
      if (msg.role === "user" && title === DEFAULT_THREAD_TITLE) {
        const text = msg.blocks.map((b) => (b.type === "markdown" ? b.text : "")).join(" ");
        title = titleFromText(text);
      }
      this.db.run("UPDATE assistant_threads SET updated_at = ?, title = ? WHERE id = ?", [now, title, threadId]);
      return msg;
    });
  }

  /** Read-modify-write of one message (synchronous, so atomic on the main thread). */
  updateMessage(id: string, patch: Partial<Omit<AssistantMessage, "id" | "threadId" | "role" | "createdAt">>): AssistantMessage | null {
    return this.db.transaction(() => {
      const cur = this.getMessage(id);
      if (!cur) return null;
      const next: AssistantMessage = { ...cur, ...patch };
      for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
        if (patch[k] === undefined) delete (next as unknown as Record<string, unknown>)[k];
      }
      this.db.run("UPDATE assistant_messages SET data = ? WHERE id = ?", [dataOf(next), id]);
      this.db.run("UPDATE assistant_threads SET updated_at = ? WHERE id = ?", [this.clock.now(), cur.threadId]);
      return next;
    });
  }

  /** Messages left "streaming" by a crash or a closed window become errors (called at start-up). */
  failDanglingStreams(): number {
    const rows = this.db.all<MessageRow>("SELECT * FROM assistant_messages WHERE role = 'assistant'");
    let n = 0;
    for (const r of rows) {
      const m = toMessage(r);
      if (m.status !== "streaming") continue;
      this.updateMessage(m.id, {
        status: "error",
        error: { code: "cancelled", message: "The answer was interrupted.", retryable: true },
      });
      n++;
    }
    return n;
  }
}

// ── Simulate branches ───────────────────────────────────────────────────────

interface BranchRow {
  id: string; file_path: string; chapter_id: string; para_id: string; chapter_index: number;
  entity_id: string | null; entity_name: string | null; title: string; created_at: number; updated_at: number;
  segment_count?: number;
}
interface SegmentRow {
  id: number; branch_id: string; segment_index: number; user_input: string; paragraphs: string; choices: string; created_at: number;
}

function toBranch(r: BranchRow): SimBranch {
  return {
    id: r.id,
    filePath: r.file_path,
    ref: { filePath: r.file_path, chapterId: r.chapter_id, paraId: r.para_id },
    chapterIndex: Number(r.chapter_index),
    ...(r.entity_id ? { entityId: r.entity_id } : {}),
    ...(r.entity_name ? { entityName: r.entity_name } : {}),
    title: r.title,
    segmentCount: Number(r.segment_count ?? 0),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function toSegment(r: SegmentRow): SimSegment {
  return {
    id: Number(r.id),
    branchId: r.branch_id,
    index: Number(r.segment_index),
    userInput: r.user_input,
    paragraphs: safeJson<string[]>(r.paragraphs, []),
    choices: safeJson<BranchChoice[]>(r.choices, []),
    createdAt: Number(r.created_at),
  };
}

const BRANCH_SELECT = `SELECT b.*, (SELECT COUNT(*) FROM assistant_branch_segments s WHERE s.branch_id = b.id) AS segment_count
  FROM assistant_branches b`;

export class BranchStore {
  constructor(private readonly db: SqlDb, private readonly clock: StoreClock = systemClock) {}

  list(filePath: string): SimBranch[] {
    return this.db.all<BranchRow>(`${BRANCH_SELECT} WHERE b.file_path = ? ORDER BY b.updated_at DESC`, [filePath]).map(toBranch);
  }

  get(id: string): SimBranch | null {
    const r = this.db.get<BranchRow>(`${BRANCH_SELECT} WHERE b.id = ?`, [id]);
    return r ? toBranch(r) : null;
  }

  create(req: CreateBranchRequest): SimBranch {
    const now = this.clock.now();
    const id = this.clock.newId();
    const title = req.title?.trim() || (req.entityName ? `What if… ${req.entityName}` : "What if…");
    this.db.run(
      `INSERT INTO assistant_branches (id, file_path, chapter_id, para_id, chapter_index, entity_id, entity_name, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.filePath, req.ref.chapterId, req.ref.paraId, req.chapterIndex, req.entityId ?? null, req.entityName ?? null, title, now, now],
    );
    return this.get(id)!;
  }

  segments(branchId: string): SimSegment[] {
    return this.db
      .all<SegmentRow>("SELECT * FROM assistant_branch_segments WHERE branch_id = ? ORDER BY segment_index ASC", [branchId])
      .map(toSegment);
  }

  /** Appends at the next index (atomic). */
  append(branchId: string, seg: { userInput: string; paragraphs: string[]; choices: BranchChoice[] }): SimSegment {
    return this.db.transaction(() => {
      if (!this.db.get("SELECT 1 AS x FROM assistant_branches WHERE id = ?", [branchId])) {
        throw new Error(`assistant: branch ${branchId} not found`);
      }
      const now = this.clock.now();
      const next = Number(
        this.db.get<{ n: number | null }>("SELECT MAX(segment_index) AS n FROM assistant_branch_segments WHERE branch_id = ?", [branchId])?.n ?? -1,
      ) + 1;
      const r = this.db.run(
        `INSERT INTO assistant_branch_segments (branch_id, segment_index, user_input, paragraphs, choices, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [branchId, next, seg.userInput, JSON.stringify(seg.paragraphs), JSON.stringify(seg.choices), now],
      );
      this.db.run("UPDATE assistant_branches SET updated_at = ? WHERE id = ?", [now, branchId]);
      return toSegment({
        id: r.lastInsertRowid, branch_id: branchId, segment_index: next, user_input: seg.userInput,
        paragraphs: JSON.stringify(seg.paragraphs), choices: JSON.stringify(seg.choices), created_at: now,
      });
    });
  }

  remove(id: string): boolean {
    return this.db.transaction(() => {
      this.db.run("DELETE FROM assistant_branch_segments WHERE branch_id = ?", [id]);
      return this.db.run("DELETE FROM assistant_branches WHERE id = ?", [id]).changes > 0;
    });
  }
}
