/**
 * Model catalog + capability flags (owner: WS-A).
 *
 * - `DEFAULT_MODELS`: stable defaults per role. (The legacy default
 *   `google/gemini-2.5-flash-lite-preview-09-2025` is retired on OpenRouter as of 2026-11.)
 * - `createModelCatalog`: fetches OpenRouter `/models` (no key needed), caches it 24 h in memory and
 *   in the settings KV (so capabilities are known offline after the first fetch), and answers
 *   `capabilities(id)` / `pricing(id)` / `missing(ids)`.
 *
 * Capabilities come from `supported_parameters`: `response_format` → json, `structured_outputs`
 * → jsonSchema, `tools` → tools, `reasoning` → reasoning. Unknown model → `undefined`, and the
 * client then avoids optional parameters (JSON is still requested in the prompt and parsed loosely).
 */

import type { ModelInfo, ModelRole } from "../shared/ai/types";
import { OPENROUTER_BASE_URL, type ModelCapabilities } from "./client";

export const DEFAULT_MODELS: Record<ModelRole, string> = {
  fast: "google/gemini-2.5-flash-lite",
  rewrite: "google/gemini-2.5-flash-lite",
  format: "google/gemini-2.5-flash-lite",
  analysis: "google/gemini-3.1-flash-lite",
  chat: "google/gemini-3.1-flash-lite",
  creative: "google/gemini-3.1-flash-lite",
  web: "perplexity/sonar",
};

export const MODEL_ROLE_INFO: Record<ModelRole, { label: string; description: string }> = {
  fast: { label: "Fast", description: "Titles, quick lookups, tagging" },
  rewrite: { label: "Rewrite", description: "Polish and concise chapter rewrites" },
  format: { label: "Format", description: "Chapter formatting and styles" },
  analysis: { label: "Analysis", description: "Wiki knowledge, recaps, comments" },
  chat: { label: "Chat", description: "The assistant, define and translate" },
  creative: { label: "Creative", description: "Branch simulation and long-form writing" },
  web: { label: "Web", description: "Book lookups that search the web" },
};

export const MODELS_CACHE_KEY = "ai:models:v1";
const TTL_MS = 24 * 60 * 60 * 1000;

interface RawModel {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  supported_parameters?: unknown;
  expiration_date?: unknown;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Parse OpenRouter's `/models` response into `ModelInfo[]` (sorted by id). */
export function parseModels(json: unknown): ModelInfo[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: ModelInfo[] = [];
  for (const m of data as RawModel[]) {
    if (typeof m?.id !== "string" || !m.id) continue;
    const params = Array.isArray(m.supported_parameters) ? (m.supported_parameters as unknown[]).map(String) : [];
    const info: ModelInfo = {
      id: m.id,
      name: typeof m.name === "string" && m.name ? m.name : m.id,
      contextLength: toNum(m.context_length),
      pricing: { prompt: toNum(m.pricing?.prompt), completion: toNum(m.pricing?.completion) },
      capabilities: {
        json: params.includes("response_format") || params.includes("structured_outputs"),
        jsonSchema: params.includes("structured_outputs"),
        tools: params.includes("tools"),
        reasoning: params.includes("reasoning") || params.includes("include_reasoning"),
      },
    };
    if (typeof m.expiration_date === "string" && m.expiration_date) {
      const t = Date.parse(m.expiration_date);
      if (Number.isFinite(t)) info.expiresAt = t;
    }
    out.push(info);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export interface ModelCatalog {
  /** Cached list (fetches when stale or `force`). Falls back to the stale list on network errors. */
  list(force?: boolean): Promise<ModelInfo[]>;
  /** Synchronous view of what's loaded (possibly empty). */
  known(): ModelInfo[];
  get(id: string): ModelInfo | undefined;
  capabilities(id: string): ModelCapabilities | undefined;
  pricing(id: string): { prompt: number; completion: number } | undefined;
  /** Configured ids the catalog doesn't list (only meaningful once loaded). */
  missing(ids: string[]): string[];
  readonly loadedAt: number;
}

export interface ModelCatalogOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  now?: () => number;
  /** Persist the catalog between runs (settings KV). */
  store?: { get(key: string): string | null; set(key: string, value: string): void };
  log?: (msg: string, err?: unknown) => void;
}

export function createModelCatalog(opts: ModelCatalogOptions = {}): ModelCatalog {
  const now = opts.now ?? Date.now;
  const baseUrl = (opts.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/$/, "");
  let models: ModelInfo[] = [];
  let byId = new Map<string, ModelInfo>();
  let loadedAt = 0;
  let pending: Promise<ModelInfo[]> | null = null;

  const set = (list: ModelInfo[], at: number) => {
    models = list;
    byId = new Map(list.map((m) => [m.id, m]));
    loadedAt = at;
  };

  // Warm from the persisted copy (any age; refreshed lazily).
  try {
    const raw = opts.store?.get(MODELS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; models: ModelInfo[] };
      if (Array.isArray(parsed.models)) set(parsed.models, Number(parsed.at) || 0);
    }
  } catch { /* corrupt cache: ignore */ }

  const lookup = (id: string): ModelInfo | undefined => byId.get(id) ?? byId.get(id.replace(/:(free|beta|extended|nitro|floor|online|thinking|batch)$/, ""));

  return {
    async list(force = false) {
      if (!force && models.length && now() - loadedAt < TTL_MS) return models;
      if (pending) return pending;
      pending = (async () => {
        try {
          const res = await (opts.fetch ?? fetch)(`${baseUrl}/models`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const list = parseModels(await res.json());
          if (list.length) {
            set(list, now());
            try {
              opts.store?.set(MODELS_CACHE_KEY, JSON.stringify({ at: loadedAt, models: list }));
            } catch (err) {
              opts.log?.("models: could not persist catalog", err);
            }
          }
          return models;
        } catch (err) {
          opts.log?.("models: fetch failed; using cached catalog", err);
          return models;
        } finally {
          pending = null;
        }
      })();
      return pending;
    },
    known: () => models,
    get: lookup,
    capabilities: (id) => lookup(id)?.capabilities,
    pricing: (id) => lookup(id)?.pricing,
    missing(ids) {
      if (!models.length) return [];
      return [...new Set(ids)].filter((id) => id && !lookup(id));
    },
    get loadedAt() {
      return loadedAt;
    },
  };
}
