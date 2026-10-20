"use client";

import { useActionState } from "react";
import { createBudgetAction } from "@/app/actions/budgets";
import { EMPTY_BUDGET_FORM_STATE } from "@/lib/budgets-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import type { BudgetCategoryOption } from "@/lib/finance/budgets";

export interface CreateBudgetFormProps {
  /** The owner's expense categories (active first). */
  categories: BudgetCategoryOption[];
  /** Normalized first day of the selected month (`YYYY-MM-DD`). */
  monthStart: string;
  /** Persian month label for helper text, e.g. "مهر 1405". */
  monthLabel: string;
}

/**
 * Creation form for a monthly budget: an expense category and a positive Toman
 * limit. The month is fixed by the page's month selector, so it is submitted as
 * a hidden field. Ownership, the expense-only rule and the one-budget-per-month
 * uniqueness are all re-verified server-side, so this form never needs to trust
 * the client.
 */
export function CreateBudgetForm({
  categories,
  monthStart,
  monthLabel,
}: CreateBudgetFormProps) {
  const [state, formAction, isPending] = useActionState(
    createBudgetAction,
    EMPTY_BUDGET_FORM_STATE,
  );

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-4"
      aria-label="فرم ثبت بودجه"
    >
      {state.status === "success" && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === "error" && state.message && (
        <Alert variant="danger">{state.message}</Alert>
      )}

      <input type="hidden" name="monthStart" value={monthStart} />

      <SelectField
        label="دسته‌بندی هزینه"
        name="categoryId"
        required
        defaultValue=""
        error={state.fieldErrors?.categoryId}
        description={`بودجه برای ماه ${monthLabel} تعیین می‌شود.`}
      >
        <option value="" disabled>
          یک دسته‌بندی انتخاب کنید
        </option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
            {category.archived ? " (بایگانی‌شده)" : ""}
          </option>
        ))}
      </SelectField>

      <TextField
        label="سقف بودجه (تومان)"
        name="limitAmount"
        type="text"
        inputMode="numeric"
        required
        placeholder="مثلاً ۱٬۲۰۰٬۰۰۰"
        error={state.fieldErrors?.limitAmount}
      />

      <Button type="submit" loading={isPending} className="self-start">
        ثبت بودجه
      </Button>
    </form>
  );
}
