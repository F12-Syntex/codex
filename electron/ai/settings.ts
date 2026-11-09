/**
 * AI settings (owner: WS-A). AI_AUDIT §4.7.
 *
 * - One source of truth: `AISettings` under the settings key `ai:settings:v1`. Only this module
 *   writes it; every change calls `onChange` (the runtime broadcasts `{type:"settings"}`).
 * - The API key is encrypted with Electron `safeStorage` (injected as `SecretCipher`) under
 *   `ai:key:v1`. The renderer only ever sees `hasKey` / `keyHealth`.
 * - Legacy migration (`ai-preset-overrides`, `openrouterApiKey`):
 *     Phase 1 (now, `activate: false`): READ-ONLY. With no `ai:settings:v1`, settings are derived
 *       from the legacy preset overrides on the fly; the key falls back to the legacy plaintext
 *       key. Nothing legacy is written or deleted, so the old renderer client is unaffected.
 *     Phase 2a (`activateMigration()`): writes `ai:settings:v1` and moves the key into safeStorage.
 *       The legacy plaintext key is removed one release later (Phase 3), together with the
 *       `ai:key:get-legacy` shim.
 * - Preset → role mapping: quick → fast, chat, analysis; format → format, rewrite;
 *   creative → creative; format-regen → (task-level temperature, no role); web is new.
 */

import type { AISettings, BookAIPrefs, ModelRole, PublicAISettings } from "../shared/ai/types";
import { MODEL_ROLES } from "../shared/ai/types";
import type { SqlDb } from "../db/sql";
import { DEFAULT_MODELS } from "./models";

export const AI_SETTINGS_KEY = "ai:settings:v1";
export const AI_SECRET_KEY = "ai:key:v1";
export const LEGACY_KEY_SETTING = "openrouterApiKey";
export const LEGACY_PRESETS_SETTING = "ai-preset-overrides";

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

/** The legacy `settings(key, value)` table through `SqlDb`. */
export function sqlKeyValueStore(db: SqlDb): KeyValueStore {
  return {
    get: (key) => db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key])?.value ?? null,
    set: (key, value) => {
      db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
    },
    delete: (key) => {
      db.run("DELETE FROM settings WHERE key = ?", [key]);
    },
  };
}

export function memoryKeyValueStore(init: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => void data.set(k, v),
    delete: (k) => void data.delete(k),
  };
}

/** `electron.safeStorage` satisfies this structurally (wrap `isEncryptionAvailable`). */
export interface SecretCipher {
  isAvailable(): boolean;
  encrypt(plain: string): Uint8Array;
  decrypt(data: Uint8Array): string;
}

export const DEFAULT_BOOK_PREFS: BookAIPrefs = {
  titles: false,
  rewrite: "off",
  formatting: false,
  knowledge: false,
  comments: false,
  recapOnReopen: false,
  prefetchNext: true,
};

export const SETTINGS_LIMITS = {
  concurrency: { min: 1, max: 12 },
  requestsPerMinute: { min: 1, max: 600 },
  dailyBudgetUsd: { min: 0.01, max: 10_000 },
} as const;

/** BCP-47 primary tag from a locale like "en-US" / "en_GB.UTF-8"; "en" when unknown. */
export function normaliseLanguage(locale: string | undefined): string {
  const m = /^([A-Za-z]{2,3})(?:[-_]([A-Za-z]{2}|\d{3}))?/.exec((locale ?? "").trim());
  if (!m) return "en";
  return m[2] ? `${m[1].toLowerCase()}-${m[2].toUpperCase()}` : m[1].toLowerCase();
}

export function defaultAISettings(locale?: string): AISettings {
  return {
    version: 1,
    models: { ...DEFAULT_MODELS },
    concurrency: 4,
    requestsPerMinute: 40,
    spoilerMode: "frontier",
    targetLanguage: normaliseLanguage(locale),
    readAloud: "displayed",
    defaults: { ...DEFAULT_BOOK_PREFS },
  };
}

const PRESET_ROLES: Record<string, ModelRole[]> = {
  quick: ["fast", "chat", "analysis"],
  format: ["format", "rewrite"],
  creative: ["creative"],
};

