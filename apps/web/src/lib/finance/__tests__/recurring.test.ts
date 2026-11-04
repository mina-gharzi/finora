/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { addDays } from "../dashboard-range";
import { todayInTehranIso } from "../today";

/**
 * Hand-rolled Drizzle stand-in. `fake-db.ts` has no `onConflictDoNothing`, which
 * materialization relies on, so this file mocks `@/db` directly instead.
 */
const h = vi.hoisted(() => ({
  state: {
    selectQueue: [] as unknown[][],
    insertReturningQueue: [] as unknown[][],
    updateReturningQueue: [] as unknown[][],
    deleteReturningQueue: [] as unknown[][],
    insertedValues: [] as unknown[],
    updatedValues: [] as unknown[],
    conflictTargets: [] as unknown[],
    insertCalls: 0,
    updateCalls: 0,
    deleteCalls: 0,
    whereConditions: [] as unknown[],
  },
}));

function makeChain(resolveTo: unknown[]) {
  const state = h.state;
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: (condition: unknown) => {
      state.whereConditions.push(condition);
      return chain;
    },
    innerJoin: () => chain,
    leftJoin: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    values: (value: unknown) => {
      state.insertedValues.push(value);
      return chain;
    },
    set: (value: unknown) => {
      state.updatedValues.push(value);
      return chain;
    },
    onConflictDoNothing: (config: unknown) => {
      state.conflictTargets.push(config);
      return chain;
    },
    returning: () => Promise.resolve(resolveTo),
    then: (
      onFulfilled?: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(resolveTo).then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock("@/db", () => {
  const state = h.state;
  const db = {
    select: () => makeChain(state.selectQueue.shift() ?? []),
    insert: () => {
      state.insertCalls += 1;
      return makeChain(state.insertReturningQueue.shift() ?? []);
    },
    update: () => {
      state.updateCalls += 1;
      return makeChain(state.updateReturningQueue.shift() ?? []);
    },
    delete: () => {
      state.deleteCalls += 1;
      return makeChain(state.deleteReturningQueue.shift() ?? []);
    },
    transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(db),
  };
  return { getDb: () => db };
});

import {
  createRecurring,
  deleteRecurring,
  ensureRecurringUpToDate,
  materializeRecurringForUser,
} from "@/lib/finance/recurring";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const RULE_ID = "55555555-5555-4555-8555-555555555555";

const ownedAccount = { id: ACCOUNT_ID, userId: OWNER, archived: false };

function ruleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    accountId: ACCOUNT_ID,
    accountArchived: false,
    categoryId: null,
    type: "expense",
    amount: 25000,
    note: "",
    frequency: "weekly",
    dayOfMonth: null,
    weekday: 0,
    startOn: "2025-01-05",
    endOn: null,
    generatedThrough: null,
    ...overrides,
  };
}

const today = todayInTehranIso();
const baseInput = {
  accountId: ACCOUNT_ID,
  categoryId: null,
  type: "expense",
  amount: 25000,
  note: "",
  frequency: "monthly",
  dayOfMonth: 1,
  weekday: null,
  startOn: addDays(today, -30),
  endOn: null,
};

beforeEach(() => {
  const state = h.state;
  state.selectQueue = [];
  state.insertReturningQueue = [];
  state.updateReturningQueue = [];
  state.deleteReturningQueue = [];
  state.insertedValues = [];
  state.updatedValues = [];
  state.conflictTargets = [];
  state.insertCalls = 0;
  state.updateCalls = 0;
  state.deleteCalls = 0;
  state.whereConditions = [];
});

