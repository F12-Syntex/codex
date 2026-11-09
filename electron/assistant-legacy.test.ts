/**
 * WS-E Phase 2d: legacy Buddy / chat history (settings keys) → assistant threads, and legacy
 * Simulate branches (`sim_branches` / `sim_segments`, index-anchored) → ParaRef branches.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations } from "./db/migrate";
import type { SqlDb } from "./db/sql";
import { assistantMigrations } from "./assistant/schema";
import { dedupeConversations, importLegacyBranches, importLegacyChats, legacyHtmlToMarkdown, sqliteTimeToMs } from "./assistant/legacy";
import { AssistantService } from "./assistant/service";
import { ThreadStore } from "./assistant/store";
import { FILE, fakeBooks, makeBook } from "./assistant/fixtures";
import { parseMarkdown } from "./shared/assistant/markdown";

const OTHER = "C:\\Books\\Other: Book.epub";

/** The pre-rebuild tables the legacy code created (subset of `electron/database.ts`). */
function legacySchema(db: SqlDb): void {
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE sim_branches (
      id TEXT NOT NULL, file_path TEXT NOT NULL, entity_id TEXT NOT NULL, entity_name TEXT NOT NULL,
      chapter_index INTEGER NOT NULL, truncate_after_para INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (file_path, id)
    );
    CREATE TABLE sim_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT NOT NULL, branch_id TEXT NOT NULL,
      segment_index INTEGER NOT NULL, user_input TEXT NOT NULL, html_paragraphs TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function setSetting(db: SqlDb, key: string, value: unknown): void {
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, typeof value === "string" ? value : JSON.stringify(value)]);
}

const msg = (id: string, role: "user" | "assistant", content: string, timestamp: number) => ({ id, role, content, timestamp });

const Q1 = msg("u1", "user", "Who is Mira?", 1000);
const A1 = msg("a1", "assistant", '<p class="buddy-text"><a data-entity="mira" class="buddy-entity-link">Mira</a> is a <strong>thief</strong>.</p>', 1001);
const Q2 = msg("u2", "user", "And Orren?", 1002);
const A2 = msg("a2", "assistant", '<div class="buddy-card"><p class="buddy-text">A <em>rival</em> of <a data-entity="mira">Mira</a>.</p></div>', 1003);

test("legacyHtmlToMarkdown: entity links, emphasis, lists and entities", () => {
  const { text, entityIds } = legacyHtmlToMarkdown(
    '<p class="buddy-text"><a data-entity="mira" class="buddy-entity-link">Mira</a> &amp; <b>Orren</b></p><ul><li>one</li><li><i>two</i></li></ul><script>alert(1)</script>',
  );
  assert.deepEqual(entityIds, ["mira"]);
  assert.match(text, /\[Mira\]\(entity:mira\) & \*\*Orren\*\*/);
  assert.match(text, /- one\n- \*two\*/);
  assert.doesNotMatch(text, /alert|<|>/);
  // Renders through the assistant Markdown subset as an entity mention.
  const blocks = parseMarkdown(text);
  assert.equal(blocks[0].t, "p");
  assert.ok(blocks[0].t === "p" && blocks[0].c.some((n) => n.t === "entity" && n.id === "mira"));
});

test("dedupeConversations folds an earlier save into the longer conversation", () => {
  const a = { messages: [Q1, A1], keys: ["k1"] };
  const b = { messages: [Q1, A1, Q2, A2], keys: ["k2"] };
  const c = { messages: [Q2, A2], keys: ["k3"] };
  const out = dedupeConversations([a, b, c]);
  assert.deepEqual(out.map((x) => x.keys[0]), ["k2", "k3"]);
  // Identical conversations: the first one wins.
  const d = dedupeConversations([{ messages: [Q1, A1], keys: ["x"] }, { messages: [Q1, A1], keys: ["y"] }]);
  assert.deepEqual(d.map((x) => x.keys[0]), ["x"]);
});

