/* ── OpenRouter compatibility shim (Phase 2) ──────────────────
 *
 * The renderer no longer talks to OpenRouter. `createOpenRouterClient().chat()` runs as a
 * `legacy.complete` job on the main-process AI core (via `ai-client.ts`), so it shares the one
 * queue, cache and safeStorage key. The `apiKey` argument is ignored, and the model id only picks
 * a role: web-search models (`perplexity/*`, `…:online`) use the Web role, anything else Fast; the
 * concrete model is whatever Settings › Intelligence has for that role.
 *
 * Deleted in Phase 3 once nothing imports it.
 */

import { ai as complete, type AIRequestOptions } from "./ai-client";

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
  chat(messages: OpenRouterMessage[], model: string, options?: ChatOptions): Promise<OpenRouterResponse>;
}

function roleForModel(model: string): NonNullable<AIRequestOptions["role"]> {
  return model.startsWith("perplexity/") || model.endsWith(":online") ? "web" : "fast";
}

export function createOpenRouterClient(_apiKey?: string | null): OpenRouterClient {
  void _apiKey;
  return {
    async chat(messages, model, options = {}) {
      const role = roleForModel(model);
      const r = await complete({
        preset: role,
        role,
        messages,
        temperature: options.temperature,
        maxTokens: options.max_tokens,
      });
      return {
        id: "",
        choices: [{ message: { role: "assistant", content: r.content }, finish_reason: r.finish_reason }],
        model: r.model,
        usage: r.usage,
      };
    },
  };
}
