/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TransactionRow } from "@/db/schema";

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
    limitArgs: [] as number[],
    offsetArgs: [] as number[],
    orderByArgs: [] as unknown[],
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
  listTransactionHistory,
  listTransactionHistoryForExport,
  listTransactions,
  updateTransaction,
} from "@/lib/finance/transactions";
import { TRANSACTION_HISTORY_PAGE_SIZE } from "@/lib/finance/history-query";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";

const ownedAccount = { id: ACCOUNT_ID, userId: OWNER };
const ownedCategory = { id: CATEGORY_ID, userId: OWNER, kind: "expense" };

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
  h.state.updateResult = [];
  h.state.deleteResult = [];
  h.state.insertedValues = [];
  h.state.updatedValues = [];
  h.state.insertCalls = 0;
  h.state.updateCalls = 0;
  h.state.deleteCalls = 0;
  h.state.whereConditions = [];
  h.state.limitArgs = [];
  h.state.offsetArgs = [];
  h.state.orderByArgs = [];
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

  it("refuses a category whose kind does not match the transaction type", async () => {
    h.state.selectQueue = [[ownedAccount], [{ ...ownedCategory, kind: "income" }]];

    const result = await createTransaction(OWNER, {
      ...baseInput,
      categoryId: CATEGORY_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.categoryId).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
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

  it("deletes the owner's transaction with an owner-scoped statement", async () => {
    h.state.deleteResult = [transactionRow()];

    await expect(
      deleteTransaction(OWNER, transactionRow().id),
    ).resolves.toBe(true);

    expect(h.state.deleteCalls).toBe(1);
    const { sql, params } = new PgDialect().sqlToQuery(
      h.state.whereConditions[h.state.whereConditions.length - 1] as never,
    );
    expect(sql).toContain("id");
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(transactionRow().id);
  });

  it("reports false when the owner-scoped delete matches no row", async () => {
    h.state.deleteResult = [];

    await expect(
      deleteTransaction(OWNER, transactionRow().id),
    ).resolves.toBe(false);
    expect(h.state.deleteCalls).toBe(1);
  });

  it("rejects a malformed id before touching the database", async () => {
    await expect(deleteTransaction(OWNER, "not-a-uuid")).resolves.toBe(false);
    expect(h.state.deleteCalls).toBe(0);
  });
});

describe("updateTransaction — ownership and validation", () => {
  const newInput = {
    accountId: ACCOUNT_ID,
    categoryId: null,
    type: "income",
    amount: 99000,
    occurredOn: "2026-09-09",
    note: "ویرایش شد",
  };

  it("updates an owned transaction with an owner-scoped statement", async () => {
    h.state.selectQueue = [[transactionRow()], [ownedAccount]];
    h.state.updateResult = [
      transactionRow({ type: "income", amount: 99000 }),
    ];

    const result = await updateTransaction(OWNER, transactionRow().id, newInput);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transaction.amount).toBe(99000);
    expect(h.state.updateCalls).toBe(1);
    expect(h.state.updatedValues[0]).toMatchObject({
      accountId: ACCOUNT_ID,
      type: "income",
      amount: 99000,
      occurredOn: "2026-09-09",
    });

    const { sql, params } = new PgDialect().sqlToQuery(
      h.state.whereConditions[h.state.whereConditions.length - 1] as never,
    );
    expect(sql).toContain("id");
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(transactionRow().id);
  });

  it("does not touch the database for a malformed id", async () => {
    const result = await updateTransaction(OWNER, "not-a-uuid", newInput);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(h.state.updateCalls).toBe(0);
    expect(h.state.selectQueue).toEqual([]);
  });

  it("rejects invalid input before loading the transaction", async () => {
    const result = await updateTransaction(OWNER, transactionRow().id, {
      ...newInput,
      amount: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.fieldErrors.amount).toBeTruthy();
    }
    expect(h.state.updateCalls).toBe(0);
  });

  it("fails safely when the transaction belongs to another user", async () => {
    h.state.selectQueue = [[transactionRow({ userId: OTHER })]];

    const result = await updateTransaction(OWNER, transactionRow().id, newInput);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(h.state.updateCalls).toBe(0);
  });

  it("fails safely when the transaction does not exist", async () => {
    h.state.selectQueue = [[]];

    const result = await updateTransaction(OWNER, transactionRow().id, newInput);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(h.state.updateCalls).toBe(0);
  });

  it("refuses to move a transaction onto another user's account", async () => {
    h.state.selectQueue = [
      [transactionRow()],
      [{ id: ACCOUNT_ID, userId: OTHER }],
    ];

    const result = await updateTransaction(OWNER, transactionRow().id, newInput);

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.fieldErrors.accountId).toBeTruthy();
    }
    expect(h.state.updateCalls).toBe(0);
  });

  it("refuses a category whose kind does not match the new type", async () => {
    h.state.selectQueue = [
      [transactionRow()],
      [ownedAccount],
      [{ ...ownedCategory, kind: "expense" }],
    ];

    const result = await updateTransaction(OWNER, transactionRow().id, {
      ...newInput,
      categoryId: CATEGORY_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.fieldErrors.categoryId).toBeTruthy();
    }
    expect(h.state.updateCalls).toBe(0);
  });

  it("reports not_found when the guarded update matches no row", async () => {
    h.state.selectQueue = [[transactionRow()], [ownedAccount]];
    h.state.updateResult = [];

    const result = await updateTransaction(OWNER, transactionRow().id, newInput);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(h.state.updateCalls).toBe(1);
  });
});

