"use client";

import { useActionState, useState } from "react";
import { formatTomanWithUnit } from "@finora/shared";
import { createRecurringAction } from "@/app/actions/recurring";
import {
  EMPTY_RECURRING_FORM_STATE,
  type RecurringFormState,
} from "@/lib/recurring-form";
import { jalaliParts } from "@/lib/finance/dashboard-range";
import { parseTomanAmount } from "@/lib/finance/money";
import { WEEKDAY_OPTIONS } from "@/lib/finance/recurring-labels";
import {
  NO_CATEGORY_LABEL,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/finance/transaction-labels";
import {
  RECURRING_FREQUENCIES,
  TRANSACTION_TYPES,
  type RecurringFrequency,
  type TransactionType,
} from "@/lib/finance/types";
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

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  monthly: "ماهانه",
  weekly: "هفتگی",
};

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, index) => index + 1);

export interface CreateRecurringFormProps {
  accounts: AccountOption[];
  categories: CategoryOption[];
  /** Gregorian `YYYY-MM-DD` used as the start date's initial value. */
  defaultDate: string;
}

/**
 * Creation form for a recurring rule. Type controls which categories are
 * offered (a category is bound to a direction) and frequency controls which
 * schedule field is rendered: only the active field is mounted, so the inactive
 * one is never submitted.
 */
export function CreateRecurringForm({
  accounts,
  categories,
  defaultDate,
}: CreateRecurringFormProps) {
  const [state, formAction, isPending] = useActionState<
    RecurringFormState,
    FormData
  >(createRecurringAction, EMPTY_RECURRING_FORM_STATE);
  const [type, setType] = useState<TransactionType>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [amountText, setAmountText] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");

  const compatibleCategories = categories.filter(
    (category) => category.kind === type,
  );

  const parsedAmount = parseTomanAmount(amountText);
  const { day: initialDayOfMonth } = jalaliParts(defaultDate);
  const initialWeekday = new Date(`${defaultDate}T00:00:00Z`).getUTCDay();

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

      <SelectField
        label="تکرار"
        name="frequency"
        required
        value={frequency}
        onChange={(event) =>
          setFrequency(event.target.value as RecurringFrequency)
        }
        error={state.fieldErrors?.frequency}
      >
        {RECURRING_FREQUENCIES.map((value) => (
          <option key={value} value={value}>
            {FREQUENCY_LABELS[value]}
          </option>
        ))}
      </SelectField>

      {frequency === "monthly" ? (
        <SelectField
          key="monthly-day"
          label="روز ماه"
          name="dayOfMonth"
          required
          defaultValue={String(initialDayOfMonth)}
          description="اگر ماه روز ۳۱ نداشته باشد، در آخرین روز ماه ثبت می‌شود."
          error={state.fieldErrors?.dayOfMonth}
        >
          {DAYS_OF_MONTH.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </SelectField>
      ) : (
        <SelectField
          key="weekly-day"
          label="روز هفته"
          name="weekday"
          required
          defaultValue={String(initialWeekday)}
          error={state.fieldErrors?.weekday}
        >
          {WEEKDAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      )}

      <TextField
        label="تاریخ شروع"
        name="startOn"
        type="date"
        required
        defaultValue={defaultDate}
        description="تراکنش‌های سررسیدشده از تاریخ شروع، بلافاصله ثبت می‌شوند."
        error={state.fieldErrors?.startOn}
      />

      <TextField
        label="تاریخ پایان (اختیاری)"
        name="endOn"
        type="date"
        error={state.fieldErrors?.endOn}
      />

      <TextField
        label="توضیحات (اختیاری)"
        name="note"
        type="text"
        maxLength={500}
        defaultValue=""
        error={state.fieldErrors?.note}
      />

      <Button type="submit" loading={isPending} className="self-start">
        ثبت قانون
      </Button>
    </form>
  );
}
