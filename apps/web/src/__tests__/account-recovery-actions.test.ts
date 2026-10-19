/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ip: "203.0.113.9",
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  issueAuthToken: vi.fn(async () => ({ rawToken: "raw-token", expiresAt: new Date() })),
  consumePasswordResetTokenAndSetPassword: vi.fn(),
  consumeEmailVerifyToken: vi.fn(),
  discardAuthToken: vi.fn(async () => {}),
  sendPasswordResetEmail: vi.fn(
    async (): Promise<"sent" | "unavailable"> => "sent",
  ),
  sendVerificationEmail: vi.fn(
    async (): Promise<"sent" | "unavailable"> => "sent",
  ),
  isEmailDeliveryAvailable: vi.fn(() => true),
  hashPassword: vi.fn(async () => "new-hash"),
  deleteSession: vi.fn(async () => {}),
  requireUserId: vi.fn(async () => "user-1"),
  isEmailVerified: vi.fn(async () => false),
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
  consumePasswordResetTokenAndSetPassword:
    mocks.consumePasswordResetTokenAndSetPassword,
  consumeEmailVerifyToken: mocks.consumeEmailVerifyToken,
  discardAuthToken: mocks.discardAuthToken,
}));
vi.mock("@/lib/email/adapter", () => ({
  isEmailDeliveryAvailable: () => mocks.isEmailDeliveryAvailable(),
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  sendVerificationEmail: mocks.sendVerificationEmail,
}));
vi.mock("@/lib/dal", () => ({
  requireUserId: mocks.requireUserId,
  isEmailVerified: mocks.isEmailVerified,
}));
vi.mock("@/lib/password", () => ({
  hashPassword: mocks.hashPassword,
}));
vi.mock("@/lib/session", () => ({
  deleteSession: mocks.deleteSession,
}));

import {
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordAction,
  verifyEmailAction,
} from "@/app/actions/account-recovery";

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
  mocks.sendPasswordResetEmail.mockResolvedValue("sent");
  mocks.sendVerificationEmail.mockResolvedValue("sent");
  mocks.isEmailVerified.mockResolvedValue(false);
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.hashPassword.mockResolvedValue("new-hash");
});