test("migration v2 imports buddy + saved chats into threads and removes the legacy keys", async () => {
  const db = await openSqlJsDb();
  legacySchema(db);
  // FILE: a saved conversation that the live Buddy conversation extends, plus an unrelated one and a "deleted" one.
  setSetting(db, `chatHistory:${FILE}`, [
    { id: "conv-1", title: "Who is Mira?", firstMessage: "Who is Mira?", messageCount: 2, timestamp: 1001 },
    { id: "conv-2", title: "Chapter 3 recap", firstMessage: "Recap", messageCount: 2, timestamp: 900 },
  ]);
  setSetting(db, `chatMessages:${FILE}:conv-1`, [Q1, A1]);
  setSetting(db, `chatMessages:${FILE}:conv-2`, [msg("r1", "user", "Recap", 900), msg("r2", "assistant", "<p>It happened.</p>", 901)]);
  setSetting(db, `chatMessages:${FILE}:conv-3`, "");
  setSetting(db, `buddyMessages:${FILE}`, [Q1, A1, Q2, A2]);
  // OTHER: only a live Buddy conversation; its path contains ':' and '\\'.
  setSetting(db, `buddyMessages:${OTHER}`, [msg("o1", "user", "Hi", 50), msg("o2", "assistant", "<p>Hello!</p>", 51)]);
  setSetting(db, "theme", "{}"); // unrelated keys survive

  const report = runMigrations(db, [{ area: "assistant", migrations: assistantMigrations }], () => {});
  assert.deepEqual(report.errors, []);

  const store = new ThreadStore(db);
  const threads = store.listThreads(FILE);
  assert.equal(threads.length, 2, "conv-1 is folded into the longer buddy conversation; conv-3 was deleted");
  const live = threads.find((t) => t.title === "Who is Mira?")!;
  assert.ok(live, "title from the first user message");
  const msgs = store.messages(live.id);
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
  assert.deepEqual(msgs[1].entityLinks, ["mira"]);
  assert.equal(msgs[1].blocks[0].type, "markdown");
  assert.match(msgs[1].blocks[0].type === "markdown" ? msgs[1].blocks[0].text : "", /\[Mira\]\(entity:mira\) is a \*\*thief\*\*\./);
  assert.equal(msgs[0].status, "done");
  assert.equal(live.createdAt, 1000);
  assert.equal(live.updatedAt, 1003);
  assert.ok(threads.some((t) => t.title === "Chapter 3 recap"), "summary title kept");

  assert.equal(store.listThreads(OTHER).length, 1);

  const left = db.all<{ key: string }>("SELECT key FROM settings ORDER BY key").map((r) => r.key);
  assert.deepEqual(left, ["theme"], "legacy chat keys (including the empty 'deleted' one) are removed");

  // Idempotent.
  assert.deepEqual(importLegacyChats(db), { threads: 0, messages: 0, removedKeys: 0 });
  assert.equal(store.listThreads(FILE).length, 2);
});

test("listThreads lazily imports legacy chats written after the migration", async () => {
  const db = await openSqlJsDb();
  legacySchema(db);
  runMigrations(db, [{ area: "assistant", migrations: assistantMigrations }], () => {});
  setSetting(db, `buddyMessages:${FILE}`, [Q1, A1]);
  const svc = new AssistantService(db);
  const threads = svc.listThreads(FILE);
  assert.equal(threads.length, 1);
  assert.equal(svc.getThread(threads[0].id).messages.length, 2);
  assert.equal(db.get("SELECT 1 AS x FROM settings WHERE key = ?", [`buddyMessages:${FILE}`]), undefined);
});

test("migration v2 is a no-op without a settings table", async () => {
  const db = await openSqlJsDb();
  const report = runMigrations(db, [{ area: "assistant", migrations: assistantMigrations }], () => {});
  assert.deepEqual(report.errors, []);
  assert.equal(report.applied.length, 2);
});

