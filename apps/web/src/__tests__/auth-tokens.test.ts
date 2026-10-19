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
    updateReturning: [] as { userId: string }[],
  },
}));

vi.mock("@/db", () => ({
  getDb: () => createDb(),
}));

type Chain = {
  where: (condition?: unknown) => Chain;
  values: (value: unknown) => Chain;
  set: (value: unknown) => Chain;
  returning: () => Promise<unknown[]>;
  then: (
    onFulfilled?: ((value: unknown[]) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

function makeChain(resolveTo: unknown[]): Chain {
  const chain: Chain = {
    where: (condition) => {
      h.state.deleteWheres.push(condition);
      h.state.updateWheres.push(condition);
      return chain;
    },
    values: (value: unknown) => {
      h.state.insertValues.push(value);
      return chain;
    },
    set: (value: unknown) => {
      h.state.updateSets.push(value);
      return chain;
    },
    returning: () => Promise.resolve(resolveTo),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(resolveTo).then(onFulfilled, onRejected),
  };
  return chain;
}

function createDb() {
  const db = {
    delete: () => makeChain([]),
    insert: () => makeChain([]),
    update: () => makeChain(h.state.updateReturning),
    transaction: (callback: (tx: unknown) => Promise<unknown>) => {
      h.state.transactionCalls += 1;
      return callback(db);
    },
  };
  return db;
}

import {
  consumeEmailVerifyToken,
  consumePasswordResetTokenAndSetPassword,
  consumeAuthToken,
  discardAuthToken,
  issueAuthToken,
} from "@/lib/auth-tokens";

function sqlText(condition: unknown): { sql: string; params: unknown[] } {
  return new PgDialect().sqlToQuery(condition as never);
}

beforeEach(() => {
  h.state.transactionCalls = 0;
  h.state.deleteWheres = [];
  h.state.insertValues = [];
  h.state.updateSets = [];
  h.state.updateWheres = [];
  h.state.updateReturning = [];
});

describe("issueAuthToken", () => {
  it("runs in a transaction, stores only the hash, and returns the raw token", async () => {
    const issued = await issueAuthToken("user-1", "password_reset");

    expect(h.state.transactionCalls).toBe(1);
    expect(issued.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(h.state.insertValues).toHaveLength(1);
    const inserted = h.state.insertValues[0] as Record<string, unknown>;
    expect(inserted.userId).toBe("user-1");
    expect(inserted.purpose).toBe("password_reset");
    // Only the hash is persisted — never the raw link token.
    expect(inserted.tokenHash).toBe(hashAuthToken(issued.rawToken));
    expect(inserted.tokenHash).not.toBe(issued.rawToken);

    // Cleanup of the user's previous tokens happened in the same transaction.
    expect(h.state.deleteWheres.length).toBeGreaterThanOrEqual(1);
    const cleanup = sqlText(h.state.deleteWheres[0]);
    expect(cleanup.sql).toContain("user_id");
    expect(cleanup.sql).toContain("purpose");
    expect(cleanup.params).toContain("user-1");
    expect(cleanup.params).toContain("password_reset");
  });
});

describe("consumeAuthToken (single purpose-bound CAS)", () => {
  it("issues a conditional update keyed by hash, purpose, liveness and expiry", async () => {
    h.state.updateReturning = [{ userId: "user-9" }];
    const raw = "raw-token";

    await expect(consumeAuthToken(raw, "email_verify")).resolves.toBe("user-9");

    expect(h.state.updateSets[0]).toMatchObject({ consumedAt: expect.anything() });
    const where = sqlText(h.state.updateWheres[0]);
    // purpose binding: the WHERE names the purpose column and its value.
    expect(where.sql).toContain("purpose");
    expect(where.params).toContain("email_verify");
    expect(where.params).toContain(hashAuthToken(raw));
    // single use + expiry: the statement only matches live tokens.
    expect(where.sql).toContain("consumed_at");
    expect(where.sql).toContain("expires_at");
  });

  it("returns null when no live token matches (unknown/expired/used/wrong purpose)", async () => {
    h.state.updateReturning = [];
    await expect(consumeAuthToken("nope", "password_reset")).resolves.toBeNull();
  });
});

describe("consumePasswordResetTokenAndSetPassword", () => {
  it("consumes the token and updates the password inside one transaction", async () => {
    h.state.updateReturning = [{ userId: "user-4" }];

    await expect(
      consumePasswordResetTokenAndSetPassword("raw", "new-hash"),
    ).resolves.toBe("user-4");

    expect(h.state.transactionCalls).toBe(1);
    expect(h.state.updateSets).toHaveLength(2);
    expect(h.state.updateSets[1]).toMatchObject({
      passwordHash: "new-hash",
      authValidAfter: expect.anything(),
    });
  });

  it("does not touch the user when the token cannot be consumed", async () => {
    h.state.updateReturning = [];
    await expect(
      consumePasswordResetTokenAndSetPassword("raw", "new-hash"),
    ).resolves.toBeNull();
    expect(h.state.updateSets).toHaveLength(1);
  });

  it("binds the update to the password_reset purpose", async () => {
    h.state.updateReturning = [{ userId: "user-4" }];
    await consumePasswordResetTokenAndSetPassword("raw", "new-hash");
    const where = sqlText(h.state.updateWheres[0]);
    expect(where.params).toContain("password_reset");
  });
});

describe("consumeEmailVerifyToken", () => {
  it("consumes and records verification atomically, idempotently", async () => {
    h.state.updateReturning = [{ userId: "user-8" }];
    await expect(consumeEmailVerifyToken("raw")).resolves.toBe("user-8");
    expect(h.state.transactionCalls).toBe(1);
    // The verified timestamp uses COALESCE so repeats keep the first value.
    expect(h.state.updateSets[1]).toHaveProperty("emailVerifiedAt");
    const setSql = new PgDialect().sqlToQuery(
      (h.state.updateSets[1] as { emailVerifiedAt: unknown }).emailVerifiedAt as never,
    );
    expect(setSql.sql).toContain("coalesce");
  });

  it("rejects a reset token presented here (purpose mismatch)", async () => {
    h.state.updateReturning = [];
    await expect(consumeEmailVerifyToken("raw")).resolves.toBeNull();
  });
});

describe("discardAuthToken", () => {
  it("deletes only the user's live tokens for that purpose", async () => {
    await discardAuthToken("user-2", "password_reset");
    const where = sqlText(h.state.deleteWheres[0]);
    expect(where.params).toContain("user-2");
    expect(where.params).toContain("password_reset");
    expect(where.sql).toContain("consumed_at");
  });
});
