/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  getDatabaseUrl,
  getSessionSecret,
  isEmailVerificationRequired,
  shouldSeedDefaultCategories,
} from "@/lib/env";

afterEach(() => {
  delete process.env.SESSION_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.SEED_DEFAULT_CATEGORIES;
  delete process.env.EMAIL_VERIFICATION_REQUIRED;
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

describe("default category seeding switch", () => {
  it("is enabled when unset", () => {
    delete process.env.SEED_DEFAULT_CATEGORIES;
    expect(shouldSeedDefaultCategories()).toBe(true);
  });

  it("is disabled only by an explicit false", () => {
    process.env.SEED_DEFAULT_CATEGORIES = "false";
    expect(shouldSeedDefaultCategories()).toBe(false);
  });

  it("trims and ignores case", () => {
    process.env.SEED_DEFAULT_CATEGORIES = "FALSE ";
    expect(shouldSeedDefaultCategories()).toBe(false);
  });

  it("treats other values as enabled", () => {
    process.env.SEED_DEFAULT_CATEGORIES = "0";
    expect(shouldSeedDefaultCategories()).toBe(true);

    process.env.SEED_DEFAULT_CATEGORIES = "true";
    expect(shouldSeedDefaultCategories()).toBe(true);
  });
});

describe("email verification switch", () => {
  it("is required when unset", () => {
    delete process.env.EMAIL_VERIFICATION_REQUIRED;
    expect(isEmailVerificationRequired()).toBe(true);
  });

  it("is disabled only by an explicit false", () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = "false";
    expect(isEmailVerificationRequired()).toBe(false);
  });

  it("trims and ignores case", () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = " FALSE ";
    expect(isEmailVerificationRequired()).toBe(false);
  });

  it("treats other values as required", () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = "0";
    expect(isEmailVerificationRequired()).toBe(true);

    process.env.EMAIL_VERIFICATION_REQUIRED = "true";
    expect(isEmailVerificationRequired()).toBe(true);
  });
});