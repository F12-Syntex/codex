/**
 * WS-B: entity resolution and the contextual alias gate (pure).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { EntityResolver, levenshtein } from "./knowledge/resolver";
import { gateAliases, isContextualAlias, aliasStrings } from "./knowledge/alias-gate";

const entries = [
  { id: "kim-soyoung", name: "Kim Soyoung", type: "character", significance: 3 },
  { id: "kael-ironforge", name: "Kael Ironforge", type: "character", significance: 4 },
  { id: "shadow", name: "Shadow", type: "location", significance: 1 },
  { id: "mira", name: "Mira", type: "character", significance: 2 },
  { id: "the-order", name: "The Silver Order", type: "concept", significance: 2 },
];
const aliases = [
  { entry_id: "kael-ironforge", alias: "The Iron Prince", relevance: 4 },
  { entry_id: "kim-soyoung", alias: "Soyoung", relevance: 5 },
  { entry_id: "mira", alias: "the girl", relevance: 1 }, // contextual: ignored by the resolver
];
const make = () => new EntityResolver(entries, aliases);

test("resolver: exact id and exact name (case-insensitive)", () => {
  const r = make();
  assert.deepEqual(r.resolve("kim-soyoung", "character"), { id: "kim-soyoung", score: 100, reason: "exact-id" });
  const m = r.resolve("KIM SOYOUNG", "character");
  assert.equal(m?.id, "kim-soyoung");
  assert.equal(m?.reason, "exact-name");
  assert.equal(m?.score, 95);
});

test("resolver: alias match on the name and on the new entry's aliases", () => {
  const r = make();
  assert.equal(r.resolve("The Iron Prince", "character")?.id, "kael-ironforge");
  const viaAlias = r.resolve("Prince Kael", "character", ["The Iron Prince"]);
  assert.equal(viaAlias?.id, "kael-ironforge");
  assert.equal(viaAlias?.reason, "alias-match");
  // Relevance-1 aliases never resolve.
  assert.equal(r.resolve("the girl", "character"), null);
});

test("resolver: substring match is type-aware", () => {
  const r = make();
  const m = r.resolve("Kael", "character");
  assert.equal(m?.id, "kael-ironforge");
  assert.equal(m?.reason, "substring-match");
  // Same word, different type → no substring match.
  assert.equal(r.resolve("Kael", "location"), null);
  // Multi-word new name containing an existing single-word name.
  assert.equal(r.resolve("Mira Valen", "character")?.id, "mira");
});

test("resolver: fuzzy spelling variants of longer names, same type only", () => {
  const r = make();
  const m = r.resolve("Kael Ironforg", "character");
  assert.equal(m?.id, "kael-ironforge");
  assert.equal(m?.reason, "fuzzy-match");
  assert.ok(m!.score >= 50);
  assert.equal(r.resolve("Kael Ironforg", "item"), null);
  assert.equal(r.resolve("Kim Soyoun", "character")?.id, "kim-soyoung"); // one dropped letter
  // Short names are not fuzzy-merged ("Mila" is a different person than "Mira").
  assert.equal(r.resolve("Mila", "character"), null);
  assert.equal(levenshtein("kitten", "sitting"), 3);
});

test("resolver: cross-type exact names score low; register and remap", () => {
  const r = make();
  const m = r.resolve("Shadow", "character");
  assert.equal(m?.id, "shadow");
  assert.equal(m?.score, 55); // still ≥ threshold, like the legacy resolver
  r.register("lord-vex", "Lord Vex", "character", ["Vex"]);
  assert.equal(r.resolve("Vex", "character")?.id, "lord-vex");
  r.register("vexy", "Vexy the Bold", "character", [], "lord-vex"); // remapped proposal id
  assert.equal(r.lookupId("vexy"), "lord-vex");
  r.remap("mira", "kim-soyoung");
  assert.equal(r.lookupId("mira"), "kim-soyoung");
  assert.equal(r.has("mira"), false);
});

test("alias gate: contextual references are downgraded, real names kept", () => {
  for (const ctx of ["the stranger", "a newcomer", "her mother", "that man", "someone", "the woman in red", "a very long descriptive phrase about him"]) {
    assert.equal(isContextualAlias(ctx), true, ctx);
  }
  for (const name of ["Jin-Woo", "The Sword Saint".replace(/^The /, ""), "Elder Chen", "Red", "Ace"]) {
    assert.equal(isContextualAlias(name), false, name);
  }
  const gated = gateAliases([
    "Jin-Woo",
    { alias: "the stranger", type: "nickname", relevance: 4 },
    { alias: "Commander", alias_type: "title", relevance: 9 },
    { alias: " " },
    null as never,
  ]);
  assert.deepEqual(gated, [
    { alias: "Jin-Woo", alias_type: "name", relevance: 3 },
    { alias: "the stranger", alias_type: "epithet", relevance: 1 },
    { alias: "Commander", alias_type: "title", relevance: 5 },
  ]);
  assert.deepEqual(gateAliases(undefined), []);
  assert.deepEqual(aliasStrings(["A", { alias: "B" }, { alias: "" } as never]), ["A", "B"]);
});
