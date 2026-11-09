/**
 * WS-A Phase 2a: settings migration activation (legacy keys → `ai:settings:v1`, key → safeStorage
 * through an injectable cipher), the legacy settings-key shim used by `library:get/set-setting`,
 * the `legacy.complete` task behind the old renderer client, and `ai:health`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AISettingsStore, AI_SECRET_KEY, AI_SETTINGS_KEY, LEGACY_KEY_SETTING, LEGACY_PRESETS_SETTING, memoryKeyValueStore,
  type SecretCipher,
} from "./ai/settings";
import {
  LEGACY_KEY_PLACEHOLDER, legacyCompleteTask, presetOverridesFrom, presetRole, readLegacySetting, sanitizeLegacyInput,
  writeLegacySetting,
} from "./ai/legacy";
import { createTestRuntime, Priority } from "./ai/testing";
import { openSqlJsDb } from "./db/sqljs";
import { createAreaContext } from "./ipc/registry";
import type { IpcMainLike } from "./ipc/context";
import { registerAI } from "./ai/ipc";
import { getAIRuntime, setAIRuntimeForTests } from "./ai/runtime";
import type { AIEvent, AIHealthStatus, JobResult } from "./shared/ai/types";

/** Records every call; "encrypts" by reversing + prefixing so plaintext never appears. */
function recordingCipher(available = true) {
  const calls: string[] = [];
  const cipher: SecretCipher = {
    isAvailable: () => available,
    encrypt: (s) => {
      calls.push("encrypt");
      return new Uint8Array(Buffer.from("enc:" + [...s].reverse().join(""), "utf8"));
    },
    decrypt: (d) => {
      calls.push("decrypt");
      const t = Buffer.from(d).toString("utf8");
      assert.ok(t.startsWith("enc:"));
      return [...t.slice(4)].reverse().join("");
    },
  };
  return { cipher, calls };
}

const LEGACY_OVERRIDES = JSON.stringify({
  quick: { model: "q/m" },
  format: { model: "f/m" },
  creative: { model: "c/m" },
  "format-regen": { model: "r/m" },
});

test("migration: legacy preset overrides and key become ai:settings:v1 + an encrypted secret", () => {
  const kv = memoryKeyValueStore({ [LEGACY_KEY_SETTING]: " sk-or-legacy ", [LEGACY_PRESETS_SETTING]: LEGACY_OVERRIDES, other: "kept" });
  const { cipher, calls } = recordingCipher();
  const changes: unknown[] = [];
  const store = new AISettingsStore({ kv, cipher, locale: "fr-FR", onChange: (p) => changes.push(p) });

  assert.deepEqual(store.activateMigration(), { settingsWritten: true, keyMoved: true });
  assert.equal(changes.length, 1, "one settings broadcast");

  const stored = JSON.parse(kv.get(AI_SETTINGS_KEY)!);
  assert.deepEqual(stored.models, {
    fast: "q/m", chat: "q/m", analysis: "q/m", format: "f/m", rewrite: "f/m", creative: "c/m", web: "perplexity/sonar",
  });
  assert.equal(stored.targetLanguage, "fr-FR");
  assert.ok(!("apiKey" in stored), "the key is never part of the settings blob");

  const secret = JSON.parse(kv.get(AI_SECRET_KEY)!);
  assert.equal(secret.enc, "safe");
  assert.ok(!kv.get(AI_SECRET_KEY)!.includes("sk-or-legacy"), "no plaintext in the secret row");
  assert.equal(calls.filter((c) => c === "encrypt").length, 1);

  // A fresh store (next launch) reads only the new keys.
  const next = new AISettingsStore({ kv, cipher });
  assert.equal(next.source, "stored");
  assert.equal(next.getApiKey(), "sk-or-legacy");
  assert.equal(next.isEncrypted(), true);
  // Legacy rows stay for one release (downgrade safety); unrelated settings untouched.
  assert.equal(kv.get(LEGACY_PRESETS_SETTING), LEGACY_OVERRIDES);
  assert.equal(kv.get("other"), "kept");

  // Idempotent; later legacy edits no longer change the source of truth.
  kv.set(LEGACY_PRESETS_SETTING, JSON.stringify({ quick: { model: "late/edit" } }));
  assert.deepEqual(next.activateMigration(), { settingsWritten: false, keyMoved: false });
  assert.equal(new AISettingsStore({ kv, cipher }).get().models.fast, "q/m");
});