test("legacy sim branches are anchored to ParaIds on first listing; segments are sanitised", async () => {
  const db = await openSqlJsDb();
  legacySchema(db);
  runMigrations(db, [{ area: "assistant", migrations: assistantMigrations }], () => {});
  db.run(
    "INSERT INTO sim_branches (id, file_path, entity_id, entity_name, chapter_index, truncate_after_para, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ["sim_1", FILE, "mira", "Mira", 1, 2, "2024-05-01 10:00:00"],
  );
  db.run(
    "INSERT INTO sim_branches (id, file_path, entity_id, entity_name, chapter_index, truncate_after_para, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ["sim_2", FILE, "orren", "Orren", 3, 99, "2024-05-02 10:00:00"],
  );
  // Chapter 42 does not exist in the parsed book: left in place.
  db.run(
    "INSERT INTO sim_branches (id, file_path, entity_id, entity_name, chapter_index, truncate_after_para) VALUES (?, ?, ?, ?, ?, ?)",
    ["sim_3", FILE, "x", "X", 42, 0],
  );
  db.run(
    "INSERT INTO sim_segments (file_path, branch_id, segment_index, user_input, html_paragraphs, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [FILE, "sim_1", 0, "Mira runs", JSON.stringify(['<p class="x">She <em>ran</em>.</p>', '<img src=x onerror="alert(1)">Gone']), "2024-05-01 10:05:00"],
  );
  db.run(
    "INSERT INTO sim_segments (file_path, branch_id, segment_index, user_input, html_paragraphs) VALUES (?, ?, ?, ?, ?)",
    [FILE, "sim_1", 1, "Then?", JSON.stringify(["<p>Next.</p>"])],
  );

  const svc = new AssistantService(db);
  const books = fakeBooks(makeBook());
  svc.configure({ books });
  const list = await svc.listBranches(FILE);
  assert.equal(list.length, 2);
  const b1 = list.find((b) => b.entityId === "mira")!;
  assert.deepEqual(b1.ref, { filePath: FILE, chapterId: "c1", paraId: "p1_2" });
  assert.equal(b1.chapterIndex, 1);
  assert.equal(b1.title, "What if… Mira");
  assert.equal(b1.segmentCount, 2);
  assert.equal(b1.id, "sim_1", "legacy id kept when free");
  assert.equal(b1.createdAt, sqliteTimeToMs("2024-05-01 10:00:00", 0));
  const b2 = list.find((b) => b.entityId === "orren")!;
  assert.equal(b2.ref.paraId, "p3_4", "out-of-range paragraph clamps to the chapter's last");

  const segs = await svc.segments("sim_1");
  assert.deepEqual(segs.map((s) => s.index), [0, 1]);
  assert.deepEqual(segs[0].paragraphs, ["<p>She <em>ran</em>.</p>", "<p>Gone</p>"]);
  assert.equal(segs[0].userInput, "Mira runs");
  assert.deepEqual(segs[0].choices, []);

  // Imported rows are removed; the unmappable one stays for a later attempt.
  assert.deepEqual(db.all<{ id: string }>("SELECT id FROM sim_branches").map((r) => r.id), ["sim_3"]);
  assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM sim_segments")?.n, 0);

  // Second listing does not re-import (and does not re-parse the book).
  const calls = books.calls;
  assert.equal((await svc.listBranches(FILE)).length, 2);
  assert.equal(books.calls, calls);
});

test("importLegacyBranches assigns a fresh id when the legacy id is taken and is idempotent", async () => {
  const db = await openSqlJsDb();
  legacySchema(db);
  runMigrations(db, [{ area: "assistant", migrations: assistantMigrations }], () => {});
  const book = makeBook();
  for (const fp of [FILE, OTHER]) {
    db.run(
      "INSERT INTO sim_branches (id, file_path, entity_id, entity_name, chapter_index, truncate_after_para) VALUES (?, ?, ?, ?, ?, ?)",
      ["sim_same", fp, "mira", "Mira", 0, 0],
    );
  }
  let n = 0;
  const opts = { newId: () => `new${++n}` };
  assert.equal(importLegacyBranches(db, FILE, book, opts).branches, 1);
  assert.equal(importLegacyBranches(db, OTHER, book, opts).branches, 1);
  const ids = db.all<{ id: string }>("SELECT id FROM assistant_branches ORDER BY id").map((r) => r.id);
  assert.deepEqual(ids, ["new1", "sim_same"]);
  assert.deepEqual(importLegacyBranches(db, FILE, book, opts), { branches: 0, segments: 0, skipped: 0 });
});

test("listBranches without book content keeps legacy rows and retries later", async () => {
  const db = await openSqlJsDb();
  legacySchema(db);
  runMigrations(db, [{ area: "assistant", migrations: assistantMigrations }], () => {});
  db.run(
    "INSERT INTO sim_branches (id, file_path, entity_id, entity_name, chapter_index, truncate_after_para) VALUES (?, ?, ?, ?, ?, ?)",
    ["sim_1", FILE, "mira", "Mira", 0, 0],
  );
  const svc = new AssistantService(db);
  assert.deepEqual(await svc.listBranches(FILE), []);
  svc.configure({ books: fakeBooks(makeBook()) });
  assert.equal((await svc.listBranches(FILE)).length, 1);
});
