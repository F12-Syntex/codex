/**
 * Phase 0 smoke tests: SqlDb (sql.js adapter), the migrations runner, the RPC allowlist (and that
 * the preload's inlined copy matches it), the IPC registry and reader-window tracking.
 * better-sqlite3 cannot load under `node --test`, so DB tests run on sql.js.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { openSqlJsDb } from "./db/sqljs";
import { hasFts5, ASYNC_TRANSACTION_ERROR } from "./db/sql";
import { runMigrations, getAppliedVersions, validateMigrations, AREA_MIGRATIONS, type AreaMigrations } from "./db/migrate";
import { isAllowedChannel, isAllowedEvent, RPC_CHANNEL_RE, EVENT_CHANNELS } from "./shared/rpc";
import { createAreaContext, registerAll } from "./ipc/registry";
import type { IpcMainLike, WindowLike } from "./ipc/context";
import { trackReaderWindow, getReaderWindows, getReaderFilePath, isBookOpen, _resetReaderWindowsForTests } from "./book/windows";
import { Priority } from "./shared/ai/types";

const silent = () => {};

// ── SqlDb adapter ───────────────────────────────────────────────────────────

test("sql.js adapter: run/get/all with positional and named params", async () => {
  const db = await openSqlJsDb();
  assert.equal(db.driver, "sql.js");
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, n INTEGER)");
  const r1 = db.run("INSERT INTO t (name, n) VALUES (?, ?)", ["a", 1]);
  assert.deepEqual(r1, { changes: 1, lastInsertRowid: 1 });
  db.run("INSERT INTO t (name, n) VALUES (@name, @n)", { name: "b", n: 2 });
  db.run("INSERT INTO t (name, n) VALUES (:name, $n)", { name: "c", n: BigInt(3) });
  assert.deepEqual(db.get("SELECT name, n FROM t WHERE id = ?", [2]), { name: "b", n: 2 });
  assert.equal(db.get("SELECT * FROM t WHERE id = ?", [99]), undefined);
  assert.deepEqual(db.all<{ name: string }>("SELECT name FROM t ORDER BY id").map((r) => r.name), ["a", "b", "c"]);
  assert.equal(db.run("UPDATE t SET n = n + 1").changes, 3);
  db.close();
});

test("sql.js adapter: transactions commit, roll back, nest, and reject async callbacks", async () => {
  const db = await openSqlJsDb();
  db.exec("CREATE TABLE t (v INTEGER)");
  db.transaction(() => db.run("INSERT INTO t VALUES (1)"));
  assert.throws(() => db.transaction(() => { db.run("INSERT INTO t VALUES (2)"); throw new Error("boom"); }), /boom/);
  // Inner failure rolls back only the savepoint.
  db.transaction(() => {
    db.run("INSERT INTO t VALUES (3)");
    try { db.transaction(() => { db.run("INSERT INTO t VALUES (4)"); throw new Error("inner"); }); } catch { /* expected */ }
  });
  assert.throws(() => db.transaction(() => Promise.resolve(5)), new RegExp(ASYNC_TRANSACTION_ERROR.slice(0, 20)));
  assert.deepEqual(db.all<{ v: number }>("SELECT v FROM t ORDER BY v").map((r) => r.v), [1, 3]);
  db.close();
});

test("sql.js build lacks FTS5 (knowledge search must fall back)", async () => {
  const db = await openSqlJsDb();
  assert.equal(hasFts5(db), false);
  db.close();
});

// ── Migrations ──────────────────────────────────────────────────────────────

