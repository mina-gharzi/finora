/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";

const h = vi.hoisted(() => ({
  requireUserIdCalls: 0,
  createCalls: [] as Array<{ userId: string; input: unknown }>,
  updateCalls: [] as Array<{
    userId: string;
    transactionId: string;
    input: unknown;
  }>,
  deleteCalls: [] as Array<{ userId: string; transactionId: string }>,
}));

vi.mock("@/lib/dal", () => ({
  requireUserId: vi.fn(async () => {
    h.requireUserIdCalls += 1;
    return "user-1";
  }),
  isEmailVerified: vi.fn(async () => true),
}));

vi.mock("@/lib/finance/transactions", () => ({
  createTransaction: vi.fn(async (userId: string, input: unknown) => {
    h.createCalls.push({ userId, input });
    return { ok: true, transaction: { id: "t-1" } };
  }),
  updateTransaction: vi.fn(
    async (userId: string, transactionId: string, input: unknown) => {
      h.updateCalls.push({ userId, transactionId, input });
      return { ok: true, transaction: { id: transactionId } };
    },
  ),
  deleteTransaction: vi.fn(async (userId: string, transactionId: string) => {
    h.deleteCalls.push({ userId, transactionId });
    return true;
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import {
  createTransactionAction,
  deleteTransactionAction,
  updateTransactionAction,
} from "@/app/actions/transactions";
import {
  EMPTY_DELETE_TRANSACTION_STATE,
  EMPTY_TRANSACTION_FORM_STATE,
} from "@/lib/transactions-form";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
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

function editForm(overrides: Record<string, string> = {}): FormData {
  const fd = baseForm();
  fd.set("transactionId", "t-1");
  fd.set("returnTo", "/transactions?type=income");
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  h.requireUserIdCalls = 0;
  h.createCalls = [];
  h.updateCalls = [];
  h.deleteCalls = [];
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
});

describe("updateTransactionAction", () => {
  it("updates using the session owner and redirects to the filtered list", async () => {
    await expect(
      updateTransactionAction(EMPTY_TRANSACTION_FORM_STATE, editForm()),
    ).rejects.toThrow("REDIRECT:/transactions?type=income&updated=1");

    expect(h.updateCalls).toHaveLength(1);
    expect(h.updateCalls[0]).toMatchObject({
      userId: "user-1",
      transactionId: "t-1",
    });
    expect(h.updateCalls[0].input).toMatchObject({
      accountId: "acc-1",
      type: "income",
      amount: "۱۲۰٬۰۰۰",
      occurredOn: "2026-10-18",
      note: "حقوق مهر",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions/t-1/edit");
  });

  it("ignores a forged owner id", async () => {
    const fd = editForm();
    fd.set("userId", "attacker");

    await expect(
      updateTransactionAction(EMPTY_TRANSACTION_FORM_STATE, fd),
    ).rejects.toThrow();

    expect(h.updateCalls[0].userId).toBe("user-1");
  });

  it("returns field errors when the domain rejects the input", async () => {
    vi.mocked(transactionsDal.updateTransaction).mockResolvedValueOnce({
      ok: false,
      reason: "invalid",
      fieldErrors: { amount: "مبلغ باید بیشتر از صفر باشد." },
    } as never);

    const res = await updateTransactionAction(
      EMPTY_TRANSACTION_FORM_STATE,
      editForm(),
    );

    expect(res.status).toBe("error");
    expect(res.fieldErrors?.amount).toBe("مبلغ باید بیشتر از صفر باشد.");
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a generic error for a missing or foreign transaction", async () => {
    vi.mocked(transactionsDal.updateTransaction).mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    } as never);

    const res = await updateTransactionAction(
      EMPTY_TRANSACTION_FORM_STATE,
      editForm(),
    );

    expect(res.status).toBe("error");
    expect(res.message).toBe("تراکنش موردنظر یافت نشد.");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects a blank transaction id without touching the domain", async () => {
    const fd = editForm({ transactionId: "   " });

    const res = await updateTransactionAction(
      EMPTY_TRANSACTION_FORM_STATE,
      fd,
    );

    expect(res.status).toBe("error");
    expect(res.message).toBe("تراکنش موردنظر یافت نشد.");
    expect(transactionsDal.updateTransaction).not.toHaveBeenCalled();
  });

  it("normalizes a hostile returnTo to the unfiltered history path", async () => {
    const fd = editForm({ returnTo: "https://evil.example/steal" });

    await expect(
      updateTransactionAction(EMPTY_TRANSACTION_FORM_STATE, fd),
    ).rejects.toThrow("REDIRECT:/transactions?updated=1");
  });
});

describe("deleteTransactionAction", () => {
  it("deletes the owned transaction and redirects back to the list", async () => {
    await expect(
      deleteTransactionAction(EMPTY_DELETE_TRANSACTION_STATE, editForm()),
    ).rejects.toThrow("REDIRECT:/transactions?type=income");

    expect(h.deleteCalls).toHaveLength(1);
    expect(h.deleteCalls[0]).toEqual({
      userId: "user-1",
      transactionId: "t-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
  });

  it("returns a generic error when nothing was deleted", async () => {
    vi.mocked(transactionsDal.deleteTransaction).mockResolvedValueOnce(false);

    const res = await deleteTransactionAction(
      EMPTY_DELETE_TRANSACTION_STATE,
      editForm(),
    );

    expect(res.status).toBe("error");
    expect(res.message).toBe("تراکنش موردنظر یافت نشد.");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects a blank transaction id without touching the domain", async () => {
    const fd = editForm({ transactionId: "" });

    const res = await deleteTransactionAction(
      EMPTY_DELETE_TRANSACTION_STATE,
      fd,
    );

    expect(res.status).toBe("error");
    expect(res.message).toBe("تراکنش موردنظر یافت نشد.");
    expect(transactionsDal.deleteTransaction).not.toHaveBeenCalled();
  });

  it("normalizes a hostile returnTo to the unfiltered history path", async () => {
    const fd = editForm({ returnTo: "//evil.example" });

    await expect(
      deleteTransactionAction(EMPTY_DELETE_TRANSACTION_STATE, fd),
    ).rejects.toThrow("REDIRECT:/transactions");
  });
});

describe("transaction actions — unauthenticated", () => {
  it("propagates an unauthenticated rejection (requireUserId redirects in the app)", async () => {
    vi.mocked(dal.requireUserId).mockImplementationOnce(async () => {
      throw new Error("REDIRECT");
    });

    await expect(
      createTransactionAction(EMPTY_TRANSACTION_FORM_STATE, baseForm()),
    ).rejects.toThrow();
  });
});

describe("transaction actions — email verification gate", () => {
  it("blocks every mutation for an unverified account before touching the domain", async () => {
    vi.mocked(dal.isEmailVerified).mockResolvedValue(false);

    const createRes = await createTransactionAction(
      EMPTY_TRANSACTION_FORM_STATE,
      baseForm(),
    );
    expect(createRes.status).toBe("error");
    expect(createRes.message).toBe(VERIFY_EMAIL_REQUIRED_MESSAGE);
    expect(transactionsDal.createTransaction).not.toHaveBeenCalled();

    const updateRes = await updateTransactionAction(
      EMPTY_TRANSACTION_FORM_STATE,
      editForm(),
    );
    expect(updateRes.status).toBe("error");
    expect(updateRes.message).toBe(VERIFY_EMAIL_REQUIRED_MESSAGE);
    expect(transactionsDal.updateTransaction).not.toHaveBeenCalled();

    const deleteRes = await deleteTransactionAction(
      EMPTY_DELETE_TRANSACTION_STATE,
      editForm(),
    );
    expect(deleteRes.status).toBe("error");
    expect(deleteRes.message).toBe(VERIFY_EMAIL_REQUIRED_MESSAGE);
    expect(transactionsDal.deleteTransaction).not.toHaveBeenCalled();
  });
});
