/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyMobileLoginCredentials: vi.fn(),
}));

vi.mock("@/lib/mobile/auth", () => ({
  verifyMobileLoginCredentials: mocks.verifyMobileLoginCredentials,
}));

import { POST } from "@/app/api/mobile/auth/login/route";
import { verifySessionTokenDetails } from "@/lib/session-token";

const SECRET = "mobile-login-test-secret-0123456789abcdef";

function loginRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("http://127.0.0.1:3000/api/mobile/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  mocks.verifyMobileLoginCredentials.mockReset();
});

describe("POST /api/mobile/auth/login", () => {
  it("returns a signed bearer token and minimal user without a cookie", async () => {
    mocks.verifyMobileLoginCredentials.mockResolvedValue({
      ok: true,
      user: {
        id: "user-1",
        name: "کاربر",
        email: "user@example.com",
        emailVerifiedAt: null,
      },
    });

    const response = await POST(
      loginRequest(JSON.stringify({ email: "user@example.com", password: "secret" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(body.user).toEqual({
      id: "user-1",
      name: "کاربر",
      email: "user@example.com",
      emailVerifiedAt: null,
    });
    expect(typeof body.token).toBe("string");
    expect(typeof body.expiresAt).toBe("string");

    await expect(
      verifySessionTokenDetails(body.token, SECRET),
    ).resolves.toMatchObject({ userId: "user-1" });
  });

  it("passes the raw request headers to the shared credential check", async () => {
    mocks.verifyMobileLoginCredentials.mockResolvedValue({
      ok: false,
      status: 401,
      message: "bad",
    });

    await POST(
      loginRequest(JSON.stringify({ email: "a@example.com", password: "x" }), {
        "x-forwarded-for": "203.0.113.10",
      }),
    );

    const [, , headers] = mocks.verifyMobileLoginCredentials.mock.calls[0];
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.10");
  });

  it("rejects malformed JSON with a generic 400", async () => {
    const response = await POST(loginRequest("{"));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(mocks.verifyMobileLoginCredentials).not.toHaveBeenCalled();
  });

  it("maps invalid credentials to 401 without leaking details", async () => {
    mocks.verifyMobileLoginCredentials.mockResolvedValue({
      ok: false,
      status: 401,
      message: "ایمیل یا گذرواژه نادرست است.",
    });

    const response = await POST(
      loginRequest(JSON.stringify({ email: "a@example.com", password: "x" })),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("maps rate limiting to 429", async () => {
    mocks.verifyMobileLoginCredentials.mockResolvedValue({
      ok: false,
      status: 429,
      message: "too many",
      retryAfterSeconds: 60,
    });

    const response = await POST(
      loginRequest(JSON.stringify({ email: "a@example.com", password: "x" })),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
  });
});
