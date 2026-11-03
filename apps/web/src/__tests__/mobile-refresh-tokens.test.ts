/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { hashAuthToken } from "@/lib/account-recovery";

const h = vi.hoisted(() => ({
  state: {
    transactionCalls: 0,
    deleteWheres: [] as unknown[],
    insertValues: [] as unknown[],
    updateSets: [] as unknown[],
    updateWheres: [] as unknown[],
    updateReturning: [] as unknown[],
    updateCalls: 0,
    selectRows: [] as unknown[],
    selectWheres: [] as unknown[],
  },
}));

vi.mock("@/db", () => ({
  getDb: () => createDb(),
}));

vi.mock("@/lib/users", () => ({
  findUserAuthValidAfter: vi.fn(),
}));

type Chain = {
  where: (condition?: unknown) => Chain;
  values: (value: unknown) => Chain;
  set: (value: unknown) => Chain;
  from: (table?: unknown) => Chain;
  limit: (n?: number) => Chain;
  returning: () => Promise<unknown[]>;
  then: (
    onFulfilled?: ((value: unknown[]) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

function makeChain(resolveTo: unknown[], kind: "delete" | "insert" | "update" | "select"): Chain {
  const chain: Chain = {
    where: (condition) => {
      if (kind === "delete") h.state.deleteWheres.push(condition);
      if (kind === "update") h.state.updateWheres.push(condition);
      if (kind === "select") h.state.selectWheres.push(condition);
      return chain;
    },
    values: (value) => {
      h.state.insertValues.push(value);
      return chain;
    },
    set: (value) => {
      h.state.updateSets.push(value);
      return chain;
    },
    from: () => chain,
    limit: () => chain,
    returning: () => Promise.resolve(resolveTo),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(resolveTo).then(onFulfilled, onRejected),
  };
  return chain;
}

function createDb() {
  const db = {
    delete: () => makeChain([], "delete"),
    insert: () => makeChain([], "insert"),
    update: () => {
      h.state.updateCalls += 1;
      return makeChain(h.state.updateReturning, "update");
    },
    select: () => makeChain(h.state.selectRows, "select"),
    transaction: (callback: (tx: unknown) => Promise<unknown>) => {
      h.state.transactionCalls += 1;
      return callback(db);
    },
  };
  return db;
}

import { findUserAuthValidAfter } from "@/lib/users";
import {
  issueRefreshToken,
  revokeAllRefreshTokensForUser,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
} from "@/lib/mobile/refresh-tokens";

const authValidAfter = vi.mocked(findUserAuthValidAfter);

function sqlText(condition: unknown): { sql: string; params: unknown[] } {
  return new PgDialect().sqlToQuery(condition as never);
}

function liveRow(over: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    userId: "user-1",
    familyId: "family-1",
    tokenHash: hashAuthToken("raw-token"),
    deviceName: null,
    createdAt: new Date(Date.now() - 60_000),
    lastUsedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...over,
  };
}

beforeEach(() => {
  h.state.transactionCalls = 0;
  h.state.deleteWheres = [];
  h.state.insertValues = [];
  h.state.updateSets = [];
  h.state.updateWheres = [];
  h.state.updateReturning = [];
  h.state.updateCalls = 0;
  h.state.selectRows = [];
  h.state.selectWheres = [];
  authValidAfter.mockReset();
  authValidAfter.mockResolvedValue({ authValidAfter: null });
});

describe("issueRefreshToken", () => {
  it("stores only the hash and prunes the user's stale rows", async () => {
    const issued = await issueRefreshToken("user-1");

    expect(h.state.transactionCalls).toBe(1);
    expect(issued.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const inserted = h.state.insertValues[0] as Record<string, unknown>;
    expect(inserted.userId).toBe("user-1");
    expect(inserted.familyId).toBe(issued.familyId);
    expect(inserted.tokenHash).toBe(hashAuthToken(issued.rawToken));
    expect(inserted.tokenHash).not.toBe(issued.rawToken);

    expect(h.state.deleteWheres).toHaveLength(1);
    const cleanup = sqlText(h.state.deleteWheres[0]);
    expect(cleanup.sql).toContain("user_id");
    expect(cleanup.sql).toContain("expires_at");
    expect(cleanup.sql).toContain("revoked_at");
    expect(cleanup.params).toContain("user-1");
  });

  it("trims and caps the device name", async () => {
    await issueRefreshToken("user-1", { deviceName: `  ${"x".repeat(80)}  ` });

    const inserted = h.state.insertValues[0] as Record<string, unknown>;
    expect(inserted.deviceName).toBe("x".repeat(64));
  });

  it("keeps an explicit family when one is supplied", async () => {
    const issued = await issueRefreshToken("user-1", { familyId: "family-9" });

    expect(issued.familyId).toBe("family-9");
    expect(h.state.insertValues[0]).toMatchObject({ familyId: "family-9" });
  });
});

describe("rotateRefreshToken", () => {
  it("revokes the presented token and issues a successor in the same family", async () => {
    h.state.updateReturning = [
      liveRow({ userId: "user-9", familyId: "family-7", deviceName: "iPhone" }),
    ];

    const result = await rotateRefreshToken("raw-token");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.userId).toBe("user-9");
    expect(result.familyId).toBe("family-7");
    expect(result.deviceName).toBe("iPhone");
    expect(result.next.rawToken).not.toBe("raw-token");
    expect(result.next.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // The CAS revokes the row and records its use.
    expect(h.state.updateSets[0]).toMatchObject({
      revokedAt: expect.anything(),
      lastUsedAt: expect.anything(),
    });
    const casWhere = sqlText(h.state.updateWheres[0]);
    expect(casWhere.params).toContain(hashAuthToken("raw-token"));
    expect(casWhere.sql).toContain("revoked_at");
    expect(casWhere.sql).toContain("expires_at");

    // The successor shares the family and stores only its hash.
    const inserted = h.state.insertValues[0] as Record<string, unknown>;
    expect(inserted.familyId).toBe("family-7");
    expect(inserted.tokenHash).toBe(hashAuthToken(result.next.rawToken));
    expect(inserted.deviceName).toBe("iPhone");
  });

  it("treats a revoked token as reuse and revokes the whole family", async () => {
    h.state.updateReturning = [];
    h.state.selectRows = [liveRow({ familyId: "family-7", revokedAt: new Date() })];

    const result = await rotateRefreshToken("raw-token");

    expect(result).toEqual({ ok: false, reason: "reused" });
    expect(h.state.updateCalls).toBe(2);
    const revokeWhere = sqlText(h.state.updateWheres[1]);
    expect(revokeWhere.params).toContain("family-7");
    expect(revokeWhere.sql).toContain("family_id");
    expect(revokeWhere.sql).toContain("revoked_at");
  });

  it("reports an expired token without revoking anything else", async () => {
    h.state.updateReturning = [];
    h.state.selectRows = [
      liveRow({ revokedAt: null, expiresAt: new Date(Date.now() - 1) }),
    ];

    await expect(rotateRefreshToken("raw-token")).resolves.toEqual({
      ok: false,
      reason: "expired",
    });
    expect(h.state.updateCalls).toBe(1);
  });

  it("reports an unknown token as invalid", async () => {
    h.state.updateReturning = [];
    h.state.selectRows = [];

    await expect(rotateRefreshToken("unknown")).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects a token created before authValidAfter and revokes its family", async () => {
    h.state.updateReturning = [
      liveRow({ familyId: "family-3", createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    authValidAfter.mockResolvedValue({
      authValidAfter: new Date("2026-02-01T00:00:00Z"),
    });

    await expect(rotateRefreshToken("raw-token")).resolves.toEqual({
      ok: false,
      reason: "password_changed",
    });

    expect(h.state.insertValues).toHaveLength(0);
    expect(h.state.updateCalls).toBe(2);
    const revokeWhere = sqlText(h.state.updateWheres[1]);
    expect(revokeWhere.params).toContain("family-3");
  });

  it("treats a missing user as a password change", async () => {
    h.state.updateReturning = [liveRow()];
    authValidAfter.mockResolvedValue(null);

    await expect(rotateRefreshToken("raw-token")).resolves.toEqual({
      ok: false,
      reason: "password_changed",
    });
  });
});

describe("revokeRefreshTokenFamily", () => {
  it("revokes the family and is idempotent", async () => {
    h.state.selectRows = [{ familyId: "family-4" }];

    await revokeRefreshTokenFamily("raw-token");
    await revokeRefreshTokenFamily("raw-token");

    expect(h.state.updateCalls).toBe(2);
    for (const condition of h.state.updateWheres) {
      const revokeWhere = sqlText(condition);
      expect(revokeWhere.params).toContain("family-4");
      expect(revokeWhere.sql).toContain("revoked_at");
    }
  });

  it("does nothing for an unknown token", async () => {
    h.state.selectRows = [];

    await revokeRefreshTokenFamily("unknown");

    expect(h.state.updateCalls).toBe(0);
  });
});

describe("revokeAllRefreshTokensForUser", () => {
  it("revokes only that user's live tokens", async () => {
    await revokeAllRefreshTokensForUser("user-1");

    expect(h.state.updateSets[0]).toMatchObject({ revokedAt: expect.anything() });
    const where = sqlText(h.state.updateWheres[0]);
    expect(where.params).toContain("user-1");
    expect(where.sql).toContain("user_id");
    expect(where.sql).toContain("revoked_at");
  });
});
