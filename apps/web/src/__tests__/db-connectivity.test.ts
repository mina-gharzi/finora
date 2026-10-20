/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  execute: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => ({ execute: h.execute }),
}));

vi.mock("pg", () => ({
  Pool: class {
    constructor() {}
  },
}));

import { checkDatabaseConnectivity } from "@/db";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://user:secret@localhost:5432/finora");
  h.execute.mockReset();
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
