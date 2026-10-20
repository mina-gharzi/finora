/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { BudgetRow } from "@/db/schema";

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
    orderByArgs: [] as unknown[],
    insertError: undefined as unknown,
    updateError: undefined as unknown,
  },
}));

vi.mock("@/db", async () => {
  const { createFakeDb } = await import("./fake-db");
  return { getDb: () => createFakeDb(h.state) };
});

import {
  createBudget,
  deleteBudget,
  getBudgetsData,
  listBudgetsWithProgress,
  listExpenseCategories,
  normalizeMonthStart,
  updateBudget,
} from "@/lib/finance/budgets";

const OWNER = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const BUDGET_ID = "55555555-5555-4555-8555-555555555555";

const dialect = new PgDialect();

function lastWhere() {
  return h.state.whereConditions[h.state.whereConditions.length - 1];
}

function serialize(condition: unknown) {
  return dialect.sqlToQuery(condition as never);
}

function budgetRow(overrides: Partial<BudgetRow> = {}): BudgetRow {
  return {
    id: BUDGET_ID,
    userId: OWNER,
    categoryId: CATEGORY_ID,
    monthStart: "2026-09-23",
    limitAmount: 1_000_000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function expenseCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: CATEGORY_ID,
    userId: OWNER,
    name: "خرید روزانه",
    kind: "expense",
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
  h.state.whereConditions = [];
  h.state.orderByArgs = [];
  h.state.insertError = undefined;
  h.state.updateError = undefined;
});

describe("normalizeMonthStart", () => {
  it("snaps a day to the first day of its Jalali month", () => {
    // 2026-09-23 is the 1st of Mehr 1405; 2026-10-10 is still Mehr (starts same day).
    const start = normalizeMonthStart("2026-10-10");
    expect(start).toBe("2026-09-23");
  });

  it("is idempotent on an already-normalized month start", () => {
    expect(normalizeMonthStart("2026-09-23")).toBe("2026-09-23");
  });
});

describe("createBudget", () => {
  it("validates and stores an owner-scoped budget with a normalized month", async () => {
    h.state.selectQueue = [[expenseCategory()]];
    h.state.insertResult = [budgetRow()];

    const result = await createBudget(OWNER, {
      categoryId: CATEGORY_ID,
      monthStart: "2026-10-10",
      limitAmount: "1200000",
    });

    expect(result.ok).toBe(true);
    expect(h.state.insertedValues[0]).toMatchObject({
      userId: OWNER,
      categoryId: CATEGORY_ID,
      monthStart: "2026-09-23",
      limitAmount: 1_200_000,
    });
  });

  it("ignores a forged userId supplied by the client", async () => {
    h.state.selectQueue = [[expenseCategory()]];
    h.state.insertResult = [budgetRow()];

    await createBudget(OWNER, {
      categoryId: CATEGORY_ID,
      monthStart: "2026-10-10",
      limitAmount: 500_000,
      userId: "attacker",
    });

    expect(h.state.insertedValues[0]).toMatchObject({ userId: OWNER });
    expect(h.state.insertedValues[0]).not.toMatchObject({ userId: "attacker" });
  });

  it("rejects a foreign category without inserting", async () => {
    h.state.selectQueue = [[]];

    const result = await createBudget(OWNER, {
      categoryId: CATEGORY_ID,
      monthStart: "2026-10-10",
      limitAmount: 500_000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.fieldErrors.categoryId).toBeTruthy();
    }
    expect(h.state.insertCalls).toBe(0);
  });

  it("rejects an income category without inserting", async () => {
    h.state.selectQueue = [[expenseCategory({ id: CATEGORY_ID, kind: "income" })]];

    const result = await createBudget(OWNER, {
      categoryId: CATEGORY_ID,
      monthStart: "2026-10-10",
      limitAmount: 500_000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.fieldErrors.categoryId).toContain("هزینه‌ای");
    }
    expect(h.state.insertCalls).toBe(0);
  });

  it.each([
    [0],
    [-1],
    ["not-a-number"],
  ])("rejects a non-positive or non-numeric limit (%j) without inserting", async (limit) => {
    h.state.selectQueue = [[expenseCategory()]];

    const result = await createBudget(OWNER, {
      categoryId: CATEGORY_ID,
      monthStart: "2026-10-10",
      limitAmount: limit,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.fieldErrors.limitAmount).toBeTruthy();
    }
    expect(h.state.insertCalls).toBe(0);
  });

  it("reports a duplicate on a unique-constraint violation", async () => {
    h.state.selectQueue = [[expenseCategory()]];
    h.state.insertError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });

    const result = await createBudget(OWNER, {
      categoryId: CATEGORY_ID,
      monthStart: "2026-10-10",
      limitAmount: 500_000,
    });

    expect(result).toEqual({ ok: false, reason: "duplicate" });
    expect(h.state.insertCalls).toBe(1);
  });

  it("reports a duplicate when the driver error is wrapped in a cause", async () => {
    h.state.selectQueue = [[expenseCategory()]];
    h.state.insertError = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("duplicate key"), { code: "23505" }),
    });

    const result = await createBudget(OWNER, {
      categoryId: CATEGORY_ID,
      monthStart: "2026-10-10",
      limitAmount: 500_000,
    });

    expect(result).toEqual({ ok: false, reason: "duplicate" });
    expect(h.state.insertCalls).toBe(1);
  });

  it("rethrows a non-unique database error", async () => {
    h.state.selectQueue = [[expenseCategory()]];
    h.state.insertError = Object.assign(new Error("connection lost"), {
      code: "08006",
    });

    await expect(
      createBudget(OWNER, {
        categoryId: CATEGORY_ID,
        monthStart: "2026-10-10",
        limitAmount: 500_000,
      }),
    ).rejects.toThrow("connection lost");
  });
});

