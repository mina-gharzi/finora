/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ip: "203.0.113.9",
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  issueAuthToken: vi.fn(async () => ({
    rawToken: "raw-token",
    expiresAt: new Date(),
  })),
  discardAuthToken: vi.fn(async () => {}),
  consumeEmailChangeTokenAndSetEmail: vi.fn(),
  readEmailChangeToken: vi.fn(),
  sendEmailChangeEmail: vi.fn(
    async (): Promise<"sent" | "unavailable"> => "sent",
  ),
  isEmailDeliveryAvailable: vi.fn(() => true),
  deleteSession: vi.fn(async () => {}),
  requireUserId: vi.fn(async () => "user-1"),
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
vi.mock("@/lib/users", () => ({
  findUserByEmail: mocks.findUserByEmail,
  findUserById: mocks.findUserById,
}));
vi.mock("@/lib/auth-tokens", () => ({
  issueAuthToken: mocks.issueAuthToken,
  discardAuthToken: mocks.discardAuthToken,
  consumeEmailChangeTokenAndSetEmail: mocks.consumeEmailChangeTokenAndSetEmail,
  readEmailChangeToken: mocks.readEmailChangeToken,
}));
vi.mock("@/lib/email/adapter", () => ({
  isEmailDeliveryAvailable: () => mocks.isEmailDeliveryAvailable(),
  sendEmailChangeEmail: mocks.sendEmailChangeEmail,
}));
vi.mock("@/lib/dal", () => ({
  requireUserId: mocks.requireUserId,
}));
vi.mock("@/lib/session", () => ({
  deleteSession: mocks.deleteSession,
}));
// Database-backed limiter swapped for the pure in-memory one; real
// persistence is covered by persistent-rate-limit.test.ts.
vi.mock("@/lib/persistent-rate-limit", async () => {
  const { createInMemoryRateLimiter } = await vi.importActual<
    typeof import("@/lib/rate-limit")
  >("@/lib/rate-limit");
  return {
    createPersistentRateLimiter: (opts: {
      limit: number;
      windowMs: number;
    }) => createInMemoryRateLimiter(opts),
    RateLimitStoreError: class RateLimitStoreError extends Error {},
  };
});

import {
  confirmEmailChangeAction,
  requestEmailChangeAction,
} from "@/app/actions/email-change";
import {
  EMAIL_ADDRESS_TAKEN_MESSAGE,
  EMAIL_CHANGE_ALREADY_USED_MESSAGE,
  EMAIL_CHANGE_SENT_MESSAGE,
  EMAIL_CHANGED_MESSAGE,
  EMAIL_DELIVERY_UNAVAILABLE_MESSAGE,
  INVALID_TOKEN_MESSAGE,
} from "@/lib/account-recovery";

function form(values: Record<string, string>) {
  const fd = new FormData();
  Object.entries(values).forEach(([k, v]) => fd.set(k, v));
  return fd;
}

beforeEach(() => {
  delete (globalThis as { finoraAuthLimiters?: unknown }).finoraAuthLimiters;
  mocks.ip = "203.0.113.9";
  Object.values(mocks).forEach(
    (m) => typeof m === "function" && "mockClear" in m && m.mockClear(),
  );
  mocks.findUserByEmail.mockResolvedValue(null);
  mocks.findUserById.mockResolvedValue({
    id: "user-1",
    email: "u1@example.com",
    name: "کاربر",
    emailVerifiedAt: null,
  });
  mocks.isEmailDeliveryAvailable.mockReturnValue(true);
  mocks.sendEmailChangeEmail.mockResolvedValue("sent");
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.readEmailChangeToken.mockResolvedValue({ state: "absent" });
  mocks.consumeEmailChangeTokenAndSetEmail.mockResolvedValue({
    status: "invalid",
  });
});

describe("requestEmailChangeAction — session anchor and validation", () => {
  const submit = (email: string) =>
    requestEmailChangeAction({}, form({ email }));

  it("redirects to login when there is no session, before any work", async () => {
    mocks.requireUserId.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));
    await expect(submit("new@example.com")).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(mocks.findUserById).not.toHaveBeenCalled();
    expect(mocks.issueAuthToken).not.toHaveBeenCalled();
  });

  it("rejects a malformed address with a field error and does no lookups", async () => {
    const res = await submit("not-an-email");
    expect(res.fieldErrors?.email).toBe("ایمیل معتبر نیست.");
    expect(mocks.findUserById).not.toHaveBeenCalled();
    expect(mocks.issueAuthToken).not.toHaveBeenCalled();
  });

  it("names the current address back to its own owner as a field error", async () => {
    const res = await submit("u1@example.com");
    expect(res.fieldErrors?.email).toBe("این ایمیل، ایمیل فعلی شماست.");
    expect(mocks.findUserByEmail).not.toHaveBeenCalled();
    expect(mocks.issueAuthToken).not.toHaveBeenCalled();
  });

  it("names a duplicate address to its own owner and issues nothing", async () => {
    mocks.findUserByEmail.mockResolvedValue({
      id: "u2",
      name: "کاربر دیگر",
      passwordHash: "h",
      emailVerifiedAt: null,
    });
    const res = await submit("taken@example.com");
    expect(res.fieldErrors?.email).toBe("این ایمیل قبلاً ثبت شده است.");
    expect(mocks.issueAuthToken).not.toHaveBeenCalled();
  });

  it("redirects and clears the cookie when the session's account is gone", async () => {
    mocks.findUserById.mockResolvedValue(null);
    await expect(submit("new@example.com")).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    expect(mocks.issueAuthToken).not.toHaveBeenCalled();
  });
});

