import { describe, expect, it } from "vitest";
import {
  accountInputSchema,
  categoryInputSchema,
  categoryNameInputSchema,
  isoDateSchema,
  transactionInputSchema,
} from "../validation";

const uuid = "3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f60";
const validTx = {
  accountId: uuid,
  categoryId: uuid,
  type: "expense",
  amount: 25000,
  occurredOn: "2026-10-16",
  note: "  ناهار ",
};

describe("transactionInputSchema", () => {
  it("accepts a valid transaction and trims the note", () => {
    const r = transactionInputSchema.safeParse(validTx);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.note).toBe("ناهار");
  });
  it("accepts a null category and defaults the note", () => {
    const { note: _n, ...rest } = validTx;
    const r = transactionInputSchema.safeParse({ ...rest, categoryId: null });
    expect(r.success && r.data.note).toBe("");
  });
  it("parses Persian-digit amount text", () => {
    const r = transactionInputSchema.safeParse({ ...validTx, amount: "۲۵,۰۰۰" });
    expect(r.success && r.data.amount).toBe(25000);
  });
  it.each([0, -5, 1.5, "12.5", "abc", Number.MAX_SAFE_INTEGER + 1, NaN])(
    "rejects amount %j",
    (amount) =>
      expect(transactionInputSchema.safeParse({ ...validTx, amount }).success).toBe(false),
  );
  it("rejects an unknown type", () => {
    expect(transactionInputSchema.safeParse({ ...validTx, type: "transfer" }).success).toBe(false);
  });
  it("rejects non-uuid account/category ids", () => {
    expect(transactionInputSchema.safeParse({ ...validTx, accountId: "1" }).success).toBe(false);
    expect(transactionInputSchema.safeParse({ ...validTx, categoryId: "x" }).success).toBe(false);
  });
  it("rejects an overlong note", () => {
    expect(transactionInputSchema.safeParse({ ...validTx, note: "a".repeat(501) }).success).toBe(false);
  });
  it("strips a forged userId so ownership cannot be client-supplied", () => {
    const r = transactionInputSchema.safeParse({ ...validTx, userId: "attacker" });
    expect(r.success).toBe(true);
    if (r.success) expect("userId" in r.data).toBe(false);
  });
});

describe("transactionInputSchema — income vs expense", () => {
  it.each(["income", "expense"] as const)("accepts type %s", (type) => {
    const r = transactionInputSchema.safeParse({ ...validTx, type });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.type).toBe(type);
  });

  it("accepts the maximum safe integer amount", () => {
    const r = transactionInputSchema.safeParse({
      ...validTx,
      amount: Number.MAX_SAFE_INTEGER,
    });
    expect(r.success && r.data.amount).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("isoDateSchema", () => {
  it.each(["2026-10-16", "2024-02-29"])("accepts %s", (d) =>
    expect(isoDateSchema.safeParse(d).success).toBe(true));
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "26-1-1", "", "2026/10/16"])(
    "rejects %j",
    (d) => expect(isoDateSchema.safeParse(d).success).toBe(false),
  );
});

describe("accountInputSchema", () => {
  it("accepts valid input and allows a zero opening balance", () => {
    expect(accountInputSchema.safeParse({ name: "نقدی", type: "cash", openingBalance: 0 }).success).toBe(true);
  });
  it("rejects a bad type, blank name and negative balance", () => {
    expect(accountInputSchema.safeParse({ name: "a", type: "crypto", openingBalance: 0 }).success).toBe(false);
    expect(accountInputSchema.safeParse({ name: "  ", type: "cash", openingBalance: 0 }).success).toBe(false);
    expect(accountInputSchema.safeParse({ name: "a", type: "cash", openingBalance: -1 }).success).toBe(false);
  });
});

describe("categoryInputSchema", () => {
  it("validates kind", () => {
    expect(categoryInputSchema.safeParse({ name: "غذا", kind: "expense" }).success).toBe(true);
    expect(categoryInputSchema.safeParse({ name: "غذا", kind: "other" }).success).toBe(false);
  });
});

describe("categoryNameInputSchema", () => {
  it("accepts a valid name and trims surrounding whitespace", () => {
    const r = categoryNameInputSchema.safeParse({ name: "  غذا  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("غذا");
  });

  it.each(["", "   "])("rejects a blank name (%j)", (name) => {
    expect(categoryNameInputSchema.safeParse({ name }).success).toBe(false);
  });

  it("rejects a name longer than 60 characters", () => {
    expect(categoryNameInputSchema.safeParse({ name: "a".repeat(60) }).success).toBe(true);
    expect(categoryNameInputSchema.safeParse({ name: "a".repeat(61) }).success).toBe(false);
  });

  it("strips extra keys so kind and ownership cannot be changed by a rename", () => {
    const r = categoryNameInputSchema.safeParse({
      name: "غذا",
      kind: "income",
      userId: "attacker",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect("kind" in r.data).toBe(false);
      expect("userId" in r.data).toBe(false);
    }
  });
});