describe("listTransactionHistory", () => {
  const baseQuery = {
    type: null,
    accountId: null,
    from: null,
    to: null,
    search: null,
    page: 1,
  };

  function historyRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "66666666-6666-4666-8666-666666666666",
      type: "expense",
      amount: 15000,
      occurredOn: "2026-10-10",
      note: "خرید روزانه",
      accountId: ACCOUNT_ID,
      accountName: "بانک ملی",
      categoryName: "خرید",
      ...overrides,
    };
  }

  function lastWhere() {
    return h.state.whereConditions[h.state.whereConditions.length - 1];
  }

  it("maps joined rows and reports no further page", async () => {
    h.state.selectQueue = [[historyRow()]];

    const result = await listTransactionHistory(OWNER, baseQuery);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      accountName: "بانک ملی",
      categoryName: "خرید",
      type: "expense",
      amount: 15000,
    });
    expect(result.hasMore).toBe(false);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(TRANSACTION_HISTORY_PAGE_SIZE);
  });

  it("returns a null category name when the join finds none", async () => {
    h.state.selectQueue = [[historyRow({ categoryName: null })]];

    const result = await listTransactionHistory(OWNER, baseQuery);

    expect(result.items[0].categoryName).toBeNull();
  });

  it("slices to the page size and flags hasMore when an extra row is returned", async () => {
    const rows = Array.from({ length: TRANSACTION_HISTORY_PAGE_SIZE + 1 }, (_, i) =>
      historyRow({ id: `row-${i}` }),
    );
    h.state.selectQueue = [rows];

    const result = await listTransactionHistory(OWNER, baseQuery);

    expect(result.items).toHaveLength(TRANSACTION_HISTORY_PAGE_SIZE);
    expect(result.hasMore).toBe(true);
  });

  it("always scopes the query to the session owner", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistory(OWNER, baseQuery);

    const { sql, params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
  });

  it("applies an account filter without dropping the owner scope", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistory(OWNER, { ...baseQuery, accountId: OTHER });

    const { sql, params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).toContain("user_id");
    expect(sql).toContain("account_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(OTHER);
  });

  it("applies type and inclusive date-range filters", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistory(OWNER, {
      ...baseQuery,
      type: "income",
      from: "2026-01-01",
      to: "2026-12-31",
    });

    const { sql, params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).toContain("occurred_on");
    expect(params).toContain("income");
    expect(params).toContain("2026-01-01");
    expect(params).toContain("2026-12-31");
  });

  it("searches the note with a bound ILIKE pattern", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistory(OWNER, { ...baseQuery, search: "خرید" });

    const { sql, params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).toContain("note");
    expect(sql).toContain("ilike");
    expect(params).toContain("%خرید%");
  });

  it("escapes LIKE wildcards so % and _ match literally", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistory(OWNER, { ...baseQuery, search: "50%_off" });

    const { params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(params).toContain("%50\\%\\_off%");
  });

  it("keeps the owner scope when a search is active", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistory(OWNER, { ...baseQuery, search: "خرید" });

    const { sql, params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain("%خرید%");
  });

  it("composes the search with the other filters", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistory(OWNER, {
      ...baseQuery,
      type: "expense",
      accountId: ACCOUNT_ID,
      search: "خرید",
    });

    const { sql, params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).toContain("user_id");
    expect(sql).toContain("type");
    expect(sql).toContain("account_id");
    expect(sql).toContain("note");
    expect(params).toContain(OWNER);
    expect(params).toContain("expense");
    expect(params).toContain(ACCOUNT_ID);
    expect(params).toContain("%خرید%");
  });

  it("adds no note condition when there is no search", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistory(OWNER, baseQuery);

    const { sql } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).not.toContain("note");
  });

  it("normalizes a page below one to the first page", async () => {
    h.state.selectQueue = [[]];

    const result = await listTransactionHistory(OWNER, { ...baseQuery, page: 0 });

    expect(result.page).toBe(1);
  });

  it("applies limit and offset for the requested page", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistory(OWNER, { ...baseQuery, page: 3 });

    expect(h.state.limitArgs).toEqual([TRANSACTION_HISTORY_PAGE_SIZE + 1]);
    expect(h.state.offsetArgs).toEqual([
      (3 - 1) * TRANSACTION_HISTORY_PAGE_SIZE,
    ]);
  });
});

