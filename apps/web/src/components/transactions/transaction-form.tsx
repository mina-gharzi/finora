"use client";

import { useActionState, useState } from "react";
import { formatTomanWithUnit } from "@finora/shared";
import {
  EMPTY_TRANSACTION_FORM_STATE,
  type TransactionFormState,
} from "@/lib/transactions-form";
import { parseTomanAmount } from "@/lib/finance/money";
import {
  NO_CATEGORY_LABEL,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/finance/transaction-labels";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/finance/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";

/** Minimal account option exposed to the client (no owner id or timestamps). */
export interface AccountOption {
  id: string;
  name: string;
  /** True when the account is archived (still selectable only where allowed). */
  archived?: boolean;
}

/** Minimal category option exposed to the client (no owner id or timestamps). */
export interface CategoryOption {
  id: string;
  name: string;
  kind: TransactionType;
}

/** Initial values for the shared transaction form. */
export interface TransactionFormInitialValues {
  type: TransactionType;
  amountText: string;
  /** Gregorian `YYYY-MM-DD` for the date field. */
  occurredOn: string;
  accountId: string;
  /** Empty string means "no category". */
  categoryId: string;
  note: string;
}

export type TransactionFormAction = (
  prevState: TransactionFormState,
  formData: FormData,
) => Promise<TransactionFormState>;

export interface TransactionFormProps {
  action: TransactionFormAction;
  accounts: AccountOption[];
  categories: CategoryOption[];
  initialValues: TransactionFormInitialValues;
  submitLabel: string;
  /** Extra hidden inputs rendered inside the form (e.g. the edited id). */
  hiddenFields?: Record<string, string>;
}

/**
 * Shared create/edit transaction form. It owns the controlled type, category and
 * amount state so categories can be filtered to the chosen direction and the
 * amount can be previewed with the shared Toman formatter; the surrounding
 * view decides which server action to run and what the submit button says.
 */
export function TransactionForm({
  action,
  accounts,
  categories,
  initialValues,
  submitLabel,
  hiddenFields,
}: TransactionFormProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    EMPTY_TRANSACTION_FORM_STATE,
  );
  const [type, setType] = useState<TransactionType>(initialValues.type);
  const [categoryId, setCategoryId] = useState(initialValues.categoryId);
  const [amountText, setAmountText] = useState(initialValues.amountText);

  const compatibleCategories = categories.filter(
    (category) => category.kind === type,
  );

  const parsedAmount = parseTomanAmount(amountText);

  function handleTypeChange(next: string) {
    setType(next as TransactionType);
    // A category is bound to a direction, so clear any incompatible choice.
    setCategoryId("");
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      {state.status === "success" && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === "error" && state.message && (
        <Alert variant="danger">{state.message}</Alert>
      )}

      <SelectField
        label="نوع تراکنش"
        name="type"
        required
        value={type}
        onChange={(event) => handleTypeChange(event.target.value)}
        error={state.fieldErrors?.type}
      >
        {TRANSACTION_TYPES.map((value) => (
          <option key={value} value={value}>
            {TRANSACTION_TYPE_LABELS[value]}
          </option>
        ))}
      </SelectField>

      <TextField
        label="مبلغ (تومان)"
        name="amount"
        type="text"
        inputMode="numeric"
        required
        value={amountText}
        onChange={(event) => setAmountText(event.target.value)}
        description={
          parsedAmount === null
            ? "عدد صحیح و بدون اعشار وارد کنید."
            : `معادل: ${formatTomanWithUnit(parsedAmount)}`
        }
        error={state.fieldErrors?.amount}
      />

      <TextField
        label="تاریخ"
        name="occurredOn"
        type="date"
        required
        defaultValue={initialValues.occurredOn}
        error={state.fieldErrors?.occurredOn}
      />

      <SelectField
        label="حساب"
        name="accountId"
        required
        defaultValue={initialValues.accountId || accounts[0]?.id}
        error={state.fieldErrors?.accountId}
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="دسته‌بندی"
        name="categoryId"
        description="اختیاری؛ فهرست بر اساس نوع تراکنش فیلتر می‌شود."
        value={categoryId}
        onChange={(event) => setCategoryId(event.target.value)}
        error={state.fieldErrors?.categoryId}
      >
        <option value="">{NO_CATEGORY_LABEL}</option>
        {compatibleCategories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>

      <TextField
        label="توضیحات (اختیاری)"
        name="note"
        type="text"
        maxLength={500}
        defaultValue={initialValues.note}
        error={state.fieldErrors?.note}
      />

      <Button type="submit" loading={isPending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
