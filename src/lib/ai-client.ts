/* ── AI Client — Resilient wrapper around OpenRouter API ──
 *
 * Single point of entry for all AI calls. Provides:
 * - Timeout via AbortController (default 90s)
 * - Retry with exponential backoff (default 3 attempts)
 * - Response validation (ensures content exists)
 * - Abort signal propagation from callers
 * - Structured error types for UI feedback
 * - Automatic preset/override resolution
 */

import {
  getPreset,
  getEffectiveModel,
  loadOverrides,
  type PresetOverrides,
} from "./ai-presets";

/* ── Types ─────────────────────────────────────────────── */

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  finish_reason: string;
}

export interface AIRequestOptions {
  /** Preset ID — determines model, temperature, max_tokens */
  preset: string;
  /** Messages to send */
  messages: AIMessage[];
  /** Override temperature (takes precedence over preset) */
  temperature?: number;
  /** Override max_tokens (takes precedence over preset) */
  maxTokens?: number;
  /** Caller-provided abort signal — request aborts when this fires */
  signal?: AbortSignal;
  /** Timeout in ms (default: 90_000) */
  timeout?: number;
  /** Max retry attempts (default: 3) */
  retries?: number;
  /** Pre-loaded overrides — skips the async loadOverrides() call */
  overrides?: PresetOverrides;
}

export class AIError extends Error {
  constructor(
    message: string,
    public readonly code: AIErrorCode,
    public readonly status?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "AIError";
  }
}

export type AIErrorCode =
  | "no_api_key"
  | "invalid_preset"
  | "timeout"
  | "aborted"
  | "rate_limited"
  | "auth_error"
  | "server_error"
  | "empty_response"
  | "network_error"
  | "unknown";

/* ── Constants ─────────────────────────────────────────── */

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT = 90_000;
const DEFAULT_RETRIES = 3;
const BASE_BACKOFF = 1_000;

/* ── Internal helpers ──────────────────────────────────── */

function classifyHttpError(status: number, body: string): AIError {
  if (status === 401 || status === 403) {
    return new AIError(`Authentication failed (${status})`, "auth_error", status);
  }
  if (status === 429) {
    return new AIError("Rate limited — too many requests", "rate_limited", status, true);
  }
  if (status >= 500) {
    return new AIError(`Server error (${status}): ${body.slice(0, 200)}`, "server_error", status, true);
  }
  return new AIError(`HTTP ${status}: ${body.slice(0, 200)}`, "unknown", status);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AIError("Request aborted", "aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new AIError("Request aborted", "aborted"));
    }, { once: true });
  });
}

/* ── Core request function ─────────────────────────────── */

async function makeRequest(
  apiKey: string,
  model: string,
  messages: AIMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    timeout: number;
  },
): Promise<AIResponse> {
  // Merge caller signal with timeout signal
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), options.timeout);

  const combinedSignal = options.signal
    ? mergeAbortSignals(options.signal, timeoutController.signal)
    : timeoutController.signal;

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.maxTokens !== undefined && { max_tokens: options.maxTokens }),
      // Disable Gemini safety filters so dark fiction isn't blocked
      ...(model.startsWith("google/") && {
        safety_settings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      }),
    };

    const res = await fetch(OPENROUTER_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/F12-Syntex/codex",
        "X-Title": "Codex",
      },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw classifyHttpError(res.status, text);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new AIError(
        "AI returned an empty response",
        "empty_response",
        undefined,
        true,
      );
    }

    return {
      content,
      model: json.model ?? model,
      usage: json.usage,
      finish_reason: json.choices?.[0]?.finish_reason ?? "unknown",
    };
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      // Determine if it was caller abort or timeout
      if (options.signal?.aborted) {
        throw new AIError("Request aborted", "aborted");
      }
      throw new AIError("Request timed out", "timeout", undefined, true);
    }
    if (err instanceof TypeError && (err.message.includes("fetch") || err.message.includes("network"))) {
      throw new AIError(`Network error: ${err.message}`, "network_error", undefined, true);
    }
    throw new AIError(
      err instanceof Error ? err.message : "Unknown error",
      "unknown",
      undefined,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

function mergeAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/* ── Public API ────────────────────────────────────────── */

/**
 * Get the current API key from settings. Returns null if not set.
 */
export async function getApiKey(): Promise<string | null> {
  const key = await window.electronAPI?.getSetting("openrouterApiKey");
  return key || null;
}

/**
 * Send an AI request with full resilience: timeout, retry, abort, validation.
 *
 * Usage:
 * ```ts
 * const response = await ai({
 *   preset: "quick",
 *   messages: [
 *     { role: "system", content: "You are helpful." },
 *     { role: "user", content: "Hello" },
 *   ],
 *   signal: abortController.signal,
 * });
 * console.log(response.content);
 * ```
 */
export async function ai(options: AIRequestOptions): Promise<AIResponse> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new AIError("No API key configured", "no_api_key");
  }

  const preset = getPreset(options.preset);
  if (!preset) {
    throw new AIError(`Unknown preset: "${options.preset}"`, "invalid_preset");
  }

  const overrides = options.overrides ?? await loadOverrides();
  const model = getEffectiveModel(preset, overrides);
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const retries = options.retries ?? DEFAULT_RETRIES;

  const temperature = options.temperature ?? preset.temperature;
  const maxTokens = options.maxTokens ?? preset.maxTokens;

  let lastError: AIError | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    // Check abort before each attempt
    if (options.signal?.aborted) {
      throw new AIError("Request aborted", "aborted");
    }

    try {
      return await makeRequest(apiKey, model, options.messages, {
        temperature,
        maxTokens,
        signal: options.signal,
        timeout,
      });
    } catch (err) {
      const aiErr = err instanceof AIError ? err : new AIError(
        err instanceof Error ? err.message : "Unknown error",
        "unknown",
        undefined,
        true,
      );

      lastError = aiErr;

      // Don't retry non-retryable or caller-aborted errors
      if (!aiErr.retryable || aiErr.code === "aborted") {
        throw aiErr;
      }

      // Last attempt — throw
      if (attempt === retries - 1) break;

      // Exponential backoff: 1s, 2s, 4s...
      const delay = BASE_BACKOFF * Math.pow(2, attempt);
      await sleep(delay, options.signal);
    }
  }

  throw lastError ?? new AIError("All retries exhausted", "unknown");
}

/**
 * Convenience: send an AI request and get just the content string.
 * Throws AIError on failure.
 */
export async function aiText(options: AIRequestOptions): Promise<string> {
  const response = await ai(options);
  return response.content;
}

/**
 * Convenience: send an AI request, parse the response as JSON.
 * Strips markdown code fences before parsing. Throws on parse failure.
 */
export async function aiJSON<T = unknown>(options: AIRequestOptions): Promise<T> {
  const raw = await aiText(options);
  let cleaned = raw;

  // Strip code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else {
    const openFence = cleaned.match(/```(?:json)?\s*([\s\S]*)/);
    if (openFence) cleaned = openFence[1].trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to find JSON object or array in the response
    const jsonStart = cleaned.search(/[{[]/);
    if (jsonStart > 0) {
      try {
        return JSON.parse(cleaned.slice(jsonStart)) as T;
      } catch { /* fall through */ }
    }
    throw new AIError(
      `Failed to parse AI response as JSON: ${cleaned.slice(0, 100)}...`,
      "empty_response",
    );
  }
}

/**
 * Create an AbortController that the caller can use to cancel AI requests.
 * Useful for component-level abort management.
 */
export function createAbortController(): AbortController {
  return new AbortController();
}