describe("listTransactionHistoryForExport", () => {
  const baseFilters = {
    type: null,
    accountId: null,
    from: null,
    to: null,
    search: null,
  };

  function historyRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "66666666-6666-4666-8666-666666666666",
      type: "expense",
      amount: 15000,
      occurredOn: "2026-10-10",
      note: "خرید روزانه",
      accountId: ACCOUNT_ID,
      accountName: "بانک ملی",
      categoryName: "خرید",
      ...overrides,
    };
  }

  function lastWhere() {
    return h.state.whereConditions[h.state.whereConditions.length - 1];
  }

  it("returns every matching row without any pagination cap", async () => {
    const rows = Array.from({ length: TRANSACTION_HISTORY_PAGE_SIZE * 2 + 7 }, (_, i) =>
      historyRow({ id: `row-${i}` }),
    );
    h.state.selectQueue = [rows];

    const result = await listTransactionHistoryForExport(OWNER, baseFilters);

    expect(result).toHaveLength(TRANSACTION_HISTORY_PAGE_SIZE * 2 + 7);
    expect(h.state.limitArgs).toEqual([]);
    expect(h.state.offsetArgs).toEqual([]);
  });

  it("always scopes the query to the session owner", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistoryForExport(OWNER, baseFilters);

    const { sql, params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
  });

  it("applies the type, account and date-range filters in SQL", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistoryForExport(OWNER, {
      type: "income",
      accountId: ACCOUNT_ID,
      from: "2026-01-01",
      to: "2026-12-31",
      search: null,
    });

    const { sql, params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).toContain("user_id");
    expect(sql).toContain("type");
    expect(sql).toContain("account_id");
    expect(sql).toContain("occurred_on");
    expect(params).toContain(OWNER);
    expect(params).toContain("income");
    expect(params).toContain(ACCOUNT_ID);
    expect(params).toContain("2026-01-01");
    expect(params).toContain("2026-12-31");
  });

  it("orders by newest first with a stable tiebreaker", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistoryForExport(OWNER, baseFilters);

    const clauses = h.state.orderByArgs[0] as unknown[];
    const dialect = new PgDialect();
    expect(clauses).toHaveLength(2);
    expect(dialect.sqlToQuery(clauses[0] as never).sql).toContain("occurred_on");
    expect(dialect.sqlToQuery(clauses[1] as never).sql).toContain("created_at");
  });

  it("applies the same note search without any pagination cap", async () => {
    h.state.selectQueue = [[]];

    await listTransactionHistoryForExport(OWNER, {
      ...baseFilters,
      search: "خرید",
    });

    const { sql, params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).toContain("user_id");
    expect(sql).toContain("note");
    expect(sql).toContain("ilike");
    expect(params).toContain(OWNER);
    expect(params).toContain("%خرید%");
    expect(h.state.limitArgs).toEqual([]);
    expect(h.state.offsetArgs).toEqual([]);
  });

  it("maps joined rows and preserves a null category name", async () => {
    h.state.selectQueue = [[historyRow({ categoryName: null })]];

    const result = await listTransactionHistoryForExport(OWNER, baseFilters);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "expense",
      amount: 15000,
      accountName: "بانک ملی",
      categoryName: null,
    });
  });

  it("returns an empty list when nothing matches", async () => {
    h.state.selectQueue = [[]];

    await expect(
      listTransactionHistoryForExport(OWNER, baseFilters),
    ).resolves.toEqual([]);
  });
});

