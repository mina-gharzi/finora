/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUserById: vi.fn(),
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
}));

import {
  getCurrentUser,
  getSessionUserId,
  requireUserId,
} from "@/lib/dal";
import { signSessionToken } from "@/lib/session-token";

const SECRET = "dal-test-session-secret-0123456789";

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  mocks.cookieToken = undefined;
  mocks.findUserById.mockReset();
  mocks.redirect.mockClear();
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
    });

    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-3",
      email: "user3@example.com",
      name: "کاربر سه",
    });
    expect(mocks.findUserById).toHaveBeenCalledWith("user-3");
  });

  it("is null when the account no longer exists", async () => {
    mocks.cookieToken = await signSessionToken("user-4", SECRET);
    mocks.findUserById.mockResolvedValue(null);
    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
