/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TransferRow } from "@/db/schema";

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
  createTransfer,
  deleteTransfer,
  listTransfers,
} from "@/lib/finance/transfers";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FROM_ID = "33333333-3333-4333-8333-333333333333";
const TO_ID = "44444444-4444-4444-8444-444444444444";

const ownedFrom = { id: FROM_ID, userId: OWNER, archived: false };
const ownedTo = { id: TO_ID, userId: OWNER, archived: false };

function transferRow(overrides: Partial<TransferRow> = {}): TransferRow {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    userId: OWNER,
    fromAccountId: FROM_ID,
    toAccountId: TO_ID,
    amount: 50000,
    occurredOn: "2026-10-16",
    note: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const baseInput = {
  fromAccountId: FROM_ID,
  toAccountId: TO_ID,
  amount: 50000,
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

describe("createTransfer — ownership", () => {
  it("inserts a transfer between two accounts owned by the session user", async () => {
    h.state.selectQueue = [[ownedFrom], [ownedTo]];
    h.state.insertResult = [transferRow()];

    const result = await createTransfer(OWNER, baseInput);

    expect(result.ok).toBe(true);
    expect(h.state.insertedValues[0]).toMatchObject({
      userId: OWNER,
      fromAccountId: FROM_ID,
      toAccountId: TO_ID,
      amount: 50000,
      occurredOn: "2026-10-16",
    });
  });

  it("refuses another user's source account", async () => {
    h.state.selectQueue = [[{ id: FROM_ID, userId: OTHER, archived: false }]];

    const result = await createTransfer(OWNER, baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.fromAccountId).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });

  it("refuses another user's destination account", async () => {
    h.state.selectQueue = [[ownedFrom], [{ id: TO_ID, userId: OTHER, archived: false }]];

    const result = await createTransfer(OWNER, baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.toAccountId).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });

  it("refuses an archived account", async () => {
    h.state.selectQueue = [[{ ...ownedFrom, archived: true }]];

    const result = await createTransfer(OWNER, baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.fromAccountId).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });

  it("ignores a forged userId supplied by the client", async () => {
    h.state.selectQueue = [[ownedFrom], [ownedTo]];
    h.state.insertResult = [transferRow()];

    await createTransfer(OWNER, { ...baseInput, userId: "attacker" });

    expect(h.state.insertedValues[0]).toMatchObject({ userId: OWNER });
  });
});

describe("createTransfer — validation", () => {
  it("rejects the same account on both sides before touching the database", async () => {
    const result = await createTransfer(OWNER, {
      ...baseInput,
      toAccountId: FROM_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.toAccountId).toBe(
        "حساب مبدأ و مقصد نباید یکی باشند.",
      );
    }
    expect(h.state.insertCalls).toBe(0);
  });

  it.each([0, -1, 12.5, "12.5", "abc", Number.MAX_SAFE_INTEGER + 1, NaN])(
    "rejects amount %j before touching the database",
    async (amount) => {
      const result = await createTransfer(OWNER, { ...baseInput, amount });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors.amount).toBeTruthy();
      expect(h.state.insertCalls).toBe(0);
    },
  );

  it("rejects a malformed date", async () => {
    const result = await createTransfer(OWNER, {
      ...baseInput,
      occurredOn: "2026-02-30",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.occurredOn).toBeTruthy();
    expect(h.state.insertCalls).toBe(0);
  });
});

describe("transfer reads and deletes are owner-scoped", () => {
  it("lists joined transfers newest first and honours the limit", async () => {
    const rows = [
      {
        id: transferRow().id,
        fromAccountId: FROM_ID,
        fromAccountName: "نقدی",
        toAccountId: TO_ID,
        toAccountName: "بانک",
        amount: 50000,
        occurredOn: "2026-10-16",
        note: "",
      },
    ];
    h.state.selectQueue = [rows];

    await expect(listTransfers(OWNER, 10)).resolves.toEqual(rows);
    expect(h.state.limitArgs).toContain(10);
  });

  it("deletes the owner's transfer with an owner-scoped statement", async () => {
    h.state.deleteResult = [transferRow()];

    await expect(deleteTransfer(OWNER, transferRow().id)).resolves.toBe(true);

    expect(h.state.deleteCalls).toBe(1);
    const { sql, params } = new PgDialect().sqlToQuery(
      h.state.whereConditions[h.state.whereConditions.length - 1] as never,
    );
    expect(sql).toContain("id");
    expect(sql).toContain("user_id");
    expect(params).toContain(OWNER);
    expect(params).toContain(transferRow().id);
  });

  it("does not delete another owner's transfer", async () => {
    h.state.deleteResult = [];

    await expect(deleteTransfer(OWNER, transferRow().id)).resolves.toBe(false);
    expect(h.state.deleteCalls).toBe(1);
  });

  it("rejects a malformed id before touching the database", async () => {
    await expect(deleteTransfer(OWNER, "not-a-uuid")).resolves.toBe(false);
    expect(h.state.deleteCalls).toBe(0);
  });
});