describe("archived-account policy", () => {
  const SECOND_ACCOUNT_ID = "77777777-7777-4777-8777-777777777777";
  const archivedAccount = { id: ACCOUNT_ID, userId: OWNER, archived: true };
  const activeAccount = { id: ACCOUNT_ID, userId: OWNER, archived: false };
  const archivedSecond = { id: SECOND_ACCOUNT_ID, userId: OWNER, archived: true };
  const activeSecond = { id: SECOND_ACCOUNT_ID, userId: OWNER, archived: false };

  it("refuses to create a transaction on an archived account", async () => {
    h.state.selectQueue = [[archivedAccount]];

    const result = await createTransaction(OWNER, baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.accountId).toContain("بایگانی");
    expect(h.state.insertCalls).toBe(0);
  });

  it("creates a transaction on an active account", async () => {
    h.state.selectQueue = [[activeAccount]];
    h.state.insertResult = [transactionRow()];

    const result = await createTransaction(OWNER, baseInput);

    expect(result.ok).toBe(true);
    expect(h.state.insertCalls).toBe(1);
  });

  it("keeps an existing transaction on its own archived account when editing", async () => {
    h.state.selectQueue = [
      [transactionRow({ accountId: ACCOUNT_ID })],
      [archivedAccount],
    ];
    h.state.updateResult = [transactionRow({ accountId: ACCOUNT_ID })];

    const result = await updateTransaction(OWNER, transactionRow().id, {
      ...baseInput,
      accountId: ACCOUNT_ID,
      amount: 99000,
    });

    expect(result.ok).toBe(true);
    expect(h.state.updateCalls).toBe(1);
  });

  it("refuses to move a transaction onto a different archived account", async () => {
    h.state.selectQueue = [
      [transactionRow({ accountId: ACCOUNT_ID })],
      [archivedSecond],
    ];

    const result = await updateTransaction(OWNER, transactionRow().id, {
      ...baseInput,
      accountId: SECOND_ACCOUNT_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.fieldErrors.accountId).toContain("بایگانی");
    }
    expect(h.state.updateCalls).toBe(0);
  });

  it("allows moving a transaction from an archived account to an active one", async () => {
    h.state.selectQueue = [
      [transactionRow({ accountId: ACCOUNT_ID })],
      [activeSecond],
    ];
    h.state.updateResult = [transactionRow({ accountId: SECOND_ACCOUNT_ID })];

    const result = await updateTransaction(OWNER, transactionRow().id, {
      ...baseInput,
      accountId: SECOND_ACCOUNT_ID,
    });

    expect(result.ok).toBe(true);
    expect(h.state.updateCalls).toBe(1);
  });
});
