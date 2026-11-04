/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeDbState,
  type FakeDbState,
} from "./fake-db";

const h = vi.hoisted(() => ({
  state: {} as FakeDbState,
}));

vi.mock("@/db", async () => {
  const { createFakeDb } = await import("./fake-db");
  return { getDb: () => createFakeDb(h.state) };
});

import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  seedDefaultCategories,
} from "@/lib/finance/default-categories";
import { categoryInputSchema } from "@/lib/finance/validation";
import type { TransactionType } from "@/lib/finance/types";

const OWNER = "11111111-1111-4111-8111-111111111111";

const ALL_DEFAULTS = [
  ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
    name,
    kind: "expense" as TransactionType,
  })),
  ...DEFAULT_INCOME_CATEGORIES.map((name) => ({
    name,
    kind: "income" as TransactionType,
  })),
];

beforeEach(() => {
  h.state = createFakeDbState();
});

describe("default category lists", () => {
  it("contains only values accepted by the category input schema", () => {
    for (const category of ALL_DEFAULTS) {
      expect(categoryInputSchema.safeParse(category).success).toBe(true);
    }
  });

  it("has no duplicate names within a kind", () => {
    expect(new Set(DEFAULT_EXPENSE_CATEGORIES).size).toBe(
      DEFAULT_EXPENSE_CATEGORIES.length,
    );
    expect(new Set(DEFAULT_INCOME_CATEGORIES).size).toBe(
      DEFAULT_INCOME_CATEGORIES.length,
    );
  });
});

describe("seedDefaultCategories", () => {
  it("inserts every default for a new user in one statement", async () => {
    h.state.selectQueue = [[]];

    const result = await seedDefaultCategories(OWNER);

    expect(result).toEqual({ inserted: ALL_DEFAULTS.length });
    expect(h.state.insertCalls).toBe(1);
    const values = h.state.insertedValues[0] as Array<{
      userId: string;
      name: string;
      kind: TransactionType;
    }>;
    expect(values).toHaveLength(ALL_DEFAULTS.length);
    expect(values.every((value) => value.userId === OWNER)).toBe(true);
    expect(values.map(({ name, kind }) => ({ name, kind }))).toEqual(
      ALL_DEFAULTS,
    );
  });

  it("inserts nothing on a second call once all defaults exist", async () => {
    h.state.selectQueue = [ALL_DEFAULTS];

    const result = await seedDefaultCategories(OWNER);

    expect(result).toEqual({ inserted: 0 });
    expect(h.state.insertCalls).toBe(0);
  });

  it("inserts only the missing defaults for a partially seeded user", async () => {
    const existing = [
      { name: DEFAULT_EXPENSE_CATEGORIES[0], kind: "expense" },
      { name: DEFAULT_INCOME_CATEGORIES[0], kind: "income" },
    ];
    h.state.selectQueue = [existing];

    const result = await seedDefaultCategories(OWNER);

    expect(result).toEqual({ inserted: ALL_DEFAULTS.length - existing.length });
    expect(h.state.insertCalls).toBe(1);
    const values = h.state.insertedValues[0] as Array<{
      name: string;
      kind: TransactionType;
    }>;
    expect(values).toHaveLength(ALL_DEFAULTS.length - existing.length);
    expect(values).not.toContainEqual(existing[0]);
    expect(values).not.toContainEqual(existing[1]);
  });
});
