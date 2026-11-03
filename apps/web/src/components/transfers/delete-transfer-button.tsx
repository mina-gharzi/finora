"use client";

import { useActionState, useState } from "react";
import { deleteTransferAction } from "@/app/actions/transfers";
import { EMPTY_DELETE_TRANSFER_STATE } from "@/lib/transfers-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface DeleteTransferButtonProps {
  transferId: string;
  /** Visual density; "sm" fits inside the transfer table rows. */
  size?: "sm" | "md";
}

/**
 * Delete control with an inline confirmation step. The id is submitted as a
 * hidden field; ownership is re-verified server-side, so this component never
 * needs to trust it. While a submission is pending the confirm button shows a
 * busy state and cancel is disabled, preventing duplicate deletions.
 */
export function DeleteTransferButton({
  transferId,
  size = "sm",
}: DeleteTransferButtonProps) {
  const [state, formAction, isPending] = useActionState(
    deleteTransferAction,
    EMPTY_DELETE_TRANSFER_STATE,
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
          aria-label="تأیید حذف انتقال"
        >
          <input type="hidden" name="transferId" value={transferId} />
          <span className="text-sm text-muted-foreground">
            این انتقال حذف شود؟
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
          aria-label="حذف انتقال"
        >
          حذف
        </Button>
      )}
    </div>
  );
}
