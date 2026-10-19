"use server";

import { revalidatePath } from "next/cache";
import { formatToman } from "@finora/shared";
import type {
  AccountFormState,
  ArchiveAccountState,
  DeleteAccountState,
} from "@/lib/accounts-form";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
import { isEmailVerified, requireUserId } from "@/lib/dal";
import {
  createAccount,
  deleteAccount,
  setAccountArchived,
} from "@/lib/finance/accounts";

const GENERIC_DELETE_ERROR = "حساب موردنظر یافت نشد.";
const GENERIC_ARCHIVE_ERROR = "حساب موردنظر یافت نشد.";

/**
 * Reads a text field, yielding `""` when it was absent or not a string.
 */
function readText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

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
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

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
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

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

/**
 * Archives or unarchives an owned account, driven by the `archived` form field
 * ("true" archives, anything else unarchives). The owner id comes exclusively
 * from the verified session; the flag flip is a single owner-scoped statement
 * in the data-access layer, so a forged `accountId` is rejected as "not found"
 * and no transaction or balance is ever touched.
 */
export async function setAccountArchivedAction(
  _prevState: ArchiveAccountState,
  formData: FormData,
): Promise<ArchiveAccountState> {
  const userId = await requireUserId();
  if (!(await isEmailVerified(userId))) {
    return { status: "error", message: VERIFY_EMAIL_REQUIRED_MESSAGE };
  }

  const accountId = readText(formData.get("accountId")).trim();
  const archived = readText(formData.get("archived")) === "true";

  if (accountId === "") {
    return { status: "error", message: GENERIC_ARCHIVE_ERROR };
  }

  const result = await setAccountArchived(userId, accountId, archived);

  if (!result.ok) {
    return { status: "error", message: GENERIC_ARCHIVE_ERROR };
  }

  // The archive flag changes which accounts are offered for new transactions
  // and how history filters and the dashboard label them.
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/transactions/new");
  return {
    status: "success",
    message: archived
      ? "حساب بایگانی شد. تراکنش‌های قبلی آن همچنان در دسترس‌اند."
      : "حساب از بایگانی خارج شد.",
  };
}
