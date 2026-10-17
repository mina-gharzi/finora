"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction } from "@/app/actions/accounts";
import { EMPTY_DELETE_ACCOUNT_STATE } from "@/lib/accounts-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface DeleteAccountButtonProps {
  accountId: string;
  accountName: string;
}

export function DeleteAccountButton({
  accountId,
  accountName,
}: DeleteAccountButtonProps) {
  const [state, formAction, isPending] = useActionState(
    deleteAccountAction,
    EMPTY_DELETE_ACCOUNT_STATE,
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
          className="flex flex-wrap items-center gap-2"
          aria-label={`تأیید حذف حساب ${accountName}`}
        >
          <input type="hidden" name="accountId" value={accountId} />
          <span className="text-sm text-muted-foreground">
            حذف «{accountName}»؟
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
          aria-label={`حذف حساب ${accountName}`}
        >
          حذف
        </Button>
      )}
    </div>
  );
}