describe("listExpenseCategories", () => {
  it("scopes to the owner and expense kind, active before archived", async () => {
    const rows = [
      { id: "c1", name: "الف", archived: false },
      { id: "c2", name: "ب", archived: true },
    ];
    h.state.selectQueue = [rows];

    await expect(listExpenseCategories(OWNER)).resolves.toEqual(rows);

    const { sql, params } = serialize(lastWhere());
    expect(sql).toContain("user_id");
    expect(sql).toContain("kind");
    expect(params).toContain(OWNER);
    expect(params).toContain("expense");
  });
});

describe("listBudgetsWithProgress", () => {
  it("merges grouped spending into each budget", async () => {
    h.state.selectQueue = [
      [
        {
          id: BUDGET_ID,
          categoryId: CATEGORY_ID,
          categoryName: "خرید روزانه",
          categoryArchived: false,
          monthStart: "2026-09-23",
          limitAmount: 1_000_000,
        },
      ],
      [{ categoryId: CATEGORY_ID, amount: "250000" }],
    ];

    const budgets = await listBudgetsWithProgress(OWNER, "2026-10-10");

    expect(budgets).toHaveLength(1);
    expect(budgets[0]).toMatchObject({
      id: BUDGET_ID,
      categoryName: "خرید روزانه",
      limitAmount: 1_000_000,
      progress: { spending: 250_000, remaining: 750_000, status: "ok" },
    });
  });

  it("treats a budget with no spending as zero and reports the full remaining", async () => {
    h.state.selectQueue = [
      [
        {
          id: BUDGET_ID,
          categoryId: CATEGORY_ID,
          categoryName: "خرید",
          categoryArchived: false,
          monthStart: "2026-09-23",
          limitAmount: 1_000_000,
        },
      ],
      [],
    ];

    const budgets = await listBudgetsWithProgress(OWNER, "2026-09-23");
    expect(budgets[0].progress).toMatchObject({
      spending: 0,
      remaining: 1_000_000,
      status: "ok",
    });
  });

  it("computes the excluded next-month boundary and expense-only spending", async () => {
    h.state.selectQueue = [[], []];

    await listBudgetsWithProgress(OWNER, "2026-09-23");

    // First where = the budgets query; second = the grouped spending query.
    const spendingWhere = h.state.whereConditions[1];
    const { sql, params } = serialize(spendingWhere);
    expect(sql).toContain("user_id");
    expect(sql).toContain("type");
    expect(sql).toContain("occurred_on");
    expect(params).toContain(OWNER);
    expect(params).toContain("expense");
    // Lower bound inclusive = month start; upper bound exclusive = next month.
    expect(params).toContain("2026-09-23");
    expect(params).toContain("2026-10-23");
    // An exclusive upper bound renders `<` (not `<=`).
    expect(sql).toContain("<");
  });

  it("scopes the budgets query to the owner and normalizes the month", async () => {
    h.state.selectQueue = [[], []];

    await listBudgetsWithProgress(OWNER, "2026-10-10");

    const { sql, params } = serialize(h.state.whereConditions[0]);
    expect(sql).toContain("user_id");
    expect(sql).toContain("month_start");
    expect(params).toContain(OWNER);
    expect(params).toContain("2026-09-23");
  });
});

