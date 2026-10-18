"use client";

import { useActionState } from "react";
import { createCategoryAction } from "@/app/actions/categories";
import { EMPTY_CATEGORY_FORM_STATE } from "@/lib/categories-form";
import { TRANSACTION_TYPE_LABELS } from "@/lib/finance/transaction-labels";
import {
  TRANSACTION_TYPES,
  type TransactionType,
} from "@/lib/finance/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";

/**
 * Creation form for a category: a name and an income/expense kind. The kind is
 * fixed once created, so it is only chosen here.
 */
export function CreateCategoryForm() {
  const [state, formAction, isPending] = useActionState(
    createCategoryAction,
    EMPTY_CATEGORY_FORM_STATE,
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
        label="نام دسته‌بندی"
        name="name"
        type="text"
        required
        maxLength={60}
        error={state.fieldErrors?.name}
      />
      <SelectField
        label="نوع دسته‌بندی"
        name="kind"
        defaultValue={TRANSACTION_TYPES[0]}
        required
        error={state.fieldErrors?.kind}
      >
        {TRANSACTION_TYPES.map((kind) => (
          <option key={kind} value={kind}>
            {TRANSACTION_TYPE_LABELS[kind as TransactionType]}
          </option>
        ))}
      </SelectField>
      <Button type="submit" loading={isPending} className="self-start">
        افزودن دسته‌بندی
      </Button>
    </form>
  );
}
