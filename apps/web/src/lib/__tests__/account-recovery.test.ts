/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  AUTH_TOKEN_PURPOSES,
  EMAIL_CHANGE_TTL_MS,
  EMAIL_VERIFY_TTL_MS,
  generateAuthToken,
  hashAuthToken,
  PASSWORD_RESET_TTL_MS,
  tokenTtlMs,
  authTokenExpiry,
} from "@/lib/account-recovery";

describe("auth token generation", () => {
  it("emits a base64url string carrying 256 bits of entropy", () => {
    const token = generateAuthToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("never repeats across draws", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateAuthToken));
    expect(tokens.size).toBe(100);
  });
});

describe("auth token hashing", () => {
  it("is a deterministic 64-char hex SHA-256 of the raw token", () => {
    const token = generateAuthToken();
    const hash = hashAuthToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAuthToken(token)).toBe(hash);
  });

  it("does not contain the raw token and is not a simple transform", () => {
    const token = generateAuthToken();
    const hash = hashAuthToken(token);
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token.slice(0, 12));
  });

  it("separates different tokens onto different hashes", () => {
    expect(hashAuthToken(generateAuthToken())).not.toBe(
      hashAuthToken(generateAuthToken()),
    );
  });
});

describe("auth token expiry", () => {
  it("uses one day for verification, one hour for reset and change", () => {
    expect(EMAIL_VERIFY_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(PASSWORD_RESET_TTL_MS).toBe(60 * 60 * 1000);
    expect(EMAIL_CHANGE_TTL_MS).toBe(60 * 60 * 1000);
    expect(tokenTtlMs("email_verify")).toBe(EMAIL_VERIFY_TTL_MS);
    expect(tokenTtlMs("password_reset")).toBe(PASSWORD_RESET_TTL_MS);
    expect(tokenTtlMs("email_change")).toBe(EMAIL_CHANGE_TTL_MS);
    expect(AUTH_TOKEN_PURPOSES).toEqual([
      "email_verify",
      "password_reset",
      "email_change",
    ]);
  });

  it("computes the expiry from the supplied clock", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(authTokenExpiry("password_reset", now).getTime()).toBe(
      now + PASSWORD_RESET_TTL_MS,
    );
    expect(authTokenExpiry("email_verify", now).getTime()).toBe(
      now + EMAIL_VERIFY_TTL_MS,
    );
    expect(authTokenExpiry("email_change", now).getTime()).toBe(
      now + EMAIL_CHANGE_TTL_MS,
    );
  });
});
