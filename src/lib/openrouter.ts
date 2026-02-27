/* ── OpenRouter API middleware ───────────────────────────── */

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
const DEFAULT_MODEL = "openai/gpt-4o-mini";

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
