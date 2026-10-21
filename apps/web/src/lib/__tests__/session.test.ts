/**
 * @vitest-environment node
 *
 * Security regression tests for the cookie-bound session module.
 *
 * The critical invariant: `lib/session.ts` must expose NO signature-only
 * "who is this" reader. Verifying the JWT alone is not authentication — the
 * `auth_valid_after` watermark that revokes sessions after a password reset or
 * change lives in the Data Access Layer. A raw `getSessionUserId`-style helper
 * here would let a future caller silently authenticate a revoked cookie, so
 * this file pins the export surface and the cookie handling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  setCalls: [] as Array<{ name: string; value: string; options: unknown }>,
  deleteCalls: [] as string[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookieValue === undefined
        ? undefined
        : { name, value: mocks.cookieValue },
    set: (name: string, value: string, options: unknown) => {
      mocks.setCalls.push({ name, value, options });
    },
    delete: (name: string) => {
      mocks.deleteCalls.push(name);
    },
  }),
}));

import * as sessionModule from "@/lib/session";
import { createSession, deleteSession, getSessionAuth } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";
import { signSessionToken } from "@/lib/session-token";

const SECRET = "session-test-secret-0123456789abcdef";

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  mocks.cookieValue = undefined;
  mocks.setCalls = [];
  mocks.deleteCalls = [];
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("session module export surface (revocation safety)", () => {
  it("does NOT expose a signature-only identity reader that would bypass the watermark", () => {
    // `getSessionAuth` is intentionally the only identity-ish export: it returns
    // the token details so the DAL can apply `auth_valid_after`. Any export
    // that returns a user id from the raw token would skip that check.
    expect(Object.keys(sessionModule).sort()).toEqual(
      ["createSession", "deleteSession", "getSessionAuth"].sort(),
    );
    expect(sessionModule).not.toHaveProperty("getSessionUserId");
    expect(sessionModule).not.toHaveProperty("verifySessionToken");
  });

  it("only re-exports identity through the watermark-aware path", () => {
    // Guard against a future helper being added with a misleading name.
    for (const name of Object.keys(sessionModule)) {
      expect(name).not.toMatch(/userId/i);
    }
  });
});

describe("createSession", () => {
  it("sets an httpOnly, SameSite=Lax session cookie with the signed token", async () => {
    await createSession("user-1");

    expect(mocks.setCalls).toHaveLength(1);
    const [call] = mocks.setCalls;
    expect(call.name).toBe(SESSION_COOKIE_NAME);
    expect(call.value).toMatch(/\./); // a JWS has header.payload.signature
    expect(call.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });
});

describe("deleteSession", () => {
  it("deletes exactly the session cookie", async () => {
    await deleteSession();
    expect(mocks.deleteCalls).toEqual([SESSION_COOKIE_NAME]);
  });
});

describe("getSessionAuth", () => {
  it("returns the user id and issue time for a valid token", async () => {
    mocks.cookieValue = await signSessionToken("user-2", SECRET);

    const auth = await getSessionAuth();
    expect(auth?.userId).toBe("user-2");
    expect(typeof auth?.issuedAt).toBe("number");
  });

  it("returns null when the cookie is absent", async () => {
    await expect(getSessionAuth()).resolves.toBeNull();
  });

  it("returns null for a tampered token (never a partial identity)", async () => {
    mocks.cookieValue = `${await signSessionToken("user-3", SECRET)}x`;
    await expect(getSessionAuth()).resolves.toBeNull();
  });
});
