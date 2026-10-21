/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AccountRow } from "@/db/schema";

const h = vi.hoisted(() => ({
  state: {
    selectQueue: [] as unknown[][],
    insertResult: [] as unknown[],
    updateResult: [] as unknown[],
    deleteResult: [] as unknown[],
    insertedValues: [] as unknown[],
    updatedValues: [] as unknown[],
    insertCalls: 0,
    updateCalls: 0,
    deleteCalls: 0,
    whereConditions: [] as unknown[],
    lockArgs: [] as string[],
  },
}));

vi.mock("@/db", async () => {
  const { createFakeDb } = await import("./fake-db");
  return { getDb: () => createFakeDb(h.state) };
});

import {
  countTransactionsForAccount,
  createAccount,
  deleteAccount,
  findAccountForUser,
  listAccounts,
  setAccountArchived,
} from "@/lib/finance/accounts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

function accountRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: ACCOUNT_ID,
    userId: OWNER,
    name: "کیف پول نقدی",
    type: "cash",
    openingBalance: 0,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  h.state.selectQueue = [];
  h.state.insertResult = [];
  h.state.updateResult = [];
  h.state.deleteResult = [];
  h.state.insertedValues = [];
  h.state.updatedValues = [];
  h.state.insertCalls = 0;
  h.state.updateCalls = 0;
  h.state.deleteCalls = 0;
  h.state.lockArgs = [];
});

