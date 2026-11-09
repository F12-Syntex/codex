/**
 * WS-C: lexicon (word replacements). Smart case, longest match first, text nodes only, scopes,
 * the empty default + opt-in preset, and the main-side store (legacy key import/mirror, events).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyLexicon, applyLexiconText, compileLexicon, EMPTY_LEXICON, entriesFromLegacy, lexiconPieces, makeLexicon, smartCase,
} from "./shared/pipeline/lexicon";
import { CULTIVATION_TERMS, mergePreset } from "./shared/pipeline/lexicon-presets";
import { LexiconStore, LEGACY_REPLACEMENTS_KEY, LEXICON_KEY, settingsKV, type KeyValueStore } from "./book/lexicon-store";
import { openSqlJsDb } from "./db/sqljs";
import type { Lexicon, LexiconEntry } from "./shared/pipeline/types";

const lex = (entries: Partial<LexiconEntry>[]): Lexicon => makeLexicon(entries);
const godLex = lex([
  { from: "god", to: "Ascendant" },
  { from: "goddess", to: "Ascendant" },
  { from: "gods", to: "Ascendants" },
  { from: "God of War", to: "Lord of Battle" },
]);

test("smart case: lower, Title, UPPER, mixed", () => {
  assert.equal(smartCase("god", "Ascendant"), "ascendant");
  assert.equal(smartCase("God", "Ascendant"), "Ascendant");
  assert.equal(smartCase("GOD", "Ascendant"), "ASCENDANT");
  assert.equal(smartCase("Gods", "lesser Ascendants"), "Lesser Ascendants");
  assert.equal(smartCase("gOd", "Ascendant"), "Ascendant");
  assert.equal(applyLexiconText("god God GOD", godLex, "display"), "ascendant Ascendant ASCENDANT");
});

test("whole words, longest match first", () => {
  assert.equal(applyLexiconText("The goddess and the gods.", godLex, "display"), "The ascendant and the ascendants.");
  assert.equal(applyLexiconText("godfather, ungodly, god-like", godLex, "display"), "godfather, ungodly, ascendant-like");
  assert.equal(applyLexiconText("The God of War rose.", godLex, "display"), "The Lord of Battle rose.");
  assert.equal(applyLexiconText("café god", lex([{ from: "caf", to: "x" }, { from: "god", to: "g" }]), "display"), "café g");
});

test("exact match is case-sensitive and verbatim", () => {
  const l = lex([{ from: "Ki", to: "qi", match: "exact" }]);
  assert.equal(applyLexiconText("Ki ki KI", l, "display"), "qi ki KI");
});

test("text nodes only: tags, attributes and entities are untouched", () => {
  const html = `<p class="god" title="God">God said <em data-x="god">god</em>&nbsp;&amp; gods</p>`;
  assert.equal(applyLexicon(html, godLex, "display"), `<p class="god" title="God">Ascendant said <em data-x="god">ascendant</em> &amp; ascendants</p>`);
  // untouched text nodes keep their raw html exactly
  assert.equal(applyLexicon(`<p>Hello&nbsp;there</p>`, godLex, "display"), `<p>Hello&nbsp;there</p>`);
  // replacement text is escaped
  assert.equal(applyLexicon(`<p>god</p>`, lex([{ from: "god", to: "<b>x</b>", match: "exact" }]), "display"), `<p>&lt;b&gt;x&lt;/b&gt;</p>`);
});

test("speech vs display scope", () => {
  const l = lex([
    { from: "Mr.", to: "Mister", scope: "speech" },
    { from: "colour", to: "color", scope: "display" },
    { from: "god", to: "Ascendant", scope: "both" },
  ]);
  const t = "Mr. Kim's colour, god";
  assert.equal(applyLexiconText(t, l, "display"), "Mr. Kim's color, ascendant");
  assert.equal(applyLexiconText(t, l, "speech"), "Mister Kim's colour, ascendant");
  const pieces = lexiconPieces(t, compileLexicon(l));
  assert.equal(pieces.map((p) => p.disp).join(""), applyLexiconText(t, l, "display"));
  assert.equal(pieces.map((p) => p.speech).join(""), applyLexiconText(t, l, "speech"));
});

test("normalisation: trims, drops blanks, de-duplicates; version tracks content", () => {
  const l = lex([{ from: " god ", to: " A " }, { from: "", to: "x" }, { from: "x", to: "" }, { from: "GOD", to: "B" }]);
  assert.deepEqual(l.entries, [{ from: "GOD", to: "B", scope: "both", match: "smart" }]);
  assert.equal(lex([]).version, EMPTY_LEXICON.version);
  assert.notEqual(l.version, EMPTY_LEXICON.version);
  assert.equal(lex([{ from: "GOD", to: "B" }]).version, l.version);
});

test("default is empty; the old list is the opt-in Cultivation preset, merged without overriding", () => {
  assert.deepEqual(EMPTY_LEXICON.entries, []);
  assert.equal(applyLexiconText("god", EMPTY_LEXICON, "display"), "god");
  assert.equal(CULTIVATION_TERMS.name, "Cultivation terms");
  assert.ok(CULTIVATION_TERMS.entries.some((e) => e.from === "god" && e.to === "Ascendant"));
  const mine: LexiconEntry[] = [{ from: "God", to: "Heaven", scope: "both", match: "smart" }];
  const merged = mergePreset(mine, "cultivation-terms");
  assert.equal(merged[0].to, "Heaven");
  assert.equal(merged.filter((e) => e.from.toLowerCase() === "god").length, 1);
  assert.equal(merged.length, CULTIVATION_TERMS.entries.length);
  assert.deepEqual(mergePreset(mine, "nope"), mine);
});

function memKV(init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...init };
  return { data, get: (k) => data[k] ?? null, set: (k, v) => { data[k] = v; } };
}

test("store: no saved list → empty lexicon (no hidden defaults)", () => {
  const store = new LexiconStore(memKV());
  assert.deepEqual(store.get().entries, []);
});

test("store: legacy saved list imported as saved (tombstones/blank rows skipped)", () => {
  const legacy = JSON.stringify([{ from: "god", to: "Ascendant" }, { from: "deity", to: "" }, { from: "", to: "" }, { from: "qi", to: "ki" }]);
  const kv = memKV({ [LEGACY_REPLACEMENTS_KEY]: legacy });
  const store = new LexiconStore(kv);
  assert.deepEqual(store.get().entries.map((e) => [e.from, e.to, e.scope, e.match]), [["god", "Ascendant", "both", "smart"], ["qi", "ki", "both", "smart"]]);
  assert.ok(kv.data[LEXICON_KEY], "imported into lexicon:v1");
  assert.equal(kv.data[LEGACY_REPLACEMENTS_KEY], legacy, "legacy key untouched by get()");
  assert.deepEqual(entriesFromLegacy("not json"), []);
});

test("store: set() mirrors to the legacy key and emits a change; legacy edits are re-imported", () => {
  const kv = memKV();
  const events: string[] = [];
  const store = new LexiconStore(kv, (l) => events.push(l.version));
  const v0 = store.get().version;
  const l1 = store.set([
    { from: "god", to: "Ascendant", scope: "both", match: "smart" },
    { from: "Mr.", to: "Mister", scope: "speech", match: "exact" },
  ]);
  assert.deepEqual(events, [l1.version]);
  assert.notEqual(l1.version, v0);
  assert.deepEqual(JSON.parse(kv.data[LEGACY_REPLACEMENTS_KEY]), [{ from: "god", to: "Ascendant" }], "speech-only entries aren't mirrored");
  assert.equal(store.set(l1.entries).version, l1.version);
  assert.equal(events.length, 1, "no event when nothing changed");

  // old Settings page edits the legacy key directly
  kv.data[LEGACY_REPLACEMENTS_KEY] = JSON.stringify([{ from: "god", to: "Heaven" }, { from: "qi", to: "ki" }]);
  const l2 = store.get();
  assert.deepEqual(l2.entries.map((e) => `${e.from}>${e.to}:${e.scope}`), ["god>Heaven:both", "qi>ki:both", "Mr.>Mister:speech"]);
  assert.equal(events[events.length - 1], l2.version);

  const l3 = store.applyPreset("cultivation-terms");
  assert.equal(l3.entries.find((e) => e.from === "god")?.to, "Heaven", "user entry wins over preset");
  assert.ok(l3.entries.some((e) => e.from === "goddess"));
});

test("store: settingsKV works on the settings table (sql.js)", async () => {
  const db = await openSqlJsDb();
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [LEGACY_REPLACEMENTS_KEY, JSON.stringify([{ from: "a", to: "b" }])]);
  const store = new LexiconStore(settingsKV(db));
  assert.deepEqual(store.get().entries.map((e) => e.from), ["a"]);
  store.set([{ from: "c", to: "d" }]);
  assert.equal(new LexiconStore(settingsKV(db)).get().entries[0].from, "c");
  db.close();
});
