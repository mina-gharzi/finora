"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type DeleteTransferState,
  type TransferFormState,
} from "@/lib/transfers-form";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
import { isEmailVerified, requireUserId } from "@/lib/dal";
import { createTransfer, deleteTransfer } from "@/lib/finance/transfers";

const GENERIC_NOT_FOUND = "انتقال موردنظر یافت نشد.";

/**
 * Reads a text field, yielding `""` when it was absent or not a string. The
 * domain schema still validates the value; this only normalizes the `FormData`
 * surface so a missing field produces a meaningful field error rather than a
 * type error.
 */
function readText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** Maps the submitted fields onto the domain input shape. */
function readTransferInput(formData: FormData) {
  return {
    fromAccountId: formData.get("fromAccountId"),
    toAccountId: formData.get("toAccountId"),
    amount: formData.get("amount"),
    occurredOn: formData.get("occurredOn"),
    note: readText(formData.get("note")),
  };
}

/** Every cached surface a transfer can change. */
function revalidateTransferPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/reports");
  revalidatePath("/accounts/transfers");
}

/**
 * Creates a transfer for the authenticated user.
 *
 * The owner id is taken exclusively from the verified server session; both
 * accounts' ownership and archived state are enforced by the data-access layer,
 * so a forged `fromAccountId`/`toAccountId` is rejected server-side even though
 * the UI only offers the user's own options.
 */
export async function createTransferAction(
  _prevState: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const result = await createTransfer(userId, readTransferInput(formData));

  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: result.fieldErrors,
      message: "ثبت انتقال انجام نشد. لطفاً خطاهای فرم را بررسی کنید.",
    };
  }

  revalidateTransferPaths();
  return {
    status: "success",
    message: "انتقال با موفقیت ثبت شد.",
  };
}

/**
 * Deletes an owned transfer. The id is re-authorized in the data-access layer,
 * so a foreign or missing transfer yields the same generic message as an
 * invalid one. On success every affected surface is revalidated.
 */
export async function deleteTransferAction(
  _prevState: DeleteTransferState,
  formData: FormData,
): Promise<DeleteTransferState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const transferId = readText(formData.get("transferId")).trim();
  if (transferId === "") {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  const deleted = await deleteTransfer(userId, transferId);
  if (!deleted) {
    return { status: "error", message: GENERIC_NOT_FOUND };
  }

  revalidateTransferPaths();
  redirect("/accounts/transfers");
}
