/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from "vitest";
import { getDatabaseUrl, getSessionSecret } from "@/lib/env";

afterEach(() => {
  delete process.env.SESSION_SECRET;
  delete process.env.DATABASE_URL;
});

describe("required environment access", () => {
  it("names the missing variable without leaking any value", () => {
    delete process.env.SESSION_SECRET;

    expect(() => getSessionSecret()).toThrowError(/SESSION_SECRET/);
  });

  it("treats a blank value as missing", () => {
    process.env.DATABASE_URL = "   ";
    expect(() => getDatabaseUrl()).toThrowError(/DATABASE_URL/);
  });

  it("returns the configured value", () => {
    process.env.SESSION_SECRET = "configured-secret-value-0123456789";
    expect(getSessionSecret()).toBe("configured-secret-value-0123456789");
  });
});

describe("session secret strength", () => {
  it("rejects a secret shorter than 32 characters without echoing it", () => {
    process.env.SESSION_SECRET = "too-short-secret";
    expect(() => getSessionSecret()).toThrowError(/at least 32/);
    expect(() => getSessionSecret()).not.toThrowError(/too-short-secret/);
  });

  it("accepts a secret of exactly 32 characters", () => {
    process.env.SESSION_SECRET = "a".repeat(32);
    expect(getSessionSecret()).toBe("a".repeat(32));
  });
});