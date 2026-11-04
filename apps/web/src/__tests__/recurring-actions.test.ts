/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  createCalls: [] as Array<{ userId: string; input: unknown }>,
  toggleCalls: [] as Array<{
    userId: string;
    recurringId: string;
    active: boolean;
  }>,
  deleteCalls: [] as Array<{ userId: string; recurringId: string }>,
}));

vi.mock("@/lib/dal", () => ({
  requireUserId: vi.fn(async () => "user-1"),
  isEmailVerified: vi.fn(async () => true),
}));

vi.mock("@/lib/finance/recurring", () => ({
  createRecurring: vi.fn(async (userId: string, input: unknown) => {
    h.createCalls.push({ userId, input });
    return { ok: true, recurring: { id: "r-1" } };
  }),
  setRecurringActive: vi.fn(
    async (userId: string, recurringId: string, active: boolean) => {
      h.toggleCalls.push({ userId, recurringId, active });
      return true;
    },
  ),
  deleteRecurring: vi.fn(async (userId: string, recurringId: string) => {
    h.deleteCalls.push({ userId, recurringId });
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
  createRecurringAction,
  deleteRecurringAction,
  toggleRecurringActiveAction,
} from "@/app/actions/recurring";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
import * as dal from "@/lib/dal";
import * as recurringDal from "@/lib/finance/recurring";
import {
  EMPTY_DELETE_RECURRING_STATE,
  EMPTY_RECURRING_FORM_STATE,
  EMPTY_TOGGLE_RECURRING_STATE,
} from "@/lib/recurring-form";
import { revalidatePath } from "next/cache";

const RULE_ID = "55555555-5555-4555-8555-555555555555";

function baseForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("accountId", "acc-1");
  fd.set("type", "expense");
  fd.set("amount", "۱۵۰٬۰۰۰");
  fd.set("categoryId", "");
  fd.set("frequency", "monthly");
  fd.set("dayOfMonth", "15");
  fd.set("weekday", "6");
  fd.set("startOn", "2026-10-01");
  fd.set("endOn", "");
  fd.set("note", "اجاره ماهانه");
  for (const [key, value] of Object.entries(overrides)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  h.createCalls = [];
  h.toggleCalls = [];
  h.deleteCalls = [];
  vi.clearAllMocks();
});

describe("createRecurringAction", () => {
  it("rejects an unverified email without touching the domain", async () => {
    vi.mocked(dal.isEmailVerified).mockResolvedValueOnce(false);

    const result = await createRecurringAction(
      EMPTY_RECURRING_FORM_STATE,
      baseForm(),
    );

    expect(result).toEqual({
      status: "error",
      message: VERIFY_EMAIL_REQUIRED_MESSAGE,
    });
    expect(recurringDal.createRecurring).not.toHaveBeenCalled();
  });

  it("creates a monthly rule, forcing weekday to null, then redirects", async () => {
    await expect(
      createRecurringAction(EMPTY_RECURRING_FORM_STATE, baseForm()),
    ).rejects.toThrow("REDIRECT:/transactions/recurring");

    expect(h.createCalls).toHaveLength(1);
    expect(h.createCalls[0]).toEqual({
      userId: "user-1",
      input: {
        accountId: "acc-1",
        categoryId: null,
        type: "expense",
        amount: "۱۵۰٬۰۰۰",
        note: "اجاره ماهانه",
        frequency: "monthly",
        dayOfMonth: 15,
        weekday: null,
        startOn: "2026-10-01",
        endOn: null,
      },
    });

    for (const path of [
      "/transactions/recurring",
      "/transactions",
      "/dashboard",
      "/accounts",
    ]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("creates a weekly rule, forcing dayOfMonth to null", async () => {
    await expect(
      createRecurringAction(
        EMPTY_RECURRING_FORM_STATE,
        baseForm({ frequency: "weekly" }),
      ),
    ).rejects.toThrow("REDIRECT:/transactions/recurring");

    expect(h.createCalls[0].input).toMatchObject({
      frequency: "weekly",
      dayOfMonth: null,
      weekday: 6,
    });
  });
});

describe("toggleRecurringActiveAction", () => {
  it("toggles the owned rule using the session user id", async () => {
    const fd = new FormData();
    fd.set("id", RULE_ID);
    fd.set("active", "false");

    const result = await toggleRecurringActiveAction(
      EMPTY_TOGGLE_RECURRING_STATE,
      fd,
    );

    expect(result).toEqual({ status: "success" });
    expect(h.toggleCalls).toEqual([
      { userId: "user-1", recurringId: RULE_ID, active: false },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/transactions/recurring");
  });
});

describe("deleteRecurringAction", () => {
  it("deletes the owned rule using the session user id", async () => {
    const fd = new FormData();
    fd.set("id", RULE_ID);

    const result = await deleteRecurringAction(
      EMPTY_DELETE_RECURRING_STATE,
      fd,
    );

    expect(result).toEqual({ status: "success" });
    expect(h.deleteCalls).toEqual([
      { userId: "user-1", recurringId: RULE_ID },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/transactions/recurring");
  });
});
