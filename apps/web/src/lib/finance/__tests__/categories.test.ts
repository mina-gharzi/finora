/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { CategoryRow } from "@/db/schema";

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
  countTransactionsForCategory,
  createCategory,
  deleteCategory,
  findCategoryForUser,
  listCategories,
  renameCategory,
} from "@/lib/finance/categories";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";

function categoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
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

function lastWhere() {
  return h.state.whereConditions[h.state.whereConditions.length - 1];
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

describe("createCategory", () => {
  it("creates a category owned by the session user", async () => {
    h.state.insertResult = [categoryRow()];

    const result = await createCategory(OWNER, {
      name: "خرید روزانه",
      kind: "expense",
    });

    expect(result.ok).toBe(true);
    expect(h.state.insertedValues[0]).toMatchObject({
      userId: OWNER,
      name: "خرید روزانه",
      kind: "expense",
    });
  });

  it("ignores a forged userId supplied by the client", async () => {
    h.state.insertResult = [categoryRow()];

    await createCategory(OWNER, {
      name: "حقوق",
      kind: "income",
      userId: "attacker",
    });

    expect(h.state.insertedValues[0]).toMatchObject({ userId: OWNER });
    expect(h.state.insertedValues[0]).not.toMatchObject({ userId: "attacker" });
  });

  it.each([
    ["", "empty name"],
    ["   ", "whitespace name"],
    ["a".repeat(61), "overlong name"],
  ])("rejects an invalid name (%s) without inserting", async (name) => {
    const result = await createCategory(OWNER, { name, kind: "expense" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.name).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });

  it("rejects an unknown kind without inserting", async () => {
    const result = await createCategory(OWNER, { name: "غذا", kind: "other" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.kind).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });
});

describe("listCategories", () => {
  it("queries and returns the owner's categories", async () => {
    const rows = [categoryRow(), categoryRow({ id: OTHER, name: "حقوق" })];
    h.state.selectQueue = [rows];

    await expect(listCategories(OWNER)).resolves.toEqual(rows);
  });
});

describe("findCategoryForUser", () => {
  it("returns a category owned by the user", async () => {
    const row = categoryRow();
    h.state.selectQueue = [[row]];
    await expect(findCategoryForUser(CATEGORY_ID, OWNER)).resolves.toEqual(row);
  });

  it("returns null for a missing category", async () => {
    h.state.selectQueue = [[]];
    await expect(findCategoryForUser(CATEGORY_ID, OWNER)).resolves.toBeNull();
  });

  it("returns null when the category belongs to another user", async () => {
    h.state.selectQueue = [[categoryRow({ userId: OTHER })]];
    await expect(findCategoryForUser(CATEGORY_ID, OWNER)).resolves.toBeNull();
  });
});

describe("countTransactionsForCategory", () => {
  it("returns the number of referencing transactions", async () => {
    h.state.selectQueue = [[{ value: 5 }]];
    await expect(countTransactionsForCategory(CATEGORY_ID)).resolves.toBe(5);
  });

  it("defaults to zero when there are no rows", async () => {
    h.state.selectQueue = [[]];
    await expect(countTransactionsForCategory(CATEGORY_ID)).resolves.toBe(0);
  });
});

describe("renameCategory — ownership and validation", () => {
  it("renames an owned category with an owner-scoped statement", async () => {
    h.state.selectQueue = [[categoryRow()]];
    h.state.updateResult = [categoryRow({ name: "خرید هفتگی" })];

    const result = await renameCategory(OWNER, CATEGORY_ID, {
      name: "خرید هفتگی",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.category.name).toBe("خرید هفتگی");
    expect(h.state.updateCalls).toBe(1);
    expect(h.state.updatedValues[0]).toMatchObject({ name: "خرید هفتگی" });
    // A rename never rewrites the direction of the category.
    expect(h.state.updatedValues[0]).not.toHaveProperty("kind");

    const { sql, params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).toContain("id");
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(CATEGORY_ID);
  });

  it("does not touch the database for a malformed id", async () => {
    const result = await renameCategory(OWNER, "not-a-uuid", { name: "x" });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(h.state.updateCalls).toBe(0);
    expect(h.state.selectQueue).toEqual([]);
  });

  it("rejects an invalid name before loading the category", async () => {
    const result = await renameCategory(OWNER, CATEGORY_ID, { name: "  " });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid") {
      expect(result.fieldErrors.name).toBeTruthy();
    }
    expect(h.state.updateCalls).toBe(0);
  });

  it("fails safely when the category belongs to another user", async () => {
    h.state.selectQueue = [[categoryRow({ userId: OTHER })]];

    const result = await renameCategory(OWNER, CATEGORY_ID, { name: "x" });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(h.state.updateCalls).toBe(0);
  });

  it("fails safely when the category does not exist", async () => {
    h.state.selectQueue = [[]];

    const result = await renameCategory(OWNER, CATEGORY_ID, { name: "x" });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(h.state.updateCalls).toBe(0);
  });

  it("reports not_found when the guarded update matches no row", async () => {
    h.state.selectQueue = [[categoryRow()]];
    h.state.updateResult = [];

    const result = await renameCategory(OWNER, CATEGORY_ID, { name: "x" });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(h.state.updateCalls).toBe(1);
  });
});

describe("deleteCategory — reference safety", () => {
  it("deletes an unreferenced owned category with an atomic guard", async () => {
    h.state.deleteResult = [categoryRow()];

    await expect(deleteCategory(OWNER, CATEGORY_ID)).resolves.toEqual({
      ok: true,
    });

    expect(h.state.deleteCalls).toBe(1);
    const { sql, params } = new PgDialect().sqlToQuery(lastWhere() as never);
    expect(sql).toContain("not exists");
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(CATEGORY_ID);
  });

  it("refuses to delete a category still referenced by transactions", async () => {
    h.state.deleteResult = [];
    h.state.selectQueue = [[categoryRow()], [{ value: 3 }]];

    await expect(deleteCategory(OWNER, CATEGORY_ID)).resolves.toEqual({
      ok: false,
      reason: "has_transactions",
      transactionCount: 3,
    });
    expect(h.state.deleteCalls).toBe(1);
  });

  it("reports not_found for a missing category without deleting", async () => {
    h.state.deleteResult = [];
    h.state.selectQueue = [[]];

    await expect(deleteCategory(OWNER, CATEGORY_ID)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(h.state.deleteCalls).toBe(1);
  });

  it("never deletes another user's category", async () => {
    h.state.deleteResult = [];
    h.state.selectQueue = [[categoryRow({ userId: OTHER })]];

    await expect(deleteCategory(OWNER, CATEGORY_ID)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("rejects a malformed id before touching the database", async () => {
    await expect(deleteCategory(OWNER, "not-a-uuid")).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(h.state.deleteCalls).toBe(0);
  });
});