describe("createAccount", () => {
  it("creates an account owned by the session user", async () => {
    h.state.insertResult = [accountRow({ openingBalance: 50000 })];

    const result = await createAccount(OWNER, {
      name: "کیف پول نقدی",
      type: "cash",
      openingBalance: 50000,
    });

    expect(result.ok).toBe(true);
    expect(h.state.insertedValues[0]).toMatchObject({
      userId: OWNER,
      name: "کیف پول نقدی",
      type: "cash",
      openingBalance: 50000,
    });
  });

  it("ignores a forged userId supplied by the client", async () => {
    h.state.insertResult = [accountRow()];

    await createAccount(OWNER, {
      name: "بانک",
      type: "bank",
      openingBalance: 0,
      userId: "attacker",
    });

    expect(h.state.insertedValues[0]).toMatchObject({ userId: OWNER });
    expect(h.state.insertedValues[0]).not.toMatchObject({ userId: "attacker" });
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "abc", null])(
    "rejects an invalid opening balance (%j) without inserting",
    async (openingBalance) => {
      const result = await createAccount(OWNER, {
        name: "بانک",
        type: "bank",
        openingBalance,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors.openingBalance).toBeTruthy();
      expect(h.state.insertCalls).toBe(0);
    },
  );

  it("rejects an unknown account type", async () => {
    const result = await createAccount(OWNER, {
      name: "بیت‌کوین",
      type: "crypto",
      openingBalance: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.type).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });
});

describe("listAccounts", () => {
  it("queries and returns the owner's accounts", async () => {
    const rows = [accountRow(), accountRow({ id: OTHER, name: "بانک" })];
    h.state.selectQueue = [rows];

    await expect(listAccounts(OWNER)).resolves.toEqual(rows);
  });
});

describe("findAccountForUser", () => {
  it("returns an account owned by the user", async () => {
    const row = accountRow();
    h.state.selectQueue = [[row]];
    await expect(findAccountForUser(ACCOUNT_ID, OWNER)).resolves.toEqual(row);
  });

  it("returns null for a missing account", async () => {
    h.state.selectQueue = [[]];
    await expect(findAccountForUser(ACCOUNT_ID, OWNER)).resolves.toBeNull();
  });

  it("returns null when the account belongs to another user", async () => {
    h.state.selectQueue = [[accountRow({ userId: OTHER })]];
    await expect(findAccountForUser(ACCOUNT_ID, OWNER)).resolves.toBeNull();
  });
});

describe("deleteAccount", () => {
  it("deletes an account owned by the user when it has no transactions", async () => {
    h.state.selectQueue = [[accountRow()], [{ value: 0 }]];
    h.state.deleteResult = [accountRow()];

    await expect(deleteAccount(OWNER, ACCOUNT_ID)).resolves.toEqual({
      ok: true,
    });
    expect(h.state.deleteCalls).toBe(1);
  });

  it("never deletes another user's account", async () => {
    h.state.selectQueue = [[accountRow({ userId: OTHER })]];

    await expect(deleteAccount(OWNER, ACCOUNT_ID)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(h.state.deleteCalls).toBe(0);
  });

  it("returns a not-found result for a missing account", async () => {
    h.state.selectQueue = [[]];
    await expect(deleteAccount(OWNER, ACCOUNT_ID)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(h.state.deleteCalls).toBe(0);
  });

  it("refuses to delete an account that still has transactions", async () => {
    h.state.selectQueue = [[accountRow()], [{ value: 3 }]];

    await expect(deleteAccount(OWNER, ACCOUNT_ID)).resolves.toEqual({
      ok: false,
      reason: "has_transactions",
      transactionCount: 3,
    });
    expect(h.state.deleteCalls).toBe(0);
  });

  it("locks the account row FOR UPDATE before counting and deleting", async () => {
    h.state.selectQueue = [[accountRow()], [{ value: 0 }]];
    h.state.deleteResult = [accountRow()];

    await expect(deleteAccount(OWNER, ACCOUNT_ID)).resolves.toEqual({
      ok: true,
    });
    // Serializes deletion against a concurrent transaction insert, which takes
    // a conflicting key-share lock on the account row.
    expect(h.state.lockArgs).toEqual(["update"]);
  });

  it("scopes the delete statement to both the account id and the owner", async () => {
    h.state.selectQueue = [[accountRow()], [{ value: 0 }]];
    h.state.deleteResult = [accountRow()];

    await deleteAccount(OWNER, ACCOUNT_ID);

    expect(h.state.deleteCalls).toBe(1);
    const { sql, params } = new PgDialect().sqlToQuery(
      h.state.whereConditions[h.state.whereConditions.length - 1] as never,
    );
    expect(sql).toContain("id");
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(ACCOUNT_ID);
  });
});

describe("setAccountArchived", () => {
  it("archives an owned account with a single owner-scoped update", async () => {
    h.state.updateResult = [accountRow({ archived: true })];

    const result = await setAccountArchived(OWNER, ACCOUNT_ID, true);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.account.archived).toBe(true);
    expect(h.state.updateCalls).toBe(1);
    expect(h.state.updatedValues[0]).toMatchObject({ archived: true });

    const { sql, params } = new PgDialect().sqlToQuery(
      h.state.whereConditions[h.state.whereConditions.length - 1] as never,
    );
    expect(sql).toContain("id");
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(ACCOUNT_ID);
  });

  it("unarchives an owned account", async () => {
    h.state.updateResult = [accountRow({ archived: false })];

    const result = await setAccountArchived(OWNER, ACCOUNT_ID, false);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.account.archived).toBe(false);
    expect(h.state.updatedValues[0]).toMatchObject({ archived: false });
  });

  it("never flips another user's account and reports not_found", async () => {
    // The owner-scoped WHERE matches nothing for a foreign row.
    h.state.updateResult = [];

    await expect(setAccountArchived(OWNER, ACCOUNT_ID, true)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(h.state.updateCalls).toBe(1);
  });

  it("rejects a malformed id before touching the database", async () => {
    await expect(
      setAccountArchived(OWNER, "not-a-uuid", true),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
    expect(h.state.updateCalls).toBe(0);
  });
});

describe("countTransactionsForAccount", () => {
  it("returns the number of referencing transactions", async () => {
    h.state.selectQueue = [[{ value: 4 }]];
    await expect(countTransactionsForAccount(OWNER, ACCOUNT_ID)).resolves.toBe(
      4,
    );
  });

  it("defaults to zero when there are no rows", async () => {
    h.state.selectQueue = [[]];
    await expect(countTransactionsForAccount(OWNER, ACCOUNT_ID)).resolves.toBe(
      0,
    );
  });

  it("scopes the count to the owner so a foreign account cannot be probed", async () => {
    h.state.selectQueue = [[{ value: 0 }]];

    await countTransactionsForAccount(OWNER, ACCOUNT_ID);

    const { sql, params } = new PgDialect().sqlToQuery(
      h.state.whereConditions[h.state.whereConditions.length - 1] as never,
    );
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(ACCOUNT_ID);
  });
});
