/**
 * @vitest-environment node
 *
 * Failure-path contract of the auth rate limiter.
 *
 * An unreachable store is answered EXACTLY like an exhausted bucket (the
 * generic "too many attempts" shape), so a total outage — missing migration,
 * wrong DATABASE_URL, unreachable host — is invisible from the outside. These
 * tests pin the two halves of the fix:
 *
 *   1. the limiter still fails CLOSED (never allows traffic through), and
 *   2. the outage is RECORDED, so an operator can tell a database outage
 *      apart from an abuse wave instead of guessing from user reports.
 *
 * The store is mocked to fail, so the assertions are deterministic and do not
 * need a database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/persistent-rate-limit", () => {
  class RateLimitStoreError extends Error {
    constructor(cause?: unknown) {
      super("rate-limit store unavailable");
      this.name = "RateLimitStoreError";
      if (cause !== undefined) {
        (this as { cause?: unknown }).cause = cause;
      }
    }
  }

  const driverError = Object.assign(new Error("relation does not exist"), {
    code: "42P01",
  });

  const failing = {
    scope: "auth:login:ip",
    async check(): Promise<never> {
      throw new RateLimitStoreError(driverError);
    },
    async hit(): Promise<never> {
      throw new RateLimitStoreError(driverError);
    },
    async reset(): Promise<never> {
      throw new RateLimitStoreError(driverError);
    },
  };

  return {
    RateLimitStoreError,
    createPersistentRateLimiter: () => failing,
  };
});

import {
  checkLimits,
  enforceLimits,
  getAuthLimiters,
  hitLimits,
  resetLimits,
} from "@/lib/auth-rate-limit";

let logged: string[] = [];

beforeEach(() => {
  delete (globalThis as { finoraAuthLimiters?: unknown }).finoraAuthLimiters;
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map((arg) => String(arg)).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function records(): Array<Record<string, unknown>> {
  return logged.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("rate-limit store failure", () => {
  it("fails closed with a fixed 60-second retry when the store is unreachable", async () => {
    const { loginIp } = getAuthLimiters();

    await expect(
      checkLimits([{ limiter: loginIp, key: "203.0.113.7" }]),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("fails closed in enforceLimits too, so an outage never lets a request through", async () => {
    const { registerIp } = getAuthLimiters();

    await expect(
      enforceLimits([{ limiter: registerIp, key: "203.0.113.7" }]),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("logs a structured store_unavailable event with the operation and scope", async () => {
    const { loginIp } = getAuthLimiters();

    await checkLimits([{ limiter: loginIp, key: "203.0.113.7" }]);

    const logged = records();
    expect(logged).toHaveLength(1);
    expect(logged[0].level).toBe("error");
    expect(logged[0].event).toBe("rate_limit.store_unavailable");
    expect(logged[0].operation).toBe("check");
    expect(logged[0].scopes).toEqual(["auth:login:ip"]);
  });

  it("records the driver error code so the failure class is identifiable", async () => {
    const { loginIp } = getAuthLimiters();

    await checkLimits([{ limiter: loginIp, key: "203.0.113.7" }]);

    // 42P01 = undefined table: the classic "migrations were never applied".
    expect(records()[0].causeCode).toBe("42P01");
  });

  it("logs the hit and reset failures as well", async () => {
    const { loginIp } = getAuthLimiters();

    await expect(
      hitLimits([{ limiter: loginIp, key: "203.0.113.7" }]),
    ).resolves.toBe(false);
    await expect(
      resetLimits([{ limiter: loginIp, key: "203.0.113.7" }]),
    ).resolves.toBe(false);

    const operations = records().map((record) => record.operation);
    expect(operations).toEqual(["hit", "reset"]);
  });

  it("never logs the identifier being limited", async () => {
    const { loginAccount } = getAuthLimiters();

    await checkLimits([
      { limiter: loginAccount, key: "someone@example.com" },
    ]);

    const raw = logged.join("\n");
    expect(raw).not.toContain("someone@example.com");
    expect(raw).not.toContain("@example.com");
  });
});
