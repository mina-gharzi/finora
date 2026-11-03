/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyMobileLoginCredentials: vi.fn(),
  verifyMobileBearerToken: vi.fn(),
  issueRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshTokenFamily: vi.fn(),
  revokeAllRefreshTokensForUser: vi.fn(),
  revokeAllUserSessions: vi.fn(),
  enforceLimits: vi.fn(),
}));

vi.mock("@/lib/mobile/auth", () => ({
  verifyMobileLoginCredentials: mocks.verifyMobileLoginCredentials,
  verifyMobileBearerToken: mocks.verifyMobileBearerToken,
}));

vi.mock("@/lib/mobile/refresh-tokens", () => ({
  issueRefreshToken: mocks.issueRefreshToken,
  rotateRefreshToken: mocks.rotateRefreshToken,
  revokeRefreshTokenFamily: mocks.revokeRefreshTokenFamily,
  revokeAllRefreshTokensForUser: mocks.revokeAllRefreshTokensForUser,
}));

vi.mock("@/lib/users", () => ({
  revokeAllUserSessions: mocks.revokeAllUserSessions,
  findUserByEmail: vi.fn(),
}));

vi.mock("@/lib/auth-rate-limit", () => ({
  getAuthLimiters: () => ({ refreshIp: { scope: "auth:refresh:ip" } }),
  enforceLimits: mocks.enforceLimits,
  checkLimits: vi.fn(),
  hitLimits: vi.fn(),
  resetLimits: vi.fn(),
}));

import { POST as loginPOST } from "@/app/api/v1/auth/login/route";
import { POST as refreshPOST } from "@/app/api/v1/auth/refresh/route";
import { POST as logoutPOST } from "@/app/api/v1/auth/logout/route";
import { POST as logoutAllPOST } from "@/app/api/v1/auth/logout-all/route";
import {
  MOBILE_ACCESS_TOKEN_SECONDS,
  MOBILE_REFRESH_TOKEN_SECONDS,
} from "@/lib/auth-constants";
import { verifySessionTokenDetails } from "@/lib/session-token";

const SECRET = "mobile-v1-test-secret-0123456789abcdef";

