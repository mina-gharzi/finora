/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  findUserCredentialsById: vi.fn(),
  updateUserPasswordIfCurrent: vi.fn(),
  createUser: vi.fn(),
  requireUserId: vi.fn(async () => "u1"),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(async () => "hash"),
  createSession: vi.fn(async () => {}),
  deleteSession: vi.fn(async () => {}),
  sendInitialVerificationEmail: vi.fn(async () => {}),
  ip: "203.0.113.9",
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
vi.mock("@/lib/dal", () => ({
  requireUserId: mocks.requireUserId,
}));
vi.mock("@/lib/users", () => ({
  findUserByEmail: mocks.findUserByEmail,
  findUserCredentialsById: mocks.findUserCredentialsById,
  updateUserPasswordIfCurrent: mocks.updateUserPasswordIfCurrent,
  createUser: mocks.createUser,
}));
vi.mock("@/lib/password", () => ({
  DUMMY_PASSWORD_HASH: "dummy",
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));
vi.mock("@/lib/session", () => ({
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
}));
vi.mock("@/app/actions/account-recovery", () => ({
  sendInitialVerificationEmail: mocks.sendInitialVerificationEmail,
}));

import {
  changePasswordAction,
  loginAction,
  registerAction,
} from "@/app/actions/auth";

function form(values: Record<string, string>) {
  const fd = new FormData();
  Object.entries(values).forEach(([k, v]) => fd.set(k, v));
  return fd;
}
const login = (email: string, password = "wrongpass1") =>
  loginAction({}, form({ email, password }));

beforeEach(() => {
  delete (globalThis as { finoraAuthLimiters?: unknown }).finoraAuthLimiters;
  Object.values(mocks).forEach((m) => typeof m === "function" && "mockClear" in m && m.mockClear());
  mocks.ip = "203.0.113.9";
  mocks.findUserByEmail.mockResolvedValue({ id: "u1", name: "n", passwordHash: "h" });
  mocks.verifyPassword.mockResolvedValue(false);
});

describe("loginAction rate limiting", () => {
  it("blocks the 6th attempt for one email without running bcrypt", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login("a@example.com")).message).toContain("نادرست");
    }
    const calls = mocks.verifyPassword.mock.calls.length;
    const res = await login("a@example.com");
    expect(res.message).toContain("بیش از حد مجاز");
    expect(mocks.verifyPassword.mock.calls.length).toBe(calls);
  });

  it("applies the same limit to unknown emails (no existence leak)", async () => {
    mocks.findUserByEmail.mockResolvedValue(null);
    for (let i = 0; i < 5; i++) await login("ghost@example.com");
    expect((await login("ghost@example.com")).message).toContain("بیش از حد مجاز");
  });

  it("limits a single IP across different emails", async () => {
    for (let i = 0; i < 20; i++) await login(`u${i}@example.com`);
    expect((await login("fresh@example.com")).message).toContain("بیش از حد مجاز");
  });

  it("resets the account counter after a successful login", async () => {
    for (let i = 0; i < 4; i++) await login("b@example.com");
    mocks.verifyPassword.mockResolvedValue(true);
    await expect(login("b@example.com", "rightpass1")).rejects.toThrow("NEXT_REDIRECT:/");
    mocks.verifyPassword.mockResolvedValue(false);
    expect((await login("b@example.com")).message).toContain("نادرست");
  });
});

describe("registerAction rate limiting", () => {
  it("blocks an IP after 20 attempts", async () => {
    mocks.findUserByEmail.mockResolvedValue({ id: "x" }); // email taken
    const reg = (i: number) =>
      registerAction({}, form({ name: "نام تست", email: `r${i}@example.com`, password: "password1" }));
    for (let i = 0; i < 20; i++) await reg(i);
    expect((await reg(99)).message).toContain("بیش از حد مجاز");
  });

  it("does not spend budget on invalid input", async () => {
    for (let i = 0; i < 30; i++) {
      await registerAction({}, form({ name: "", email: "bad", password: "x" }));
    }
    mocks.findUserByEmail.mockResolvedValue(null);
    mocks.createUser.mockResolvedValue({ id: "new" });
    await expect(
      registerAction({}, form({ name: "نام تست", email: "ok@example.com", password: "password1" })),
    ).rejects.toThrow("NEXT_REDIRECT:/");
  });
});

describe("registerAction database errors", () => {
  const submit = () =>
    registerAction(
      {},
      form({ name: "نام تست", email: "dup@example.com", password: "password1" }),
    );

  it("reports a duplicate email only for a unique violation", async () => {
    mocks.findUserByEmail.mockResolvedValue(null);
    mocks.createUser.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "23505" }),
    );
    expect((await submit()).fieldErrors?.email).toContain("قبلاً");
  });

  it("rethrows unrelated database failures instead of blaming the email", async () => {
    mocks.findUserByEmail.mockResolvedValue(null);
    mocks.createUser.mockRejectedValue(
      Object.assign(new Error("db down"), { code: "ECONNREFUSED" }),
    );
    await expect(submit()).rejects.toThrow("db down");
  });
});

