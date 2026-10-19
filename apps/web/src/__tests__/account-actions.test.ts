/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireUserIdCalls: 0,
  createAccountCalls: [] as Array<{ userId: string; input: unknown }>,
  deleteAccountCalls: [] as Array<{ userId: string; input: unknown }>,
  archiveCalls: [] as Array<{ userId: string; id: string; archived: boolean }>,
}));

vi.mock("@/lib/dal", () => ({
  requireUserId: vi.fn(async () => {
    h.requireUserIdCalls += 1;
    return "user-1";
  }),
  isEmailVerified: vi.fn(async () => true),
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
  setAccountArchived: vi.fn(
    async (userId: string, id: string, archived: boolean) => {
      h.archiveCalls.push({ userId, id, archived });
      return { ok: true, account: { id } };
    },
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));

import {
  createAccountAction,
  deleteAccountAction,
  setAccountArchivedAction,
} from "@/app/actions/accounts";
import {
  EMPTY_ACCOUNT_FORM_STATE,
  EMPTY_ARCHIVE_ACCOUNT_STATE,
  EMPTY_DELETE_ACCOUNT_STATE,
} from "@/lib/accounts-form";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
import * as accountsDal from "@/lib/finance/accounts";
import * as dal from "@/lib/dal";
import { revalidatePath } from "next/cache";

beforeEach(() => {
  h.requireUserIdCalls = 0;
  h.createAccountCalls = [];
  h.deleteAccountCalls = [];
  h.archiveCalls = [];
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

describe("setAccountArchivedAction", () => {
  it("archives using the session owner and revalidates the affected routes", async () => {
    const fd = new FormData();
    fd.set("accountId", "acc-1");
    fd.set("archived", "true");

    const res = await setAccountArchivedAction(EMPTY_ARCHIVE_ACCOUNT_STATE, fd);

    expect(res.status).toBe("success");
    expect(h.requireUserIdCalls).toBeGreaterThan(0);
    expect(h.archiveCalls).toEqual([
      { userId: "user-1", id: "acc-1", archived: true },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions/new");
  });

  it("unarchives when the archived field is not 'true'", async () => {
    const fd = new FormData();
    fd.set("accountId", "acc-1");
    fd.set("archived", "false");

    const res = await setAccountArchivedAction(EMPTY_ARCHIVE_ACCOUNT_STATE, fd);

    expect(res.status).toBe("success");
    expect(h.archiveCalls[0]).toEqual({
      userId: "user-1",
      id: "acc-1",
      archived: false,
    });
  });

  it("rejects an empty account id without calling the DAL", async () => {
    const fd = new FormData();
    fd.set("accountId", "");
    fd.set("archived", "true");

    const res = await setAccountArchivedAction(EMPTY_ARCHIVE_ACCOUNT_STATE, fd);

    expect(res.status).toBe("error");
    expect(accountsDal.setAccountArchived).not.toHaveBeenCalled();
  });

  it("collapses a foreign or missing account into a generic error", async () => {
    vi.mocked(accountsDal.setAccountArchived).mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    } as never);

    const fd = new FormData();
    fd.set("accountId", "acc-1");
    fd.set("archived", "true");

    const res = await setAccountArchivedAction(EMPTY_ARCHIVE_ACCOUNT_STATE, fd);

    expect(res.status).toBe("error");
    expect(res.message).toBe("حساب موردنظر یافت نشد.");
  });

  it("propagates the unauthenticated redirect", async () => {
    vi.mocked(dal.requireUserId).mockImplementationOnce(async () => {
      throw new Error("REDIRECT");
    });

    const fd = new FormData();
    fd.set("accountId", "acc-1");
    fd.set("archived", "true");

    await expect(
      setAccountArchivedAction(EMPTY_ARCHIVE_ACCOUNT_STATE, fd),
    ).rejects.toThrow();
  });
});

describe("account actions — email verification gate", () => {
  it("blocks every mutation for an unverified account before touching the domain", async () => {
    vi.mocked(dal.isEmailVerified).mockResolvedValue(false);

    const createForm = new FormData();
    createForm.set("name", "نقدی");
    createForm.set("type", "cash");
    createForm.set("openingBalance", "0");
    const createRes = await createAccountAction(EMPTY_ACCOUNT_FORM_STATE, createForm);
    expect(createRes.status).toBe("error");
    expect(createRes.message).toBe(VERIFY_EMAIL_REQUIRED_MESSAGE);
    expect(accountsDal.createAccount).not.toHaveBeenCalled();

    const deleteForm = new FormData();
    deleteForm.set("accountId", "acc-1");
    const deleteRes = await deleteAccountAction(EMPTY_DELETE_ACCOUNT_STATE, deleteForm);
    expect(deleteRes.status).toBe("error");
    expect(deleteRes.message).toBe(VERIFY_EMAIL_REQUIRED_MESSAGE);
    expect(accountsDal.deleteAccount).not.toHaveBeenCalled();

    const archiveForm = new FormData();
    archiveForm.set("accountId", "acc-1");
    archiveForm.set("archived", "true");
    const archiveRes = await setAccountArchivedAction(EMPTY_ARCHIVE_ACCOUNT_STATE, archiveForm);
    expect(archiveRes.status).toBe("error");
    expect(archiveRes.message).toBe(VERIFY_EMAIL_REQUIRED_MESSAGE);
    expect(accountsDal.setAccountArchived).not.toHaveBeenCalled();

    expect(h.requireUserIdCalls).toBe(3);
  });

  it("still asks the session for the owner before the gate (no enumeration by id)", async () => {
    vi.mocked(dal.isEmailVerified).mockResolvedValue(false);

    const fd = new FormData();
    fd.set("name", "نقدی");
    fd.set("type", "cash");
    fd.set("openingBalance", "0");

    await createAccountAction(EMPTY_ACCOUNT_FORM_STATE, fd);
    // The session is resolved first, so the gate answers for any authenticated
    // id without leaking whether a resource exists.
    expect(dal.requireUserId).toHaveBeenCalled();
    expect(h.requireUserIdCalls).toBe(1);
    expect(accountsDal.createAccount).not.toHaveBeenCalled();
  });
});
