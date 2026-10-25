/**
 * @vitest-environment node
 *
 * Integration-level checks for the persistent rate-limit policy as wired into
 * the auth actions:
 *   - the per-account key is the NORMALIZED email, so case/whitespace variants
 *     cannot open a fresh budget,
 *   - IP and identifier scopes are independent,
 *   - a store outage on an abuse-sensitive action FAILS CLOSED (denies with
 *     the generic message instead of proceeding),
 *   - a successful login clears only the account scope, not the IP scope.
 *
 * The limiter is replaced with a recording fake so the KEY each scope receives
 * is observable. Real database behavior is covered elsewhere.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ip: "203.0.113.9",
  findUserByEmail: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(async () => {}),
  deleteSession: vi.fn(async () => {}),
  hashPassword: vi.fn(async () => "hash"),
  createUser: vi.fn(),
  // Recording fake limiter factory.
  created: [] as Array<{ scope: string; limit: number; hits: string[]; checks: string[]; resets: string[] }>,
  failStore: false,
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (n: string) => (n === "x-forwarded-for" ? mocks.ip : null),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/dal", () => ({ requireUserId: vi.fn(async () => "u1") }));
vi.mock("@/lib/users", () => ({
  findUserByEmail: mocks.findUserByEmail,
  findUserCredentialsById: vi.fn(),
  updateUserPasswordIfCurrent: vi.fn(),
  createUser: mocks.createUser,
}));
vi.mock("@/lib/password", () => ({
  DUMMY_PASSWORD_HASH: "dummy",
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));
vi.mock("@/lib/session", () => ({
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
}));
vi.mock("@/app/actions/account-recovery", () => ({
  sendInitialVerificationEmail: vi.fn(async () => {}),
}));
// A recording persistent-limiter factory; optionally throws to simulate an
// unreachable store.
vi.mock("@/lib/persistent-rate-limit", () => {
  class RateLimitStoreError extends Error {}
  return {
    RateLimitStoreError,
    createPersistentRateLimiter: (opts: {
      scope: string;
      limit: number;
    }) => {
      const record = {
        scope: opts.scope,
        limit: opts.limit,
        hits: [] as string[],
        checks: [] as string[],
        resets: [] as string[],
      };
      mocks.created.push(record);
      return {
        async check(key: string) {
          if (mocks.failStore) throw new RateLimitStoreError("down");
          record.checks.push(key);
          return {
            allowed: record.hits.filter((h) => h === key).length < opts.limit,
            retryAfterSeconds: 60,
          };
        },
        async hit(key: string) {
          if (mocks.failStore) throw new RateLimitStoreError("down");
          record.hits.push(key);
        },
        async reset(key: string) {
          if (mocks.failStore) throw new RateLimitStoreError("down");
          record.resets.push(key);
          record.hits = record.hits.filter((h) => h !== key);
        },
      };
    },
  };
});

import { loginAction } from "@/app/actions/auth";

function form(values: Record<string, string>) {
  const fd = new FormData();
  Object.entries(values).forEach(([k, v]) => fd.set(k, v));
  return fd;
}
const login = (email: string, password = "wrongpass1") =>
  loginAction({}, form({ email, password }));

function scope(name: string) {
  const found = mocks.created.find((c) => c.scope === name);
  if (!found) throw new Error(`scope not created: ${name}`);
  return found;
}

beforeEach(() => {
  // These tests describe a deployment behind one trusted proxy, so each
  // request gets its own per-IP bucket (see lib/client-ip.ts). Without this the
  // address is "unknown" and uses the separate site-wide backstop instead.
  vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
  delete (globalThis as { finoraAuthLimiters?: unknown }).finoraAuthLimiters;
  mocks.created.length = 0;
  mocks.failStore = false;
  mocks.ip = "203.0.113.9";
  mocks.findUserByEmail.mockReset();
  mocks.verifyPassword.mockReset();
  mocks.findUserByEmail.mockResolvedValue({
    id: "u1",
    name: "n",
    passwordHash: "h",
  });
  mocks.verifyPassword.mockResolvedValue(false);
});

describe("email normalization prevents budget bypass", () => {
  it("keys the account counter on the normalized form regardless of casing", async () => {
    await login("User@Example.COM");
    await login("user@example.com");
    const account = scope("auth:login:account");
    // Both submissions resolve to the same normalized key.
    expect(account.hits).toEqual(["user@example.com", "user@example.com"]);
  });

  it("trims surrounding whitespace before keying", async () => {
    await login("  spaced@example.com  ");
    expect(scope("auth:login:account").hits).toEqual(["spaced@example.com"]);
  });

  it("blocks once the normalized counter is exhausted, even across variants", async () => {
    for (let i = 0; i < 5; i++) await login("Case@Example.com");
    const res = await login("case@example.com");
    expect(res.message).toContain("بیش از حد مجاز");
  });
});

describe("IP and identifier scopes are independent", () => {
  it("uses distinct scopes for the account and IP counters", async () => {
    await login("a@example.com");
    const account = scope("auth:login:account");
    const ipScope = scope("auth:login:ip");
    expect(account.scope).not.toBe(ipScope.scope);
    expect(account.hits).toContain("a@example.com");
    // Behind one trusted proxy the IP scope receives the real client address.
    expect(ipScope.hits).toContain("203.0.113.9");
    expect(scope("auth:login:ip:unknown").hits).toEqual([]);
  });

  it("counts an unidentifiable client against the separate site-wide scope, not the normal per-IP one", async () => {
    // No trusted proxy configured: the forwarded address cannot be trusted, so
    // it must not be used, and must not consume the normal per-IP budget that
    // every other visitor would then share.
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    await login("a@example.com");
    expect(scope("auth:login:ip").hits).toEqual([]);
    expect(scope("auth:login:ip:unknown").hits).toEqual(["unknown"]);
  });

  it("does not lock every visitor out when one unidentifiable client floods the endpoint", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    // Limiters are created lazily on first use.
    await login("flood-first@example.com");
    const normalLimit = scope("auth:login:ip").limit;
    // More failed logins than the normal per-IP budget, each for a different
    // email so the per-account limit never interferes.
    for (let i = 0; i <= normalLimit; i += 1) {
      await login(`flood${i}@example.com`);
    }
    // A different visitor (also unidentifiable) can still sign in.
    const res = await login("someone-else@example.com");
    expect(res.message).not.toContain("بیش از حد مجاز");
  });

  it("does not let different emails share an account counter", async () => {
    await login("one@example.com");
    await login("two@example.com");
    const account = scope("auth:login:account");
    expect(account.hits).toEqual(["one@example.com", "two@example.com"]);
  });
});

describe("fail closed when the store is unavailable", () => {
  it("denies login with the generic rate-limit message instead of proceeding", async () => {
    mocks.failStore = true;
    const res = await login("a@example.com");
    expect(res.message).toContain("بیش از حد مجاز");
    // Crucially, no credential work was attempted.
    expect(mocks.findUserByEmail).not.toHaveBeenCalled();
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });
});

describe("successful login resets only the account scope", () => {
  it("clears the account counter and leaves the IP counter intact", async () => {
    for (let i = 0; i < 2; i++) await login("b@example.com");
    mocks.verifyPassword.mockResolvedValue(true);
    await expect(login("b@example.com", "rightpass1")).rejects.toThrow(
      "NEXT_REDIRECT:/",
    );
    expect(scope("auth:login:account").resets).toContain("b@example.com");
    expect(scope("auth:login:ip").resets).toEqual([]);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});