test("migration: fresh install, corrupt legacy JSON and no keychain", () => {
  const empty = memoryKeyValueStore();
  const s0 = new AISettingsStore({ kv: empty, cipher: recordingCipher().cipher });
  assert.deepEqual(s0.activateMigration(), { settingsWritten: true, keyMoved: false });
  assert.equal(s0.getPublic().hasKey, false);
  assert.equal(empty.get(AI_SECRET_KEY), null);

  const corrupt = memoryKeyValueStore({ [LEGACY_PRESETS_SETTING]: "{not json", [LEGACY_KEY_SETTING]: "k" });
  const s1 = new AISettingsStore({ kv: corrupt, cipher: recordingCipher().cipher });
  s1.activateMigration();
  assert.equal(JSON.parse(corrupt.get(AI_SETTINGS_KEY)!).models.fast, "google/gemini-2.5-flash-lite");

  // No OS keychain: still migrated (stored without encryption, same exposure as before).
  const noKeychain = memoryKeyValueStore({ [LEGACY_KEY_SETTING]: "sk-plain" });
  const { cipher, calls } = recordingCipher(false);
  const s2 = new AISettingsStore({ kv: noKeychain, cipher });
  assert.deepEqual(s2.activateMigration(), { settingsWritten: true, keyMoved: true });
  assert.equal(JSON.parse(noKeychain.get(AI_SECRET_KEY)!).enc, "plain");
  assert.deepEqual(calls, []);
  assert.equal(new AISettingsStore({ kv: noKeychain, cipher }).getApiKey(), "sk-plain");
});

test("migration never overwrites a stored secret, even one this run can't decrypt", () => {
  const kv = memoryKeyValueStore({ [LEGACY_KEY_SETTING]: "sk-old" });
  const unlocked = recordingCipher(true).cipher;
  new AISettingsStore({ kv, cipher: unlocked }).setApiKey("sk-new");
  assert.equal(kv.get(LEGACY_KEY_SETTING), null, "explicit key change drops the plaintext key");
  kv.set(LEGACY_KEY_SETTING, "sk-old"); // e.g. written by an older build
  const before = kv.get(AI_SECRET_KEY);
  const locked = new AISettingsStore({ kv, cipher: recordingCipher(false).cipher });
  assert.equal(locked.activateMigration().keyMoved, false);
  assert.equal(kv.get(AI_SECRET_KEY), before);
  assert.equal(new AISettingsStore({ kv, cipher: unlocked }).getApiKey(), "sk-new");
});

test("legacy settings shim: the key never leaves main; preset overrides map to roles", () => {
  const kv = memoryKeyValueStore({ [LEGACY_KEY_SETTING]: "sk-or-legacy", [LEGACY_PRESETS_SETTING]: LEGACY_OVERRIDES });
  const store = new AISettingsStore({ kv, cipher: recordingCipher().cipher });
  store.activateMigration();

  assert.equal(readLegacySetting(store, LEGACY_KEY_SETTING), LEGACY_KEY_PLACEHOLDER);
  assert.equal(readLegacySetting(store, AI_SECRET_KEY), null);
  assert.equal(readLegacySetting(store, AI_SETTINGS_KEY), null);
  assert.equal(readLegacySetting(store, "libraryPath"), undefined, "other keys fall through");
  assert.deepEqual(JSON.parse(readLegacySetting(store, LEGACY_PRESETS_SETTING)!), JSON.parse(presetOverridesFrom(store.get())));

  // Writes route to the new store.
  const keys: string[] = [];
  const setKey = (k: string) => {
    keys.push(k);
    store.setApiKey(k);
  };
  assert.equal(writeLegacySetting(store, setKey, LEGACY_KEY_SETTING, LEGACY_KEY_PLACEHOLDER), true);
  assert.deepEqual(keys, [], "writing the placeholder back is a no-op");
  assert.equal(writeLegacySetting(store, setKey, LEGACY_KEY_SETTING, "sk-typed"), true);
  assert.equal(store.getApiKey(), "sk-typed");
  assert.equal(writeLegacySetting(store, setKey, LEGACY_KEY_SETTING, ""), true);
  assert.equal(readLegacySetting(store, LEGACY_KEY_SETTING), null);
  assert.equal(writeLegacySetting(store, setKey, LEGACY_PRESETS_SETTING, JSON.stringify({ creative: { model: "new/c" } })), true);
  assert.equal(store.get().models.creative, "new/c");
  assert.equal(store.get().models.fast, "q/m");
  assert.equal(writeLegacySetting(store, setKey, AI_SECRET_KEY, "x"), true, "protected keys are swallowed");
  assert.equal(writeLegacySetting(store, setKey, "libraryPath", "/x"), false);
});

