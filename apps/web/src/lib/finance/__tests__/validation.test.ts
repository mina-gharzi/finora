import { describe, expect, it } from "vitest";
import {
  accountInputSchema,
  budgetInputSchema,
  categoryInputSchema,
  categoryNameInputSchema,
  isoDateSchema,
  recurringInputSchema,
  transactionInputSchema,
  transferInputSchema,
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

describe("budgetInputSchema", () => {
  const validBudget = {
    categoryId: uuid,
    monthStart: "2026-10-16",
    limitAmount: 1200000,
  };

  it("accepts a valid budget", () => {
    const r = budgetInputSchema.safeParse(validBudget);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limitAmount).toBe(1200000);
  });

  it("parses Persian-digit limit text", () => {
    const r = budgetInputSchema.safeParse({ ...validBudget, limitAmount: "۱٬۲۰۰٬۰۰۰" });
    expect(r.success && r.data.limitAmount).toBe(1200000);
  });

  it.each([0, -1, 1.5, "0", "abc", Number.MAX_SAFE_INTEGER + 1, NaN])(
    "rejects a non-positive or non-integer limit %j",
    (limitAmount) =>
      expect(budgetInputSchema.safeParse({ ...validBudget, limitAmount }).success).toBe(false),
  );

  it("rejects a non-uuid category id", () => {
    expect(budgetInputSchema.safeParse({ ...validBudget, categoryId: "1" }).success).toBe(false);
  });

  it("rejects a malformed month start", () => {
    expect(budgetInputSchema.safeParse({ ...validBudget, monthStart: "2026-13-01" }).success).toBe(false);
    expect(budgetInputSchema.safeParse({ ...validBudget, monthStart: "2026/10/16" }).success).toBe(false);
  });

  it("strips a forged userId so ownership cannot be client-supplied", () => {
    const r = budgetInputSchema.safeParse({ ...validBudget, userId: "attacker" });
    expect(r.success).toBe(true);
    if (r.success) expect("userId" in r.data).toBe(false);
  });
});

describe("transferInputSchema", () => {
  const otherUuid = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  const validTransfer = {
    fromAccountId: uuid,
    toAccountId: otherUuid,
    amount: 25000,
    occurredOn: "2026-10-16",
    note: "  انتقال ",
  };

  it("accepts a valid transfer and trims the note", () => {
    const r = transferInputSchema.safeParse(validTransfer);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.note).toBe("انتقال");
  });

  it("rejects the same account on both sides with the Persian message", () => {
    const r = transferInputSchema.safeParse({
      ...validTransfer,
      toAccountId: uuid,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "حساب مبدأ و مقصد نباید یکی باشند.",
      );
    }
  });

  it.each([0, -5, 1.5, "12.5", "abc", Number.MAX_SAFE_INTEGER + 1, NaN])(
    "rejects amount %j",
    (amount) =>
      expect(
        transferInputSchema.safeParse({ ...validTransfer, amount }).success,
      ).toBe(false),
  );

  it("rejects non-uuid account ids and a malformed date", () => {
    expect(
      transferInputSchema.safeParse({ ...validTransfer, fromAccountId: "1" })
        .success,
    ).toBe(false);
    expect(
      transferInputSchema.safeParse({ ...validTransfer, toAccountId: "x" })
        .success,
    ).toBe(false);
    expect(
      transferInputSchema.safeParse({
        ...validTransfer,
        occurredOn: "2026-02-30",
      }).success,
    ).toBe(false);
  });

  it("strips a forged userId so ownership cannot be client-supplied", () => {
    const r = transferInputSchema.safeParse({
      ...validTransfer,
      userId: "attacker",
    });
    expect(r.success).toBe(true);
    if (r.success) expect("userId" in r.data).toBe(false);
  });
});

describe("recurringInputSchema", () => {
  const validMonthly = {
    accountId: uuid,
    categoryId: uuid,
    type: "expense",
    amount: 25000,
    note: "  اجاره ",
    frequency: "monthly",
    dayOfMonth: 15,
    startOn: "2026-10-16",
    endOn: null,
  };

  const validWeekly = {
    ...validMonthly,
    frequency: "weekly",
    dayOfMonth: null,
    weekday: 5,
  };

  it("accepts a monthly rule and trims the note", () => {
    const r = recurringInputSchema.safeParse(validMonthly);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.note).toBe("اجاره");
  });

  it("accepts a weekly rule and defaults endOn to null", () => {
    const { endOn: _e, ...rest } = validWeekly;
    const r = recurringInputSchema.safeParse(rest);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.endOn).toBeNull();
  });

  it("requires dayOfMonth for monthly rules and forbids weekday", () => {
    const missing = recurringInputSchema.safeParse({
      ...validMonthly,
      dayOfMonth: null,
    });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues[0]?.message).toBe("روز ماه را وارد کنید.");
    }

    const both = recurringInputSchema.safeParse({
      ...validMonthly,
      weekday: 2,
    });
    expect(both.success).toBe(false);
  });

  it("requires weekday for weekly rules and forbids dayOfMonth", () => {
    const missing = recurringInputSchema.safeParse({
      ...validWeekly,
      weekday: null,
    });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues[0]?.message).toBe("روز هفته را وارد کنید.");
    }

    const both = recurringInputSchema.safeParse({
      ...validWeekly,
      dayOfMonth: 3,
    });
    expect(both.success).toBe(false);
  });

  it.each([0, 32, 1.5])("rejects dayOfMonth %j", (dayOfMonth) => {
    expect(
      recurringInputSchema.safeParse({ ...validMonthly, dayOfMonth }).success,
    ).toBe(false);
  });

  it.each([-1, 7, 1.5])("rejects weekday %j", (weekday) => {
    expect(
      recurringInputSchema.safeParse({ ...validWeekly, weekday }).success,
    ).toBe(false);
  });

  it.each([0, -5, 1.5, "12.5", "abc", Number.MAX_SAFE_INTEGER + 1, NaN])(
    "rejects amount %j",
    (amount) => {
      expect(
        recurringInputSchema.safeParse({ ...validMonthly, amount }).success,
      ).toBe(false);
    },
  );

  it("rejects endOn before startOn with the Persian message", () => {
    const r = recurringInputSchema.safeParse({
      ...validMonthly,
      endOn: "2026-10-15",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some(
          (issue) =>
            issue.path[0] === "endOn" &&
            issue.message === "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.",
        ),
      ).toBe(true);
    }
  });

  it("rejects non-uuid references and a malformed start date", () => {
    expect(
      recurringInputSchema.safeParse({ ...validMonthly, accountId: "1" })
        .success,
    ).toBe(false);
    expect(
      recurringInputSchema.safeParse({ ...validMonthly, categoryId: "1" })
        .success,
    ).toBe(false);
    expect(
      recurringInputSchema.safeParse({
        ...validMonthly,
        startOn: "2026-02-30",
      }).success,
    ).toBe(false);
  });

  it("strips a forged userId so ownership cannot be client-supplied", () => {
    const r = recurringInputSchema.safeParse({
      ...validMonthly,
      userId: "attacker",
    });
    expect(r.success).toBe(true);
    if (r.success) expect("userId" in r.data).toBe(false);
  });
});