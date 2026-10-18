"use client";

import { useActionState, useState } from "react";
import { deleteTransactionAction } from "@/app/actions/transactions";
import { EMPTY_DELETE_TRANSACTION_STATE } from "@/lib/transactions-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface DeleteTransactionButtonProps {
  transactionId: string;
  /** Same-app `/transactions` path the user returns to after deletion. */
  returnTo: string;
  /** Visual density; "sm" fits inside the history table rows. */
  size?: "sm" | "md";
}

/**
 * Delete control with an inline confirmation step. The id and return path are
 * submitted as hidden fields; ownership is re-verified server-side, so this
 * component never needs to trust them. While a submission is pending the
 * confirm button shows a busy state and cancel is disabled, preventing
 * duplicate deletions.
 */
export function DeleteTransactionButton({
  transactionId,
  returnTo,
  size = "sm",
}: DeleteTransactionButtonProps) {
  const [state, formAction, isPending] = useActionState(
    deleteTransactionAction,
    EMPTY_DELETE_TRANSACTION_STATE,
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
          aria-label="تأیید حذف تراکنش"
        >
          <input type="hidden" name="transactionId" value={transactionId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <span className="text-sm text-muted-foreground">
            این تراکنش حذف شود؟
          </span>
          <Button
            type="submit"
            variant="danger"
            size={size}
            loading={isPending}
          >
            تأیید حذف
          </Button>
          <Button
            type="button"
            variant="secondary"
            size={size}
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
          size={size}
          onClick={() => setConfirming(true)}
          aria-label="حذف تراکنش"
        >
          حذف
        </Button>
      )}
    </div>
  );
}