function request(path: string, body?: string, headers: Record<string, string> = {}) {
  return new Request(`http://127.0.0.1:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

const USER = {
  id: "user-1",
  name: "کاربر",
  email: "user@example.com",
  emailVerifiedAt: null,
};

const REFRESH_EXPIRY = new Date(Date.now() + MOBILE_REFRESH_TOKEN_SECONDS * 1000);

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  vi.clearAllMocks();
  mocks.enforceLimits.mockResolvedValue({ allowed: true });
  mocks.revokeRefreshTokenFamily.mockResolvedValue(undefined);
  mocks.revokeAllRefreshTokensForUser.mockResolvedValue(undefined);
  mocks.revokeAllUserSessions.mockResolvedValue(undefined);
});

describe("POST /api/v1/auth/login", () => {
  it("returns both tokens and the user", async () => {
    mocks.verifyMobileLoginCredentials.mockResolvedValue({
      ok: true,
      user: USER,
    });
    mocks.issueRefreshToken.mockResolvedValue({
      rawToken: "refresh-1",
      expiresAt: REFRESH_EXPIRY,
      familyId: "family-1",
    });

    const response = await loginPOST(
      request(
        "/api/v1/auth/login",
        JSON.stringify({
          email: "user@example.com",
          password: "secret",
          deviceName: " iPhone ",
        }),
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(body.user).toEqual(USER);
    expect(body.refreshToken).toBe("refresh-1");
    expect(body.refreshTokenExpiresAt).toBe(REFRESH_EXPIRY.toISOString());
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.accessTokenExpiresAt).toBe("string");

    expect(mocks.issueRefreshToken).toHaveBeenCalledWith("user-1", {
      deviceName: " iPhone ",
    });

    const details = await verifySessionTokenDetails(body.accessToken, SECRET);
    expect(details).toMatchObject({ userId: "user-1" });
    const accessExpiresAt = new Date(body.accessTokenExpiresAt).getTime();
    expect(accessExpiresAt).toBeGreaterThan(Date.now());
    expect(accessExpiresAt).toBeLessThanOrEqual(
      Date.now() + MOBILE_ACCESS_TOKEN_SECONDS * 1000,
    );
  });

  it("rejects malformed JSON with a generic 400", async () => {
    const response = await loginPOST(request("/api/v1/auth/login", "{"));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(mocks.verifyMobileLoginCredentials).not.toHaveBeenCalled();
  });

  it("maps invalid credentials to 401", async () => {
    mocks.verifyMobileLoginCredentials.mockResolvedValue({
      ok: false,
      status: 401,
      message: "ایمیل یا گذرواژه نادرست است.",
    });

    const response = await loginPOST(
      request(
        "/api/v1/auth/login",
        JSON.stringify({ email: "a@example.com", password: "x" }),
      ),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("maps rate limiting to 429", async () => {
    mocks.verifyMobileLoginCredentials.mockResolvedValue({
      ok: false,
      status: 429,
      message: "too many",
      retryAfterSeconds: 60,
    });

    const response = await loginPOST(
      request(
        "/api/v1/auth/login",
        JSON.stringify({ email: "a@example.com", password: "x" }),
      ),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("returns a NEW refresh token and a fresh access token", async () => {
    mocks.rotateRefreshToken.mockResolvedValue({
      ok: true,
      userId: "user-1",
      familyId: "family-1",
      deviceName: null,
      next: { rawToken: "refresh-2", expiresAt: REFRESH_EXPIRY },
    });

    const response = await refreshPOST(
      request(
        "/api/v1/auth/refresh",
        JSON.stringify({ refreshToken: "refresh-1" }),
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.refreshToken).toBe("refresh-2");
    expect(body.refreshToken).not.toBe("refresh-1");
    expect(body.refreshTokenExpiresAt).toBe(REFRESH_EXPIRY.toISOString());
    expect(mocks.rotateRefreshToken).toHaveBeenCalledWith("refresh-1");

    const details = await verifySessionTokenDetails(body.accessToken, SECRET);
    expect(details).toMatchObject({ userId: "user-1" });
  });

  it("returns an identical 401 for every failure reason", async () => {
    const responses: Array<{ status: number; body: unknown }> = [];

    for (const reason of [
      "invalid",
      "expired",
      "reused",
      "password_changed",
    ]) {
      mocks.rotateRefreshToken.mockResolvedValue({ ok: false, reason });
      const response = await refreshPOST(
        request(
          "/api/v1/auth/refresh",
          JSON.stringify({ refreshToken: "refresh-1" }),
        ),
      );
      responses.push({ status: response.status, body: await response.json() });
    }

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual(responses[0].body);
      expect(response.body).toMatchObject({ error: "unauthorized" });
    }
  });

  it("enforces the per-IP limit with a Retry-After header", async () => {
    mocks.enforceLimits.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 42,
    });

    const response = await refreshPOST(
      request(
        "/api/v1/auth/refresh",
        JSON.stringify({ refreshToken: "refresh-1" }),
      ),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it("rejects a missing or invalid body with 400", async () => {
    for (const body of [
      undefined,
      "{}",
      JSON.stringify({ refreshToken: 123 }),
      JSON.stringify({ refreshToken: "" }),
    ]) {
      const response = await refreshPOST(
        request("/api/v1/auth/refresh", body),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "bad_request" });
    }
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("is idempotent and always answers 200", async () => {
    const first = await logoutPOST(
      request(
        "/api/v1/auth/logout",
        JSON.stringify({ refreshToken: "refresh-1" }),
      ),
    );
    const second = await logoutPOST(
      request(
        "/api/v1/auth/logout",
        JSON.stringify({ refreshToken: "refresh-1" }),
      ),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect(await second.json()).toEqual({ ok: true });
    expect(mocks.revokeRefreshTokenFamily).toHaveBeenCalledTimes(2);
    expect(mocks.revokeRefreshTokenFamily).toHaveBeenCalledWith("refresh-1");
  });

  it("rejects a missing body with 400", async () => {
    const response = await logoutPOST(request("/api/v1/auth/logout"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(mocks.revokeRefreshTokenFamily).not.toHaveBeenCalled();
  });

  it("enforces the per-IP limit with a Retry-After header", async () => {
    mocks.enforceLimits.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 7,
    });

    const response = await logoutPOST(
      request(
        "/api/v1/auth/logout",
        JSON.stringify({ refreshToken: "refresh-1" }),
      ),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(mocks.revokeRefreshTokenFamily).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/logout-all", () => {
  it("requires a valid Bearer token", async () => {
    mocks.verifyMobileBearerToken.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const response = await logoutAllPOST(request("/api/v1/auth/logout-all"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
    expect(mocks.verifyMobileBearerToken).toHaveBeenCalledWith(null);
    expect(mocks.revokeAllUserSessions).not.toHaveBeenCalled();
    expect(mocks.revokeAllRefreshTokensForUser).not.toHaveBeenCalled();
  });

  it("revokes the watermark and all refresh tokens on success", async () => {
    mocks.verifyMobileBearerToken.mockResolvedValue({
      ok: true,
      userId: "user-1",
    });

    const response = await logoutAllPOST(
      request("/api/v1/auth/logout-all", undefined, {
        authorization: "Bearer access-token",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.verifyMobileBearerToken).toHaveBeenCalledWith(
      "Bearer access-token",
    );
    expect(mocks.revokeAllUserSessions).toHaveBeenCalledWith("user-1");
    expect(mocks.revokeAllRefreshTokensForUser).toHaveBeenCalledWith("user-1");
  });
});
