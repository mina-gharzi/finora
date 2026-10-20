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

import { getBalanceTrendData } from "@/lib/finance/balance-trend-data";

const OWNER = "11111111-1111-4111-8111-111111111111";
/** Anchor: the Mehr 1405 window ends at the month containing `TODAY`. */
const TODAY = "2026-10-10";

const dialect = new PgDialect();

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

/**
 * Seeds the four queries issued by `getBalanceTrendData` in call order:
 * opening total, balance history, transaction probe, account probe.
 */
function seed(opening: string | null, history: Record<string, unknown>, hasTx: boolean, hasAcc: boolean) {
  h.state.selectQueue = [
    [{ total: opening }],
    [history],
    hasTx ? [{ id: "t1" }] : [],
    hasAcc ? [{ id: "acc-1" }] : [],
  ];
}

describe("getBalanceTrendData", () => {
  it("assembles month-end balances from opening, before-net and monthly nets", async () => {
    seed("1000000", {
      beforeIncome: "500000",
      beforeExpense: "0",
      income0: "200000",
      expense0: "50000",
      income1: "0",
      expense1: "300000",
    }, true, true);

    const data = await getBalanceTrendData(OWNER, TODAY, 6);

    expect(data.range).toBe(6);
    expect(data.points).toHaveLength(6);
    expect(data.hasTransactions).toBe(true);
    expect(data.hasAccounts).toBe(true);

    // Window ends at مهر 1405; the last two months carry the seeded figures.
    const last = data.points[5];
    expect(last?.param).toBe("1405-07");
    // 1,000,000 opening + 500,000 before = 1,500,000; +150,000 + (-300,000).
    expect(last?.balance).toBe(1_350_000);
    expect(data.currentBalance).toBe(1_350_000);
  });

  it("carries zero months for months without transactions", async () => {
    seed("0", {
      beforeIncome: null,
      beforeExpense: null,
      income0: null,
      expense0: null,
      income1: null,
      expense1: null,
    }, true, true);

    const data = await getBalanceTrendData(OWNER, TODAY, 6);

    for (const point of data.points) {
      expect(point.income).toBe(0);
      expect(point.expense).toBe(0);
      expect(point.balance).toBe(0);
    }
  });

  it("reports no accounts and no transactions for a fresh owner", async () => {
    seed(null, {
      beforeIncome: null,
      beforeExpense: null,
      income0: null,
      expense0: null,
      income1: null,
      expense1: null,
    }, false, false);

    const data = await getBalanceTrendData(OWNER, TODAY, 12);

    expect(data.points).toHaveLength(12);
    expect(data.currentBalance).toBe(0);
    expect(data.hasTransactions).toBe(false);
    expect(data.hasAccounts).toBe(false);
  });

  it("scopes every aggregate query to the session owner", async () => {
    seed("0", {
      beforeIncome: "0",
      beforeExpense: "0",
      income0: "0",
      expense0: "0",
      income1: "0",
      expense1: "0",
    }, false, false);

    await getBalanceTrendData(OWNER, TODAY, 6);

    // Four queries, all owner-scoped; no query per month.
    expect(h.state.whereConditions).toHaveLength(4);
    for (const condition of h.state.whereConditions) {
      const { sql, params } = serialize(condition);
      expect(sql).toContain("user_id");
      expect(params).toContain(OWNER);
    }
  });
});
