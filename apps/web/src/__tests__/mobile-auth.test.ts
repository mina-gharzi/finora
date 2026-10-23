/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUserAuthValidAfter: vi.fn(),
  findUserById: vi.fn(),
  isEmailVerifiedFor: vi.fn(),
}));

vi.mock("@/lib/users", () => ({
  findUserAuthValidAfter: mocks.findUserAuthValidAfter,
  findUserById: mocks.findUserById,
  isEmailVerifiedFor: mocks.isEmailVerifiedFor,
}));

import { verifyMobileBearerToken } from "@/lib/mobile/auth";
import { signSessionToken } from "@/lib/session-token";

const SECRET = "mobile-auth-test-secret-0123456789abcdef";

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  mocks.findUserAuthValidAfter.mockReset();
  mocks.findUserAuthValidAfter.mockResolvedValue({ authValidAfter: null });
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("verifyMobileBearerToken", () => {
  it("accepts a valid bearer token", async () => {
    const token = await signSessionToken("user-1", SECRET);

    await expect(verifyMobileBearerToken(`Bearer ${token}`)).resolves.toEqual({
      ok: true,
      userId: "user-1",
    });
  });

  it("rejects missing, malformed, and tampered tokens", async () => {
    const token = await signSessionToken("user-1", SECRET);

    await expect(verifyMobileBearerToken(null)).resolves.toEqual({
      ok: false,
      status: 401,
    });
    await expect(verifyMobileBearerToken(token)).resolves.toEqual({
      ok: false,
      status: 401,
    });
    await expect(verifyMobileBearerToken(`Bearer ${token}x`)).resolves.toEqual({
      ok: false,
      status: 401,
    });
  });

  it("rejects a token revoked by the watermark", async () => {
    const token = await signSessionToken("user-r", SECRET);
    mocks.findUserAuthValidAfter.mockResolvedValue({
      authValidAfter: new Date(Date.now() + 60_000),
    });

    await expect(verifyMobileBearerToken(`Bearer ${token}`)).resolves.toEqual({
      ok: false,
      status: 401,
    });
  });

  it("rejects a token for a deleted account", async () => {
    const token = await signSessionToken("user-gone", SECRET);
    mocks.findUserAuthValidAfter.mockResolvedValue(null);

    await expect(verifyMobileBearerToken(`Bearer ${token}`)).resolves.toEqual({
      ok: false,
      status: 401,
    });
  });
});
