/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

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
  },
}));

vi.mock("@/db", async () => {
  const { createFakeDb } = await import("./fake-db");
  return { getDb: () => createFakeDb(h.state) };
});

import {
  DASHBOARD_RECENT_LIMIT,
  getAccountBalances,
  getCategoryExpenseBreakdown,
  getDashboardData,
  getPeriodTotals,
  hasAnyTransactions,
  listRecentTransactions,
} from "@/lib/finance/dashboard";

const OWNER = "11111111-1111-4111-8111-111111111111";

const dialect = new PgDialect();

function lastWhere() {
  return h.state.whereConditions[h.state.whereConditions.length - 1];
}

function serialize(condition: unknown) {
  return dialect.sqlToQuery(condition as never);
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
  h.state.whereConditions = [];
});

describe("getPeriodTotals", () => {
  it("computes income, expense and net from the aggregate row", async () => {
    h.state.selectQueue = [[{ income: "500000", expense: "200000" }]];

    await expect(getPeriodTotals(OWNER, { from: null, to: null })).resolves.toEqual(
      { income: 500000, expense: 200000, net: 300000 },
    );
  });

  it("reports a negative net when expenses exceed income", async () => {
    h.state.selectQueue = [[{ income: "100000", expense: "450000" }]];

    const totals = await getPeriodTotals(OWNER, { from: null, to: null });
    expect(totals.net).toBe(-350000);
  });

  it.each([
    [{ income: "0", expense: "0" }],
    [{}],
    [[]],
  ])("treats missing aggregate values as zero (%j)", async (row) => {
    h.state.selectQueue = [[row]];

    await expect(
      getPeriodTotals(OWNER, { from: null, to: null }),
    ).resolves.toEqual({ income: 0, expense: 0, net: 0 });
  });

  it("throws rather than losing precision on an out-of-range sum", async () => {
    h.state.selectQueue = [
      [{ income: String(Number.MAX_SAFE_INTEGER + 10), expense: "0" }],
    ];

    await expect(
      getPeriodTotals(OWNER, { from: null, to: null }),
    ).rejects.toThrow(RangeError);
  });

  it("scopes the query to the session owner", async () => {
    h.state.selectQueue = [[]];

    await getPeriodTotals(OWNER, { from: null, to: null });

    const { sql, params } = serialize(lastWhere());
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
  });

  it("applies inclusive date bounds when the range is bounded", async () => {
    h.state.selectQueue = [[]];

    await getPeriodTotals(OWNER, { from: "2026-09-23", to: "2026-10-22" });

    const { sql, params } = serialize(lastWhere());
    expect(sql).toContain("occurred_on");
    expect(params).toContain("2026-09-23");
    expect(params).toContain("2026-10-22");
  });

  it("applies no date filter for an all-time range", async () => {
    h.state.selectQueue = [[]];

    await getPeriodTotals(OWNER, { from: null, to: null });

    const { sql } = serialize(lastWhere());
    expect(sql).toContain("user_id");
    expect(sql).not.toContain("occurred_on");
  });
});

describe("getCategoryExpenseBreakdown", () => {
  it("maps categories, keeping a null (uncategorised) bucket", async () => {
    h.state.selectQueue = [
      [
        { categoryId: "cat-1", categoryName: "خرید روزانه", amount: "150000" },
        { categoryId: null, categoryName: null, amount: "50000" },
      ],
    ];

    await expect(
      getCategoryExpenseBreakdown(OWNER, { from: null, to: null }),
    ).resolves.toEqual([
      { categoryId: "cat-1", categoryName: "خرید روزانه", amount: 150000 },
      { categoryId: null, categoryName: null, amount: 50000 },
    ]);
  });

  it("returns an empty list when there are no expenses", async () => {
    h.state.selectQueue = [[]];

    await expect(
      getCategoryExpenseBreakdown(OWNER, { from: null, to: null }),
    ).resolves.toEqual([]);
  });

  it("filters by owner and by expense direction", async () => {
    h.state.selectQueue = [[]];

    await getCategoryExpenseBreakdown(OWNER, { from: null, to: null });

    const { sql, params } = serialize(lastWhere());
    expect(sql).toContain("user_id");
    expect(sql).toContain("type");
    expect(params).toContain(OWNER);
    expect(params).toContain("expense");
  });
});

describe("getAccountBalances", () => {
  it("computes opening_balance + income - expense per account", async () => {
    h.state.selectQueue = [
      [
        {
          id: "acc-1",
          name: "کیف پول نقدی",
          type: "cash",
          openingBalance: 100000,
          income: "500000",
          expense: "200000",
        },
        {
          id: "acc-2",
          name: "بانک",
          type: "bank",
          openingBalance: 0,
          income: "0",
          expense: "0",
        },
      ],
    ];

    await expect(getAccountBalances(OWNER)).resolves.toEqual([
      { id: "acc-1", name: "کیف پول نقدی", type: "cash", balance: 400000 },
      { id: "acc-2", name: "بانک", type: "bank", balance: 0 },
    ]);
  });

  it("keeps each account's rows separate across multiple accounts", async () => {
    // Distinct per-account aggregates: a bug that multiplied joined rows would
    // change these numbers.
    h.state.selectQueue = [
      [
        {
          id: "a",
          name: "الف",
          type: "cash",
          openingBalance: 0,
          income: "1000",
          expense: "0",
        },
        {
          id: "b",
          name: "ب",
          type: "wallet",
          openingBalance: 5000,
          income: "0",
          expense: "2000",
        },
      ],
    ];

    const balances = await getAccountBalances(OWNER);
    expect(balances).toHaveLength(2);
    expect(balances[0].balance).toBe(1000);
    expect(balances[1].balance).toBe(3000);
  });

  it("scopes the query to the session owner", async () => {
    h.state.selectQueue = [[]];

    await getAccountBalances(OWNER);

    const { sql, params } = serialize(lastWhere());
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
  });
});

