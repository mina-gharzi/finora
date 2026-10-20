"use client";

import { useActionState, useState } from "react";
import { updateBudgetAction } from "@/app/actions/budgets";
import { EMPTY_BUDGET_EDIT_STATE } from "@/lib/budgets-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import type { BudgetCategoryOption } from "@/lib/finance/budgets";

export interface EditBudgetFormProps {
  budgetId: string;
  /** Normalized first day of the budget's month (`YYYY-MM-DD`). */
  monthStart: string;
  /** The budget's current category id (selected by default). */
  categoryId: string;
  /** Current limit as plain integer text (Latin digits). */
  limitAmount: number;
  /** Selectable expense categories, including the current one. */
  categories: BudgetCategoryOption[];
}

/**
 * Inline edit control for one budget: change its limit, or move it to another
 * expense category. The month is fixed (a hidden field), so editing never moves
 * a budget across months; to budget a different month the user switches the
 * page's month selector. Ownership, the expense-only rule and uniqueness are
 * re-verified server-side.
 */
export function EditBudgetForm({
  budgetId,
  monthStart,
  categoryId,
  limitAmount,
  categories,
}: EditBudgetFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateBudgetAction,
    EMPTY_BUDGET_EDIT_STATE,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="ویرایش بودجه"
      >
        ویرایش
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      noValidate
      className="flex w-full flex-col gap-3"
      aria-label="فرم ویرایش بودجه"
    >
      {state.status === "success" && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === "error" && state.message && (
        <Alert variant="danger">{state.message}</Alert>
      )}

      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="monthStart" value={monthStart} />

      <SelectField
        label="دسته‌بندی هزینه"
        name="categoryId"
        required
        defaultValue={categoryId}
        error={state.fieldErrors?.categoryId}
      >
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
        defaultValue={String(limitAmount)}
        error={state.fieldErrors?.limitAmount}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" loading={isPending}>
          ذخیره تغییرات
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={isPending}
        >
          انصراف
        </Button>
      </div>
    </form>
  );
}