/** Legacy `ai-preset-overrides` JSON → role models (only roles the user had customised). */
export function migratePresetOverrides(raw: string | null): Partial<Record<ModelRole, string>> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};
  const out: Partial<Record<ModelRole, string>> = {};
  for (const [preset, roles] of Object.entries(PRESET_ROLES)) {
    const model = (parsed as Record<string, { model?: unknown }>)[preset]?.model;
    if (typeof model === "string" && model.trim()) for (const r of roles) out[r] = model.trim();
  }
  return out;
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function normalisePrefs(v: unknown, base: BookAIPrefs): BookAIPrefs {
  const p = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof BookAIPrefs, unknown>>;
  const bool = (k: keyof BookAIPrefs) => (typeof p[k] === "boolean" ? (p[k] as boolean) : (base[k] as boolean));
  return {
    titles: bool("titles"),
    rewrite: pickEnum(p.rewrite, ["off", "polish", "concise"] as const, base.rewrite),
    formatting: bool("formatting"),
    knowledge: bool("knowledge"),
    comments: bool("comments"),
    recapOnReopen: bool("recapOnReopen"),
    prefetchNext: bool("prefetchNext"),
  };
}

/**
 * Merge `patch` over `base`, validating every field. Unknown fields are ignored; invalid values
 * keep the base value. `dailyBudgetUsd: null | 0 | undefined` (present in the patch) clears it.
 */
export function mergeSettings(base: AISettings, patch: unknown): AISettings {
  const p = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const models = { ...base.models };
  if (p.models && typeof p.models === "object") {
    for (const role of MODEL_ROLES) {
      const m = (p.models as Record<string, unknown>)[role];
      if (typeof m === "string" && m.trim() && m.length <= 200) models[role] = m.trim();
    }
  }
  const out: AISettings = {
    version: 1,
    models,
    concurrency: clampInt(p.concurrency, SETTINGS_LIMITS.concurrency.min, SETTINGS_LIMITS.concurrency.max, base.concurrency),
    requestsPerMinute: clampInt(p.requestsPerMinute, SETTINGS_LIMITS.requestsPerMinute.min, SETTINGS_LIMITS.requestsPerMinute.max, base.requestsPerMinute),
    spoilerMode: pickEnum(p.spoilerMode, ["frontier", "position", "off"] as const, base.spoilerMode),
    targetLanguage:
      typeof p.targetLanguage === "string" && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(p.targetLanguage.trim())
        ? p.targetLanguage.trim()
        : base.targetLanguage,
    readAloud: pickEnum(p.readAloud, ["displayed", "original"] as const, base.readAloud),
    defaults: p.defaults !== undefined ? normalisePrefs(p.defaults, base.defaults) : { ...base.defaults },
  };
  if ("dailyBudgetUsd" in p) {
    const b = typeof p.dailyBudgetUsd === "number" ? p.dailyBudgetUsd : Number.NaN;
    if (Number.isFinite(b) && b > 0) out.dailyBudgetUsd = Math.min(SETTINGS_LIMITS.dailyBudgetUsd.max, Math.max(SETTINGS_LIMITS.dailyBudgetUsd.min, b));
  } else if (base.dailyBudgetUsd !== undefined) {
    out.dailyBudgetUsd = base.dailyBudgetUsd;
  }
  return out;
}

export type SettingsSource = "stored" | "legacy" | "default";
export type KeyHealth = PublicAISettings["keyHealth"];

export interface AISettingsStoreOptions {
  kv: KeyValueStore;
  cipher?: SecretCipher;
  locale?: string;
  onChange?: (s: PublicAISettings) => void;
  log?: (msg: string, err?: unknown) => void;
}

interface StoredSecret { v: 1; enc: "safe" | "plain"; data: string }

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
function fromBase64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

export class AISettingsStore {
  private cached: AISettings | null = null;
  private _source: SettingsSource = "default";
  private health: KeyHealth = "unknown";
  private keyCache: { value: string | null } | null = null;

  constructor(private opts: AISettingsStoreOptions) {}

  /** Where the current settings came from. */
  get source(): SettingsSource {
    this.get();
    return this._source;
  }

  get(): AISettings {
    if (this.cached) return this.cached;
    const defaults = defaultAISettings(this.opts.locale);
    const raw = this.opts.kv.get(AI_SETTINGS_KEY);
    if (raw) {
      try {
        this.cached = mergeSettings(defaults, JSON.parse(raw));
        this._source = "stored";
        return this.cached;
      } catch (err) {
        this.opts.log?.("ai settings: stored value is corrupt; using defaults", err);
      }
    }
    const legacyModels = migratePresetOverrides(this.opts.kv.get(LEGACY_PRESETS_SETTING));
    this.cached = mergeSettings(defaults, { models: legacyModels });
    this._source = Object.keys(legacyModels).length ? "legacy" : "default";
    return this.cached;
  }

