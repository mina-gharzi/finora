"use server";

import { revalidatePath } from "next/cache";
import type {
  BudgetEditState,
  BudgetFormState,
  DeleteBudgetState,
} from "@/lib/budgets-form";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
import { isEmailVerified, requireUserId } from "@/lib/dal";
import {
  createBudget,
  deleteBudget,
  updateBudget,
} from "@/lib/finance/budgets";

const GENERIC_NOT_FOUND = "بودجه موردنظر یافت نشد.";
const DUPLICATE_MESSAGE =
  "برای این دسته‌بندی در این ماه از قبل بودجه ثبت شده است؛ آن را ویرایش کنید.";

/**
 * Reads a text field, yielding `""` when it was absent or not a string. The
 * domain schema still validates the value; this only normalizes the `FormData`
 * surface so a missing field produces a meaningful field error.
 */
function readText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** Maps the submitted fields onto the budget domain input shape. */
function readBudgetInput(formData: FormData) {
  return {
    categoryId: readText(formData.get("categoryId")),
    monthStart: readText(formData.get("monthStart")),
    limitAmount: readText(formData.get("limitAmount")),
  };
}

/** Revalidates the budgets page (all mutations change what it renders). */
function revalidateBudgetViews() {
  revalidatePath("/budgets");
}

/**
 * Creates a budget for the authenticated user. The owner id comes exclusively
 * from the verified session; the category (owned + expense) and month are
 * enforced in the data-access layer, so a forged category is rejected
 * server-side. A duplicate month+category is reported as its own message rather
 * than a generic failure.
 */
export async function createBudgetAction(
  _prevState: BudgetFormState,
  formData: FormData,
): Promise<BudgetFormState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const result = await createBudget(userId, readBudgetInput(formData));

  if (!result.ok) {
    if (result.reason === "duplicate") {
      return { status: "error", message: DUPLICATE_MESSAGE };
    }
    return {
      status: "error",
      fieldErrors: result.fieldErrors,
      message: "ثبت بودجه انجام نشد. لطفاً خطاهای فرم را بررسی کنید.",
    };
  }

  revalidateBudgetViews();
  return {
    status: "success",
    message: "بودجه با موفقیت ثبت شد.",
  };
}

/**
 * Updates an owned budget in place. The target id arrives as an untrusted form
 * field, so it is re-authorized in the data-access layer: a foreign, missing or
 * malformed id yields the same generic message rather than revealing existence.
 */
export async function updateBudgetAction(
  _prevState: BudgetEditState,
  formData: FormData,
): Promise<BudgetEditState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const budgetId = readText(formData.get("budgetId")).trim();
  if (budgetId === "") {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  const result = await updateBudget(userId, budgetId, readBudgetInput(formData));

  if (!result.ok) {
    if (result.reason === "not_found") {
      return { status: "error", message: GENERIC_NOT_FOUND };
    }
    if (result.reason === "duplicate") {
      return { status: "error", message: DUPLICATE_MESSAGE };
    }
    return {
      status: "error",
      fieldErrors: result.fieldErrors,
      message: "ویرایش بودجه انجام نشد. لطفاً خطاهای فرم را بررسی کنید.",
    };
  }

  revalidateBudgetViews();
  return {
    status: "success",
    message: "بودجه با موفقیت ویرایش شد.",
  };
}

/**
 * Removes an owned budget. The id is re-authorized in the data-access layer, so
 * a foreign or missing budget yields the same generic message as an invalid one.
 */
export async function deleteBudgetAction(
  _prevState: DeleteBudgetState,
  formData: FormData,
): Promise<DeleteBudgetState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const budgetId = readText(formData.get("budgetId")).trim();
  if (budgetId === "") {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  const result = await deleteBudget(userId, budgetId);
  if (!result.ok) {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  revalidateBudgetViews();
  return { status: "success", message: "بودجه حذف شد." };
}