test("runMigrations: production area lists are valid and apply cleanly", async () => {
  const db = await openSqlJsDb();
  validateMigrations(AREA_MIGRATIONS);
  const report = runMigrations(db, AREA_MIGRATIONS, silent);
  assert.deepEqual(report.errors, []);
  assert.ok(db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"));
  db.close();
});

test("runMigrations: applies in order, records versions, is idempotent and picks up appended versions", async () => {
  const db = await openSqlJsDb();
  const calls: string[] = [];
  const v1: AreaMigrations = {
    area: "demo",
    migrations: [
      { version: 1, name: "create", up: "CREATE TABLE demo (id INTEGER PRIMARY KEY, v TEXT)" },
      { version: 2, name: "seed", up: (d) => { calls.push("seed"); d.run("INSERT INTO demo (v) VALUES (?)", ["x"]); } },
    ],
  };
  let report = runMigrations(db, [v1], silent);
  assert.deepEqual(report.applied.map((a) => a.version), [1, 2]);
  assert.deepEqual(getAppliedVersions(db, "demo"), [1, 2]);

  report = runMigrations(db, [v1], silent);
  assert.deepEqual(report.applied, []);
  assert.deepEqual(calls, ["seed"]);

  const v2: AreaMigrations = { area: "demo", migrations: [...v1.migrations, { version: 3, name: "col", up: "ALTER TABLE demo ADD COLUMN w TEXT" }] };
  report = runMigrations(db, [v2], silent);
  assert.deepEqual(report.applied.map((a) => a.version), [3]);
  assert.deepEqual(getAppliedVersions(db, "demo"), [1, 2, 3]);
  db.close();
});

test("runMigrations: a failure rolls back that migration, stops its area, and other areas still run", async () => {
  const db = await openSqlJsDb();
  const logged: string[] = [];
  const report = runMigrations(db, [
    {
      area: "bad",
      migrations: [
        { version: 1, name: "ok", up: "CREATE TABLE bad1 (x)" },
        { version: 2, name: "partial", up: "CREATE TABLE bad2 (x); INSERT INTO nope VALUES (1);" },
        { version: 3, name: "never", up: "CREATE TABLE bad3 (x)" },
      ],
    },
    { area: "good", migrations: [{ version: 1, name: "ok", up: "CREATE TABLE good1 (x)" }] },
  ], (msg) => logged.push(msg));

  assert.deepEqual(report.applied.map((a) => `${a.area}@${a.version}`), ["bad@1", "good@1"]);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].version, 2);
  assert.equal(logged.length, 1);
  const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name);
  assert.ok(tables.includes("bad1") && tables.includes("good1"));
  assert.ok(!tables.includes("bad2"), "partial DDL must be rolled back");
  assert.ok(!tables.includes("bad3"));
  assert.deepEqual(getAppliedVersions(db, "bad"), [1]);
  db.close();
});

test("validateMigrations rejects bad lists", () => {
  const up = "SELECT 1";
  assert.throws(() => validateMigrations([{ area: "a", migrations: [{ version: 2, name: "", up }, { version: 1, name: "", up }] }]));
  assert.throws(() => validateMigrations([{ area: "a", migrations: [{ version: 1, name: "", up }, { version: 1, name: "", up }] }]));
  assert.throws(() => validateMigrations([{ area: "a", migrations: [{ version: 0, name: "", up }] }]));
  assert.throws(() => validateMigrations([{ area: "a", migrations: [] }, { area: "a", migrations: [] }]));
});

// ── RPC allowlist ───────────────────────────────────────────────────────────

test("isAllowedChannel: new area prefixes only", () => {
  for (const ok of ["ai:submit", "ai:settings:get", "chapters:ensure", "bulk:start", "style:get", "book:content",
    "lexicon:get", "knowledge:wiki", "assistant:send", "vocab:list", "library:get-setting"]) {
    assert.equal(isAllowedChannel(ok), true, ok);
  }
  for (const bad of ["wiki:clear-all", "shell:open-external", "style-dictionary:open", "reader:open", "ai", "ai-x:y",
    " ai:submit", "AI:submit", "", "x".repeat(130), 42, null, undefined, {}]) {
    assert.equal(isAllowedChannel(bad), false, String(bad));
  }
  assert.equal(isAllowedChannel("ai:" + "x".repeat(200)), false);
});

test("isAllowedEvent: only ai:event", () => {
  assert.equal(isAllowedEvent("ai:event"), true);
  for (const bad of ["window:maximized", "update:status", "ai:other", "", 1, null]) assert.equal(isAllowedEvent(bad), false);
});

