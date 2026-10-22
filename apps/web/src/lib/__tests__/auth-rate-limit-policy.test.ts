/**
 * @vitest-environment node
 *
 * Configuration-level checks for the auth rate-limit POLICY: every limiter in
 * `getAuthLimiters()` is created with an explicit, stable scope and a bounded
 * limit/window. The persistent store implementation is mocked with a recording
 * factory; the counters themselves are covered by persistent-rate-limit.test.ts
 * and the E2E suite.
 *
 * These tests pin the values so a policy change is a deliberate, reviewed edit
 * rather than an accidental one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  created: [] as Array<{ scope: string; limit: number; windowMs: number }>,
}));

vi.mock("@/lib/persistent-rate-limit", () => {
  class RateLimitStoreError extends Error {}
  return {
    RateLimitStoreError,
    createPersistentRateLimiter: (opts: {
      scope: string;
      limit: number;
      windowMs: number;
    }) => {
      mocks.created.push({
        scope: opts.scope,
        limit: opts.limit,
        windowMs: opts.windowMs,
      });
      return {
        async check() {
          return { allowed: true, retryAfterSeconds: 0 };
        },
        async hit() {},
        async reset() {},
      };
    },
  };
});

import { getAuthLimiters } from "@/lib/auth-rate-limit";

const MINUTE = 60 * 1000;

beforeEach(() => {
  delete (globalThis as { finoraAuthLimiters?: unknown }).finoraAuthLimiters;
  mocks.created.length = 0;
});

function policy(scope: string) {
  const found = mocks.created.find((c) => c.scope === scope);
  if (!found) throw new Error(`limiter not created: ${scope}`);
  return found;
}

describe("auth rate-limit policy", () => {
  it("creates one limiter per scope with unique scope names", () => {
    const limiters = getAuthLimiters();
    expect(Object.keys(limiters).sort()).toEqual(
      [
        "changeEmailIp",
        "changeEmailUser",
        "changePasswordUser",
        "forgotEmail",
        "forgotIp",
        "loginAccount",
        "loginIp",
        "registerIp",
        "resendIp",
        "resendUser",
        "tokenIp",
      ].sort(),
    );
    const scopes = mocks.created.map((c) => c.scope);
    expect(new Set(scopes).size).toBe(scopes.length);
  });

  it("throttles password changes per signed-in user at 5 attempts per 15 minutes", () => {
    getAuthLimiters();
    const changePassword = policy("auth:change-password:user");
    // Matches the login-attempt budget: each change re-verifies the CURRENT
    // password, so it is the same class of credential check.
    expect(changePassword.limit).toBe(5);
    expect(changePassword.windowMs).toBe(15 * MINUTE);
  });

  it("throttles failed logins per account at 5 attempts per 15 minutes", () => {
    getAuthLimiters();
    const loginAccount = policy("auth:login:account");
    expect(loginAccount.limit).toBe(5);
    expect(loginAccount.windowMs).toBe(15 * MINUTE);
  });

  it("throttles failed logins per client address at 20 attempts per 15 minutes", () => {
    getAuthLimiters();
    const loginIp = policy("auth:login:ip");
    expect(loginIp.limit).toBe(20);
    expect(loginIp.windowMs).toBe(15 * MINUTE);
  });

  it("throttles registration attempts per client address at 20 attempts per hour", () => {
    getAuthLimiters();
    const registerIp = policy("auth:register:ip");
    expect(registerIp.limit).toBe(20);
    expect(registerIp.windowMs).toBe(60 * MINUTE);
  });

  it("keeps every limiter within a conservative, bounded window", () => {
    getAuthLimiters();
    expect(mocks.created.length).toBeGreaterThan(0);
    for (const limiter of mocks.created) {
      expect(limiter.limit).toBeGreaterThan(0);
      expect(limiter.windowMs).toBeGreaterThanOrEqual(5 * MINUTE);
      expect(limiter.windowMs).toBeLessThanOrEqual(60 * MINUTE);
    }
  });

  it("caches the limiter set on globalThis so reloads reuse it", () => {
    const first = getAuthLimiters();
    const createdAfterFirst = mocks.created.length;
    const second = getAuthLimiters();
    expect(second).toBe(first);
    expect(mocks.created.length).toBe(createdAfterFirst);
  });
});
