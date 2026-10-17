/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionRow } from "@/db/schema";

const h = vi.hoisted(() => ({
  state: {
    selectQueue: [] as unknown[][],
    insertResult: [] as unknown[],
    deleteResult: [] as unknown[],
    insertedValues: [] as unknown[],
    insertCalls: 0,
    deleteCalls: 0,
  },
}));

vi.mock("@/db", async () => {
  const { createFakeDb } = await import("./fake-db");
  return { getDb: () => createFakeDb(h.state) };
});

import {
  createTransaction,
  deleteTransaction,
  findTransactionForUser,
  listTransactions,
} from "@/lib/finance/transactions";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";

const ownedAccount = { id: ACCOUNT_ID, userId: OWNER };
const ownedCategory = { id: CATEGORY_ID, userId: OWNER };

function transactionRow(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    userId: OWNER,
    accountId: ACCOUNT_ID,
    categoryId: null,
    type: "expense",
    amount: 25000,
    occurredOn: "2026-10-16",
    note: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const baseInput = {
  accountId: ACCOUNT_ID,
  categoryId: null,
  type: "expense",
  amount: 25000,
  occurredOn: "2026-10-16",
  note: "",
};

beforeEach(() => {
  h.state.selectQueue = [];
  h.state.insertResult = [];
  h.state.deleteResult = [];
  h.state.insertedValues = [];
  h.state.insertCalls = 0;
  h.state.deleteCalls = 0;
});

describe("createTransaction — ownership", () => {
  it("inserts an expense against an account owned by the session user", async () => {
    h.state.selectQueue = [[ownedAccount]];
    h.state.insertResult = [transactionRow()];

    const result = await createTransaction(OWNER, baseInput);

    expect(result.ok).toBe(true);
    expect(h.state.insertedValues[0]).toMatchObject({
      userId: OWNER,
      accountId: ACCOUNT_ID,
      type: "expense",
      amount: 25000,
    });
  });

  it("inserts an income transaction", async () => {
    h.state.selectQueue = [[ownedAccount]];
    h.state.insertResult = [transactionRow({ type: "income" })];

    const result = await createTransaction(OWNER, {
      ...baseInput,
      type: "income",
      amount: 1000,
    });

    expect(result.ok).toBe(true);
    expect(h.state.insertedValues[0]).toMatchObject({ type: "income", amount: 1000 });
  });

  it("refuses to post onto another user's account", async () => {
    h.state.selectQueue = [[{ id: ACCOUNT_ID, userId: OTHER }]];

    const result = await createTransaction(OWNER, baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.accountId).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });

  it("rejects a missing account reference", async () => {
    h.state.selectQueue = [[]];

    const result = await createTransaction(OWNER, baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.accountId).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });

  it("refuses to attach another user's category", async () => {
    h.state.selectQueue = [[ownedAccount], [{ id: CATEGORY_ID, userId: OTHER }]];

    const result = await createTransaction(OWNER, {
      ...baseInput,
      categoryId: CATEGORY_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.categoryId).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });

  it("accepts an owned category", async () => {
    h.state.selectQueue = [[ownedAccount], [ownedCategory]];
    h.state.insertResult = [transactionRow({ categoryId: CATEGORY_ID })];

    const result = await createTransaction(OWNER, {
      ...baseInput,
      categoryId: CATEGORY_ID,
    });

    expect(result.ok).toBe(true);
    expect(h.state.insertedValues[0]).toMatchObject({ categoryId: CATEGORY_ID });
  });

  it("ignores a forged userId supplied by the client", async () => {
    h.state.selectQueue = [[ownedAccount]];
    h.state.insertResult = [transactionRow()];

    await createTransaction(OWNER, { ...baseInput, userId: "attacker" });

    expect(h.state.insertedValues[0]).toMatchObject({ userId: OWNER });
  });
});

describe("createTransaction — validation", () => {
  it.each([0, -25000, 12.5, "12.5", "abc", Number.MAX_SAFE_INTEGER + 1, NaN])(
    "rejects amount %j before touching the database",
    async (amount) => {
      const result = await createTransaction(OWNER, { ...baseInput, amount });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors.amount).toBeTruthy();
      expect(h.state.insertCalls).toBe(0);
    },
  );

  it("rejects an unknown transaction type", async () => {
    const result = await createTransaction(OWNER, {
      ...baseInput,
      type: "transfer",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.type).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });

  it("rejects a malformed account id", async () => {
    const result = await createTransaction(OWNER, {
      ...baseInput,
      accountId: "not-a-uuid",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.accountId).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });
});

describe("createTransaction — monetary precision", () => {
  it("persists the largest safe integer amount exactly", async () => {
    const max = Number.MAX_SAFE_INTEGER;
    h.state.selectQueue = [[ownedAccount]];
    h.state.insertResult = [transactionRow({ amount: max })];

    const result = await createTransaction(OWNER, {
      ...baseInput,
      amount: max,
    });

    expect(result.ok).toBe(true);
    expect(h.state.insertedValues[0]).toMatchObject({ amount: max });
    if (result.ok) expect(result.transaction.amount).toBe(max);
  });

  it("keeps occurredOn as an ISO date string", async () => {
    h.state.selectQueue = [[ownedAccount]];
    h.state.insertResult = [transactionRow({ occurredOn: "2026-01-02" })];

    const result = await createTransaction(OWNER, {
      ...baseInput,
      occurredOn: "2026-01-02",
    });

    expect(result.ok).toBe(true);
    expect(h.state.insertedValues[0]).toMatchObject({ occurredOn: "2026-01-02" });
  });
});

describe("transaction reads and deletes are owner-scoped", () => {
  it("lists the owner's transactions", async () => {
    const rows = [transactionRow()];
    h.state.selectQueue = [rows];
    await expect(listTransactions(OWNER)).resolves.toEqual(rows);
  });

  it("returns null when reading another user's transaction", async () => {
    h.state.selectQueue = [[transactionRow({ userId: OTHER })]];
    await expect(
      findTransactionForUser(transactionRow().id, OWNER),
    ).resolves.toBeNull();
  });

  it("never deletes another user's transaction", async () => {
    h.state.selectQueue = [[transactionRow({ userId: OTHER })]];
    await expect(
      deleteTransaction(OWNER, transactionRow().id),
    ).resolves.toBe(false);
    expect(h.state.deleteCalls).toBe(0);
  });

  it("deletes the owner's transaction", async () => {
    h.state.selectQueue = [[transactionRow()]];
    await expect(
      deleteTransaction(OWNER, transactionRow().id),
    ).resolves.toBe(true);
    expect(h.state.deleteCalls).toBe(1);
  });
});
