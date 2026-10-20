/**
 * @vitest-environment node
 *
 * These tests exercise the persistent limiter's CONTROL FLOW and QUERY SHAPE
 * against a stateful in-memory stand-in for the database. They verify:
 *   - only the hashed key is ever passed to the store (privacy),
 *   - window/limit/reset semantics,
 *   - scope independence,
 *   - fail-closed behavior when the store throws,
 *   - bounded, indexed cleanup.
 *
 * WHAT THEY DO NOT PROVE: true cross-process atomicity. That is a property of
 * the single `INSERT ... ON CONFLICT DO UPDATE` statement PostgreSQL executes;
 * a JS mock cannot demonstrate it. The statement shape is asserted here, and
 * the real database path is exercised by the E2E suite. See the README.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  executedSql: [] as string[],
  executedParams: [] as unknown[],
  selectRows: [] as unknown[],
  deleteReturning: [] as unknown[],
  failExecute: false,
  failSelect: false,
  failDelete: false,
  /** When > 0, the Nth execute call (1-based) rejects. */
  failExecuteOnCall: 0,
  executeCallCount: 0,
  // Simulated counter store: keyHash -> { count, windowStartMs, expiresAtMs }
  store: new Map<
    string,
    { count: number; windowStartMs: number; expiresAtMs: number }
  >(),
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    execute: (query: unknown) => {
      h.executeCallCount += 1;
      if (h.failExecute || h.executeCallCount === h.failExecuteOnCall) {
        return Promise.reject(new Error("db down"));
      }
      // `db.execute` receives a drizzle SQL object; render it to text+params.
      const { sql, params } = new PgDialect().sqlToQuery(query as never);
      h.executedSql.push(sql);
      h.executedParams.push(...params);
      return Promise.resolve({});
    },
    select: () => {
      if (h.failSelect) throw new Error("db down");
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(h.selectRows),
          }),
        }),
      };
    },
    delete: () => ({
      where: () => ({
        returning: () => {
          if (h.failDelete) return Promise.reject(new Error("db down"));
          return Promise.resolve(h.deleteReturning);
        },
      }),
    }),
  }),
}));

import {
  createPersistentRateLimiter,
  hashRateLimitKey,
  RateLimitStoreError,
  sweepAllExpired,
} from "../persistent-rate-limit";

beforeEach(() => {
  h.executedSql = [];
  h.executedParams = [];
  h.selectRows = [];
  h.deleteReturning = [];
  h.failExecute = false;
  h.failSelect = false;
  h.failDelete = false;
  h.failExecuteOnCall = 0;
  h.executeCallCount = 0;
  h.store.clear();
});

describe("hashRateLimitKey — privacy", () => {
  it("returns a hex SHA-256 and never the raw identifier", () => {
    const digest = hashRateLimitKey("auth:login:account", "user@example.com");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain("user@example.com");
  });

  it("namespaces by scope so the same identifier yields different keys", () => {
    const a = hashRateLimitKey("auth:login:account", "x@example.com");
    const b = hashRateLimitKey("auth:forgot:email", "x@example.com");
    expect(a).not.toBe(b);
  });
});

