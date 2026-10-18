"use client";

import { createTransactionAction } from "@/app/actions/transactions";
import {
  TransactionForm,
  type AccountOption,
  type CategoryOption,
} from "./transaction-form";

export type { AccountOption, CategoryOption };

export interface CreateTransactionFormProps {
  accounts: AccountOption[];
  categories: CategoryOption[];
  /** Gregorian `YYYY-MM-DD` used as the date field's initial value. */
  defaultDate: string;
}

/**
 * Creation entry point for the shared transaction form. It seeds an empty
 * expense and points the form at the create action; the edit flow reuses the
 * same form with different initial values and action.
 */
export function CreateTransactionForm({
  accounts,
  categories,
  defaultDate,
}: CreateTransactionFormProps) {
  return (
    <TransactionForm
      action={createTransactionAction}
      accounts={accounts}
      categories={categories}
      initialValues={{
        type: "expense",
        amountText: "",
        occurredOn: defaultDate,
        accountId: accounts[0]?.id ?? "",
        categoryId: "",
        note: "",
      }}
      submitLabel="ثبت تراکنش"
    />
  );
}
