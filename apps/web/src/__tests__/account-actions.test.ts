/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireUserIdCalls: 0,
  createAccountCalls: [] as Array<{ userId: string; input: unknown }>,
  deleteAccountCalls: [] as Array<{ userId: string; input: unknown }>,
}));

vi.mock("@/lib/dal", () => ({
  requireUserId: vi.fn(async () => {
    h.requireUserIdCalls += 1;
    return "user-1";
  }),
}));

vi.mock("@/lib/finance/accounts", () => ({
  createAccount: vi.fn(async (userId: string, input: unknown) => {
    h.createAccountCalls.push({ userId, input });
    return { ok: true, account: { id: "acc-1" } };
  }),
  deleteAccount: vi.fn(async (userId: string, input: unknown) => {
    h.deleteAccountCalls.push({ userId, input });
    return { ok: true };
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));

import {
  createAccountAction,
  deleteAccountAction,
} from "@/app/actions/accounts";
import { EMPTY_ACCOUNT_FORM_STATE, EMPTY_DELETE_ACCOUNT_STATE } from "@/lib/accounts-form";
import * as accountsDal from "@/lib/finance/accounts";
import * as dal from "@/lib/dal";
import { revalidatePath } from "next/cache";

beforeEach(() => {
  h.requireUserIdCalls = 0;
  h.createAccountCalls = [];
  h.deleteAccountCalls = [];
  vi.clearAllMocks();
});

describe("createAccountAction", () => {
  it("calls createAccount with owner from session and revalidates path on success", async () => {
    const fd = new FormData();
    fd.set("name", "نقدی");
    fd.set("type", "cash");
    fd.set("openingBalance", "100000");

    const res = await createAccountAction(EMPTY_ACCOUNT_FORM_STATE, fd);
    expect(res.status).toBe("success");
    expect(h.requireUserIdCalls).toBeGreaterThan(0);
    expect(accountsDal.createAccount).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
  });

  it("returns field errors when creation fails", async () => {
    vi.mocked(accountsDal.createAccount).mockResolvedValueOnce({
      ok: false,
      fieldErrors: { name: "نام را وارد کنید." },
    } as never);

    const fd = new FormData();
    fd.set("name", "");
    fd.set("type", "cash");
    fd.set("openingBalance", "0");

    const res = await createAccountAction(EMPTY_ACCOUNT_FORM_STATE, fd);
    expect(res.status).toBe("error");
    expect(res.fieldErrors?.name).toBe("نام را وارد کنید.");
  });

  it("forwards unauthenticated case (requireUserId would redirect in real app)", async () => {
    vi.mocked(dal.requireUserId).mockImplementationOnce(async () => {
      h.requireUserIdCalls += 1;
      throw new Error("REDIRECT");
    });

    const fd = new FormData();
    fd.set("name", "نقدی");
    fd.set("type", "cash");

    await expect(
      createAccountAction(EMPTY_ACCOUNT_FORM_STATE, fd),
    ).rejects.toThrow();
  });
});

describe("deleteAccountAction", () => {
  it("deletes an empty account and revalidates on success", async () => {
    const fd = new FormData();
    fd.set("accountId", "acc-1");

    const res = await deleteAccountAction(EMPTY_DELETE_ACCOUNT_STATE, fd);
    expect(res.status).toBe("success");
    expect(accountsDal.deleteAccount).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
  });

  it("returns error message when account has transactions", async () => {
    vi.mocked(accountsDal.deleteAccount).mockResolvedValueOnce({
      ok: false,
      reason: "has_transactions",
      transactionCount: 3,
    } as never);

    const fd = new FormData();
    fd.set("accountId", "acc-1");

    const res = await deleteAccountAction(EMPTY_DELETE_ACCOUNT_STATE, fd);
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/3/);
  });

  it("returns not-found message when account does not exist", async () => {
    vi.mocked(accountsDal.deleteAccount).mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    } as never);

    const fd = new FormData();
    fd.set("accountId", "acc-1");

    const res = await deleteAccountAction(EMPTY_DELETE_ACCOUNT_STATE, fd);
    expect(res.status).toBe("error");
    expect(res.message).toBeDefined();
  });
});
