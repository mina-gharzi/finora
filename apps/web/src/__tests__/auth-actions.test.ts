/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(async () => "hash"),
  createSession: vi.fn(async () => {}),
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
vi.mock("@/lib/users", () => ({
  findUserByEmail: mocks.findUserByEmail,
  createUser: mocks.createUser,
}));
vi.mock("@/lib/password", () => ({
  DUMMY_PASSWORD_HASH: "dummy",
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));
vi.mock("@/lib/session", () => ({
  createSession: mocks.createSession,
  deleteSession: vi.fn(),
}));

import { loginAction, registerAction } from "@/app/actions/auth";

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