describe("createRecurring — ownership", () => {
  it("inserts an owned rule with no watermark", async () => {
    h.state.selectQueue = [[ownedAccount]];
    h.state.insertReturningQueue = [[{ id: RULE_ID }]];

    const result = await createRecurring(OWNER, baseInput);

    expect(result.ok).toBe(true);
    expect(h.state.insertedValues[0]).toMatchObject({
      userId: OWNER,
      accountId: ACCOUNT_ID,
      amount: 25000,
      generatedThrough: null,
    });
  });

  it("refuses another user's account", async () => {
    h.state.selectQueue = [[{ ...ownedAccount, userId: OTHER }]];

    const result = await createRecurring(OWNER, baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.accountId).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });

  it("refuses an archived account", async () => {
    h.state.selectQueue = [[{ ...ownedAccount, archived: true }]];

    const result = await createRecurring(OWNER, baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.accountId).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });

  it("refuses a category of the wrong kind", async () => {
    h.state.selectQueue = [
      [ownedAccount],
      [{ id: CATEGORY_ID, userId: OWNER, kind: "income", archived: false }],
    ];

    const result = await createRecurring(OWNER, {
      ...baseInput,
      categoryId: CATEGORY_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.categoryId).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });

  it("refuses a startOn outside the one-year window", async () => {
    h.state.selectQueue = [[ownedAccount]];

    const result = await createRecurring(OWNER, {
      ...baseInput,
      startOn: addDays(today, -400),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.startOn).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });
});

describe("materializeRecurringForUser", () => {
  it("creates every due row and advances the watermark", async () => {
    h.state.selectQueue = [[ruleRow()]];
    h.state.insertReturningQueue = [
      [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    ];

    const result = await materializeRecurringForUser(OWNER, "2025-01-26");

    expect(result.created).toBe(4);
    expect(h.state.insertedValues[0]).toEqual([
      expect.objectContaining({
        userId: OWNER,
        recurringId: RULE_ID,
        occurredOn: "2025-01-05",
      }),
      expect.objectContaining({ occurredOn: "2025-01-12" }),
      expect.objectContaining({ occurredOn: "2025-01-19" }),
      expect.objectContaining({ occurredOn: "2025-01-26" }),
    ]);
    expect(h.state.updatedValues[0]).toMatchObject({
      generatedThrough: "2025-01-26",
    });
    expect(h.state.conflictTargets).toHaveLength(1);
  });

  it("is idempotent: a second run inserts nothing", async () => {
    h.state.selectQueue = [[ruleRow()], [ruleRow()]];
    h.state.insertReturningQueue = [
      [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      [],
    ];

    const first = await materializeRecurringForUser(OWNER, "2025-01-26");
    const second = await materializeRecurringForUser(OWNER, "2025-01-26");

    expect(first.created).toBe(4);
    expect(second.created).toBe(0);
    expect(h.state.conflictTargets).toHaveLength(2);
  });

  it("honours endOn and stops the watermark there", async () => {
    h.state.selectQueue = [
      [ruleRow({ endOn: "2025-01-19" })],
    ];
    h.state.insertReturningQueue = [[{ id: "a" }, { id: "b" }, { id: "c" }]];

    const result = await materializeRecurringForUser(OWNER, "2025-01-26");

    expect(result.created).toBe(3);
    expect(
      (h.state.insertedValues[0] as { occurredOn: string }[]).map(
        (row) => row.occurredOn,
      ),
    ).toEqual(["2025-01-05", "2025-01-12", "2025-01-19"]);
    expect(h.state.updatedValues[0]).toMatchObject({
      generatedThrough: "2025-01-19",
    });
  });

  it("skips an archived account without advancing the watermark", async () => {
    h.state.selectQueue = [[ruleRow({ accountArchived: true })]];

    const result = await materializeRecurringForUser(OWNER, "2025-01-26");

    expect(result.created).toBe(0);
    expect(h.state.insertCalls).toBe(0);
    expect(h.state.updateCalls).toBe(0);
  });

  it("scopes the rule query to the owner", async () => {
    h.state.selectQueue = [[]];

    await materializeRecurringForUser(OWNER, "2025-01-26");

    const { sql, params } = new PgDialect().sqlToQuery(
      h.state.whereConditions[0] as never,
    );
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
  });
});

describe("ensureRecurringUpToDate", () => {
  it("does no work when no rule is due", async () => {
    h.state.selectQueue = [[]];

    await expect(ensureRecurringUpToDate(OWNER, "2025-01-26")).resolves.toEqual(
      { created: 0 },
    );
    expect(h.state.selectQueue).toHaveLength(0);
    expect(h.state.insertCalls).toBe(0);
  });

  it("materializes when a due rule exists", async () => {
    h.state.selectQueue = [[{ id: RULE_ID }], [ruleRow()]];
    h.state.insertReturningQueue = [[{ id: "a" }]];

    await expect(ensureRecurringUpToDate(OWNER, "2025-01-05")).resolves.toEqual(
      { created: 1 },
    );
    expect(h.state.insertCalls).toBe(1);
  });
});

describe("deleteRecurring", () => {
  it("deletes only the owned rule, leaving generated transactions intact", async () => {
    h.state.deleteReturningQueue = [[ruleRow()]];

    await expect(deleteRecurring(OWNER, RULE_ID)).resolves.toBe(true);

    // A single DELETE against the rule table: generated rows survive because
    // transactions.recurring_id is ON DELETE SET NULL.
    expect(h.state.deleteCalls).toBe(1);
    const { sql, params } = new PgDialect().sqlToQuery(
      h.state.whereConditions[0] as never,
    );
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(RULE_ID);
  });

  it("reports false when the rule is not the owner's", async () => {
    h.state.deleteReturningQueue = [[]];

    await expect(deleteRecurring(OWNER, RULE_ID)).resolves.toBe(false);
    expect(h.state.deleteCalls).toBe(1);
  });
});
