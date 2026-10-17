/**
 * Minimal fixed-window rate limiter kept in process memory.
 *
 * LIMITATION: state is local to one server process. It resets on restart and
 * is NOT shared between multiple instances. For multi-instance deployments a
 * shared store (e.g. the database or Redis) is required.
 *
 * Pure module (no Next.js imports) so it is trivially unit-testable.
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
  /** Reports whether `key` may proceed. Does not count an event. */
  check(key: string): RateLimitResult;
  /** Counts one event for `key`. */
  hit(key: string): void;
  /** Forgets `key` (e.g. after a successful login). */
  reset(key: string): void;
}

interface Entry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
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
    check(key) {
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
    hit(key) {
      const entry = active(key);
      if (entry) {
        entry.count += 1;
        return;
      }
      makeRoom();
      entries.set(key, { count: 1, resetAt: now() + windowMs });
    },
    reset(key) {
      entries.delete(key);
    },
  };
}

/** Persian "too many attempts" message with a whole-minute wait. */
export function tooManyAttemptsMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `تعداد تلاش‌ها بیش از حد مجاز است. لطفاً ${minutes} دقیقه دیگر دوباره تلاش کنید.`;
}