describe("registerAction verification email", () => {
  const submit = () =>
    registerAction(
      {},
      form({ name: "نام تست", email: "new@example.com", password: "password1" }),
    );

  it("kicks off the initial verification email for the new account", async () => {
    mocks.findUserByEmail.mockResolvedValue(null);
    mocks.createUser.mockResolvedValue({ id: "new" });

    await expect(submit()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.sendInitialVerificationEmail).toHaveBeenCalledWith({
      userId: "new",
      email: "new@example.com",
      name: "نام تست",
    });
  });

  it("still completes registration when the email adapter is unconfigured", async () => {
    mocks.findUserByEmail.mockResolvedValue(null);
    mocks.createUser.mockResolvedValue({ id: "new" });
    // sendInitialVerificationEmail never throws by contract (best-effort);
    // simulate the adapter reporting 'unavailable' without failing.
    mocks.sendInitialVerificationEmail.mockResolvedValueOnce("unavailable" as never);

    await expect(submit()).rejects.toThrow("NEXT_REDIRECT:/");
  });
});

describe("changePasswordAction", () => {
  const submit = (overrides: Record<string, string> = {}) =>
    changePasswordAction(
      {},
      form({
        current: "Password123",
        password: "NewPassword456",
        confirm: "NewPassword456",
        ...overrides,
      }),
    );

  beforeEach(() => {
    mocks.requireUserId.mockResolvedValue("u1");
    mocks.findUserCredentialsById.mockResolvedValue({
      id: "u1",
      name: "n",
      passwordHash: "old-hash",
      emailVerifiedAt: null,
    });
    mocks.verifyPassword.mockResolvedValue(false);
    mocks.updateUserPasswordIfCurrent.mockResolvedValue(true);
  });

  it("redirects to login without a session, before touching any credential", async () => {
    mocks.requireUserId.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(submit()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.findUserCredentialsById).not.toHaveBeenCalled();
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it("verifies the current password, stores the new hash, ends the session and redirects to sign in", async () => {
    mocks.verifyPassword.mockResolvedValue(true);

    await expect(submit()).rejects.toThrow(
      "NEXT_REDIRECT:/login?passwordChanged=1",
    );
    expect(mocks.verifyPassword).toHaveBeenCalledWith(
      "Password123",
      "old-hash",
    );
    expect(mocks.hashPassword).toHaveBeenCalledWith("NewPassword456");
    // Compare-and-swap against the hash that was just verified.
    expect(mocks.updateUserPasswordIfCurrent).toHaveBeenCalledWith(
      "u1",
      "old-hash",
      "hash",
    );
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
  });

  it("never stores the plaintext password", async () => {
    mocks.verifyPassword.mockResolvedValue(true);

    await expect(submit()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.hashPassword).toHaveBeenCalledWith("NewPassword456");
    const storedHash = mocks.updateUserPasswordIfCurrent.mock.calls[0]?.[2];
    expect(storedHash).toBeDefined();
    expect(storedHash).not.toBe("NewPassword456");
    expect(storedHash).not.toBe("Password123");
  });

  it("rejects an incorrect current password without changing anything", async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    const res = await submit();
    expect(res.fieldErrors?.current).toContain("نادرست");
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.updateUserPasswordIfCurrent).not.toHaveBeenCalled();
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it("rejects a weak new password before any credential check", async () => {
    const res = await submit({ password: "short", confirm: "short" });
    expect(res.fieldErrors?.password).toBeTruthy();
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.updateUserPasswordIfCurrent).not.toHaveBeenCalled();
  });

  it("rejects a mismatched confirmation with a field error", async () => {
    const res = await submit({ confirm: "Different1" });
    expect(res.fieldErrors?.confirm).toContain("یکسان");
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.updateUserPasswordIfCurrent).not.toHaveBeenCalled();
  });

  it("applies no change and keeps the session when the stored hash moves concurrently", async () => {
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.updateUserPasswordIfCurrent.mockResolvedValue(false);

    const res = await submit();
    expect(res.message).toContain("دیگر معتبر نیست");
    expect(res.fieldErrors).toBeUndefined();
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(mocks.hashPassword).toHaveBeenCalled();
  });

  it("ends the session when the account vanished behind a live cookie", async () => {
    mocks.findUserCredentialsById.mockResolvedValue(null);

    await expect(submit()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.updateUserPasswordIfCurrent).not.toHaveBeenCalled();
  });
});