describe("updateBudget", () => {
  it("updates an owned budget with an owner-scoped statement", async () => {
    h.state.selectQueue = [[expenseCategory()]];
    h.state.updateResult = [budgetRow({ limitAmount: 2_000_000 })];

    const result = await updateBudget(OWNER, BUDGET_ID, {
      categoryId: CATEGORY_ID,
      monthStart: "2026-09-23",
      limitAmount: 2_000_000,
    });

    expect(result.ok).toBe(true);
    expect(h.state.updateCalls).toBe(1);
    expect(h.state.updatedValues[0]).toMatchObject({ limitAmount: 2_000_000 });

    const { sql, params } = serialize(lastWhere());
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(BUDGET_ID);
  });

  it("does not touch the database for a malformed id", async () => {
    const result = await updateBudget(OWNER, "not-a-uuid", {
      categoryId: CATEGORY_ID,
      monthStart: "2026-09-23",
      limitAmount: 1000,
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(h.state.updateCalls).toBe(0);
  });

  it("rejects an income category before writing", async () => {
    h.state.selectQueue = [[expenseCategory({ kind: "income" })]];

    const result = await updateBudget(OWNER, BUDGET_ID, {
      categoryId: CATEGORY_ID,
      monthStart: "2026-09-23",
      limitAmount: 1000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.fieldErrors.categoryId).toBeTruthy();
    }
    expect(h.state.updateCalls).toBe(0);
  });

  it("reports not_found when the owner-scoped update matches no row", async () => {
    h.state.selectQueue = [[expenseCategory()]];
    h.state.updateResult = [];

    const result = await updateBudget(OWNER, BUDGET_ID, {
      categoryId: CATEGORY_ID,
      monthStart: "2026-09-23",
      limitAmount: 1000,
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(h.state.updateCalls).toBe(1);
  });

  it("reports a duplicate when moving onto an existing category+month", async () => {
    h.state.selectQueue = [[expenseCategory()]];
    h.state.updateError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });

    const result = await updateBudget(OWNER, BUDGET_ID, {
      categoryId: CATEGORY_ID,
      monthStart: "2026-09-23",
      limitAmount: 1000,
    });

    expect(result).toEqual({ ok: false, reason: "duplicate" });
    expect(h.state.updateCalls).toBe(1);
  });
});

describe("deleteBudget", () => {
  it("deletes an owned budget with an atomic owner-scoped statement", async () => {
    h.state.deleteResult = [budgetRow()];

    await expect(deleteBudget(OWNER, BUDGET_ID)).resolves.toEqual({ ok: true });

    const { sql, params } = serialize(lastWhere());
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(BUDGET_ID);
  });

  it("never deletes another user's budget", async () => {
    h.state.deleteResult = [];
    await expect(deleteBudget(OWNER, BUDGET_ID)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("rejects a malformed id before touching the database", async () => {
    await expect(deleteBudget(OWNER, "not-a-uuid")).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(h.state.deleteCalls).toBe(0);
  });
});

describe("getBudgetsData", () => {
  it("assembles categories and budgets for the normalized month", async () => {
    h.state.selectQueue = [
      [{ id: CATEGORY_ID, name: "خرید", archived: false }],
      [
        {
          id: BUDGET_ID,
          categoryId: CATEGORY_ID,
          categoryName: "خرید",
          categoryArchived: false,
          monthStart: "2026-09-23",
          limitAmount: 1_000_000,
        },
      ],
      [{ categoryId: CATEGORY_ID, amount: "1000000" }],
    ];

    const data = await getBudgetsData(OWNER, "2026-10-10");

    expect(data.monthStart).toBe("2026-09-23");
    expect(data.monthEnd).toBe("2026-10-22");
    expect(data.hasExpenseCategories).toBe(true);
    expect(data.budgets).toHaveLength(1);
    expect(data.budgets[0].progress.status).toBe("reached");
  });

  it("reports no expense categories for a fresh owner", async () => {
    h.state.selectQueue = [[], [], []];

    const data = await getBudgetsData(OWNER, "2026-10-10");

    expect(data.hasExpenseCategories).toBe(false);
    expect(data.budgets).toEqual([]);
  });
});
