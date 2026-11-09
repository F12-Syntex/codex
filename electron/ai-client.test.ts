/**
 * WS-A: OpenRouter client with a stubbed `fetch` (status → AIErrorCode, response_format gating,
 * tools gating, streaming, finish reasons, usage/cost, abort/timeout), the model catalog, the
 * token-bucket limiter, settings (safeStorage + read-only legacy migration) and the fake provider.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenRouterClient, mapFinishReason, parseRetryAt, type CompletionRequest, type ModelCapabilities } from "./ai/client";
import { AIError } from "./ai/errors";
import { createModelCatalog, parseModels, DEFAULT_MODELS } from "./ai/models";
import { createRateLimiter } from "./ai/rate-limit";
import {
  AISettingsStore, AI_SECRET_KEY, AI_SETTINGS_KEY, LEGACY_KEY_SETTING, LEGACY_PRESETS_SETTING, memoryKeyValueStore, mergeSettings,
  defaultAISettings, normaliseLanguage, type SecretCipher,
} from "./ai/settings";
import { createFakeClock, FakeProvider, flush } from "./ai/testing";
import { fakeProviderFromEnv } from "./ai/fake-provider";

interface Captured { url: string; init: RequestInit; body: Record<string, unknown> }

function stubFetch(respond: (c: Captured) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const c = { url, init, body: JSON.parse(String(init.body ?? "{}")) };
    calls.push(c);
    if (init.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    return respond(c);
  }) as unknown as typeof fetch;
  return { f, calls };
}

const okBody = (text: string, extra: object = {}) =>
  new Response(JSON.stringify({ model: "m/x", choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 3, cost: 0.0002 }, ...extra }), { status: 200 });

const req = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  model: "m/x", messages: [{ role: "user", content: "hi" }], signal: new AbortController().signal, ...over,
});

const caps = (c: Partial<ModelCapabilities>): ModelCapabilities => ({ json: false, jsonSchema: false, tools: false, reasoning: false, ...c });

test("client: success maps text, finish reason, usage and cost; headers and safety settings", async () => {
  const { f, calls } = stubFetch(() => okBody("Hello"));
  const client = createOpenRouterClient({ getApiKey: () => "sk-test", fetch: f });
  const c = await client.complete(req({ model: "google/gemini-x", temperature: 0.2, maxTokens: 50 }));
  assert.deepEqual(c, { text: "Hello", toolCalls: [], finishReason: "stop", usage: { model: "m/x", promptTokens: 12, completionTokens: 3, costUsd: 0.0002 }, model: "m/x" });
  const call = calls[0];
  assert.equal(call.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal((call.init.headers as Record<string, string>).Authorization, "Bearer sk-test");
  assert.equal(call.body.temperature, 0.2);
  assert.equal(call.body.max_tokens, 50);
  assert.deepEqual(call.body.usage, { include: true });
  assert.ok(Array.isArray(call.body.safety_settings));
  assert.equal(call.body.response_format, undefined);
});

test("client: cost falls back to catalog pricing", async () => {
  const { f } = stubFetch(() => new Response(JSON.stringify({ choices: [{ message: { content: "x" }, finish_reason: "stop" }], usage: { prompt_tokens: 1000, completion_tokens: 100 } })));
  const client = createOpenRouterClient({ getApiKey: () => "k", fetch: f, pricing: () => ({ prompt: 1e-6, completion: 2e-6 }) });
  const c = await client.complete(req());
  assert.ok(Math.abs(c.usage.costUsd! - 0.0012) < 1e-12);
  assert.equal(c.model, "m/x"); // requested model when the provider omits it
});

test("client: response_format only when the model is known to support it", async () => {
  const { f, calls } = stubFetch(() => okBody("{}"));
  let current: ModelCapabilities | undefined;
  const client = createOpenRouterClient({ getApiKey: () => "k", fetch: f, capabilities: () => current });
  const schema = { type: "object" };

  current = undefined; // unknown model → nothing optional is sent
  await client.complete(req({ json: { mode: "object" } }));
  current = caps({ json: false });
  await client.complete(req({ json: { mode: "object" } }));
  current = caps({ json: true });
  await client.complete(req({ json: { mode: "object" } }));
  await client.complete(req({ json: { mode: "schema", name: "out", schema } })); // no schema support → json_object
  current = caps({ json: true, jsonSchema: true });
  await client.complete(req({ json: { mode: "schema", name: "out", schema } }));

  assert.deepEqual(calls.map((c) => c.body.response_format), [
    undefined,
    undefined,
    { type: "json_object" },
    { type: "json_object" },
    { type: "json_schema", json_schema: { name: "out", strict: false, schema } },
  ]);
});

test("client: tools are gated on capabilities and tool calls are parsed", async () => {
  const tool = { name: "search_book", description: "Search", parameters: { type: "object" } };
  const { f, calls } = stubFetch(() =>
    new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "search_book", arguments: '{"q":"x"}' } }] }, finish_reason: "tool_calls" }] })),
  );
  const noTools = createOpenRouterClient({ getApiKey: () => "k", fetch: f, capabilities: () => caps({}) });
  await assert.rejects(noTools.complete(req({ tools: [tool] })), (e: unknown) => e instanceof AIError && e.code === "bad_request");
  assert.equal(calls.length, 0);
  const withTools = createOpenRouterClient({ getApiKey: () => "k", fetch: f, capabilities: () => caps({ tools: true }) });
  const c = await withTools.complete(req({ tools: [tool], toolChoice: "auto", messages: [
    { role: "user", content: "q" },
    { role: "assistant", content: "", toolCalls: [{ id: "c0", name: "search_book", arguments: "{}" }] },
    { role: "tool", content: "[]", toolCallId: "c0" },
  ] }));
  assert.equal(c.finishReason, "tool_calls");
  assert.deepEqual(c.toolCalls, [{ id: "c1", name: "search_book", arguments: '{"q":"x"}' }]);
  const sent = calls[0].body as { tools: unknown[]; tool_choice: string; messages: Record<string, unknown>[] };
  assert.equal(sent.tool_choice, "auto");
  assert.deepEqual(sent.messages[1].tool_calls, [{ id: "c0", type: "function", function: { name: "search_book", arguments: "{}" } }]);
  assert.equal(sent.messages[2].tool_call_id, "c0");
});

test("client: HTTP status codes map to AIErrorCode (with retryAt for 429)", async () => {
  const now = 1_000_000;
  const cases: [number, string, string, Record<string, string>?][] = [
    [401, '{"error":{"message":"No auth credentials found"}}', "auth"],
    [403, '{"error":{"message":"Key disabled"}}', "auth"],
    [403, '{"error":{"message":"Input was flagged by moderation"}}', "content_filtered"],
    [402, '{"error":{"message":"Insufficient credits"}}', "budget_exceeded"],
    [404, '{"error":{"message":"No endpoints found"}}', "model_unavailable"],
    [400, '{"error":{"message":"foo/bar is not a valid model ID"}}', "model_unavailable"],
    [400, '{"error":{"message":"context length exceeded"}}', "bad_request"],
    [408, "timeout", "timeout"],
    [429, '{"error":{"message":"Rate limit"}}', "rate_limited", { "Retry-After": "7" }],
    [500, "oops", "server"],
    [502, "bad gateway", "server"],
    [503, "", "server"],
    [418, "teapot", "unknown"],
  ];
  for (const [status, body, code, headers] of cases) {
    const { f } = stubFetch(() => new Response(body, { status, headers }));
    const client = createOpenRouterClient({ getApiKey: () => "k", fetch: f, now: () => now });
    await assert.rejects(client.complete(req()), (e: unknown) => {
      assert.ok(e instanceof AIError, `status ${status}`);
      assert.equal(e.code, code, `status ${status}`);
      assert.equal(e.status, status);
      if (status === 429) assert.equal(e.retryAt, now + 7000);
      assert.equal(e.retryable, ["rate_limited", "server", "timeout"].includes(code), `retryable for ${status}`);
      return true;
    });
  }
});

test("client: errors embedded in a 200 body, empty replies, missing key, network errors", async () => {
  const embedded = stubFetch(() => new Response(JSON.stringify({ error: { code: 429, message: "slow down", metadata: { headers: { "X-RateLimit-Reset": "2000000000000" } } } })));
  await assert.rejects(createOpenRouterClient({ getApiKey: () => "k", fetch: embedded.f }).complete(req()), (e: unknown) => e instanceof AIError && e.code === "rate_limited" && e.retryAt === 2_000_000_000_000);
  const empty = stubFetch(() => okBody("  "));
  await assert.rejects(createOpenRouterClient({ getApiKey: () => "k", fetch: empty.f }).complete(req()), (e: unknown) => e instanceof AIError && e.code === "server" && e.retryable);
  await assert.rejects(createOpenRouterClient({ getApiKey: () => null, fetch: empty.f }).complete(req()), (e: unknown) => e instanceof AIError && e.code === "no_api_key");
  const net = stubFetch(() => { throw new TypeError("fetch failed"); });
  await assert.rejects(createOpenRouterClient({ getApiKey: () => "k", fetch: net.f }).complete(req()), (e: unknown) => e instanceof AIError && e.code === "network");
});

test("client: finish reasons — length → truncated (partial attached) unless allowed; content_filter", async () => {
  const { f } = stubFetch(() => okBody('{"a": [1, 2', { choices: [{ message: { content: '{"a": [1, 2' }, finish_reason: "length" }] }));
  const client = createOpenRouterClient({ getApiKey: () => "k", fetch: f });
  await assert.rejects(client.complete(req()), (e: unknown) => e instanceof AIError && e.code === "truncated" && e.partial?.text === '{"a": [1, 2' && !e.retryable);
  const c = await client.complete(req({ allowTruncated: true }));
  assert.equal(c.finishReason, "length");
  const filtered = stubFetch(() => okBody("", { choices: [{ message: { content: "" }, finish_reason: "content_filter" }] }));
  await assert.rejects(createOpenRouterClient({ getApiKey: () => "k", fetch: filtered.f }).complete(req()), (e: unknown) => e instanceof AIError && e.code === "content_filtered");
  assert.equal(mapFinishReason("MAX_TOKENS"), "length");
  assert.equal(mapFinishReason("SAFETY"), "content_filter");
  assert.equal(mapFinishReason("end_turn"), "stop");
  assert.equal(mapFinishReason(null), "unknown");
});

test("client: streaming SSE forwards deltas, merges tool-call chunks and reads final usage", async () => {
  const sse = [
    ": OPENROUTER PROCESSING",
    'data: {"model":"m/s","choices":[{"delta":{"content":"Hel"}}]}',
    'data: {"choices":[{"delta":{"content":"lo"}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"t1","function":{"name":"get_","arguments":"{\\"a\\""}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"entity","arguments":":1}"}}]},"finish_reason":"tool_calls"}]}',
    'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2,"cost":0.001}}',
    "data: [DONE]",
    "",
  ].join("\n");
  const { f, calls } = stubFetch(() => {
    const enc = new TextEncoder().encode(sse);
    // deliver in awkward chunks to exercise line buffering
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        for (let i = 0; i < enc.length; i += 17) ctrl.enqueue(enc.slice(i, i + 17));
        ctrl.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  const deltas: string[] = [];
  const c = await createOpenRouterClient({ getApiKey: () => "k", fetch: f }).complete(req({ stream: (d) => deltas.push(d) }));
  assert.equal(calls[0].body.stream, true);
  assert.deepEqual(deltas, ["Hel", "lo"]);
  assert.equal(c.text, "Hello");
  assert.equal(c.model, "m/s");
  assert.deepEqual(c.toolCalls, [{ id: "t1", name: "get_entity", arguments: '{"a":1}' }]);
  assert.equal(c.finishReason, "tool_calls");
  assert.deepEqual(c.usage, { model: "m/s", promptTokens: 5, completionTokens: 2, costUsd: 0.001 });

  const err = stubFetch(() => new Response('data: {"error":{"code":502,"message":"upstream died"}}\n\n', { status: 200 }));
  await assert.rejects(createOpenRouterClient({ getApiKey: () => "k", fetch: err.f }).complete(req({ stream: () => {} })), (e: unknown) => e instanceof AIError && e.code === "server");
});

test("client: abort propagates (cancelled) and timeouts map to timeout", async () => {
  const hang = (c: Captured) =>
    new Promise<Response>((_res, rej) => {
      c.init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
  const { f, calls } = stubFetch(hang);
  const client = createOpenRouterClient({ getApiKey: () => "k", fetch: f });
  const ctrl = new AbortController();
  const p = client.complete(req({ signal: ctrl.signal }));
  await flush(1);
  ctrl.abort();
  await assert.rejects(p, (e: unknown) => e instanceof AIError && e.code === "cancelled");
  assert.equal(calls[0].init.signal!.aborted, true);
  // an already-aborted signal never reaches fetch
  const pre = new AbortController();
  pre.abort();
  await assert.rejects(client.complete(req({ signal: pre.signal })), (e: unknown) => e instanceof AIError && e.code === "cancelled");
  assert.equal(calls.length, 1);
  await assert.rejects(client.complete(req({ timeoutMs: 5 })), (e: unknown) => e instanceof AIError && e.code === "timeout");
});

test("client: Retry-After forms", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  assert.equal(parseRetryAt(h({ "retry-after": "3" }), 1000), 4000);
  assert.equal(parseRetryAt(h({ "retry-after": new Date(10_000).toUTCString() }), 1000), 10_000);
  assert.equal(parseRetryAt(h({ "x-ratelimit-reset": "1700000000" }), 1000), 1_700_000_000_000);
  assert.equal(parseRetryAt(h({ "x-ratelimit-reset": "1700000000123" }), 1000), 1_700_000_000_123);
  assert.equal(parseRetryAt(h({}), 1000), undefined);
});

// ── Models ──────────────────────────────────────────────────────────────────

const MODELS_JSON = {
  data: [
    { id: "google/gemini-2.5-flash-lite", name: "Flash Lite", context_length: 1048576, pricing: { prompt: "0.0000001", completion: "0.0000004" }, supported_parameters: ["response_format", "structured_outputs", "tools", "reasoning"] },
    { id: "perplexity/sonar", name: "Sonar", context_length: 127072, pricing: { prompt: "0.000001", completion: "0.000001" }, supported_parameters: ["temperature"], expiration_date: "2027-01-01" },
    { name: "no id" },
  ],
};

test("models: parse capabilities/pricing; catalog caches, persists and reports missing ids", async () => {
  const parsed = parseModels(MODELS_JSON);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0].capabilities, { json: true, jsonSchema: true, tools: true, reasoning: true });
  assert.deepEqual(parsed[1].capabilities, { json: false, jsonSchema: false, tools: false, reasoning: false });
  assert.equal(parsed[0].pricing.prompt, 1e-7);
  assert.equal(parsed[1].expiresAt, Date.parse("2027-01-01"));

  let fetches = 0;
  let t = 0;
  const kv = memoryKeyValueStore();
  const f = (async () => { fetches++; return new Response(JSON.stringify(MODELS_JSON)); }) as unknown as typeof fetch;
  const cat = createModelCatalog({ fetch: f, now: () => t, store: kv });
  assert.deepEqual(cat.missing(["x"]), []); // unknown until loaded
  assert.equal(cat.capabilities("google/gemini-2.5-flash-lite"), undefined);
  await cat.list();
  await cat.list();
  assert.equal(fetches, 1);
  assert.equal(cat.capabilities("google/gemini-2.5-flash-lite:free")?.json, true); // variant suffix
  assert.deepEqual(cat.missing([DEFAULT_MODELS.fast, "retired/model-preview-09-2025"]), ["retired/model-preview-09-2025"]);
  t += 25 * 3600_000;
  await cat.list();
  assert.equal(fetches, 2);
  // a new catalog warms from the persisted copy, offline
  const offline = createModelCatalog({ fetch: (async () => { throw new Error("offline"); }) as unknown as typeof fetch, store: kv, log: () => {} });
  assert.equal(offline.capabilities("perplexity/sonar")?.tools, false);
  assert.equal((await offline.list(true)).length, 2);
});

// ── Rate limiter ────────────────────────────────────────────────────────────

test("rate limiter: token bucket spaces requests; pauseUntil holds everyone; abort rejects", async () => {
  const clock = createFakeClock(0);
  const lim = createRateLimiter({ requestsPerMinute: 60, burst: 2, now: clock.now, sleep: clock.sleep });
  const sig = new AbortController().signal;
  const got: number[] = [];
  const take = () => lim.acquire(sig).then(() => got.push(clock.now()));
  void take(); void take(); void take(); void take();
  await clock.advance(5_000);
  assert.deepEqual(got, [0, 0, 1000, 2000]);
  lim.pauseUntil(10_000);
  lim.pauseUntil(8_000); // never shortens
  void take();
  await clock.advance(4_000);
  assert.equal(got.length, 4);
  await clock.advance(2_000);
  assert.deepEqual(got.slice(4), [10_000]);
  const ctrl = new AbortController();
  lim.pauseUntil(60_000);
  const p = lim.acquire(ctrl.signal);
  ctrl.abort();
  await assert.rejects(p, (e: unknown) => e instanceof AIError && e.code === "cancelled");
});

// ── Settings ────────────────────────────────────────────────────────────────

const xorCipher = (available = true): SecretCipher => ({
  isAvailable: () => available,
  encrypt: (s) => new Uint8Array(Buffer.from(s, "utf8").map((b) => b ^ 0x5a)),
  decrypt: (d) => Buffer.from(Buffer.from(d).map((b) => b ^ 0x5a)).toString("utf8"),
});

test("settings: defaults, validation/clamping and budget clearing", () => {
  const d = defaultAISettings("de_DE.UTF-8");
  assert.equal(d.targetLanguage, "de-DE");
  assert.equal(d.concurrency, 4);
  assert.equal(d.requestsPerMinute, 40);
  assert.equal(d.models.web, "perplexity/sonar");
  assert.equal(normaliseLanguage(undefined), "en");
  const m = mergeSettings(d, { concurrency: 0, requestsPerMinute: "90", spoilerMode: "nope", readAloud: "original", dailyBudgetUsd: 2.5, models: { chat: " a/b ", bogus: "x", fast: "" }, defaults: { titles: true, rewrite: "weird" } });
  assert.equal(m.concurrency, 1);
  assert.equal(m.requestsPerMinute, 90);
  assert.equal(m.spoilerMode, "frontier");
  assert.equal(m.readAloud, "original");
  assert.equal(m.dailyBudgetUsd, 2.5);
  assert.equal(m.models.chat, "a/b");
  assert.equal(m.models.fast, d.models.fast);
  assert.equal(m.defaults.titles, true);
  assert.equal(m.defaults.rewrite, "off");
  assert.equal(mergeSettings(m, { concurrency: 3 }).dailyBudgetUsd, 2.5);
  assert.equal(mergeSettings(m, { dailyBudgetUsd: undefined }).dailyBudgetUsd, undefined);
});

test("settings: legacy migration is read-only in Phase 1", () => {
  const kv = memoryKeyValueStore({
    [LEGACY_KEY_SETTING]: "sk-or-legacy",
    [LEGACY_PRESETS_SETTING]: JSON.stringify({ quick: { model: "q/m" }, format: { model: "f/m" }, creative: { model: "c/m" }, "format-regen": { model: "r/m" } }),
  });
  const before = new Map(kv.data);
  const store = new AISettingsStore({ kv, cipher: xorCipher(), locale: "en-GB" });
  const s = store.get();
  assert.equal(store.source, "legacy");
  assert.deepEqual(
    { fast: s.models.fast, chat: s.models.chat, analysis: s.models.analysis, format: s.models.format, rewrite: s.models.rewrite, creative: s.models.creative, web: s.models.web },
    { fast: "q/m", chat: "q/m", analysis: "q/m", format: "f/m", rewrite: "f/m", creative: "c/m", web: "perplexity/sonar" },
  );
  assert.equal(store.getApiKey(), "sk-or-legacy");
  const pub = store.getPublic();
  assert.equal(pub.hasKey, true);
  assert.equal(pub.keyHealth, "unknown");
  assert.equal("apiKey" in pub, false);
  assert.deepEqual(kv.data, before); // nothing written, nothing deleted
});

test("settings: safeStorage key, write-only updates, change events, activation (Phase 2a)", () => {
  const kv = memoryKeyValueStore({ [LEGACY_KEY_SETTING]: "sk-or-legacy" });
  const changes: unknown[] = [];
  const store = new AISettingsStore({ kv, cipher: xorCipher(), onChange: (p) => changes.push(p) });
  store.setApiKey("  sk-or-new  ");
  const raw = JSON.parse(kv.get(AI_SECRET_KEY)!);
  assert.equal(raw.enc, "safe");
  assert.ok(!kv.get(AI_SECRET_KEY)!.includes("sk-or-new"));
  assert.equal(store.getApiKey(), "sk-or-new");
  assert.equal(store.isEncrypted(), true);
  assert.equal(kv.get(LEGACY_KEY_SETTING), "sk-or-legacy"); // legacy untouched in Phase 1
  store.setKeyHealth("ok");
  store.update({ spoilerMode: "position" });
  assert.equal(JSON.parse(kv.get(AI_SETTINGS_KEY)!).spoilerMode, "position");
  assert.equal(changes.length, 3);
  store.setApiKey("");
  assert.equal(kv.get(AI_SECRET_KEY), null);
  assert.equal(store.getApiKey(), "sk-or-legacy"); // falls back to the legacy key

  // no keychain → stored without encryption (same exposure as before), still readable
  const plain = new AISettingsStore({ kv: memoryKeyValueStore(), cipher: xorCipher(false) });
  plain.setApiKey("k2");
  assert.equal(plain.getApiKey(), "k2");
  assert.equal(plain.isEncrypted(), false);

  // Phase 2a activation: persists migrated settings and moves the key into safeStorage
  const kv2 = memoryKeyValueStore({ [LEGACY_KEY_SETTING]: "sk-old", [LEGACY_PRESETS_SETTING]: '{"quick":{"model":"q/m"}}' });
  const s2 = new AISettingsStore({ kv: kv2, cipher: xorCipher() });
  assert.deepEqual(s2.activateMigration(), { settingsWritten: true, keyMoved: true });
  assert.equal(JSON.parse(kv2.get(AI_SETTINGS_KEY)!).models.fast, "q/m");
  assert.equal(JSON.parse(kv2.get(AI_SECRET_KEY)!).enc, "safe");
  assert.deepEqual(s2.activateMigration(), { settingsWritten: false, keyMoved: false });
  assert.equal(new AISettingsStore({ kv: kv2, cipher: xorCipher() }).source, "stored");
});

// ── Fake provider ───────────────────────────────────────────────────────────

test("fake provider: deterministic replies, JSON echo, env config, scripted failures", async () => {
  const p = new FakeProvider();
  const sig = new AbortController().signal;
  const echo = await p.complete({ model: "m", json: { mode: "object" }, signal: sig, messages: [{ role: "user", content: 'Rewrite these.\n{"paras": {"p1": "A", "p2": "B"}}\nReturn JSON.' }] });
  assert.deepEqual(JSON.parse(echo.text), { paras: { p1: "A", p2: "B" } });
  const plain = await p.complete({ model: "m", signal: sig, messages: [{ role: "user", content: "Tell me a story" }] });
  assert.equal(plain.text, "Fake response from m to: Tell me a story");
  p.respondTo("selection.define", () => '{"lemma":"ward"}');
  const routed = await p.complete({ model: "m", signal: sig, meta: { task: "selection.define" }, messages: [{ role: "user", content: "x" }] });
  assert.equal(routed.text, '{"lemma":"ward"}');
  p.failNext({ status: 429, retryAfterSec: 3 });
  await assert.rejects(p.complete({ model: "m", signal: sig, messages: [] }), (e: unknown) => e instanceof AIError && e.code === "rate_limited" && typeof e.retryAt === "number");

  assert.equal(fakeProviderFromEnv({}), null);
  const env = fakeProviderFromEnv({ CODEX_AI_PROVIDER: "fake", CODEX_AI_FAKE: "429:1,latency:0" })!;
  await assert.rejects(env.complete({ model: "m", signal: sig, messages: [] }), (e: unknown) => e instanceof AIError && e.code === "rate_limited");
});
