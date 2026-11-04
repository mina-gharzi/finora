"use client";

import { useActionState, useState } from "react";
import { deleteRecurringAction } from "@/app/actions/recurring";
import { EMPTY_DELETE_RECURRING_STATE } from "@/lib/recurring-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface DeleteRecurringButtonProps {
  recurringId: string;
}

/**
 * Delete control with an inline confirmation step. Already-generated
 * transactions survive deletion, so the copy makes that explicit. The id is a
 * hidden field and is re-authorized server-side.
 */
export function DeleteRecurringButton({
  recurringId,
}: DeleteRecurringButtonProps) {
  const [state, formAction, isPending] = useActionState(
    deleteRecurringAction,
    EMPTY_DELETE_RECURRING_STATE,
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col items-start gap-2">
      {state.status === "error" && state.message && (
        <Alert variant="danger">{state.message}</Alert>
      )}
      {confirming ? (
        <form
          action={formAction}
          className="flex flex-wrap items-center gap-2"
          aria-label="تأیید حذف قانون تکرارشونده"
        >
          <input type="hidden" name="id" value={recurringId} />
          <span className="text-sm text-muted-foreground">
            این قانون حذف شود؟ تراکنش‌های ثبت‌شده‌ی قبلی حفظ می‌شوند.
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
          aria-label="حذف قانون تکرارشونده"
        >
          حذف
        </Button>
      )}
    </div>
  );
}
