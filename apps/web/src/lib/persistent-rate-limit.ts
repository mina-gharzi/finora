import "server-only";
import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { rateLimitCounters } from "@/db/schema";
import type {
  RateLimitResult,
  RateLimiter,
  RateLimiterOptions,
} from "./rate-limit";

// Unqualified column names, for positions where PostgreSQL rejects a
// table-qualified reference (the INSERT column list, the ON CONFLICT target,
// and the SET targets). Drizzle would otherwise render `${table.column}` as
// `"table"."column"`, producing invalid SQL.
const KEY_HASH = sql.identifier("key_hash");
const COUNT = sql.identifier("count");
const WINDOW_START = sql.identifier("window_start");
const EXPIRES_AT = sql.identifier("expires_at");
// Table-qualified column references, for use inside expressions (WHERE, CASE,
// SET right-hand sides) where the qualified form is valid.
const Q_COUNT = sql`"rate_limit_counters"."count"`;
const Q_WINDOW_START = sql`"rate_limit_counters"."window_start"`;
const Q_EXPIRES_AT = sql`"rate_limit_counters"."expires_at"`;

/**
 * Persistent, database-backed fixed-window rate limiter.
 *
 * STORAGE
 * -------
 * Counters live in `rate_limit_counters`, one row per key, keyed by the
 * SHA-256 hex digest of the caller-supplied identifier. Only the digest is
 * persisted, so the table never holds a raw email, IP, token, or credential.
 *
 * CONCURRENCY
 * -----------
 * Each `hit` is ONE statement:
 *
 *   INSERT INTO rate_limit_counters (key_hash, count, window_start, expires_at)
 *   VALUES ($1, 1, now(), now() + window)
 *   ON CONFLICT (key_hash) DO UPDATE SET
 *     count        = CASE WHEN counter.window_start + window <= now()
 *                         THEN 1 ELSE counter.count + 1 END,
 *     window_start = CASE WHEN counter.window_start + window <= now()
 *                         THEN now() ELSE counter.window_start END,
 *     expires_at   = CASE WHEN counter.window_start + window <= now()
 *                         THEN now() + window ELSE counter.expires_at END
 *
 * PostgreSQL serialises the conflicting row update, so N concurrent requests
 * produce exactly N increments; there is no read-then-write gap through which
 * a request could slip past the limit. A request that arrives after the window
 * expired atomically restarts the window at 1 (correct reset semantics), and
 * the same statement keeps `expires_at` in step for cleanup.
 *
 * `check` is a read-only `SELECT` of `count`/`window_start`; it never mutates,
 * so a blocked request cannot extend the window, and it never consumes budget.
 *
 * FAILURE POLICY (fail closed)
 * ----------------------------
 * If the store is unreachable, every method throws `RateLimitStoreError`
 * instead of silently allowing traffic. Callers that guard abuse-sensitive
 * operations translate that into the generic "too many attempts" answer, so a
 * database outage can never be interpreted as permission to proceed. This is
 * deliberate: an auth endpoint must never fail open.
 *
 * CLEANUP
 * -------
 * Expired rows are removed opportunistically and cheaply: after a successful
 * `hit`, at most one expired row is deleted (bounded, indexed by
 * `expires_at`), and a rare global sweep (probability-gated) trims older
 * strays. There is no unbounded scan on the request path. See `sweepExpired`.
 */

/** Raised when the persistent store cannot be reached. Never swallowed. */
export class RateLimitStoreError extends Error {
  constructor(cause: unknown) {
    super("rate-limit store unavailable");
    this.name = "RateLimitStoreError";
    this.cause = cause;
  }
}

export interface PersistentRateLimiterOptions extends RateLimiterOptions {
  /**
   * Namespace folded into the key digest before hashing, so two policies that
   * happen to see the same raw identifier (e.g. an email used for both login
   * and password reset) never share a counter.
   */
  scope: string;
  /**
   * Probability (0..1) that a `hit` also runs a global expired-row sweep.
   * Keeps steady-state cleanup cheap while still reclaiming strays. Set 0 in
   * tests for determinism.
   */
  sweepProbability?: number;
  /** Injectable clock for tests; defaults to `Date.now`. */
  now?: () => number;
}

/** Hex SHA-256 of a namespaced identifier. The only value ever persisted. */
export function hashRateLimitKey(scope: string, identifier: string): string {
  return createHash("sha256").update(`${scope}:${identifier}`).digest("hex");
}