test("preload inlines the same allowlists as shared/rpc.ts", () => {
  // Compiled test lives in dist-electron/; the source preload is in electron/.
  const src = fs.readFileSync(path.join(__dirname, "..", "electron", "preload.ts"), "utf8");
  assert.ok(src.includes(`const RPC_CHANNEL_RE = ${RPC_CHANNEL_RE.toString()};`), "RPC_CHANNEL_RE drifted");
  const events = EVENT_CHANNELS.map((e) => JSON.stringify(e)).join(", ");
  assert.ok(src.includes(`const EVENT_CHANNELS: readonly string[] = [${events}];`), "EVENT_CHANNELS drifted");
  assert.ok(src.includes("channel.length <= 128"), "length guard drifted");
});

// ── IPC registry ────────────────────────────────────────────────────────────

function fakeIpc() {
  const handlers = new Map<string, (event: { sender: { id: number } }, ...args: unknown[]) => unknown>();
  const ipc: IpcMainLike = {
    handle: (ch, fn) => { if (handlers.has(ch)) throw new Error("dup"); handlers.set(ch, fn); },
    removeHandler: (ch) => { handlers.delete(ch); },
  };
  return { ipc, handlers };
}

test("registry: typed handle passes sender id, rejects unallowlisted/duplicate channels; broadcast skips destroyed windows", async () => {
  const db = await openSqlJsDb();
  const { ipc, handlers } = fakeIpc();
  const sent: { id: number; channel: string; payload: unknown }[] = [];
  const win = (id: number, destroyed = false): WindowLike => ({
    isDestroyed: () => destroyed,
    webContents: { id, send: (channel, payload) => sent.push({ id, channel, payload }) },
  });
  const ctx = createAreaContext({ db, ipcMain: ipc, getWindows: () => [win(1), win(2, true), win(3)] });

  ctx.handle("ai:cancel", (meta, sel) => ("jobId" in sel ? meta.senderId : -1));
  assert.equal(await handlers.get("ai:cancel")!({ sender: { id: 7 } }, { jobId: "j1" }), 7);
  assert.throws(() => ctx.handle("ai:cancel", () => 0), /twice/);
  assert.throws(() => (ctx.handle as (c: string, h: () => void) => void)("wiki:clear-all", () => {}), /not allowlisted/);

  ctx.broadcast("ai:event", { type: "health", state: "ok" });
  assert.deepEqual(sent.map((s) => s.id), [1, 3]);
  assert.ok(sent.every((s) => s.channel === "ai:event"));
  db.close();
});

test("registerAll: Phase 0 stubs register nothing and a second call is a no-op", async () => {
  const db = await openSqlJsDb();
  const { ipc, handlers } = fakeIpc();
  const a = registerAll({ db, ipcMain: ipc, getWindows: () => [] });
  const b = registerAll({ db, ipcMain: ipc, getWindows: () => [] });
  assert.equal(a, b);
  assert.equal(handlers.size, 0);
  db.close();
});

// ── Reader windows ──────────────────────────────────────────────────────────

test("trackReaderWindow: tracks by file and forgets closed windows", () => {
  _resetReaderWindowsForTests();
  const make = (id: number) => {
    let destroyed = false;
    let onClosed: (() => void) | null = null;
    return {
      win: { isDestroyed: () => destroyed, webContents: { id }, once: (_e: "closed", cb: () => void) => { onClosed = cb; } },
      close: () => { destroyed = true; onClosed?.(); },
    };
  };
  const a = make(1), b = make(2), c = make(3);
  trackReaderWindow(a.win, "/books/a.epub");
  trackReaderWindow(b.win, "/books/a.epub");
  trackReaderWindow(c.win, "/books/c.pdf");
  assert.equal(getReaderWindows("/books/a.epub").length, 2);
  assert.equal(getReaderWindows().length, 3);
  assert.equal(getReaderFilePath(3), "/books/c.pdf");
  assert.equal(isBookOpen("/books/a.epub", 1), true);
  a.close();
  assert.equal(isBookOpen("/books/a.epub", 2), false);
  assert.equal(getReaderFilePath(1), undefined);
  assert.equal(getReaderWindows().length, 2);
});

test("shared Priority ordering", () => {
  assert.ok(Priority.Interactive < Priority.Visible && Priority.Visible < Priority.Prefetch && Priority.Prefetch < Priority.Background);
});