test("legacy.complete: preset roles, sanitising, caching and JSON re-ask", async () => {
  assert.equal(presetRole("quick"), "fast");
  assert.equal(presetRole("format-regen"), "format");
  assert.equal(presetRole("creative"), "creative");
  assert.equal(presetRole("web"), "web");
  assert.equal(presetRole("bogus"), "fast");
  assert.throws(() => sanitizeLegacyInput({ messages: [] }));
  const clean = sanitizeLegacyInput({ messages: [{ role: "tool", content: 5 }], role: "nope", temperature: 9, maxTokens: -1 });
  assert.deepEqual(clean, { messages: [{ role: "user", content: "5" }], role: "fast", temperature: 2 });

  const rt = createTestRuntime({ tasks: [legacyCompleteTask], settings: { models: { creative: "c/model" } } as never });
  const seen: { model: string; temperature?: number }[] = [];
  rt.provider.respondTo("legacy.complete", (req) => {
    seen.push({ model: req.model, temperature: req.temperature });
    const last = req.messages[req.messages.length - 1].content;
    if (last.includes("give json")) return "Sure!\n```json\n{\"a\": [1, 2]}\n```";
    return `  echo: ${last}  `;
  });

  const spec = { task: "legacy.complete" as const, input: { role: "creative", temperature: 0.4, messages: [{ role: "user", content: "hi" }] }, priority: Priority.Visible };
  const r1 = (await rt.run(spec)) as JobResult<{ text: string }>;
  assert.equal(r1.state, "done");
  assert.equal(r1.output!.text, "echo: hi");
  assert.deepEqual(seen, [{ model: "c/model", temperature: 0.4 }]);
  const r2 = (await rt.run(spec)) as JobResult<{ text: string }>;
  assert.equal(r2.cached, true, "same request → one shared cache");
  assert.equal(seen.length, 1);

  const j = (await rt.run({ ...spec, input: { role: "fast", json: true, messages: [{ role: "user", content: "give json" }] } })) as JobResult<{ text: string }>;
  assert.deepEqual(JSON.parse(j.output!.text), { a: [1, 2] });

  // Empty replies fail (and are not cached).
  rt.provider.respondTo("legacy.complete", () => "   ");
  const e = (await rt.run({ ...spec, input: { role: "fast", messages: [{ role: "user", content: "empty" }] } })) as JobResult;
  assert.equal(e.state, "error");
  assert.equal(e.error!.code, "parse");
});

function fakeIpc() {
  const handlers = new Map<string, (event: { sender: { id: number } }, ...args: unknown[]) => unknown>();
  const ipc: IpcMainLike = { handle: (ch, fn) => void handlers.set(ch, fn), removeHandler: (ch) => void handlers.delete(ch) };
  const call = (ch: string, ...args: unknown[]) => Promise.resolve(handlers.get(ch)!({ sender: { id: 1 } }, ...args));
  return { ipc, call };
}

test("ai:health and the legacy client path over IPC", async () => {
  setAIRuntimeForTests(null);
  const db = await openSqlJsDb();
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const { ipc, call } = fakeIpc();
  const sent: AIEvent[] = [];
  const ctx = createAreaContext({ db, ipcMain: ipc, getWindows: () => [{ isDestroyed: () => false, webContents: { id: 1, send: (_c: string, p: unknown) => void sent.push(p as AIEvent) } }] });
  // Real (non-fake) provider with a fetch that must never be reached without a key.
  registerAI(ctx, { electron: null, fetch: (async () => { throw new Error("no network in tests"); }) as unknown as typeof fetch, env: {} });
  try {
    const rt = getAIRuntime();
    assert.deepEqual(await call("ai:health"), { state: "no_key" } satisfies AIHealthStatus);

    // legacy.complete is registered and validated at submit time
    await assert.rejects(Promise.resolve().then(() => call("ai:submit", { task: "legacy.complete", input: { messages: [] }, priority: 1 })));
    const t = (await call("ai:submit", { task: "legacy.complete", input: { role: "fast", messages: [{ role: "user", content: "x" }] }, priority: 1 })) as { jobId: string };
    const r = (await call("ai:result", t.jobId)) as JobResult;
    assert.equal(r.state, "error");
    assert.equal(r.error!.code, "no_api_key");

    // Setting a key closes the breaker and broadcasts health ok; removing it reports no_key.
    sent.length = 0;
    rt.setApiKey("sk-or-test");
    assert.deepEqual(await call("ai:health"), { state: "ok" });
    assert.ok(sent.some((e) => e.type === "health" && e.state === "ok"));
    sent.length = 0;
    rt.setApiKey("");
    assert.deepEqual(await call("ai:health"), { state: "no_key" });
    assert.ok(sent.some((e) => e.type === "health" && e.state === "no_key"));

  } finally {
    getAIRuntime().dispose();
    setAIRuntimeForTests(null);
    db.close();
  }
});