function toRetryAfterSeconds(resetAtMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));
}

export function createPersistentRateLimiter(
  options: PersistentRateLimiterOptions,
): RateLimiter {
  const {
    limit,
    windowMs,
    scope,
    sweepProbability = 0.01,
    now = Date.now,
  } = options;
  const windowSeconds = windowMs / 1000;

  async function sweepExpiredOnce(): Promise<void> {
    // Bounded: deletes at most one expired row, using the expires_at index.
    // It never touches a live counter.
    await getDb().execute(sql`
      delete from ${rateLimitCounters}
      where ${rateLimitCounters.keyHash} = (
        select ${rateLimitCounters.keyHash}
        from ${rateLimitCounters}
        where ${rateLimitCounters.expiresAt} < now()
        limit 1
      )
    `);
  }

  return {
    // Diagnostic only — see `RateLimiter.scope`.
    scope,

    async check(identifier): Promise<RateLimitResult> {
      const keyHash = hashRateLimitKey(scope, identifier);
      try {
        const rows = await getDb()
          .select({
            count: rateLimitCounters.count,
            windowStart: rateLimitCounters.windowStart,
          })
          .from(rateLimitCounters)
          .where(sql`${rateLimitCounters.keyHash} = ${keyHash}`)
          .limit(1);

        const row = rows[0];
        if (!row) {
          return { allowed: true, retryAfterSeconds: 0 };
        }

        const windowStartMs = row.windowStart.getTime();
        const resetAtMs = windowStartMs + windowMs;
        if (row.count >= limit && resetAtMs > now()) {
          return {
            allowed: false,
            retryAfterSeconds: toRetryAfterSeconds(resetAtMs, now()),
          };
        }
        return { allowed: true, retryAfterSeconds: 0 };
      } catch (error) {
        throw new RateLimitStoreError(error);
      }
    },

    async hit(identifier): Promise<void> {
      const keyHash = hashRateLimitKey(scope, identifier);
      try {
        // The INSERT column list, the ON CONFLICT target, and the SET targets
        // must be UNQUALIFIED names (PostgreSQL rejects "table"."column" in
        // those positions); expression column references stay qualified.
        await getDb().execute(sql`
          insert into ${rateLimitCounters}
            (${KEY_HASH}, ${COUNT}, ${WINDOW_START}, ${EXPIRES_AT})
          values
            (${keyHash}, 1, now(), now() + make_interval(secs => ${windowSeconds}))
          on conflict (${KEY_HASH}) do update set
            ${COUNT} = case
              when ${Q_WINDOW_START}
                   + make_interval(secs => ${windowSeconds}) <= now()
              then 1 else ${Q_COUNT} + 1 end,
            ${WINDOW_START} = case
              when ${Q_WINDOW_START}
                   + make_interval(secs => ${windowSeconds}) <= now()
              then now() else ${Q_WINDOW_START} end,
            ${EXPIRES_AT} = case
              when ${Q_WINDOW_START}
                   + make_interval(secs => ${windowSeconds}) <= now()
              then now() + make_interval(secs => ${windowSeconds})
              else ${Q_EXPIRES_AT} end
        `);
      } catch (error) {
        throw new RateLimitStoreError(error);
      }

      if (sweepProbability > 0 && Math.random() < sweepProbability) {
        // Best-effort: a cleanup failure must not fail the request that just
        // had its event counted.
        try {
          await sweepExpiredOnce();
        } catch {
          // Ignored on purpose — the counter itself is already durable.
        }
      }
    },

    async reset(identifier): Promise<void> {
      const keyHash = hashRateLimitKey(scope, identifier);
      try {
        await getDb().delete(rateLimitCounters).where(
          sql`${rateLimitCounters.keyHash} = ${keyHash}`,
        );
      } catch (error) {
        throw new RateLimitStoreError(error);
      }
    },
  };
}

/**
 * Deletes every expired row in one indexed statement. Intended for an
 * occasional scheduled/maintenance call, not the request path. Returns the
 * number of rows removed.
 */
export async function sweepAllExpired(): Promise<number> {
  const result = await getDb()
    .delete(rateLimitCounters)
    .where(lt(rateLimitCounters.expiresAt, sql`now()`))
    .returning({ keyHash: rateLimitCounters.keyHash });
  return result.length;
}