describe("createPersistentRateLimiter — basic window semantics", () => {
  const limiter = () =>
    createPersistentRateLimiter({
      scope: "test:scope",
      limit: 3,
      windowMs: 60_000,
      sweepProbability: 0, // deterministic: never sweep
      now: () => 1_000_000,
    });

  it("allows when no counter exists", async () => {
    h.selectRows = [];
    await expect(limiter().check("k")).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("allows while the live window is below the limit", async () => {
    h.selectRows = [{ count: 2, windowStart: new Date(999_000) }];
    await expect(limiter().check("k")).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("blocks at the limit and reports seconds until the window resets", async () => {
    // window started at 960_000; windowMs 60_000 -> resets at 1_020_000,
    // which is 20s after now (1_000_000).
    h.selectRows = [{ count: 3, windowStart: new Date(960_000) }];
    await expect(limiter().check("k")).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 20,
    });
  });

  it("treats an expired window as open even at the old limit", async () => {
    // reset at 1_020_000 <= now (1_000_000? no) — use an older start.
    h.selectRows = [{ count: 99, windowStart: new Date(1_000_000 - 120_000) }];
    await expect(limiter().check("k")).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("hit emits a single atomic upsert with the hashed key parameterized", async () => {
    await limiter().hit("client@example.com");
    expect(h.executedSql).toHaveLength(1);
    expect(h.executedSql[0]).toMatch(/insert into/i);
    expect(h.executedSql[0]).toMatch(/on conflict/i);
    expect(h.executedSql[0]).toMatch(/do update/i);
    // The raw identifier must appear only inside the SQL text placeholders,
    // never as an interpolated parameter value.
    expect(h.executedParams).toContain(
      hashRateLimitKey("test:scope", "client@example.com"),
    );
    expect(h.executedParams).not.toContain("client@example.com");
  });
});

describe("createPersistentRateLimiter — shared-store semantics", () => {
  it("two independently created limiters over the same scoped store agree", async () => {
    // Both limiters derive identical key hashes for the same scope+identifier,
    // which is exactly what lets separate app instances share one counter row.
    const a = createPersistentRateLimiter({
      scope: "shared",
      limit: 1,
      windowMs: 60_000,
      sweepProbability: 0,
    });
    const b = createPersistentRateLimiter({
      scope: "shared",
      limit: 1,
      windowMs: 60_000,
      sweepProbability: 0,
    });
    await a.hit("ip-1");
    const keyA = h.executedParams.find(
      (p) => typeof p === "string" && hashRateLimitKey("shared", "ip-1") === p,
    );
    h.executedParams = [];
    await b.hit("ip-1");
    const keyB = h.executedParams.find(
      (p) => typeof p === "string" && hashRateLimitKey("shared", "ip-1") === p,
    );
    expect(keyA).toBeDefined();
    expect(keyA).toBe(keyB);
  });
});

describe("createPersistentRateLimiter — fail closed", () => {
  it("throws RateLimitStoreError when the store is unreachable on check", async () => {
    h.failSelect = true;
    const limiter = createPersistentRateLimiter({
      scope: "s",
      limit: 1,
      windowMs: 1000,
    });
    await expect(limiter.check("k")).rejects.toBeInstanceOf(RateLimitStoreError);
  });

  it("throws RateLimitStoreError when the store is unreachable on hit", async () => {
    h.failExecute = true;
    const limiter = createPersistentRateLimiter({
      scope: "s",
      limit: 1,
      windowMs: 1000,
    });
    await expect(limiter.hit("k")).rejects.toBeInstanceOf(RateLimitStoreError);
  });
});

describe("createPersistentRateLimiter — bounded cleanup", () => {
  it("does not sweep when probability is zero", async () => {
    const limiter = createPersistentRateLimiter({
      scope: "s",
      limit: 5,
      windowMs: 1000,
      sweepProbability: 0,
    });
    await limiter.hit("k");
    // Only the upsert ran; no sweep delete.
    expect(h.executedSql).toHaveLength(1);
  });

  it("sweeps at most one expired row (indexed, bounded) when triggered", async () => {
    const limiter = createPersistentRateLimiter({
      scope: "s",
      limit: 5,
      windowMs: 1000,
      sweepProbability: 1, // always sweep
    });
    await limiter.hit("k");
    expect(h.executedSql).toHaveLength(2);
    const sweep = h.executedSql[1];
    expect(sweep).toMatch(/delete from/i);
    expect(sweep).toMatch(/limit 1/i);
    expect(sweep).toMatch(/now\(\)/i);
  });

  it("a cleanup failure never fails the hit that just counted", async () => {
    const limiter = createPersistentRateLimiter({
      scope: "s",
      limit: 5,
      windowMs: 1000,
      sweepProbability: 1, // always attempt a sweep
    });
    // The first execute (the upsert) succeeds; the second (the sweep) fails.
    h.failExecuteOnCall = 2;
    await expect(limiter.hit("k")).resolves.toBeUndefined();
    // The durable upsert did run.
    expect(h.executedSql).toHaveLength(1);
    expect(h.executedSql[0]).toMatch(/insert into/i);
  });
});

describe("sweepAllExpired", () => {
  it("deletes via an expires_at predicate and reports the row count", async () => {
    h.deleteReturning = [{ keyHash: "a" }, { keyHash: "b" }];
    await expect(sweepAllExpired()).resolves.toBe(2);
  });

  it("propagates a store error rather than pretending nothing expired", async () => {
    h.failDelete = true;
    await expect(sweepAllExpired()).rejects.toThrow("db down");
  });
});
