"use client";

import { useActionState } from "react";
import { createAccountAction } from "@/app/actions/accounts";
import { EMPTY_ACCOUNT_FORM_STATE } from "@/lib/accounts-form";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/account-labels";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/finance/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";

export function CreateAccountForm() {
  const [state, formAction, isPending] = useActionState(
    createAccountAction,
    EMPTY_ACCOUNT_FORM_STATE,
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.status === "success" && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === "error" && state.message && (
        <Alert variant="danger">{state.message}</Alert>
      )}

      <TextField
        label="نام حساب"
        name="name"
        type="text"
        required
        error={state.fieldErrors?.name}
      />
      <SelectField
        label="نوع حساب"
        name="type"
        defaultValue={ACCOUNT_TYPES[0]}
        required
        error={state.fieldErrors?.type}
      >
        {ACCOUNT_TYPES.map((type) => (
          <option key={type} value={type}>
            {ACCOUNT_TYPE_LABELS[type as AccountType]}
          </option>
        ))}
      </SelectField>
      <TextField
        label="موجودی اولیه (تومان)"
        name="openingBalance"
        inputMode="numeric"
        description="اختیاری؛ در صورت خالی بودن، صفر در نظر گرفته می‌شود."
        error={state.fieldErrors?.openingBalance}
      />
      <Button type="submit" loading={isPending} className="self-start">
        افزودن حساب
      </Button>
    </form>
  );
}