  getPublic(): PublicAISettings {
    return { ...this.get(), hasKey: !!this.getApiKey(), keyHealth: this.health };
  }

  update(patch: Partial<AISettings>): PublicAISettings {
    const next = mergeSettings(this.get(), patch);
    this.opts.kv.set(AI_SETTINGS_KEY, JSON.stringify(next));
    this.cached = next;
    this._source = "stored";
    return this.emit();
  }

  /** The key for provider calls: safeStorage first, then (read-only) the legacy plaintext key. */
  getApiKey(): string | null {
    if (!this.keyCache) this.keyCache = { value: this.readSecret() ?? this.legacyApiKey() };
    return this.keyCache.value;
  }

  hasStoredSecret(): boolean {
    return this.readSecret() !== null;
  }

  legacyApiKey(): string | null {
    const v = this.opts.kv.get(LEGACY_KEY_SETTING);
    return v && v.trim() ? v.trim() : null;
  }

  /** Write-only key update. "" removes the stored key (the legacy key is untouched in Phase 1). */
  setApiKey(key: string): { ok: boolean } {
    const trimmed = (key ?? "").trim();
    if (trimmed.length > 500) return { ok: false };
    if (!trimmed) {
      this.opts.kv.delete(AI_SECRET_KEY);
    } else {
      this.writeSecret(trimmed);
    }
    this.keyCache = null;
    this.health = "unknown";
    this.emit();
    return { ok: true };
  }

  get keyHealth(): KeyHealth {
    return this.health;
  }

  setKeyHealth(h: KeyHealth): void {
    if (h === this.health) return;
    this.health = h;
    this.emit();
  }

  /** Whether the stored key is encrypted with the OS keychain. */
  isEncrypted(): boolean {
    const raw = this.opts.kv.get(AI_SECRET_KEY);
    if (!raw) return false;
    try {
      return (JSON.parse(raw) as StoredSecret).enc === "safe";
    } catch {
      return false;
    }
  }

  /**
   * Phase 2a activation (NOT called in Phase 1): persist migrated settings and move the legacy
   * plaintext key into safeStorage. Idempotent. The legacy keys themselves are left in place for
   * one release (Phase 3 deletes them).
   */
  activateMigration(): { settingsWritten: boolean; keyMoved: boolean } {
    let settingsWritten = false;
    let keyMoved = false;
    if (!this.opts.kv.get(AI_SETTINGS_KEY)) {
      this.opts.kv.set(AI_SETTINGS_KEY, JSON.stringify(this.get()));
      this._source = "stored";
      settingsWritten = true;
    }
    const legacy = this.legacyApiKey();
    if (legacy && this.readSecret() === null) {
      this.writeSecret(legacy);
      this.keyCache = null;
      keyMoved = true;
    }
    if (settingsWritten || keyMoved) this.emit();
    return { settingsWritten, keyMoved };
  }

  /** Drop in-memory caches (after an external write). */
  invalidate(): void {
    this.cached = null;
    this.keyCache = null;
  }

  private emit(): PublicAISettings {
    const pub = this.getPublic();
    try {
      this.opts.onChange?.(pub);
    } catch (err) {
      this.opts.log?.("ai settings: onChange failed", err);
    }
    return pub;
  }

  private writeSecret(key: string) {
    const cipher = this.opts.cipher;
    let stored: StoredSecret;
    if (cipher?.isAvailable()) {
      stored = { v: 1, enc: "safe", data: toBase64(cipher.encrypt(key)) };
    } else {
      // No OS keychain (e.g. Linux without a secret service): same exposure as the legacy key.
      stored = { v: 1, enc: "plain", data: Buffer.from(key, "utf8").toString("base64") };
    }
    this.opts.kv.set(AI_SECRET_KEY, JSON.stringify(stored));
  }

  private readSecret(): string | null {
    const raw = this.opts.kv.get(AI_SECRET_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as StoredSecret;
      if (s.enc === "plain") return Buffer.from(s.data, "base64").toString("utf8") || null;
      if (s.enc === "safe" && this.opts.cipher?.isAvailable()) return this.opts.cipher.decrypt(fromBase64(s.data)) || null;
    } catch (err) {
      this.opts.log?.("ai settings: could not read the stored key", err);
    }
    return null;
  }
}
