/* ── OpenRouter API middleware ───────────────────────────── */

import {
  getPreset,
  getEffectiveModel,
  type PresetOverrides,
} from "./ai-presets";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterResponse {
  id: string;
  choices: {
    message: { role: string; content: string };
    finish_reason: string;
  }[];
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
}

interface OpenRouterClient {
  chat(
    messages: OpenRouterMessage[],
    model?: string,
    options?: ChatOptions,
  ): Promise<OpenRouterResponse>;
}

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_API = "https://openrouter.ai/api/v1/models";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

export interface OpenRouterModel {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
}

let cachedModels: OpenRouterModel[] | null = null;

/** Fetch available models from OpenRouter (cached after first call). */
export async function fetchModels(): Promise<OpenRouterModel[]> {
  if (cachedModels) return cachedModels;

  const res = await fetch(OPENROUTER_MODELS_API);
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);

  const json = (await res.json()) as { data: OpenRouterModel[] };
  cachedModels = json.data
    .filter((m) => m.id && m.name)
    .sort((a, b) => a.id.localeCompare(b.id));

  return cachedModels;
}

/** Validate an API key by sending a minimal request. */
export async function testApiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = createOpenRouterClient(apiKey);
    await client.chat(
      [{ role: "user", content: "hi" }],
      DEFAULT_MODEL,
      { max_tokens: 1 },
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export function createOpenRouterClient(apiKey: string): OpenRouterClient {
  return {
    async chat(messages, model = DEFAULT_MODEL, options = {}) {
      const res = await fetch(OPENROUTER_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/F12-Syntex/codex",
          "X-Title": "Codex",
        },
        body: JSON.stringify({
          model,
          messages,
          ...options,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(`OpenRouter ${res.status}: ${text}`);
      }

      return res.json() as Promise<OpenRouterResponse>;
    },
  };
}

/** Send a chat request using a named preset's model and parameters. */
export async function chatWithPreset(
  apiKey: string,
  presetId: string,
  messages: OpenRouterMessage[],
  overrides?: PresetOverrides,
): Promise<OpenRouterResponse> {
  const preset = getPreset(presetId);
  if (!preset) throw new Error(`Unknown AI preset: "${presetId}"`);

  const model = getEffectiveModel(preset, overrides ?? {});
  const client = createOpenRouterClient(apiKey);

  return client.chat(messages, model, {
    temperature: preset.temperature,
    max_tokens: preset.maxTokens,
  });
}
