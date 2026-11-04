"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type DeleteRecurringState,
  type RecurringFormState,
  type ToggleRecurringState,
} from "@/lib/recurring-form";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
import { isEmailVerified, requireUserId } from "@/lib/dal";
import {
  createRecurring,
  deleteRecurring,
  setRecurringActive,
} from "@/lib/finance/recurring";

const GENERIC_NOT_FOUND = "قانون تکرارشونده موردنظر یافت نشد.";

/**
 * Reads a text field, yielding `""` when it was absent or not a string. The
 * domain schema still validates the value; this only normalizes the `FormData`
 * surface so a missing field produces a meaningful field error.
 */
function readText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** Reads an optional id field, yielding `null` for an empty selection. */
function readOptionalId(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Reads a numeric select value, yielding `null` when absent or empty. */
function readOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Revalidates every page whose aggregates include generated rows. */
function revalidateRecurringPaths(): void {
  revalidatePath("/transactions/recurring");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
}

/**
 * Creates a recurring rule for the authenticated user.
 *
 * The owner id comes exclusively from the verified session; account/category
 * ownership and compatibility are re-checked by the data-access layer. The two
 * schedule fields are mutually exclusive, so the inactive one is forced to
 * `null` before the domain sees it.
 */
export async function createRecurringAction(
  _prevState: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const frequency = readText(formData.get("frequency"));
  const isMonthly = frequency === "monthly";

  const result = await createRecurring(userId, {
    accountId: formData.get("accountId"),
    categoryId: readOptionalId(formData.get("categoryId")),
    type: formData.get("type"),
    amount: formData.get("amount"),
    note: readText(formData.get("note")),
    frequency,
    dayOfMonth: isMonthly
      ? readOptionalNumber(formData.get("dayOfMonth"))
      : null,
    weekday: isMonthly ? null : readOptionalNumber(formData.get("weekday")),
    startOn: formData.get("startOn"),
    endOn: readOptionalId(formData.get("endOn")),
  });

  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: result.fieldErrors,
      message: "ثبت قانون تکرارشونده انجام نشد. لطفاً خطاهای فرم را بررسی کنید.",
    };
  }

  revalidateRecurringPaths();
  redirect("/transactions/recurring");
}

/** Enables or pauses one owned rule; ownership is re-checked server-side. */
export async function toggleRecurringActiveAction(
  _prevState: ToggleRecurringState,
  formData: FormData,
): Promise<ToggleRecurringState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const recurringId = readText(formData.get("id")).trim();
  if (recurringId === "") {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  const active = readText(formData.get("active")) === "true";
  const updated = await setRecurringActive(userId, recurringId, active);
  if (!updated) {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  revalidateRecurringPaths();
  return { status: "success" };
}

/** Deletes one owned rule; already-generated transactions are preserved. */
export async function deleteRecurringAction(
  _prevState: DeleteRecurringState,
  formData: FormData,
): Promise<DeleteRecurringState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const recurringId = readText(formData.get("id")).trim();
  if (recurringId === "") {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  const deleted = await deleteRecurring(userId, recurringId);
  if (!deleted) {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  revalidateRecurringPaths();
  return { status: "success" };
}
