"use server";

import { revalidatePath } from "next/cache";
import type { TransactionFormState } from "@/lib/transactions-form";
import { requireUserId } from "@/lib/dal";
import { createTransaction } from "@/lib/finance/transactions";

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

  const result = await createTransaction(userId, {
    accountId: formData.get("accountId"),
    categoryId: readOptionalId(formData.get("categoryId")),
    type: formData.get("type"),
    amount: formData.get("amount"),
    occurredOn: formData.get("occurredOn"),
    note: readText(formData.get("note")),
  });

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
