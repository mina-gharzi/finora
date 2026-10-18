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

import { getReportsData } from "@/lib/finance/reports";
import { reportsMonthFromKey } from "@/lib/finance/reports-range";

const OWNER = "11111111-1111-4111-8111-111111111111";

const dialect = new PgDialect();

/**
 * Selected month: Mehr 1405 (param `1405-07`), Gregorian bounds
 * 2026-09-23 … 2026-10-22 (verified by dashboard-range.test.ts). The trend
 * window is the six months اردیبهشت … مهر 1405, and the comparison baseline
 * is the month before the selection, شهریور 1405.
 */
const SELECTED = reportsMonthFromKey({ year: 1405, month: 7 });

function serialize(condition: unknown) {
  return dialect.sqlToQuery(condition as never);
}

function whereAt(index: number) {
  return serialize(h.state.whereConditions[index]);
}

/** Every aggregate row the six monthly `getPeriodTotals` calls return. */
function seedTrendRows() {
  h.state.selectQueue = [
    // Trend points, oldest (اردیبهشت 1405) first:
    [{ income: "100000", expense: "40000" }], // 1405-02
    [{ income: "120000", expense: "50000" }], // 1405-03
    [{ income: "130000", expense: "60000" }], // 1405-04
    [{ income: "140000", expense: "70000" }], // 1405-05
    [{ income: "200000", expense: "80000" }], // 1405-06 (شهریور)
    [{ income: "300000", expense: "120000" }], // 1405-07 (مهر, selected)
  ];
}

