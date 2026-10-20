import { expect, test } from "./fixtures";

/**
 * The health endpoint is intentionally unauthenticated and touches no user
 * data, so these tests hit it directly — no `authenticate` needed.
 */
test.describe("health endpoint", () => {
  test("reports ok with a minimal body and no-store caching", async ({
    page,
  }) => {
    const response = await page.request.get("/api/health");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("is reachable without a session", async ({ request }) => {
    // A bare API request with no cookies must still succeed when the DB is up.
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
  });

  test("does not leak internals in the body", async ({ request }) => {
    const response = await request.get("/api/health");
    const text = await response.text();

    expect(text).toBe('{"status":"ok"}');
    for (const needle of [
      "DATABASE_URL",
      "postgres://",
      "password",
      "stack",
      "SELECT",
    ]) {
      expect(text).not.toContain(needle);
    }
  });
});
