"use client";

import { useActionState, useState } from "react";
import { deleteBudgetAction } from "@/app/actions/budgets";
import { EMPTY_DELETE_BUDGET_STATE } from "@/lib/budgets-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface DeleteBudgetButtonProps {
  budgetId: string;
  categoryName: string;
}

/**
 * Remove control with an inline confirmation step. The id is submitted as a
 * hidden field; ownership is re-verified server-side, so this component never
 * needs to trust it. While a submission is pending the confirm button shows a
 * busy state and cancel is disabled, preventing duplicate removals.
 */
export function DeleteBudgetButton({
  budgetId,
  categoryName,
}: DeleteBudgetButtonProps) {
  const [state, formAction, isPending] = useActionState(
    deleteBudgetAction,
    EMPTY_DELETE_BUDGET_STATE,
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      {state.status === "error" && state.message && (
        <Alert variant="danger" className="w-full">
          {state.message}
        </Alert>
      )}
      {confirming ? (
        <form
          action={formAction}
          className="flex flex-wrap items-center justify-end gap-2"
          aria-label={`تأیید حذف بودجه ${categoryName}`}
        >
          <input type="hidden" name="budgetId" value={budgetId} />
          <span className="text-sm text-muted-foreground">
            حذف بودجه «{categoryName}»؟
          </span>
          <Button type="submit" variant="danger" size="sm" loading={isPending}>
            تأیید حذف
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={isPending}
          >
            انصراف
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(true)}
          aria-label={`حذف بودجه ${categoryName}`}
        >
          حذف
        </Button>
      )}
    </div>
  );
}
