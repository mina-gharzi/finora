import "server-only";
import {
  createPersistentRateLimiter,
  RateLimitStoreError,
} from "./persistent-rate-limit";
import type { RateLimitResult, RateLimiter } from "./rate-limit";

/**
 * Rate-limit policy for the authentication actions.
 *
 * Every limiter is backed by the SHARED PostgreSQL store
 * (`persistent-rate-limit.ts`), so limits hold across all application
 * instances that use the same database. Each limiter is namespaced by its own
 * scope, so the same identifier used in two flows (e.g. an email submitted to
 * both login and forgot-password) keeps two independent counters.
 *
 * The limiter objects themselves are cached on `globalThis` so they survive
 * module reloads in development; the counters they read/write are in the
 * database, not in that cache.
 */

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

interface AuthLimiters {
  /** Failed logins per submitted email (normalized). */
  loginAccount: RateLimiter;
  /** Failed logins per client address. */
  loginIp: RateLimiter;
  /** All registration attempts per client address. */
  registerIp: RateLimiter;
  /** Password-reset requests per client address. */
  forgotIp: RateLimiter;
  /** Password-reset requests per submitted email (existing or not). */
  forgotEmail: RateLimiter;
  /** Reset-password / verify-email / email-change confirmations per address. */
  tokenIp: RateLimiter;
  /** Verification resends per signed-in user. */
  resendUser: RateLimiter;
  /** Verification resends per client address. */
  resendIp: RateLimiter;
  /** Email-change requests per signed-in user. */
  changeEmailUser: RateLimiter;
  /** Email-change requests per client address. */
  changeEmailIp: RateLimiter;
}

const globalForLimiters = globalThis as unknown as {
  finoraAuthLimiters?: AuthLimiters;
};

export function getAuthLimiters(): AuthLimiters {
  if (!globalForLimiters.finoraAuthLimiters) {
    globalForLimiters.finoraAuthLimiters = {
      loginAccount: createPersistentRateLimiter({
        scope: "auth:login:account",
        limit: 5,
        windowMs: FIFTEEN_MINUTES,
      }),
      loginIp: createPersistentRateLimiter({
        scope: "auth:login:ip",
        limit: 20,
        windowMs: FIFTEEN_MINUTES,
      }),
      registerIp: createPersistentRateLimiter({
        scope: "auth:register:ip",
        limit: 20,
        windowMs: ONE_HOUR,
      }),
      forgotIp: createPersistentRateLimiter({
        scope: "auth:forgot:ip",
        limit: 10,
        windowMs: ONE_HOUR,
      }),
      forgotEmail: createPersistentRateLimiter({
        scope: "auth:forgot:email",
        limit: 3,
        windowMs: ONE_HOUR,
      }),
      tokenIp: createPersistentRateLimiter({
        scope: "auth:token:ip",
        limit: 20,
        windowMs: FIFTEEN_MINUTES,
      }),
      resendUser: createPersistentRateLimiter({
        scope: "auth:resend:user",
        limit: 3,
        windowMs: ONE_HOUR,
      }),
      resendIp: createPersistentRateLimiter({
        scope: "auth:resend:ip",
        limit: 10,
        windowMs: ONE_HOUR,
      }),
      // Mirrors the resend policy: an authenticated user can still mail a
      // handful of addresses per hour, but cannot be scripted to bombard
      // arbitrary inboxes with change links.
      changeEmailUser: createPersistentRateLimiter({
        scope: "auth:change-email:user",
        limit: 3,
        windowMs: ONE_HOUR,
      }),
      changeEmailIp: createPersistentRateLimiter({
        scope: "auth:change-email:ip",
        limit: 10,
        windowMs: ONE_HOUR,
      }),
    };
  }
  return globalForLimiters.finoraAuthLimiters;
}

/** The abuse-sensitive outcome of a limiter check. */
export type LimitGate =
  /** At least one scope is exhausted; deny with `retryAfterSeconds` remaining. */
  | { allowed: false; retryAfterSeconds: number }
  /** All scopes permit the attempt; the event has been counted. */
  | { allowed: true };

/**
 * Checks every scope WITHOUT counting. Use when the event should only be
 * counted on a particular outcome (e.g. only FAILED logins count, so a
 * successful login must not add to the failed-attempt budget). Fails CLOSED on
 * a store error, exactly like `enforceLimits`.
 */
export async function checkLimits(
  checks: ReadonlyArray<{ limiter: RateLimiter; key: string }>,
): Promise<LimitGate> {
  try {
    const results: RateLimitResult[] = [];
    for (const { limiter, key } of checks) {
      results.push(await limiter.check(key));
    }
    const blocked = results.filter((result) => !result.allowed);
    if (blocked.length > 0) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          ...blocked.map((result) => result.retryAfterSeconds),
        ),
      };
    }
    return { allowed: true };
  } catch (error) {
    if (error instanceof RateLimitStoreError) {
      return { allowed: false, retryAfterSeconds: 60 };
    }
    throw error;
  }
}

/**
 * Counts one event across the given scopes. Fails CLOSED on a store error so a
 * counted failure cannot silently disappear; returns whether every increment
 * landed.
 */
export async function hitLimits(
  hits: ReadonlyArray<{ limiter: RateLimiter; key: string }>,
): Promise<boolean> {
  try {
    for (const { limiter, key } of hits) {
      await limiter.hit(key);
    }
    return true;
  } catch (error) {
    if (error instanceof RateLimitStoreError) {
      return false;
    }
    throw error;
  }
}

/**
 * Checks every scope, then counts the event only if all permit it. Fails
 * CLOSED: if the shared store is unreachable, returns the retry-after shape a
 * normal exhaustion would, so the caller denies the operation with the
 * existing generic "too many attempts" message rather than letting it through.
 *
 * Counting happens after the check so a denied attempt never extends a window,
 * and a successful `hit` on any scope is not rolled back if a later scope's
 * `hit` fails — the guard already saw the store reachable on `check`, and an
 * extra counted event is the safe direction to err in.
 *
 * Use this for operations that count EVERY attempt (registration, resets,
 * resends, email-change requests). For counting only a specific outcome, pair
 * `checkLimits` with `hitLimits`/`resetLimits`.
 */
export async function enforceLimits(
  checks: ReadonlyArray<{ limiter: RateLimiter; key: string }>,
): Promise<LimitGate> {
  const gate = await checkLimits(checks);
  if (!gate.allowed) {
    return gate;
  }
  await hitLimits(checks);
  return { allowed: true };
}

/**
 * Forgets an identifier across the given limiters, failing closed on a store
 * error (a successful login must not be reported when its counter could not be
 * cleared, or an attacker could reset their own budget by forcing errors).
 * Returns whether the reset completed.
 */
export async function resetLimits(
  resets: ReadonlyArray<{ limiter: RateLimiter; key: string }>,
): Promise<boolean> {
  try {
    for (const { limiter, key } of resets) {
      await limiter.reset(key);
    }
    return true;
  } catch (error) {
    if (error instanceof RateLimitStoreError) {
      return false;
    }
    throw error;
  }
}
