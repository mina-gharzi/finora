"use server";

import { revalidatePath } from "next/cache";
import { formatToman } from "@finora/shared";
import type { AccountFormState, DeleteAccountState } from "@/lib/accounts-form";
import { requireUserId } from "@/lib/dal";
import { createAccount, deleteAccount } from "@/lib/finance/accounts";

const GENERIC_DELETE_ERROR = "حساب موردنظر یافت نشد.";

function readOpeningBalance(
  value: FormDataEntryValue | null,
): number | string {
  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return 0;
  }

  return trimmed;
}

export async function createAccountAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const userId = await requireUserId();

  const result = await createAccount(userId, {
    name: formData.get("name"),
    type: formData.get("type"),
    openingBalance: readOpeningBalance(formData.get("openingBalance")),
  });

  if (!result.ok) {
    return {
      status: "error",
      fieldErrors: result.fieldErrors,
    };
  }

  revalidatePath("/accounts");
  return {
    status: "success",
    message: "حساب جدید با موفقیت ثبت شد.",
  };
}

export async function deleteAccountAction(
  _prevState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const userId = await requireUserId();

  const accountId = formData.get("accountId");
  if (typeof accountId !== "string" || accountId.trim() === "") {
    return { status: "error", message: GENERIC_DELETE_ERROR };
  }

  const result = await deleteAccount(userId, accountId.trim());

  if (result.ok) {
    revalidatePath("/accounts");
    return { status: "success" };
  }

  if (result.reason === "has_transactions") {
    return {
      status: "error",
      message: `این حساب ${formatToman(result.transactionCount)} تراکنش دارد و برای جلوگیری از حذف داده‌ها قابل حذف نیست.`,
    };
  }

  return { status: "error", message: GENERIC_DELETE_ERROR };
}
