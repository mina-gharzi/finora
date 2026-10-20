/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireUserIdCalls: 0,
  createCategoryCalls: [] as Array<{ userId: string; input: unknown }>,
  renameCategoryCalls: [] as Array<{
    userId: string;
    categoryId: string;
    input: unknown;
  }>,
  deleteCategoryCalls: [] as Array<{ userId: string; categoryId: string }>,
  setCategoryArchivedCalls: [] as Array<{
    userId: string;
    categoryId: string;
    archived: boolean;
  }>,
}));

vi.mock("@/lib/dal", () => ({
  requireUserId: vi.fn(async () => {
    h.requireUserIdCalls += 1;
    return "user-1";
  }),
  isEmailVerified: vi.fn(async () => true),
}));

vi.mock("@/lib/finance/categories", () => ({
  createCategory: vi.fn(async (userId: string, input: unknown) => {
    h.createCategoryCalls.push({ userId, input });
    return { ok: true, category: { id: "cat-1" } };
  }),
  renameCategory: vi.fn(
    async (userId: string, categoryId: string, input: unknown) => {
      h.renameCategoryCalls.push({ userId, categoryId, input });
      return { ok: true, category: { id: categoryId } };
    },
  ),
  deleteCategory: vi.fn(async (userId: string, categoryId: string) => {
    h.deleteCategoryCalls.push({ userId, categoryId });
    return { ok: true };
  }),
  setCategoryArchived: vi.fn(
    async (userId: string, categoryId: string, archived: boolean) => {
      h.setCategoryArchivedCalls.push({ userId, categoryId, archived });
      return { ok: true, category: { id: categoryId, archived } };
    },
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));

import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
  setCategoryArchivedAction,
} from "@/app/actions/categories";
import {
  EMPTY_ARCHIVE_CATEGORY_STATE,
  EMPTY_CATEGORY_FORM_STATE,
  EMPTY_CATEGORY_RENAME_STATE,
  EMPTY_DELETE_CATEGORY_STATE,
} from "@/lib/categories-form";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
import * as categoriesDal from "@/lib/finance/categories";
import * as dal from "@/lib/dal";
import { revalidatePath } from "next/cache";

beforeEach(() => {
  h.requireUserIdCalls = 0;
  h.createCategoryCalls = [];
  h.renameCategoryCalls = [];
  h.deleteCategoryCalls = [];
  h.setCategoryArchivedCalls = [];
  vi.clearAllMocks();
});

describe("createCategoryAction", () => {
  it("derives the owner from the session and revalidates affected views", async () => {
    const fd = new FormData();
    fd.set("name", "خرید روزانه");
    fd.set("kind", "expense");

    const res = await createCategoryAction(EMPTY_CATEGORY_FORM_STATE, fd);

    expect(res.status).toBe("success");
    expect(h.requireUserIdCalls).toBeGreaterThan(0);
    expect(h.createCategoryCalls[0]).toMatchObject({
      userId: "user-1",
      input: { name: "خرید روزانه", kind: "expense" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/categories");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions/new");
  });

  it("returns field errors when creation fails", async () => {
    vi.mocked(categoriesDal.createCategory).mockResolvedValueOnce({
      ok: false,
      fieldErrors: { name: "نام را وارد کنید." },
    } as never);

    const fd = new FormData();
    fd.set("name", "");
    fd.set("kind", "expense");

    const res = await createCategoryAction(EMPTY_CATEGORY_FORM_STATE, fd);
    expect(res.status).toBe("error");
    expect(res.fieldErrors?.name).toBe("نام را وارد کنید.");
  });

  it("forwards an unauthenticated request (requireUserId redirects in the app)", async () => {
    vi.mocked(dal.requireUserId).mockImplementationOnce(async () => {
      h.requireUserIdCalls += 1;
      throw new Error("REDIRECT");
    });

    const fd = new FormData();
    fd.set("name", "خرید");
    fd.set("kind", "expense");

    await expect(
      createCategoryAction(EMPTY_CATEGORY_FORM_STATE, fd),
    ).rejects.toThrow();
  });
});

describe("renameCategoryAction", () => {
  it("renames using the session owner and revalidates on success", async () => {
    const fd = new FormData();
    fd.set("categoryId", "cat-1");
    fd.set("name", "خرید هفتگی");

    const res = await renameCategoryAction(EMPTY_CATEGORY_RENAME_STATE, fd);

    expect(res.status).toBe("success");
    expect(h.renameCategoryCalls[0]).toMatchObject({
      userId: "user-1",
      categoryId: "cat-1",
      input: { name: "خرید هفتگی" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/categories");
  });

  it("rejects a blank id with a generic not-found message", async () => {
    const fd = new FormData();
    fd.set("categoryId", "");
    fd.set("name", "x");

    const res = await renameCategoryAction(EMPTY_CATEGORY_RENAME_STATE, fd);
    expect(res.status).toBe("error");
    expect(res.message).toBeDefined();
    expect(categoriesDal.renameCategory).not.toHaveBeenCalled();
  });

  it("returns a generic message for a foreign or missing category", async () => {
    vi.mocked(categoriesDal.renameCategory).mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    } as never);

    const fd = new FormData();
    fd.set("categoryId", "cat-1");
    fd.set("name", "x");

    const res = await renameCategoryAction(EMPTY_CATEGORY_RENAME_STATE, fd);
    expect(res.status).toBe("error");
    expect(res.message).toBeDefined();
  });

  it("returns field errors for an invalid name", async () => {
    vi.mocked(categoriesDal.renameCategory).mockResolvedValueOnce({
      ok: false,
      reason: "invalid",
      fieldErrors: { name: "نام را وارد کنید." },
    } as never);

    const fd = new FormData();
    fd.set("categoryId", "cat-1");
    fd.set("name", "");

    const res = await renameCategoryAction(EMPTY_CATEGORY_RENAME_STATE, fd);
    expect(res.status).toBe("error");
    expect(res.fieldErrors?.name).toBe("نام را وارد کنید.");
  });
});

describe("deleteCategoryAction", () => {
  it("deletes with the session owner and revalidates on success", async () => {
    const fd = new FormData();
    fd.set("categoryId", "cat-1");

    const res = await deleteCategoryAction(EMPTY_DELETE_CATEGORY_STATE, fd);

    expect(res.status).toBe("success");
    expect(h.deleteCategoryCalls[0]).toEqual({
      userId: "user-1",
      categoryId: "cat-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/categories");
  });

  it("explains when the category is still referenced by transactions", async () => {
    vi.mocked(categoriesDal.deleteCategory).mockResolvedValueOnce({
      ok: false,
      reason: "has_transactions",
      transactionCount: 3,
    } as never);

    const fd = new FormData();
    fd.set("categoryId", "cat-1");

    const res = await deleteCategoryAction(EMPTY_DELETE_CATEGORY_STATE, fd);
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/3/);
  });

  it("returns a generic message for a foreign or missing category", async () => {
    vi.mocked(categoriesDal.deleteCategory).mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    } as never);

    const fd = new FormData();
    fd.set("categoryId", "cat-1");

    const res = await deleteCategoryAction(EMPTY_DELETE_CATEGORY_STATE, fd);
    expect(res.status).toBe("error");
    expect(res.message).toBeDefined();
  });
});

describe("setCategoryArchivedAction", () => {
  it("archives with the session owner and revalidates on success", async () => {
    const fd = new FormData();
    fd.set("categoryId", "cat-1");
    fd.set("archived", "true");

    const res = await setCategoryArchivedAction(EMPTY_ARCHIVE_CATEGORY_STATE, fd);

    expect(res.status).toBe("success");
    expect(h.setCategoryArchivedCalls[0]).toEqual({
      userId: "user-1",
      categoryId: "cat-1",
      archived: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/categories");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions/new");
  });

  it("unarchives when the archived field is not 'true'", async () => {
    const fd = new FormData();
    fd.set("categoryId", "cat-1");
    fd.set("archived", "false");

    const res = await setCategoryArchivedAction(EMPTY_ARCHIVE_CATEGORY_STATE, fd);

    expect(res.status).toBe("success");
    expect(h.setCategoryArchivedCalls[0].archived).toBe(false);
  });

  it("rejects a blank id with a generic not-found message", async () => {
    const fd = new FormData();
    fd.set("categoryId", "");
    fd.set("archived", "true");

    const res = await setCategoryArchivedAction(EMPTY_ARCHIVE_CATEGORY_STATE, fd);
    expect(res.status).toBe("error");
    expect(res.message).toBeDefined();
    expect(categoriesDal.setCategoryArchived).not.toHaveBeenCalled();
  });

  it("returns a generic message for a foreign or missing category", async () => {
    vi.mocked(categoriesDal.setCategoryArchived).mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    } as never);

    const fd = new FormData();
    fd.set("categoryId", "cat-1");
    fd.set("archived", "true");

    const res = await setCategoryArchivedAction(EMPTY_ARCHIVE_CATEGORY_STATE, fd);
    expect(res.status).toBe("error");
    expect(res.message).toBeDefined();
  });
});

describe("category actions — email verification gate", () => {
  it("blocks every mutation for an unverified account before touching the domain", async () => {
    vi.mocked(dal.isEmailVerified).mockResolvedValue(false);

    const createForm = new FormData();
    createForm.set("name", "خرید روزانه");
    createForm.set("kind", "expense");
    const createRes = await createCategoryAction(EMPTY_CATEGORY_FORM_STATE, createForm);
    expect(createRes.status).toBe("error");
    expect(createRes.message).toBe(VERIFY_EMAIL_REQUIRED_MESSAGE);
    expect(categoriesDal.createCategory).not.toHaveBeenCalled();

    const renameForm = new FormData();
    renameForm.set("categoryId", "cat-1");
    renameForm.set("name", "خرید هفتگی");
    const renameRes = await renameCategoryAction(EMPTY_CATEGORY_RENAME_STATE, renameForm);
    expect(renameRes.status).toBe("error");
    expect(renameRes.message).toBe(VERIFY_EMAIL_REQUIRED_MESSAGE);
    expect(categoriesDal.renameCategory).not.toHaveBeenCalled();

    const deleteForm = new FormData();
    deleteForm.set("categoryId", "cat-1");
    const deleteRes = await deleteCategoryAction(EMPTY_DELETE_CATEGORY_STATE, deleteForm);
    expect(deleteRes.status).toBe("error");
    expect(deleteRes.message).toBe(VERIFY_EMAIL_REQUIRED_MESSAGE);
    expect(categoriesDal.deleteCategory).not.toHaveBeenCalled();

    const archiveForm = new FormData();
    archiveForm.set("categoryId", "cat-1");
    archiveForm.set("archived", "true");
    const archiveRes = await setCategoryArchivedAction(
      EMPTY_ARCHIVE_CATEGORY_STATE,
      archiveForm,
    );
    expect(archiveRes.status).toBe("error");
    expect(archiveRes.message).toBe(VERIFY_EMAIL_REQUIRED_MESSAGE);
    expect(categoriesDal.setCategoryArchived).not.toHaveBeenCalled();
  });
});