describe("listRecentTransactions", () => {
  it("maps the joined rows", async () => {
    h.state.selectQueue = [
      [
        {
          id: "t1",
          type: "income",
          amount: 5000000,
          occurredOn: "2026-10-18",
          note: "حقوق",
          accountId: "acc-1",
          accountName: "بانک ملی",
          categoryName: "حقوق",
        },
      ],
    ];

    await expect(
      listRecentTransactions(OWNER, { from: null, to: null }),
    ).resolves.toEqual([
      {
        id: "t1",
        type: "income",
        amount: 5000000,
        occurredOn: "2026-10-18",
        note: "حقوق",
        accountId: "acc-1",
        accountName: "بانک ملی",
        categoryName: "حقوق",
      },
    ]);
  });

  it("defaults to the dashboard recent limit", () => {
    expect(DASHBOARD_RECENT_LIMIT).toBe(5);
  });

  it("scopes by owner and applies the date window", async () => {
    h.state.selectQueue = [[]];

    await listRecentTransactions(OWNER, {
      from: "2026-09-23",
      to: "2026-10-22",
    });

    const { sql, params } = serialize(lastWhere());
    expect(sql).toContain("user_id");
    expect(sql).toContain("occurred_on");
    expect(params).toContain(OWNER);
    expect(params).toContain("2026-09-23");
    expect(params).toContain("2026-10-22");
  });

  it("returns an empty list when nothing matches", async () => {
    h.state.selectQueue = [[]];

    await expect(
      listRecentTransactions(OWNER, { from: null, to: null }),
    ).resolves.toEqual([]);
  });
});

describe("hasAnyTransactions", () => {
  it("is true when at least one transaction exists", async () => {
    h.state.selectQueue = [[{ id: "t1" }]];
    await expect(hasAnyTransactions(OWNER)).resolves.toBe(true);
  });

  it("is false when the owner has no transactions", async () => {
    h.state.selectQueue = [[]];
    await expect(hasAnyTransactions(OWNER)).resolves.toBe(false);
  });

  it("scopes the probe to the session owner", async () => {
    h.state.selectQueue = [[]];

    await hasAnyTransactions(OWNER);

    const { sql, params } = serialize(lastWhere());
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
  });
});

describe("getDashboardData", () => {
  it("assembles every section from its query", async () => {
    h.state.selectQueue = [
      [{ income: "500000", expense: "200000" }],
      [{ categoryId: "cat-1", categoryName: "خرید", amount: "200000" }],
      [
        {
          id: "acc-1",
          name: "نقدی",
          type: "cash",
          openingBalance: 0,
          income: "500000",
          expense: "200000",
        },
      ],
      [
        {
          id: "t1",
          type: "expense",
          amount: 200000,
          occurredOn: "2026-10-18",
          note: "",
          accountId: "acc-1",
          accountName: "نقدی",
          categoryName: "خرید",
        },
      ],
      [{ id: "t1" }],
    ];

    const data = await getDashboardData(OWNER, {
      from: "2026-09-23",
      to: "2026-10-22",
    });

    expect(data.totals).toEqual({ income: 500000, expense: 200000, net: 300000 });
    expect(data.categoryBreakdown).toHaveLength(1);
    expect(data.accountBalances).toEqual([
      { id: "acc-1", name: "نقدی", type: "cash", balance: 300000 },
    ]);
    expect(data.recentTransactions).toHaveLength(1);
    expect(data.hasAccounts).toBe(true);
    expect(data.hasTransactions).toBe(true);
  });

  it("reports no accounts and no transactions for an empty owner", async () => {
    h.state.selectQueue = [[], [], [], [], []];

    const data = await getDashboardData(OWNER, { from: null, to: null });

    expect(data.totals).toEqual({ income: 0, expense: 0, net: 0 });
    expect(data.categoryBreakdown).toEqual([]);
    expect(data.accountBalances).toEqual([]);
    expect(data.recentTransactions).toEqual([]);
    expect(data.hasAccounts).toBe(false);
    expect(data.hasTransactions).toBe(false);
  });

  it("reports hasAccounts true but hasTransactions false for a fresh account", async () => {
    h.state.selectQueue = [
      [{ income: "0", expense: "0" }],
      [],
      [
        {
          id: "acc-1",
          name: "نقدی",
          type: "cash",
          openingBalance: 0,
          income: "0",
          expense: "0",
        },
      ],
      [],
      [],
    ];

    const data = await getDashboardData(OWNER, { from: null, to: null });
    expect(data.hasAccounts).toBe(true);
    expect(data.hasTransactions).toBe(false);
  });
});
