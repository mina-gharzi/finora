/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  checkDatabaseConnectivity: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@/db", () => ({
  checkDatabaseConnectivity: h.checkDatabaseConnectivity,
}));

import { GET } from "@/app/api/health/route";

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/health", { headers });
}

beforeEach(() => {
  h.checkDatabaseConnectivity.mockReset();
  h.checkDatabaseConnectivity.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("returns 200 with a minimal ok body when the database is reachable", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(h.checkDatabaseConnectivity).toHaveBeenCalledTimes(1);
  });

  it("returns 503 with a minimal body when the database is unreachable", async () => {
    h.checkDatabaseConnectivity.mockResolvedValue(false);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("disables caching on both success and failure", async () => {
    const ok = await GET(request());
    expect(ok.headers.get("cache-control")).toBe("no-store, max-age=0");

    h.checkDatabaseConnectivity.mockResolvedValue(false);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = await GET(request());
    expect(down.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("sets a JSON content type", async () => {
    const response = await GET(request());
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
  });

  it("never leaks internals when the check fails", async () => {
    // Even if a driver error somehow reached the handler, the body must stay
    // a fixed, generic document.
    h.checkDatabaseConnectivity.mockResolvedValue(false);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(request());
    const text = await response.text();

    expect(text).toBe('{"status":"unavailable"}');
    for (const needle of [
      "DATABASE_URL",
      "postgres://",
      "password",
      "stack",
      "SELECT",
      "ECONNREFUSED",
    ]) {
      expect(text).not.toContain(needle);
    }
  });

  it("logs a safe, structured event on failure without secrets", async () => {
    h.checkDatabaseConnectivity.mockResolvedValue(false);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await GET(
      request({
        "x-request-id": "trace-123",
        authorization: "Bearer super-secret-token",
        cookie: "finora_session=leak-me",
      }),
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = String(errorSpy.mock.calls[0][0]);
    const record = JSON.parse(logged);
    expect(record.level).toBe("error");
    expect(record.event).toBe("health.database.unavailable");
    expect(record.requestId).toBe("trace-123");
    expect(logged).not.toContain("super-secret-token");
    expect(logged).not.toContain("leak-me");
    expect(logged).not.toContain("Bearer");
  });

  it("propagates a generated request id into the failure log", async () => {
    h.checkDatabaseConnectivity.mockResolvedValue(false);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await GET(request());

    const record = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(typeof record.requestId).toBe("string");
    expect((record.requestId as string).length).toBeGreaterThan(0);
  });

  it("does not require authentication", async () => {
    // No session/cookie is present, yet a healthy probe still succeeds.
    const response = await GET(request());
    expect(response.status).toBe(200);
  });
});
