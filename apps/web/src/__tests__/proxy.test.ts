/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";
import { signSessionToken } from "@/lib/session-token";

const STRONG_SECRET = "proxy-test-session-secret-0123456789abcdef";
const SHORT_SECRET = "too-short";

async function cookieHeader(token: string): Promise<Record<string, string>> {
  return { cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://127.0.0.1:3000${path}`, { headers });
}

async function run(path: string, headers: Record<string, string> = {}) {
  const { proxy } = await import("@/proxy");
  return proxy(request(path, headers));
}

/** Redirect host is normalized internally by Next; the path is what matters. */
function locationPath(response: { headers: { get(name: string): string | null } }) {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : null;
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", STRONG_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy route guard", () => {
  it("redirects unauthenticated requests away from protected routes", async () => {
    const response = await run("/accounts");
    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/login");
  });

  it("lets a request with a valid session reach the app", async () => {
    const token = await signSessionToken("user-1", STRONG_SECRET);
    const response = await run("/accounts", await cookieHeader(token));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects a session holder away from the auth pages", async () => {
    const token = await signSessionToken("user-1", STRONG_SECRET);
    const response = await run("/login", await cookieHeader(token));
    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/dashboard");
  });

  it("lets an anonymous visitor read the landing page", async () => {
    const response = await run("/");
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects a signed-in visitor from the landing page to the dashboard", async () => {
    const token = await signSessionToken("user-1", STRONG_SECRET);
    const response = await run("/", await cookieHeader(token));
    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/dashboard");
  });

  it("keeps the session holder off the marked revoked-session login page bounce only", async () => {
    // A cookie that still verifies here but fails the DAL watermark must be
    // able to settle on /login?session=expired — otherwise the proxy and the
    // DAL bounce it between /dashboard and /login forever.
    const token = await signSessionToken("user-1", STRONG_SECRET);
    const response = await run(
      "/login?session=expired",
      await cookieHeader(token),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps a session holder away from /login even with an unrelated query", async () => {
    const token = await signSessionToken("user-1", STRONG_SECRET);
    const response = await run("/login?passwordChanged=1", await cookieHeader(token));
    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/dashboard");
  });

  it("allows anonymous visitors onto the auth pages", async () => {
    const response = await run("/register");
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows anonymous visitors onto the forgot-password page", async () => {
    const response = await run("/forgot-password");
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps the forgot-password page away from signed-in users (like other auth pages)", async () => {
    const token = await signSessionToken("user-1", STRONG_SECRET);
    const response = await run("/forgot-password", await cookieHeader(token));
    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/dashboard");
  });

  it("lets anonymous visitors open token pages (token itself is the credential)", async () => {
    for (const path of [
      "/verify-email?token=abc",
      "/reset-password?token=abc",
      "/change-email?token=abc",
    ]) {
      const response = await run(path);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("keeps token pages reachable for signed-in users too (resend/verify while browsing)", async () => {
    const token = await signSessionToken("user-1", STRONG_SECRET);
    for (const path of [
      "/verify-email?token=abc",
      "/reset-password?token=abc",
      "/change-email?token=abc",
    ]) {
      const response = await run(path, await cookieHeader(token));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("lets anonymous visitors reach the health endpoint", async () => {
    const response = await run("/api/health");
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps a signed-in visitor on the health endpoint (no auth-page bounce)", async () => {
    const token = await signSessionToken("user-1", STRONG_SECRET);
    const response = await run("/api/health", await cookieHeader(token));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("treats a token signed with a different secret as unauthenticated", async () => {
    const token = await signSessionToken(
      "user-1",
      "some-other-secret-value-9876543210",
    );
    const response = await run("/accounts", await cookieHeader(token));
    expect(locationPath(response)).toBe("/login");
  });

  it("treats a tampered token as unauthenticated", async () => {
    const token = await signSessionToken("user-1", STRONG_SECRET);
    const response = await run(
      "/accounts",
      await cookieHeader(`${token}tampered`),
    );
    expect(locationPath(response)).toBe("/login");
  });

  it("treats a missing token as unauthenticated", async () => {
    const response = await run("/transactions");
    expect(locationPath(response)).toBe("/login");
  });
});

describe("proxy secret validation", () => {
  it("fails closed when SESSION_SECRET is missing, even for a signed cookie", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    const token = await signSessionToken("user-1", STRONG_SECRET);
    const response = await run("/accounts", await cookieHeader(token));
    expect(locationPath(response)).toBe("/login");
  });

  it("refuses to verify with a secret below the minimum length", async () => {
    vi.stubEnv("SESSION_SECRET", SHORT_SECRET);
    // A cookie genuinely signed with the weak secret must still be rejected:
    // the proxy must not perform HMAC verification with a key the server-side
    // session reader would refuse to use.
    const token = await signSessionToken("user-1", SHORT_SECRET);
    const response = await run("/accounts", await cookieHeader(token));
    expect(locationPath(response)).toBe("/login");
  });

  it("verifies normally when the secret only differs by surrounding whitespace", async () => {
    vi.stubEnv("SESSION_SECRET", `  ${STRONG_SECRET}\n`);
    const token = await signSessionToken("user-1", STRONG_SECRET);
    const response = await run("/accounts", await cookieHeader(token));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });
});
