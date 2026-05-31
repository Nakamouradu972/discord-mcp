/** Options controlling {@link withRateLimitRetry}. */
export interface RetryOptions {
  /** Maximum number of retries after the first attempt. */
  maxRetries?: number;
  /** Base backoff in milliseconds, doubled on each attempt. */
  baseDelayMs?: number;
  /** Injectable sleep, so tests can run without real timers. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Extract a Discord-suggested retry delay (seconds) from an error, honouring
 * the rate-limit information discord.js exposes. Returns `null` when the error
 * is not a rate-limit error.
 *
 * Handles both the `RateLimitError` shape (`timeToReset` in ms) and HTTP 429
 * `DiscordAPIError`/response shapes (`retry_after` in seconds, or a
 * `Retry-After` header). This keeps us resilient to discord.js exposing
 * rate-limits either by throwing or by surfacing a 429 response.
 */
export function getRetryDelayMs(error: unknown): number | null {
  if (error == null || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;

  // discord.js RateLimitError
  if (typeof e.timeToReset === "number") return e.timeToReset;
  if (typeof e.retryAfter === "number") return e.retryAfter * 1000;

  // HTTP 429 from the REST layer
  const status = (e.status ?? e.statusCode ?? e.httpStatus) as number | undefined;
  if (status === 429) {
    const retryAfter = (e.retry_after ?? e.retryAfter) as number | undefined;
    if (typeof retryAfter === "number") return retryAfter * 1000;
    return 1000;
  }
  return null;
}

/**
 * Execute `fn`, retrying when Discord reports a rate-limit. The delay honours
 * Discord's suggested wait when available, otherwise falls back to an
 * exponential backoff. Non-rate-limit errors propagate immediately.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const suggested = getRetryDelayMs(error);
      if (suggested === null || attempt >= maxRetries) throw error;
      const backoff = baseDelayMs * 2 ** attempt;
      await sleep(Math.max(suggested, backoff));
      attempt += 1;
    }
  }
}
