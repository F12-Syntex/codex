/**
 * Phase 2 compatibility for the legacy renderer AI modules (owner: WS-A). Removed in Phase 3.
 *
 * 1. `legacy.complete` task: the old `src/lib/ai-client.ts` (`ai`/`aiText`/`aiJSON`) and
 *    `src/lib/openrouter.ts` no longer call OpenRouter from the renderer. They submit this task
 *    over `ai:submit`, so every remaining legacy caller shares the scheduler (concurrency, rate
 *    limit, retries, breaker), the AI cache, usage accounting and the one safeStorage key.
 * 2. Legacy settings keys (`openrouterApiKey`, `ai-preset-overrides`) read and written through the
 *    old `library:get-setting` / `library:set-setting` IPC are answered from the new settings, so
 *    nothing reads a stale plaintext key and the new settings stay the single source of truth.
 */

import type { AISettings, ChatMessage, ModelRole } from "../shared/ai/types";
import { MODEL_ROLES } from "../shared/ai/types";
import type { TaskDefinition } from "./registry";
import { AIError } from "./errors";
import { LEGACY_KEY_SETTING, LEGACY_PRESETS_SETTING, migratePresetOverrides, type AISettingsStore } from "./settings";

// ── legacy.complete ─────────────────────────────────────────────────────────

export interface LegacyCompleteInput {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  role: ModelRole;
  temperature?: number;
  maxTokens?: number;
  /** Parse loosely (fences, trailing prose…) with one re-ask; the reply is re-serialised JSON. */
  json?: boolean;
}

export interface LegacyCompleteOutput {
  text: string;
  model: string;
  finishReason: string;
}

/** Old preset id → role (AI_AUDIT §4.7). `format-regen` keeps its higher temperature per call. */
export function presetRole(preset: string): ModelRole {
  switch (preset) {
    case "creative":
      return "creative";
    case "format":
    case "format-regen":
      return "format";
    case "web":
      return "web";
    default:
      return (MODEL_ROLES as readonly string[]).includes(preset) ? (preset as ModelRole) : "fast";
  }
}

/** Legacy preset temperatures (the presets' own defaults, used when the caller gave none). */
export function presetTemperature(preset: string): number | undefined {
  return ({ creative: 0.85, format: 0.3, "format-regen": 0.9 } as Record<string, number>)[preset];
}

const MAX_MESSAGES = 200;
const MAX_CHARS = 2_000_000;

/** Reject malformed renderer input before it reaches the provider. */
export function sanitizeLegacyInput(raw: unknown): LegacyCompleteInput {
  const r = (raw ?? {}) as Partial<LegacyCompleteInput>;
  if (!Array.isArray(r.messages) || r.messages.length === 0) throw new AIError("bad_request", "legacy.complete: messages are required", { retryable: false });
  let chars = 0;
  const messages = r.messages.slice(0, MAX_MESSAGES).map((m) => {
    const role = m?.role === "system" || m?.role === "assistant" ? m.role : "user";
    const content = typeof m?.content === "string" ? m.content : String(m?.content ?? "");
    chars += content.length;
    return { role, content } as LegacyCompleteInput["messages"][number];
  });
  if (chars > MAX_CHARS) throw new AIError("bad_request", "legacy.complete: request too large", { retryable: false });
  const out: LegacyCompleteInput = { messages, role: (MODEL_ROLES as readonly string[]).includes(r.role as string) ? (r.role as ModelRole) : "fast" };
  if (typeof r.temperature === "number" && Number.isFinite(r.temperature)) out.temperature = Math.min(2, Math.max(0, r.temperature));
  if (typeof r.maxTokens === "number" && Number.isFinite(r.maxTokens) && r.maxTokens > 0) out.maxTokens = Math.floor(r.maxTokens);
  if (r.json) out.json = true;
  return out;
}

export const legacyCompleteTask: TaskDefinition<LegacyCompleteInput, LegacyCompleteOutput> = {
  id: "legacy.complete",
  version: 1,
  role: "fast",
  cacheable: true,
  key: (input, ctx) =>
    JSON.stringify([
      input.role,
      ctx.settings.models[input.role],
      input.temperature ?? null,
      input.maxTokens ?? null,
      !!input.json,
      input.messages,
    ]),
  async run(raw, ctx) {
    const input = sanitizeLegacyInput(raw);
    const messages: ChatMessage[] = input.messages.map((m) => ({ role: m.role, content: m.content }));
    const base = { role: input.role, messages, temperature: input.temperature, maxTokens: input.maxTokens, allowTruncated: true };
    if (input.json) {
      const { value, completion } = await ctx.completeJson({ ...base, jsonMode: "none" });
      return { text: JSON.stringify(value), model: completion.model, finishReason: completion.finishReason };
    }
    const c = await ctx.complete(base);
    const text = c.text.trim();
    // Not cached (the task throws), and the legacy callers' own retry logic sees `empty_response`.
    if (!text) throw new AIError("parse", "AI returned an empty response", { retryable: false });
    return { text, model: c.model, finishReason: c.finishReason };
  },
  validate: (o): o is LegacyCompleteOutput => !!o && typeof (o as LegacyCompleteOutput).text === "string" && (o as LegacyCompleteOutput).text.length > 0,
};

// ── Legacy settings keys ────────────────────────────────────────────────────

/**
 * What `getSetting("openrouterApiKey")` returns once the key lives in safeStorage. Legacy callers
 * only test it for presence (all their requests go through `legacy.complete` now), so the real key
 * never reaches a renderer.
 */
export const LEGACY_KEY_PLACEHOLDER = "stored-in-codex-keychain";

/** Settings keys the legacy settings IPC must never hand out or overwrite directly. */
export const PROTECTED_SETTINGS = new Set<string>(["ai:key:v1", "ai:settings:v1"]);

type Settings = Pick<AISettingsStore, "get" | "getApiKey" | "update"> & { setApiKey?: AISettingsStore["setApiKey"] };

/** The new settings rendered as the legacy `ai-preset-overrides` JSON. */
export function presetOverridesFrom(s: AISettings): string {
  return JSON.stringify({
    quick: { model: s.models.fast },
    creative: { model: s.models.creative },
    format: { model: s.models.format },
    "format-regen": { model: s.models.format },
  });
}

/**
 * Answer a legacy `getSetting(key)`. Returns `undefined` when the key isn't a legacy AI key (the
 * caller then reads the settings table as usual).
 */
export function readLegacySetting(settings: Settings, key: string): string | null | undefined {
  if (key === LEGACY_KEY_SETTING) return settings.getApiKey() ? LEGACY_KEY_PLACEHOLDER : null;
  if (key === LEGACY_PRESETS_SETTING) return presetOverridesFrom(settings.get());
  if (PROTECTED_SETTINGS.has(key)) return null;
  return undefined;
}

/**
 * Apply a legacy `setSetting(key, value)`. Returns true when handled (the caller must NOT write the
 * settings table itself).
 */
export function writeLegacySetting(settings: Settings, setApiKey: (key: string) => unknown, key: string, value: string): boolean {
  if (key === LEGACY_KEY_SETTING) {
    if (value !== LEGACY_KEY_PLACEHOLDER) setApiKey(typeof value === "string" ? value : "");
    return true;
  }
  if (key === LEGACY_PRESETS_SETTING) {
    const models = migratePresetOverrides(value);
    if (Object.keys(models).length) settings.update({ models: { ...settings.get().models, ...models } });
    return true;
  }
  return PROTECTED_SETTINGS.has(key);
}