describe("requestEmailChangeAction — issuance and delivery", () => {
  const submit = (email: string) =>
    requestEmailChangeAction({}, form({ email }));

  it("issues a target-bound token and delivers the link to the NEW address", async () => {
    const res = await submit("New@Example.COM");

    expect(mocks.issueAuthToken).toHaveBeenCalledWith(
      "user-1",
      "email_change",
      "new@example.com",
    );
    expect(mocks.sendEmailChangeEmail).toHaveBeenCalledWith({
      to: "new@example.com",
      name: "کاربر",
      rawToken: "raw-token",
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe(EMAIL_CHANGE_SENT_MESSAGE);
    expect(mocks.discardAuthToken).not.toHaveBeenCalled();
    // The request path never rewrites the address itself.
    expect(mocks.consumeEmailChangeTokenAndSetEmail).not.toHaveBeenCalled();
  });

  it("pre-flights delivery and issues nothing when email is not configured", async () => {
    mocks.isEmailDeliveryAvailable.mockReturnValue(false);
    const res = await submit("new@example.com");
    expect(res.message).toBe(EMAIL_DELIVERY_UNAVAILABLE_MESSAGE);
    expect(res.success).not.toBe(true);
    expect(mocks.issueAuthToken).not.toHaveBeenCalled();
    expect(mocks.sendEmailChangeEmail).not.toHaveBeenCalled();
  });

  it("discards the issued token and reports unavailable when the send fails", async () => {
    mocks.sendEmailChangeEmail.mockResolvedValue("unavailable");
    const res = await submit("new@example.com");
    expect(mocks.discardAuthToken).toHaveBeenCalledWith(
      "user-1",
      "email_change",
    );
    expect(res.message).toBe(EMAIL_DELIVERY_UNAVAILABLE_MESSAGE);
    expect(res.success).not.toBe(true);
  });

  it("rate limits requests per signed-in user (3 per hour)", async () => {
    for (let i = 0; i < 3; i++) await submit(`a${i}@example.com`);
    const res = await submit("fresh@example.com");
    expect(res.message).toContain("بیش از حد مجاز");
    expect(mocks.issueAuthToken).toHaveBeenCalledTimes(3);
  });

  it("rate limits one IP across different accounts (10 per hour)", async () => {
    let n = 0;
    mocks.requireUserId.mockImplementation(async () => `user-${n}`);
    mocks.findUserById.mockImplementation(async () => {
      const id = `user-${n++}`;
      return { id, email: `${id}@example.com`, name: "کاربر", emailVerifiedAt: null };
    });

    for (let i = 0; i < 10; i++) await submit(`a${i}@example.com`);
    const res = await submit("fresh@example.com");
    expect(res.message).toContain("بیش از حد مجاز");
    expect(mocks.issueAuthToken).toHaveBeenCalledTimes(10);
  });
});

describe("confirmEmailChangeAction", () => {
  const submit = (token = "tok") =>
    confirmEmailChangeAction({}, form({ token }));

  it("rejects an empty token without touching the database", async () => {
    const res = await submit("");
    expect(res.message).toBe(INVALID_TOKEN_MESSAGE);
    expect(mocks.consumeEmailChangeTokenAndSetEmail).not.toHaveBeenCalled();
    expect(mocks.readEmailChangeToken).not.toHaveBeenCalled();
  });

  it("consumes, kills the local session, and reports success", async () => {
    mocks.consumeEmailChangeTokenAndSetEmail.mockResolvedValue({
      status: "changed",
      userId: "user-1",
    });
    const res = await submit("good");
    expect(mocks.consumeEmailChangeTokenAndSetEmail).toHaveBeenCalledWith(
      "good",
    );
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(res.message).toBe(EMAIL_CHANGED_MESSAGE);
    expect(mocks.readEmailChangeToken).not.toHaveBeenCalled();
  });

  it("maps the taken-address race to its specific message without killing this session", async () => {
    mocks.consumeEmailChangeTokenAndSetEmail.mockResolvedValue({
      status: "taken",
    });
    const res = await submit();
    expect(res.message).toBe(EMAIL_ADDRESS_TAKEN_MESSAGE);
    expect(res.success).not.toBe(true);
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(mocks.readEmailChangeToken).not.toHaveBeenCalled();
  });

  it("distinguishes an already-used token from generic invalidity", async () => {
    mocks.readEmailChangeToken.mockResolvedValue({ state: "consumed" });
    const res = await submit();
    expect(res.message).toBe(EMAIL_CHANGE_ALREADY_USED_MESSAGE);
    expect(res.success).not.toBe(true);
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it("maps unknown, expired and foreign tokens to one generic message", async () => {
    for (const state of ["absent", "expired"] as const) {
      mocks.readEmailChangeToken.mockResolvedValue({ state });
      const res = await submit();
      expect(res.message).toBe(INVALID_TOKEN_MESSAGE);
      expect(res.success).not.toBe(true);
    }
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it("rate limits token submissions per address (20 per 15 minutes)", async () => {
    for (let i = 0; i < 20; i++) await submit(`t${i}`);
    const res = await submit("t99");
    expect(res.message).toContain("بیش از حد مجاز");
    expect(mocks.consumeEmailChangeTokenAndSetEmail).toHaveBeenCalledTimes(20);
  });
});
