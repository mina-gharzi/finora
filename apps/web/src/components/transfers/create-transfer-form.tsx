"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { formatTomanWithUnit } from "@finora/shared";
import { createTransferAction } from "@/app/actions/transfers";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { parseTomanAmount } from "@/lib/finance/money";
import { EMPTY_TRANSFER_FORM_STATE } from "@/lib/transfers-form";

/** Minimal account option exposed to the client (no owner id or timestamps). */
export interface TransferAccountOption {
  id: string;
  name: string;
}

export interface CreateTransferFormProps {
  /** Active (non-archived) accounts, eligible for a new transfer. */
  accounts: TransferAccountOption[];
  /** Gregorian `YYYY-MM-DD` used as the date field's initial value. */
  defaultDate: string;
}

/**
 * Creation form for account-to-account transfers. It owns the controlled
 * account and amount state so the destination list can exclude the selected
 * source and the amount can be previewed with the shared Toman formatter.
 */
export function CreateTransferForm({
  accounts,
  defaultDate,
}: CreateTransferFormProps) {
  if (accounts.length < 2) {
    return (
      <EmptyState
        title="برای ثبت انتقال حداقل دو حساب فعال لازم است"
        description="انتقال پول بین دو حساب انجام می‌شود؛ ابتدا یک حساب فعال دیگر بسازید یا حسابی را از بایگانی خارج کنید."
        action={
          <Link
            href="/accounts"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
          >
            مدیریت حساب‌ها
          </Link>
        }
      />
    );
  }

  return <TransferForm accounts={accounts} defaultDate={defaultDate} />;
}

function TransferForm({
  accounts,
  defaultDate,
}: {
  accounts: TransferAccountOption[];
  defaultDate: string;
}) {
  const [state, formAction, isPending] = useActionState(
    createTransferAction,
    EMPTY_TRANSFER_FORM_STATE,
  );
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? "");
  const [amountText, setAmountText] = useState("");

  const parsedAmount = parseTomanAmount(amountText);

  function handleFromChange(next: string) {
    setFromAccountId(next);
    // The same account cannot be both sides; move the destination if needed.
    if (next === toAccountId) {
      const fallback = accounts.find((account) => account.id !== next);
      setToAccountId(fallback?.id ?? "");
    }
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
        label="از حساب"
        name="fromAccountId"
        required
        value={fromAccountId}
        onChange={(event) => handleFromChange(event.target.value)}
        error={state.fieldErrors?.fromAccountId}
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="به حساب"
        name="toAccountId"
        required
        value={toAccountId}
        onChange={(event) => setToAccountId(event.target.value)}
        error={state.fieldErrors?.toAccountId}
      >
        {accounts.map((account) => (
          <option
            key={account.id}
            value={account.id}
            disabled={account.id === fromAccountId}
          >
            {account.name}
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

      <TextField
        label="توضیح (اختیاری)"
        name="note"
        type="text"
        maxLength={500}
        error={state.fieldErrors?.note}
      />

      <Button type="submit" loading={isPending} className="self-start">
        ثبت انتقال
      </Button>
    </form>
  );
}