describe("requestPasswordResetAction — enumeration resistance", () => {
  const submit = (email: string) =>
    requestPasswordResetAction({}, form({ email }));

  it("answers identically for existing and unknown addresses", async () => {
    mocks.findUserByEmail.mockResolvedValue(null);
    const unknown = await submit("ghost@example.com");

    mocks.findUserByEmail.mockResolvedValue({
      id: "u1",
      name: "کاربر",
      passwordHash: "h",
      emailVerifiedAt: null,
    });
    const known = await submit("real@example.com");

    expect(unknown.message).toBe(known.message);
    expect(unknown.message).toContain("اگر حسابی");
    expect(unknown.success).toBe(true);
  });

  it("issues no token and sends no email for unknown addresses", async () => {
    await submit("ghost@example.com");
    expect(mocks.issueAuthToken).not.toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("validates the email before spending any budget", async () => {
    const res = await requestPasswordResetAction({}, form({ email: "bad" }));
    expect(res.fieldErrors?.email).toBeTruthy();
    expect(mocks.findUserByEmail).not.toHaveBeenCalled();
  });
});

describe("requestPasswordResetAction — delivery", () => {
  const submit = (email: string) =>
    requestPasswordResetAction({}, form({ email }));
  const existingUser = () =>
    mocks.findUserByEmail.mockResolvedValue({
      id: "u1",
      name: "کاربر",
      passwordHash: "h",
      emailVerifiedAt: null,
    });

  it("answers 'unavailable' for everyone when no adapter is configured", async () => {
    mocks.isEmailDeliveryAvailable.mockReturnValue(false);
    const unknown = await submit("ghost@example.com");
    // The pre-flight runs before the account lookup, so even the unknown
    // address gets the unavailable message — and no lookup happens.
    expect(unknown.message).toContain("در دسترس نیست");
    expect(mocks.findUserByEmail).not.toHaveBeenCalled();

    existingUser();
    const known = await submit("real@example.com");
    expect(known.message).toBe(unknown.message);
    expect(mocks.issueAuthToken).not.toHaveBeenCalled();
  });

  it("issues, sends, and reports generic success for an existing account", async () => {
    existingUser();
    const res = await submit("real@example.com");
    expect(mocks.issueAuthToken).toHaveBeenCalledWith("u1", "password_reset");
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith({
      to: "real@example.com",
      name: "کاربر",
      rawToken: "raw-token",
    });
    expect(res.message).toContain("اگر حسابی");
    expect(res.success).toBe(true);
    expect(mocks.discardAuthToken).not.toHaveBeenCalled();
  });

  it("rolls back the token and reports unavailable when the send fails", async () => {
    existingUser();
    mocks.sendPasswordResetEmail.mockResolvedValue("unavailable");
    const res = await submit("real@example.com");
    expect(mocks.discardAuthToken).toHaveBeenCalledWith("u1", "password_reset");
    expect(res.message).toContain("در دسترس نیست");
    expect(res.success).not.toBe(true);
  });

  it("rate limits per submitted email", async () => {
    existingUser();
    for (let i = 0; i < 3; i++) await submit("real@example.com");
    const res = await submit("real@example.com");
    expect(res.message).toContain("بیش از حد مجاز");
  });

  it("rate limits a single IP across different emails", async () => {
    existingUser();
    for (let i = 0; i < 10; i++) await submit(`a${i}@example.com`);
    const res = await submit("fresh@example.com");
    expect(res.message).toContain("بیش از حد مجاز");
  });
});

describe("resetPasswordAction", () => {
  const submit = (overrides: Record<string, string> = {}) =>
    resetPasswordAction(
      {},
      form({ token: "tok", password: "Password1", confirm: "Password1", ...overrides }),
    );

  it("rejects a weak password with a field error and never consumes", async () => {
    const res = await submit({ password: "short", confirm: "short" });
    expect(res.fieldErrors?.password).toBeTruthy();
    expect(mocks.consumePasswordResetTokenAndSetPassword).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation with a field error", async () => {
    const res = await submit({ confirm: "Different1" });
    expect(res.fieldErrors?.confirm).toContain("یکسان");
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it("maps unknown, expired, reused and wrong-purpose tokens to one message", async () => {
    mocks.consumePasswordResetTokenAndSetPassword.mockResolvedValue(null);
    const res = await submit();
    expect(res.message).toContain("معتبر نیست");
    expect(res.success).not.toBe(true);
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it("hashes with the shared policy, consumes atomically, and kills sessions", async () => {
    mocks.consumePasswordResetTokenAndSetPassword.mockResolvedValue("user-1");
    const res = await submit();
    expect(mocks.hashPassword).toHaveBeenCalledWith("Password1");
    expect(mocks.consumePasswordResetTokenAndSetPassword).toHaveBeenCalledWith(
      "tok",
      "new-hash",
    );
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });

  it("rate limits token submissions per address", async () => {
    mocks.consumePasswordResetTokenAndSetPassword.mockResolvedValue(null);
    for (let i = 0; i < 20; i++) await submit({ token: `t${i}` });
    const res = await submit({ token: "t99" });
    expect(res.message).toContain("بیش از حد مجاز");
    expect(mocks.consumePasswordResetTokenAndSetPassword).toHaveBeenCalledTimes(20);
  });
});

describe("verifyEmailAction", () => {
  const submit = (token = "tok") =>
    verifyEmailAction({}, form({ token }));

  it("maps invalid, expired, reused and reset-purpose tokens to one message", async () => {
    mocks.consumeEmailVerifyToken.mockResolvedValue(null);
    const res = await submit();
    expect(res.message).toContain("معتبر نیست");
    expect(res.success).not.toBe(true);
  });

  it("consumes the token and reports success", async () => {
    mocks.consumeEmailVerifyToken.mockResolvedValue("user-1");
    const res = await submit("good");
    expect(mocks.consumeEmailVerifyToken).toHaveBeenCalledWith("good");
    expect(res.success).toBe(true);
    expect(res.message).toContain("تأیید شد");
  });

  it("rejects an empty token", async () => {
    const res = await submit("");
    expect(mocks.consumeEmailVerifyToken).not.toHaveBeenCalled();
    expect(res.message).toContain("معتبر نیست");
  });
});

describe("resendVerificationAction", () => {
  it("redirects to login without a session", async () => {
    mocks.requireUserId.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));
    await expect(resendVerificationAction()).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
  });

  it("is idempotent for already-verified accounts", async () => {
    mocks.isEmailVerified.mockResolvedValue(true);
    const res = await resendVerificationAction();
    expect(res.success).toBe(true);
    expect(mocks.issueAuthToken).not.toHaveBeenCalled();
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("issues a fresh verification token for unverified accounts", async () => {
    const res = await resendVerificationAction();
    expect(mocks.issueAuthToken).toHaveBeenCalledWith("user-1", "email_verify");
    expect(res.success).toBe(true);
    expect(res.message).toContain("ارسال شد");
  });

  it("rolls back the token when the resend cannot be delivered", async () => {
    mocks.sendVerificationEmail.mockResolvedValue("unavailable");
    const res = await resendVerificationAction();
    expect(mocks.discardAuthToken).toHaveBeenCalledWith("user-1", "email_verify");
    expect(res.message).toContain("در دسترس نیست");
    expect(res.success).not.toBe(true);
  });

  it("rate limits per signed-in user", async () => {
    for (let i = 0; i < 3; i++) await resendVerificationAction();
    const res = await resendVerificationAction();
    expect(res.message).toContain("بیش از حد مجاز");
  });
});
