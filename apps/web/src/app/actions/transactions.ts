"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type DeleteTransactionState,
  type TransactionFormState,
} from "@/lib/transactions-form";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
import { isEmailVerified, requireUserId } from "@/lib/dal";
import { parseTransactionReturnTo } from "@/lib/finance/history-query";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/lib/finance/transactions";

const GENERIC_NOT_FOUND = "تراکنش موردنظر یافت نشد.";

/**
 * Reads a text field, yielding `""` when it was absent or not a string. The
 * domain schema still validates the value; this only normalizes the `FormData`
 * surface so a missing field produces a meaningful field error rather than a
 * type error.
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

/** Appends a `updated=1` marker used by the history page to show a notice. */
function withUpdatedFlag(href: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}updated=1`;
}

/** Maps the submitted fields onto the domain input shape. */
function readTransactionInput(formData: FormData) {
  return {
    accountId: formData.get("accountId"),
    categoryId: readOptionalId(formData.get("categoryId")),
    type: formData.get("type"),
    amount: formData.get("amount"),
    occurredOn: formData.get("occurredOn"),
    note: readText(formData.get("note")),
  };
}

/**
 * Creates a transaction for the authenticated user.
 *
 * The owner id is taken exclusively from the verified server session; the
 * account (and optional category) ownership and category/type compatibility are
 * enforced by the data-access layer, so a forged `accountId`/`categoryId` is
 * rejected server-side even though the UI only offers the user's own options.
 */
export async function createTransactionAction(
  _prevState: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const result = await createTransaction(userId, readTransactionInput(formData));

  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: result.fieldErrors,
      message: "ثبت تراکنش انجام نشد. لطفاً خطاهای فرم را بررسی کنید.",
    };
  }

  revalidatePath("/transactions");
  return {
    status: "success",
    message: "تراکنش با موفقیت ثبت شد.",
  };
}

/**
 * Updates an owned transaction in place.
 *
 * The target id and the desired return path arrive as form fields, so they are
 * untrusted: the id is re-authorized in the data-access layer (a foreign or
 * malformed id is reported as "not found") and the return path is normalized to
 * a same-app `/transactions` URL. On success the history and edit routes are
 * revalidated and the user is redirected back to the filtered history list with
 * a `updated=1` marker.
 */
export async function updateTransactionAction(
  _prevState: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const transactionId = readText(formData.get("transactionId")).trim();
  const returnHref = parseTransactionReturnTo(
    readText(formData.get("returnTo")),
  );

  if (transactionId === "") {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  const result = await updateTransaction(
    userId,
    transactionId,
    readTransactionInput(formData),
  );

  if (!result.ok) {
    if (result.reason === "not_found") {
      return { status: "error", message: GENERIC_NOT_FOUND };
    }
    return {
      status: "error",
      fieldErrors: result.fieldErrors,
      message: "ویرایش تراکنش انجام نشد. لطفاً خطاهای فرم را بررسی کنید.",
    };
  }

  revalidatePath("/transactions");
  revalidatePath(`/transactions/${transactionId}/edit`);
  redirect(withUpdatedFlag(returnHref));
}

/**
 * Deletes an owned transaction. The id is re-authorized in the data-access
 * layer, so a foreign or missing transaction yields the same generic message as
 * an invalid one. On success the history is revalidated and the user is sent
 * back to the (filtered) history list.
 */
export async function deleteTransactionAction(
  _prevState: DeleteTransactionState,
  formData: FormData,
): Promise<DeleteTransactionState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const transactionId = readText(formData.get("transactionId")).trim();
  const returnHref = parseTransactionReturnTo(
    readText(formData.get("returnTo")),
  );

  if (transactionId === "") {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  const deleted = await deleteTransaction(userId, transactionId);
  if (!deleted) {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  revalidatePath("/transactions");
  redirect(returnHref);
}