function seedEmptyTrendRows() {
  h.state.selectQueue = [[], [], [], [], [], []];
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

describe("getReportsData — trend window", () => {
  it("returns six months, oldest first, ending at the selection", async () => {
    seedTrendRows();
    h.state.selectQueue.push([], [{ id: "t1" }]);

    const data = await getReportsData(OWNER, SELECTED);

    expect(data.trend).toHaveLength(6);
    expect(data.trend.map((point) => point.param)).toEqual([
      "1405-02",
      "1405-03",
      "1405-04",
      "1405-05",
      "1405-06",
      "1405-07",
    ]);
    expect(data.trend[0]?.label).toBe("اردیبهشت 1405");
    expect(data.trend[5]?.label).toBe("مهر 1405");
  });

  it("carries income, expense and net per month", async () => {
    seedTrendRows();
    h.state.selectQueue.push([], [{ id: "t1" }]);

    const data = await getReportsData(OWNER, SELECTED);

    expect(data.trend[5]).toEqual({
      param: "1405-07",
      label: "مهر 1405",
      shortLabel: "مهر",
      income: 300000,
      expense: 120000,
      net: 180000,
    });
    expect(data.trend[0]?.net).toBe(60000);
  });

  it("shows zero totals for months with no transactions", async () => {
    seedEmptyTrendRows();
    h.state.selectQueue.push([], []);

    const data = await getReportsData(OWNER, SELECTED);

    expect(data.totals).toEqual({ income: 0, expense: 0, net: 0 });
    for (const point of data.trend) {
      expect(point.income).toBe(0);
      expect(point.expense).toBe(0);
      expect(point.net).toBe(0);
    }
  });
});

describe("getReportsData — selected vs previous month", () => {
  it("uses the last two trend points as the comparison pair", async () => {
    seedTrendRows();
    h.state.selectQueue.push([], [{ id: "t1" }]);

    const data = await getReportsData(OWNER, SELECTED);

    expect(data.selected.param).toBe("1405-07");
    expect(data.previous.param).toBe("1405-06");
    expect(data.previous.label).toBe("شهریور 1405");
    expect(data.totals).toEqual({ income: 300000, expense: 120000, net: 180000 });
    expect(data.previousTotals).toEqual({
      income: 200000,
      expense: 80000,
      net: 120000,
    });
  });

  it("applies the month-over-month comparison rules", async () => {
    seedTrendRows();
    h.state.selectQueue.push([], [{ id: "t1" }]);

    const data = await getReportsData(OWNER, SELECTED);

    expect(data.comparison.income).toEqual({
      current: 300000,
      previous: 200000,
      delta: 100000,
      percent: 50,
    });
    expect(data.comparison.expense).toEqual({
      current: 120000,
      previous: 80000,
      delta: 40000,
      percent: 50,
    });
    expect(data.comparison.net).toEqual({
      current: 180000,
      previous: 120000,
      delta: 60000,
      percent: 50,
    });
  });

  it("yields a neutral comparison when both months are empty", async () => {
    seedEmptyTrendRows();
    h.state.selectQueue.push([], []);

    const data = await getReportsData(OWNER, SELECTED);

    expect(data.comparison.income).toEqual({
      current: 0,
      previous: 0,
      delta: 0,
      percent: null,
    });
    expect(data.comparison.expense.percent).toBeNull();
    expect(data.comparison.net.percent).toBeNull();
  });
});

describe("getReportsData — category breakdown", () => {
  it("maps the selected month's expense rows, uncategorized bucket included", async () => {
    seedEmptyTrendRows();
    h.state.selectQueue.push(
      [
        { categoryId: "cat-1", categoryName: "خرید", amount: "120000" },
        { categoryId: null, categoryName: null, amount: "30000" },
      ],
      [{ id: "t1" }],
    );

    const data = await getReportsData(OWNER, SELECTED);

    expect(data.categoryBreakdown).toEqual([
      { categoryId: "cat-1", categoryName: "خرید", amount: 120000 },
      { categoryId: null, categoryName: null, amount: 30000 },
    ]);
  });

  it("returns an empty breakdown when the month has no expenses", async () => {
    seedEmptyTrendRows();
    h.state.selectQueue.push([], [{ id: "t1" }]);

    const data = await getReportsData(OWNER, SELECTED);

    expect(data.categoryBreakdown).toEqual([]);
  });
});

describe("getReportsData — existence probe", () => {
  it("reports hasTransactions true when the owner has any transaction", async () => {
    seedEmptyTrendRows();
    h.state.selectQueue.push([], [{ id: "t1" }]);

    const data = await getReportsData(OWNER, SELECTED);

    expect(data.hasTransactions).toBe(true);
  });

  it("reports hasTransactions false for a fresh owner", async () => {
    seedEmptyTrendRows();
    h.state.selectQueue.push([], []);

    const data = await getReportsData(OWNER, SELECTED);

    expect(data.hasTransactions).toBe(false);
  });
});

describe("getReportsData — owner scoping and query shape", () => {
  it("scopes all eight aggregate queries to the session owner", async () => {
    seedTrendRows();
    h.state.selectQueue.push(
      [{ categoryId: null, categoryName: null, amount: "120000" }],
      [{ id: "t1" }],
    );

    await getReportsData(OWNER, SELECTED);

    // Six trend totals + one breakdown + one existence probe.
    expect(h.state.whereConditions).toHaveLength(8);
    for (let index = 0; index < 8; index += 1) {
      const { sql, params } = whereAt(index);
      expect(sql).toContain("user_id");
      expect(params).toContain(OWNER);
    }
  });

  it("bounds each trend query with that month's inclusive Gregorian dates", async () => {
    seedTrendRows();
    h.state.selectQueue.push([], [{ id: "t1" }]);

    await getReportsData(OWNER, SELECTED);

    // First trend query: اردیبهشت 1405 (31 days after Farvardin 1405).
    const oldest = reportsMonthFromKey({ year: 1405, month: 2 });
    const first = whereAt(0);
    expect(first.sql).toContain("occurred_on");
    expect(first.params).toContain(oldest.from);
    expect(first.params).toContain(oldest.to);

    // Sixth trend query: the selected month itself (Mehr 1405).
    const lastTrend = whereAt(5);
    expect(lastTrend.params).toContain(SELECTED.from);
    expect(lastTrend.params).toContain(SELECTED.to);
  });

  it("bounds the category breakdown with the selected month's dates", async () => {
    seedEmptyTrendRows();
    h.state.selectQueue.push([], [{ id: "t1" }]);

    await getReportsData(OWNER, SELECTED);

    const breakdown = whereAt(6);
    expect(breakdown.sql).toContain("user_id");
    expect(breakdown.sql).toContain("occurred_on");
    expect(breakdown.params).toContain(SELECTED.from);
    expect(breakdown.params).toContain(SELECTED.to);
  });
});
