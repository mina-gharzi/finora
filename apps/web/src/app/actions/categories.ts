"use server";

import { revalidatePath } from "next/cache";
import { formatToman } from "@finora/shared";
import type {
  CategoryFormState,
  CategoryRenameState,
  DeleteCategoryState,
} from "@/lib/categories-form";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
import { isEmailVerified, requireUserId } from "@/lib/dal";
import {
  createCategory,
  deleteCategory,
  renameCategory,
} from "@/lib/finance/categories";

const GENERIC_RENAME_ERROR = "دسته‌بندی موردنظر یافت نشد.";
const GENERIC_DELETE_ERROR = "دسته‌بندی موردنظر یافت نشد.";

/**
 * Reads a text field, yielding `""` when it was absent or not a string. The
 * domain schema still validates the value; this only normalizes the `FormData`
 * surface so a missing field produces a meaningful field error.
 */
function readText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Revalidates every view that lists categories. Category names appear in the
 * management page and in the transaction create/edit category pickers, so those
 * routes are refreshed after any successful mutation.
 */
function revalidateCategoryViews() {
  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/transactions/new");
}

/**
 * Creates a category for the authenticated user. The owner id comes exclusively
 * from the verified session; `kind` is validated by the domain schema, so a
 * forged owner or an unknown type is rejected server-side.
 */
export async function createCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const result = await createCategory(userId, {
    name: readText(formData.get("name")),
    kind: readText(formData.get("kind")),
  });

  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: result.fieldErrors,
      message: "ثبت دسته‌بندی انجام نشد. لطفاً خطاهای فرم را بررسی کنید.",
    };
  }

  revalidateCategoryViews();
  return {
    status: "success",
    message: "دسته‌بندی جدید با موفقیت ثبت شد.",
  };
}

/**
 * Renames an owned category. The target id arrives as an untrusted form field,
 * so it is re-authorized in the data-access layer: a foreign, missing or
 * malformed id yields the same generic message rather than revealing existence.
 * Only the name changes — `kind` is fixed for the category's lifetime.
 */
export async function renameCategoryAction(
  _prevState: CategoryRenameState,
  formData: FormData,
): Promise<CategoryRenameState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const categoryId = readText(formData.get("categoryId")).trim();
  if (categoryId === "") {
    return { status: "error", message: GENERIC_RENAME_ERROR };
  }

  const result = await renameCategory(userId, categoryId, {
    name: readText(formData.get("name")),
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return { status: "error", message: GENERIC_RENAME_ERROR };
    }
    return {
      status: "error",
      fieldErrors: result.fieldErrors,
      message: "ویرایش دسته‌بندی انجام نشد. لطفاً خطاهای فرم را بررسی کنید.",
    };
  }

  revalidateCategoryViews();
  return {
    status: "success",
    message: "نام دسته‌بندی با موفقیت ویرایش شد.",
  };
}

/**
 * Deletes an owned category, but only when no transaction references it. The id
 * is re-authorized in the data-access layer, so a foreign or missing category
 * yields the same generic message as an invalid one. A referenced category is
 * preserved and the user is told how many transactions depend on it.
 */
export async function deleteCategoryAction(
  _prevState: DeleteCategoryState,
  formData: FormData,
): Promise<DeleteCategoryState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const categoryId = readText(formData.get("categoryId")).trim();
  if (categoryId === "") {
    return { status: "error", message: GENERIC_DELETE_ERROR };
  }

  const result = await deleteCategory(userId, categoryId);

  if (result.ok) {
    revalidateCategoryViews();
    return { status: "success" };
  }

  if (result.reason === "has_transactions") {
    return {
      status: "error",
      message: `این دسته‌بندی در ${formatToman(result.transactionCount)} تراکنش استفاده شده است و برای جلوگیری از حذف داده‌ها قابل حذف نیست.`,
    };
  }

  return { status: "error", message: GENERIC_DELETE_ERROR };
}
