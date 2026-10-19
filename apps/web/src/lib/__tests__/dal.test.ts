/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUserById: vi.fn(),
  findUserAuthValidAfter: vi.fn(),
  isEmailVerifiedFor: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  cookieToken: undefined as string | undefined,
}));

// React's `cache` memoizes across the process outside a render, which would
// leak results between cases; make it a pass-through for the unit test.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookieToken === undefined
        ? undefined
        : { name, value: mocks.cookieToken },
    set: () => {},
    delete: () => {},
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mocks.redirect(url),
}));

vi.mock("@/lib/users", () => ({
  findUserById: (id: string) => mocks.findUserById(id),
  findUserAuthValidAfter: (id: string) => mocks.findUserAuthValidAfter(id),
  isEmailVerifiedFor: (id: string) => mocks.isEmailVerifiedFor(id),
}));

import {
  getCurrentUser,
  getSessionUserId,
  isEmailVerified,
  requireUserId,
} from "@/lib/dal";
import { signSessionToken } from "@/lib/session-token";

const SECRET = "dal-test-session-secret-0123456789";

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  mocks.cookieToken = undefined;
  mocks.findUserById.mockReset();
  mocks.findUserAuthValidAfter.mockReset();
  mocks.isEmailVerifiedFor.mockReset();
  mocks.redirect.mockClear();
  mocks.findUserAuthValidAfter.mockResolvedValue({ authValidAfter: null });
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("DAL session resolution", () => {
  it("resolves the user id from a valid signed cookie", async () => {
    mocks.cookieToken = await signSessionToken("user-1", SECRET);
    await expect(getSessionUserId()).resolves.toBe("user-1");
  });

  it("returns null when the cookie is missing", async () => {
    await expect(getSessionUserId()).resolves.toBeNull();
  });

  it("returns null for a tampered token", async () => {
    mocks.cookieToken = `${await signSessionToken("user-1", SECRET)}x`;
    await expect(getSessionUserId()).resolves.toBeNull();
  });
});

describe("DAL session-invalidation watermark", () => {
  it("rejects a token issued before the watermark (post password reset)", async () => {
    mocks.cookieToken = await signSessionToken("user-r", SECRET);
    mocks.findUserAuthValidAfter.mockResolvedValue({
      authValidAfter: new Date(Date.now() + 60_000),
    });
    await expect(getSessionUserId()).resolves.toBeNull();
  });

  it("accepts a token issued at or after the watermark", async () => {
    mocks.cookieToken = await signSessionToken("user-r2", SECRET);
    mocks.findUserAuthValidAfter.mockResolvedValue({
      authValidAfter: new Date(Date.now() - 60_000),
    });
    await expect(getSessionUserId()).resolves.toBe("user-r2");
  });

  it("treats a deleted account (no gate row) as signed out", async () => {
    mocks.cookieToken = await signSessionToken("user-gone", SECRET);
    mocks.findUserAuthValidAfter.mockResolvedValue(null);
    await expect(getSessionUserId()).resolves.toBeNull();
  });
});

describe("requireUserId", () => {
  it("redirects to /login without a session", async () => {
    await expect(requireUserId()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("returns the id when authenticated", async () => {
    mocks.cookieToken = await signSessionToken("user-2", SECRET);
    await expect(requireUserId()).resolves.toBe("user-2");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("isEmailVerified", () => {
  it("reflects the user's verified flag", async () => {
    mocks.isEmailVerifiedFor.mockResolvedValueOnce(true);
    await expect(isEmailVerified("user-5")).resolves.toBe(true);
    mocks.isEmailVerifiedFor.mockResolvedValueOnce(false);
    await expect(isEmailVerified("user-5")).resolves.toBe(false);
  });
});

describe("getCurrentUser", () => {
  it("is null without a session and does not query the database", async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.findUserById).not.toHaveBeenCalled();
  });

  it("loads only the session user's own record, by the session id", async () => {
    mocks.cookieToken = await signSessionToken("user-3", SECRET);
    mocks.findUserById.mockResolvedValue({
      id: "user-3",
      email: "user3@example.com",
      name: "کاربر سه",
      emailVerifiedAt: null,
    });

    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-3",
      email: "user3@example.com",
      name: "کاربر سه",
      emailVerifiedAt: null,
    });
    expect(mocks.findUserById).toHaveBeenCalledWith("user-3");
  });

  it("is null when the account no longer exists", async () => {
    mocks.cookieToken = await signSessionToken("user-4", SECRET);
    mocks.findUserById.mockResolvedValue(null);
    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
