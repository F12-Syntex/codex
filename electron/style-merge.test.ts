/**
 * WS-D: style dictionary — concurrent merges never lose rules or flip a character's dialogue
 * class (AI_AUDIT S1-7). `book_style` read-modify-writes run in one synchronous transaction.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openSqlJsDb } from "./db/sqljs";
import { runMigrations } from "./db/migrate";
import { chaptersMigrations } from "./ai/artifacts-schema";
import {
  SqlStyleStore, buildStyleContext, extractCharacterStyles, extractRules, mergeCharacterStyles, mergeRules,
} from "./ai/style";

async function store() {
  const db = await openSqlJsDb();
  runMigrations(db, [{ area: "chapters", migrations: chaptersMigrations }], () => {});
  return { db, style: new SqlStyleStore(db, () => 1_700_000_000_000) };
}

const badge = (cls: string, name: string) => `<p><span class="${cls}" data-tts-skip>${name}</span> “Hi.”</p>`;

test("style: extraction finds components (not icons/sub-parts) and speaker classes", () => {
  const html = [
    '<div class="ai-fmt-stat-block"><div class="ai-fmt-stat-row"><span class="ai-fmt-stat-label"><span class="ai-fmt-icon ai-fmt-icon-heart"></span>HP</span></div></div>',
    badge("ai-fmt-dialogue-hero", "Kim"),
  ];
  assert.deepEqual(extractRules(html).map((r) => r.component).sort(), ["ai-fmt-dialogue-hero", "ai-fmt-stat-block"]);
  assert.deepEqual(extractCharacterStyles(html), { kim: "ai-fmt-dialogue-hero" });
  assert.equal(extractRules(html)[0].id, extractRules(html)[0].id, "rule ids are deterministic");
});

test("style: mergeRules keeps the existing id and takes the newer example; character styles are first-writer-wins", () => {
  const [a] = extractRules(['<div class="ai-fmt-system-msg">Old</div>']);
  const [b] = extractRules(['<div class="ai-fmt-system-msg">New</div>']);
  const merged = mergeRules([{ ...a, id: "keep-me" }], [b]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "keep-me");
  assert.match(merged[0].exampleHtml, /New/);
  assert.deepEqual(mergeCharacterStyles({ kim: "ai-fmt-dialogue-hero" }, { kim: "ai-fmt-dialogue-villain", vorn: "ai-fmt-dialogue-villain" }), {
    kim: "ai-fmt-dialogue-hero",
    vorn: "ai-fmt-dialogue-villain",
  });
});

test("style: concurrent merges from several jobs never lose rules or flip a character's class", async () => {
  const { db, style } = await store();
  const book = "/books/a.epub";
  // Each "job" formats a chapter; they finish in an interleaved order on main's event loop.
  const jobs = [
    { delay: 3, html: ['<div class="ai-fmt-system-msg">Quest</div>', badge("ai-fmt-dialogue-hero", "Kim")] },
    { delay: 1, html: ['<span class="ai-fmt-xp-badge">+40 XP</span>', badge("ai-fmt-dialogue-villain", "Kim")] },
    { delay: 2, html: ['<div class="ai-fmt-item-card">Sword</div>', badge("ai-fmt-dialogue-divine", "Vorn")] },
    { delay: 0, html: ['<div class="ai-fmt-thought">hm</div>'] },
  ];
  const stale = style.get(book); // what the legacy code passed around: a snapshot taken up front
  await Promise.all(
    jobs.map(async (j) => {
      await new Promise((r) => setTimeout(r, j.delay));
      style.mergeFormatted(book, j.html, "Book");
    }),
  );
  const d = style.get(book);
  assert.deepEqual(
    d.rules.map((r) => r.component).sort(),
    ["ai-fmt-dialogue-divine", "ai-fmt-dialogue-hero", "ai-fmt-dialogue-villain", "ai-fmt-item-card", "ai-fmt-system-msg", "ai-fmt-thought", "ai-fmt-xp-badge"],
  );
  // Job 2 (delay 1) wrote Kim first → villain sticks; job 1's later "hero" does not flip it.
  assert.equal(d.characterStyles?.kim, "ai-fmt-dialogue-villain");
  assert.equal(d.characterStyles?.vorn, "ai-fmt-dialogue-divine");
  assert.equal(style.version(book), 4, "one row version per merge");
  assert.equal(stale.rules.length, 0);

  // Later merges never flip established speakers, whatever order they arrive in.
  style.mergeFormatted(book, [badge("ai-fmt-dialogue-hero", "Kim"), badge("ai-fmt-dialogue-hero", "Vorn")], "Book");
  assert.equal(style.get(book).characterStyles?.kim, "ai-fmt-dialogue-villain");
  assert.equal(style.get(book).characterStyles?.vorn, "ai-fmt-dialogue-divine");
  db.close();
});

test("style: a throwing update rolls back; books are independent; prompt context lists rules and speakers", async () => {
  const { db, style } = await store();
  style.mergeFormatted("/a", ['<div class="ai-fmt-system-msg">x</div>', badge("ai-fmt-dialogue-hero", "Kim")], "A");
  assert.throws(() => style.update("/a", () => { throw new Error("boom"); }));
  assert.equal(style.get("/a").rules.length, 2);
  assert.equal(style.get("/b").rules.length, 0);
  const ctx = buildStyleContext(style.get("/a"));
  assert.match(ctx, /ai-fmt-system-msg/);
  assert.match(ctx, /"kim": ALWAYS use `ai-fmt-dialogue-hero`/);
  style.clear("/a");
  assert.equal(style.get("/a").rules.length, 0);
  db.close();
});
