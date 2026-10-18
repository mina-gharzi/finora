"use client";

import { useActionState, useState } from "react";
import { formatTomanWithUnit } from "@finora/shared";
import { createTransactionAction } from "@/app/actions/transactions";
import { EMPTY_TRANSACTION_FORM_STATE } from "@/lib/transactions-form";
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
}

/** Minimal category option exposed to the client (no owner id or timestamps). */
export interface CategoryOption {
  id: string;
  name: string;
  kind: TransactionType;
}

export interface CreateTransactionFormProps {
  accounts: AccountOption[];
  categories: CategoryOption[];
  /** Gregorian `YYYY-MM-DD` used as the date field's initial value. */
  defaultDate: string;
}

export function CreateTransactionForm({
  accounts,
  categories,
  defaultDate,
}: CreateTransactionFormProps) {
  const [state, formAction, isPending] = useActionState(
    createTransactionAction,
    EMPTY_TRANSACTION_FORM_STATE,
  );
  const [type, setType] = useState<TransactionType>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [amountText, setAmountText] = useState("");

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
        defaultValue={defaultDate}
        error={state.fieldErrors?.occurredOn}
      />

      <SelectField
        label="حساب"
        name="accountId"
        required
        defaultValue={accounts[0]?.id}
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
        error={state.fieldErrors?.note}
      />

      <Button type="submit" loading={isPending} className="self-start">
        ثبت تراکنش
      </Button>
    </form>
  );
}
