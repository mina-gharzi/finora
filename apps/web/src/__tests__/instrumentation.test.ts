/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const STRONG_SECRET = "instrumentation-test-secret-0123456789";
const DATABASE_URL = "postgres://user:pass@127.0.0.1:15432/finora";

async function importRegister() {
  vi.resetModules();
  const loaded = await import("@/instrumentation");
  return loaded.register;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production startup validation", () => {
  it("fails a production server boot when SESSION_SECRET is missing", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("DATABASE_URL", DATABASE_URL);

    await expect(importRegister().then((register) => register())).rejects.toThrow(
      /SESSION_SECRET/,
    );
  });

  it("fails when SESSION_SECRET is shorter than the minimum length, without echoing it", async () => {
    const weak = "weak-secret-value";
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", weak);
    vi.stubEnv("DATABASE_URL", DATABASE_URL);

    const register = await importRegister();
    await expect(register()).rejects.toThrow(/at least 32/);
    await expect(register()).rejects.not.toThrow(weak);
  });

  it("fails when DATABASE_URL is missing", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", STRONG_SECRET);
    vi.stubEnv("DATABASE_URL", "");

    await expect(importRegister().then((register) => register())).rejects.toThrow(
      /DATABASE_URL/,
    );
  });

  it("passes with a strong secret and a database url", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", STRONG_SECRET);
    vi.stubEnv("DATABASE_URL", DATABASE_URL);

    const register = await importRegister();
    await expect(register()).resolves.toBeUndefined();
  });

  it("skips validation during the production build phase", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("DATABASE_URL", "");

    const register = await importRegister();
    await expect(register()).resolves.toBeUndefined();
  });

  it("skips validation outside the nodejs runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("DATABASE_URL", "");

    const register = await importRegister();
    await expect(register()).resolves.toBeUndefined();
  });

  it("keeps development lazy instead of failing at boot", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("DATABASE_URL", "");

    const register = await importRegister();
    await expect(register()).resolves.toBeUndefined();
  });
});
