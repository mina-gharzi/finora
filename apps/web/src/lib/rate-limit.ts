/**
 * Rate-limiting primitives.
 *
 * Two implementations share one interface:
 *
 *  - `createInMemoryRateLimiter` — a pure, process-local fixed-window limiter.
 *    Fast and dependency-free, but state is per process: it resets on restart
 *    and is NOT shared between instances. Suitable for tests and for
 *    non-security-critical smoothing; NOT sufficient on its own for
 *    multi-instance deployments.
 *
 *  - `createPersistentRateLimiter` (see `persistent-rate-limit.ts`) — the same
 *    policy backed by the shared PostgreSQL store, so limits hold across every
 *    application instance that uses the same database.
 *
 * Both are fixed-window: a key accumulates events until `windowMs` elapses from
 * the first event, after which the window resets. Fixed-window is the simplest
 * correct algorithm that meets an auth-abuse requirement; its known weakness
 * (a burst across a window boundary can momentarily allow up to 2x) is
 * acceptable here and documented in the README.
 *
 * The interface is async because the persistent store performs database I/O.
 * Call sites `await` the methods uniformly.
 *
 * Pure module (no Next.js imports) so the in-memory limiter is trivially
 * unit-testable.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets; 0 when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  /** Maximum counted events per window. */
  limit: number;
  windowMs: number;
  /** Upper bound on tracked keys, so memory cannot grow without limit. */
  maxKeys?: number;
  now?: () => number;
}

export interface RateLimiter {
  /**
   * Reports whether `key` may proceed. MUST NOT count an event — callers
   * `check()` first and only `hit()` when the action actually proceeds, so a
   * rejected request does not extend the window.
   */
  check(key: string): Promise<RateLimitResult>;
  /** Counts one event for `key`. */
  hit(key: string): Promise<void>;
  /** Forgets `key` (e.g. after a successful login). */
  reset(key: string): Promise<void>;
}

interface Entry {
  count: number;
  resetAt: number;
}

/**
 * Process-local fixed-window limiter. Retained for unit tests and as the
 * reference implementation of the shared interface.
 */
export function createInMemoryRateLimiter(
  options: RateLimiterOptions,
): RateLimiter {
  const { limit, windowMs, maxKeys = 10_000, now = Date.now } = options;
  const entries = new Map<string, Entry>();

  function active(key: string): Entry | undefined {
    const entry = entries.get(key);
    if (entry && entry.resetAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  function makeRoom(): void {
    if (entries.size < maxKeys) return;
    const t = now();
    for (const [key, entry] of entries) {
      if (entry.resetAt <= t) entries.delete(key);
    }
    // Still full: evict the oldest-inserted keys.
    while (entries.size >= maxKeys) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    async check(key) {
      const entry = active(key);
      if (entry && entry.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((entry.resetAt - now()) / 1000),
          ),
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
    async hit(key) {
      const entry = active(key);
      if (entry) {
        entry.count += 1;
        return;
      }
      makeRoom();
      entries.set(key, { count: 1, resetAt: now() + windowMs });
    },
    async reset(key) {
      entries.delete(key);
    },
  };
}

/**
 * Backwards-compatible alias for the in-memory limiter. Prefer the explicit
 * `createInMemoryRateLimiter` for new non-persistent uses.
 */
export const createRateLimiter = createInMemoryRateLimiter;

/** Persian "too many attempts" message with a whole-minute wait. */
export function tooManyAttemptsMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `تعداد تلاش‌ها بیش از حد مجاز است. لطفاً ${minutes} دقیقه دیگر دوباره تلاش کنید.`;
}
