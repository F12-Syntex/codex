/**
 * Global request rate limiter (owner: WS-A): a token bucket (requests per minute) plus a global
 * pause driven by 429 `Retry-After` / `X-RateLimit-Reset`. Clock and sleep are injectable.
 */

import { AIError } from "./errors";

export interface RateLimiter {
  /** Resolves when a request may be sent. Rejects with `AIError("cancelled")` if `signal` aborts. */
  acquire(signal: AbortSignal): Promise<void>;
  /** Pause every request until `epochMs` (never shortens an existing pause). */
  pauseUntil(epochMs: number): void;
  readonly pausedUntil: number;
  setRate(requestsPerMinute: number): void;
}

export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

/** setTimeout-based abortable sleep that always removes its abort listener. */
export const realSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new AIError("cancelled", "Cancelled"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AIError("cancelled", "Cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, ms));
    signal.addEventListener("abort", onAbort, { once: true });
  });

export interface TokenBucketOptions {
  requestsPerMinute: number;
  /** Bucket size (max burst). Default min(rpm, 8). */
  burst?: number;
  now?: () => number;
  sleep?: Sleep;
}

export function createRateLimiter(opts: TokenBucketOptions): RateLimiter {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  let rpm = Math.max(1, opts.requestsPerMinute);
  let capacity = Math.max(1, opts.burst ?? Math.min(rpm, 8));
  let tokens = capacity;
  let last = now();
  let pausedUntil = 0;

  const refill = () => {
    const t = now();
    if (t > last) {
      tokens = Math.min(capacity, tokens + ((t - last) * rpm) / 60_000);
      last = t;
    }
  };

  return {
    async acquire(signal) {
      for (;;) {
        if (signal.aborted) throw new AIError("cancelled", "Cancelled");
        const t = now();
        if (pausedUntil > t) {
          await sleep(pausedUntil - t, signal);
          continue;
        }
        refill();
        if (tokens >= 1) {
          tokens -= 1;
          return;
        }
        const waitMs = Math.ceil(((1 - tokens) * 60_000) / rpm);
        await sleep(Math.max(1, waitMs), signal);
      }
    },
    pauseUntil(epochMs) {
      if (epochMs > pausedUntil) pausedUntil = epochMs;
    },
    get pausedUntil() {
      return pausedUntil;
    },
    setRate(next) {
      refill();
      rpm = Math.max(1, next);
      capacity = Math.max(1, opts.burst ?? Math.min(rpm, 8));
      tokens = Math.min(tokens, capacity);
    },
  };
}

/** No limits (tests). `pauseUntil` is still honoured so 429 handling can be tested. */
export function createUnlimitedLimiter(now: () => number = Date.now, sleep: Sleep = realSleep): RateLimiter {
  let pausedUntil = 0;
  return {
    async acquire(signal) {
      for (;;) {
        if (signal.aborted) throw new AIError("cancelled", "Cancelled");
        const t = now();
        if (pausedUntil <= t) return;
        await sleep(pausedUntil - t, signal);
      }
    },
    pauseUntil(ms) {
      if (ms > pausedUntil) pausedUntil = ms;
    },
    get pausedUntil() {
      return pausedUntil;
    },
    setRate() {},
  };
}
