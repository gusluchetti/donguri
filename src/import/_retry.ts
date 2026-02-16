/**
 * Shared retry utilities for import scripts running over flaky connections
 * (e.g. WireGuard tunnel to Fly.io Postgres).
 */

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const CONNECTION_ERROR_PATTERNS = [
  "CONNECTION_CLOSED",
  "CONNECT_TIMEOUT",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "socket hang up",
  "connection terminated",
  "connection refused",
  "fetch failed",
  "terminated unexpectedly",
];

export function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message + (err.cause ? ` ${err.cause}` : "");
  return CONNECTION_ERROR_PATTERNS.some((p) => msg.includes(p));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  opts?: RetryOptions,
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelay = opts?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let lastAttempt = 0;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (lastAttempt > 0) {
        console.log(`[retry] ${label} succeeded on attempt ${attempt}/${maxRetries}`);
      }
      return result;
    } catch (err) {
      lastAttempt = attempt;
      if (isConnectionError(err) && attempt < maxRetries) {
        const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);
        const jitter = Math.floor(Math.random() * delay * 0.2);
        const wait = delay + jitter;
        console.warn(
          `[retry] ${label} failed (attempt ${attempt}/${maxRetries}), retrying in ${(wait / 1000).toFixed(1)}s...`,
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
