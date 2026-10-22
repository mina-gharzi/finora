/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  execute: vi.fn<(query: unknown) => Promise<unknown>>(),
  poolListeners: [] as Array<(error: Error) => void>,
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => ({ execute: h.execute }),
}));

vi.mock("pg", () => ({
  Pool: class {
    constructor() {}
    on(event: string, listener: (error: Error) => void) {
      if (event === "error") h.poolListeners.push(listener);
    }
  },
}));

import {
  checkDatabaseConnectivity,
  checkRateLimitStoreReady,
} from "@/db";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://user:secret@localhost:5432/finora");
  h.execute.mockReset();
  h.poolListeners.length = 0;
  delete (globalThis as { finoraPool?: unknown }).finoraPool;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("checkDatabaseConnectivity", () => {
  it("resolves true and runs a lightweight SELECT 1 when the DB responds", async () => {
    h.execute.mockResolvedValue([{ "?column?": 1 }]);

    await expect(checkDatabaseConnectivity()).resolves.toBe(true);
    expect(h.execute).toHaveBeenCalledTimes(1);

    // The probe must not touch application tables.
    const queryArg = h.execute.mock.calls[0][0] as unknown;
    const text = JSON.stringify(queryArg);
    expect(text.toLowerCase()).toContain("select 1");
    expect(text.toLowerCase()).not.toContain("from");
  });

  it("resolves false when the query rejects, without surfacing the error", async () => {
    h.execute.mockRejectedValue(
      new Error("connect ECONNREFUSED postgres://user:secret@host"),
    );

    await expect(checkDatabaseConnectivity()).resolves.toBe(false);
  });
});

describe("checkRateLimitStoreReady", () => {
  it("resolves true when the rate-limit table exists", async () => {
    h.execute.mockResolvedValue({
      rows: [{ table_name: "rate_limit_counters" }],
    });

    await expect(checkRateLimitStoreReady()).resolves.toBe(true);

    const text = JSON.stringify(h.execute.mock.calls[0][0]).toLowerCase();
    expect(text).toContain("to_regclass");
    expect(text).toContain("rate_limit_counters");
  });

  it("resolves false when the table is missing (migrations never applied)", async () => {
    // `to_regclass` returns NULL for an unknown relation.
    h.execute.mockResolvedValue({ rows: [{ table_name: null }] });

    await expect(checkRateLimitStoreReady()).resolves.toBe(false);
  });

  it("resolves false when the query rejects", async () => {
    h.execute.mockRejectedValue(
      Object.assign(new Error("undefined table"), { code: "42P01" }),
    );

    await expect(checkRateLimitStoreReady()).resolves.toBe(false);
  });
});

describe("pool", () => {
  it("registers an error listener so an idle-client failure cannot crash the process", async () => {
    await checkDatabaseConnectivity();

    expect(h.poolListeners).toHaveLength(1);
  });

  it("logs a pool error instead of throwing it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await checkDatabaseConnectivity();

    h.poolListeners[0]?.(Object.assign(new Error("idle client ended"), {
      code: "ECONNRESET",
    }));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const record = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(record.event).toBe("db.pool.error");
    expect(record.level).toBe("error");
  });
});
