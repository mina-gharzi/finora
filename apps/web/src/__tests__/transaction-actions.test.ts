/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireUserIdCalls: 0,
  createCalls: [] as Array<{ userId: string; input: unknown }>,
}));

vi.mock("@/lib/dal", () => ({
  requireUserId: vi.fn(async () => {
    h.requireUserIdCalls += 1;
    return "user-1";
  }),
}));

vi.mock("@/lib/finance/transactions", () => ({
  createTransaction: vi.fn(async (userId: string, input: unknown) => {
    h.createCalls.push({ userId, input });
    return { ok: true, transaction: { id: "t-1" } };
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));

import { createTransactionAction } from "@/app/actions/transactions";
import { EMPTY_TRANSACTION_FORM_STATE } from "@/lib/transactions-form";
import * as transactionsDal from "@/lib/finance/transactions";
import * as dal from "@/lib/dal";
import { revalidatePath } from "next/cache";

function baseForm(): FormData {
  const fd = new FormData();
  fd.set("accountId", "acc-1");
  fd.set("type", "income");
  fd.set("amount", "۱۲۰٬۰۰۰");
  fd.set("occurredOn", "2026-10-18");
  fd.set("note", "حقوق مهر");
  return fd;
}

beforeEach(() => {
  h.requireUserIdCalls = 0;
  h.createCalls = [];
  vi.clearAllMocks();
});

describe("createTransactionAction", () => {
  it("creates the transaction with the owner from the session and revalidates", async () => {
    const res = await createTransactionAction(
      EMPTY_TRANSACTION_FORM_STATE,
      baseForm(),
    );

    expect(res.status).toBe("success");
    expect(h.requireUserIdCalls).toBeGreaterThan(0);
    expect(transactionsDal.createTransaction).toHaveBeenCalledTimes(1);

    const call = h.createCalls[0];
    expect(call.userId).toBe("user-1");
    expect(call.input).toMatchObject({
      accountId: "acc-1",
      categoryId: null,
      type: "income",
      amount: "۱۲۰٬۰۰۰",
      occurredOn: "2026-10-18",
      note: "حقوق مهر",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
  });

  it("never forwards a client-supplied owner id", async () => {
    const fd = baseForm();
    fd.set("userId", "attacker");

    await createTransactionAction(EMPTY_TRANSACTION_FORM_STATE, fd);

    const call = h.createCalls[0];
    expect(call.userId).toBe("user-1");
    expect((call.input as Record<string, unknown>).userId).toBeUndefined();
  });

  it("maps an empty category selection to null", async () => {
    const fd = baseForm();
    fd.set("categoryId", "");

    await createTransactionAction(EMPTY_TRANSACTION_FORM_STATE, fd);

    expect(h.createCalls[0].input).toMatchObject({ categoryId: null });
  });

  it("trims a provided category id", async () => {
    const fd = baseForm();
    fd.set("categoryId", " cat-1 ");

    await createTransactionAction(EMPTY_TRANSACTION_FORM_STATE, fd);

    expect(h.createCalls[0].input).toMatchObject({ categoryId: "cat-1" });
  });

  it("returns field errors when the domain rejects the input", async () => {
    vi.mocked(transactionsDal.createTransaction).mockResolvedValueOnce({
      ok: false,
      fieldErrors: { amount: "مبلغ باید بیشتر از صفر باشد." },
    } as never);

    const res = await createTransactionAction(
      EMPTY_TRANSACTION_FORM_STATE,
      baseForm(),
    );

    expect(res.status).toBe("error");
    expect(res.fieldErrors?.amount).toBe("مبلغ باید بیشتر از صفر باشد.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("propagates an unauthenticated rejection (requireUserId redirects in the app)", async () => {
    vi.mocked(dal.requireUserId).mockImplementationOnce(async () => {
      throw new Error("REDIRECT");
    });

    await expect(
      createTransactionAction(EMPTY_TRANSACTION_FORM_STATE, baseForm()),
    ).rejects.toThrow();
  });
});
