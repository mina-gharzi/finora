/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireUserIdCalls: 0,
  verified: true,
  createBudgetCalls: [] as Array<{ userId: string; input: unknown }>,
  updateBudgetCalls: [] as Array<{
    userId: string;
    budgetId: string;
    input: unknown;
  }>,
  deleteBudgetCalls: [] as Array<{ userId: string; budgetId: string }>,
}));

vi.mock("@/lib/dal", () => ({
  requireUserId: vi.fn(async () => {
    h.requireUserIdCalls += 1;
    return "user-1";
  }),
  isEmailVerified: vi.fn(async () => h.verified),
}));

vi.mock("@/lib/finance/budgets", () => ({
  createBudget: vi.fn(async (userId: string, input: unknown) => {
    h.createBudgetCalls.push({ userId, input });
    return { ok: true, budget: { id: "budget-1" } };
  }),
  updateBudget: vi.fn(async (userId: string, budgetId: string, input: unknown) => {
    h.updateBudgetCalls.push({ userId, budgetId, input });
    return { ok: true, budget: { id: budgetId } };
  }),
  deleteBudget: vi.fn(async (userId: string, budgetId: string) => {
    h.deleteBudgetCalls.push({ userId, budgetId });
    return { ok: true };
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));

import {
  createBudgetAction,
  deleteBudgetAction,
  updateBudgetAction,
} from "@/app/actions/budgets";
import {
  EMPTY_BUDGET_EDIT_STATE,
  EMPTY_BUDGET_FORM_STATE,
  EMPTY_DELETE_BUDGET_STATE,
} from "@/lib/budgets-form";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
import * as budgetsDal from "@/lib/finance/budgets";
import * as dal from "@/lib/dal";
import { revalidatePath } from "next/cache";

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  h.requireUserIdCalls = 0;
  h.verified = true;
  h.createBudgetCalls = [];
  h.updateBudgetCalls = [];
  h.deleteBudgetCalls = [];
  vi.clearAllMocks();
});

describe("createBudgetAction", () => {
  it("derives the owner from the session and revalidates on success", async () => {
    const res = await createBudgetAction(
      EMPTY_BUDGET_FORM_STATE,
      formData({
        categoryId: "cat-1",
        monthStart: "2026-09-23",
        limitAmount: "1200000",
      }),
    );

    expect(res.status).toBe("success");
    expect(h.createBudgetCalls[0]).toMatchObject({
      userId: "user-1",
      input: {
        categoryId: "cat-1",
        monthStart: "2026-09-23",
        limitAmount: "1200000",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/budgets");
  });

  it("reports a duplicate as its own message", async () => {
    vi.mocked(budgetsDal.createBudget).mockResolvedValueOnce({
      ok: false,
      reason: "duplicate",
    } as never);

    const res = await createBudgetAction(
      EMPTY_BUDGET_FORM_STATE,
      formData({ categoryId: "cat-1", monthStart: "2026-09-23", limitAmount: "1" }),
    );

    expect(res.status).toBe("error");
    expect(res.message).toContain("از قبل بودجه ثبت شده است");
  });

  it("returns field errors when creation fails validation", async () => {
    vi.mocked(budgetsDal.createBudget).mockResolvedValueOnce({
      ok: false,
      reason: "invalid",
      fieldErrors: { limitAmount: "مبلغ معتبر نیست." },
    } as never);

    const res = await createBudgetAction(
      EMPTY_BUDGET_FORM_STATE,
      formData({ categoryId: "cat-1", monthStart: "2026-09-23", limitAmount: "x" }),
    );

    expect(res.status).toBe("error");
    expect(res.fieldErrors?.limitAmount).toBe("مبلغ معتبر نیست.");
  });

  it("blocks an unverified email before touching the data layer", async () => {
    h.verified = false;

    const res = await createBudgetAction(
      EMPTY_BUDGET_FORM_STATE,
      formData({ categoryId: "cat-1", monthStart: "2026-09-23", limitAmount: "1" }),
    );

    expect(res).toEqual({
      status: "error",
      message: VERIFY_EMAIL_REQUIRED_MESSAGE,
    });
    expect(budgetsDal.createBudget).not.toHaveBeenCalled();
  });

  it("forwards an unauthenticated request (requireUserId redirects in the app)", async () => {
    vi.mocked(dal.requireUserId).mockImplementationOnce(async () => {
      throw new Error("REDIRECT");
    });

    await expect(
      createBudgetAction(
        EMPTY_BUDGET_FORM_STATE,
        formData({ categoryId: "cat-1", monthStart: "2026-09-23", limitAmount: "1" }),
      ),
    ).rejects.toThrow();
  });
});

describe("updateBudgetAction", () => {
  it("updates using the session owner and revalidates on success", async () => {
    const res = await updateBudgetAction(
      EMPTY_BUDGET_EDIT_STATE,
      formData({
        budgetId: "budget-1",
        categoryId: "cat-1",
        monthStart: "2026-09-23",
        limitAmount: "900000",
      }),
    );

    expect(res.status).toBe("success");
    expect(h.updateBudgetCalls[0]).toMatchObject({
      userId: "user-1",
      budgetId: "budget-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/budgets");
  });

  it("rejects a blank id without calling the data layer", async () => {
    const res = await updateBudgetAction(
      EMPTY_BUDGET_EDIT_STATE,
      formData({ budgetId: "", categoryId: "cat-1", monthStart: "2026-09-23", limitAmount: "1" }),
    );

    expect(res.status).toBe("error");
    expect(budgetsDal.updateBudget).not.toHaveBeenCalled();
  });

  it("returns a generic message for a foreign or missing budget", async () => {
    vi.mocked(budgetsDal.updateBudget).mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    } as never);

    const res = await updateBudgetAction(
      EMPTY_BUDGET_EDIT_STATE,
      formData({ budgetId: "budget-1", categoryId: "cat-1", monthStart: "2026-09-23", limitAmount: "1" }),
    );

    expect(res.status).toBe("error");
    expect(res.message).toBeDefined();
  });

  it("reports a duplicate as its own message", async () => {
    vi.mocked(budgetsDal.updateBudget).mockResolvedValueOnce({
      ok: false,
      reason: "duplicate",
    } as never);

    const res = await updateBudgetAction(
      EMPTY_BUDGET_EDIT_STATE,
      formData({ budgetId: "budget-1", categoryId: "cat-1", monthStart: "2026-09-23", limitAmount: "1" }),
    );

    expect(res.status).toBe("error");
    expect(res.message).toContain("از قبل بودجه ثبت شده است");
  });
});

describe("deleteBudgetAction", () => {
  it("deletes using the session owner and revalidates on success", async () => {
    const res = await deleteBudgetAction(
      EMPTY_DELETE_BUDGET_STATE,
      formData({ budgetId: "budget-1" }),
    );

    expect(res.status).toBe("success");
    expect(h.deleteBudgetCalls[0]).toMatchObject({
      userId: "user-1",
      budgetId: "budget-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/budgets");
  });

  it("returns a generic message when the budget is not found", async () => {
    vi.mocked(budgetsDal.deleteBudget).mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    } as never);

    const res = await deleteBudgetAction(
      EMPTY_DELETE_BUDGET_STATE,
      formData({ budgetId: "budget-1" }),
    );

    expect(res.status).toBe("error");
    expect(res.message).toBeDefined();
  });

  it("blocks an unverified email before touching the data layer", async () => {
    h.verified = false;

    const res = await deleteBudgetAction(
      EMPTY_DELETE_BUDGET_STATE,
      formData({ budgetId: "budget-1" }),
    );

    expect(res).toEqual({
      status: "error",
      message: VERIFY_EMAIL_REQUIRED_MESSAGE,
    });
    expect(budgetsDal.deleteBudget).not.toHaveBeenCalled();
  });
});
